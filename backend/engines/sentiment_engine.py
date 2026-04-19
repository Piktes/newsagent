"""
Haberajani - Sentiment Analysis Engine
Uses incidelen/bert-base-turkish-sentiment-analysis-cased for Turkish sentiment analysis.
Singleton pattern to load model once and reuse.
"""
import threading
from typing import Optional, Tuple

_lock = threading.Lock()
_analyzer = None
_model_loaded = False
_model_error = None

MODEL_NAME = "incidelen/bert-base-turkish-sentiment-analysis-cased"

# Label mapping from model output to our internal labels
LABEL_MAP = {
    "LABEL_0": "negative",
    "LABEL_1": "neutral",
    "LABEL_2": "positive",
    # Some models use text labels directly
    "negative": "negative",
    "neutral": "neutral",
    "positive": "positive",
    "Negative": "negative",
    "Neutral": "neutral",
    "Positive": "positive",
}

# Emoji mapping for display
EMOJI_MAP = {
    "positive": "😊",
    "neutral": "😐",
    "negative": "😟",
}


def _load_model():
    """Load the sentiment analysis model (called once)."""
    global _analyzer, _model_loaded, _model_error
    
    with _lock:
        if _model_loaded:
            return
        
        try:
            from transformers import pipeline
            print(f"[*] Sentiment modeli yukleniyor: {MODEL_NAME}...")
            _analyzer = pipeline(
                "sentiment-analysis",
                model=MODEL_NAME,
                tokenizer=MODEL_NAME,
                max_length=512,
                truncation=True,
            )
            _model_loaded = True
            print("[OK] Sentiment modeli hazir!")
        except Exception as e:
            _model_error = str(e)
            print(f"[ERROR] Sentiment modeli yuklenemedi: {e}")


def analyze_sentiment(text: str) -> Tuple[Optional[str], Optional[float]]:
    """
    Analyze the sentiment of a given text.
    
    Returns:
        Tuple of (label, score) where label is 'positive', 'neutral', or 'negative'
        and score is the confidence between 0.0 and 1.0.
        Returns (None, None) if analysis fails.
    """
    if not text or not text.strip():
        return None, None
    
    # Ensure model is loaded
    if not _model_loaded:
        _load_model()
    
    if _analyzer is None:
        return None, None
    
    try:
        # Truncate text to avoid token limit issues
        truncated = text[:512].strip()
        result = _analyzer(truncated)
        
        if result and len(result) > 0:
            raw_label = result[0].get("label", "")
            score = round(result[0].get("score", 0.0), 4)
            
            # Map to our standard labels
            label = LABEL_MAP.get(raw_label, "neutral")
            
            return label, score
    except Exception as e:
        print(f"[Sentiment] Analiz hatası: {e}")
    
    return None, None


def analyze_batch(texts: list) -> list:
    """
    Analyze sentiment for a batch of texts.
    
    Returns:
        List of (label, score) tuples.
    """
    if not texts:
        return []
    
    # Ensure model is loaded
    if not _model_loaded:
        _load_model()
    
    if _analyzer is None:
        return [(None, None)] * len(texts)
    
    results = []
    try:
        # Process in smaller batches to avoid memory issues
        batch_size = 16
        for i in range(0, len(texts), batch_size):
            batch = [t[:512].strip() if t else "" for t in texts[i:i + batch_size]]
            # Filter out empty strings
            valid_indices = [j for j, t in enumerate(batch) if t]
            valid_texts = [batch[j] for j in valid_indices]
            
            if not valid_texts:
                results.extend([(None, None)] * len(batch))
                continue
            
            batch_results = _analyzer(valid_texts)
            
            # Map results back
            result_map = {}
            for idx, res in zip(valid_indices, batch_results):
                raw_label = res.get("label", "")
                score = round(res.get("score", 0.0), 4)
                label = LABEL_MAP.get(raw_label, "neutral")
                result_map[idx] = (label, score)
            
            for j in range(len(batch)):
                results.append(result_map.get(j, (None, None)))
    
    except Exception as e:
        print(f"[Sentiment] Batch analiz hatası: {e}")
        results.extend([(None, None)] * (len(texts) - len(results)))
    
    return results


def is_model_ready() -> bool:
    """Check if the sentiment model is loaded and ready."""
    return _model_loaded and _analyzer is not None


def get_model_status() -> dict:
    """Get the current model status."""
    return {
        "loaded": _model_loaded,
        "model_name": MODEL_NAME,
        "error": _model_error,
    }


def preload_model():
    """Pre-load the model (call during app startup)."""
    if not _model_loaded:
        _load_model()
