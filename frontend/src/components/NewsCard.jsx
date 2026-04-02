import { useState } from 'react';
import { TrendingUp, Minus, TrendingDown } from 'lucide-react';
import { newsApi } from '../services/api';

const decodeHtml = (html) => {
  if (!html) return '';
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  let decoded = txt.value;
  // Fallback for tricky spaces
  decoded = decoded.replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"');
  return decoded;
};

export default function NewsCard({ item, onUpdate }) {
  const [loading, setLoading] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [noteText, setNoteText] = useState(item.user_note || '');
  const [savingNote, setSavingNote] = useState(false);

  const handleFavorite = async (e) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await newsApi.toggleFavorite(item.id);
      onUpdate?.();
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleRead = async () => {
    if (!item.is_read) {
      try {
        await newsApi.toggleRead(item.id);
        onUpdate?.();
      } catch (err) {
        console.error(err);
      }
    }
    window.open(item.url, '_blank');
  };

  const handleSaveNote = async (e) => {
    e.stopPropagation();
    setSavingNote(true);
    try {
      await newsApi.updateNote(item.id, noteText || null);
      onUpdate?.();
    } catch (err) {
      console.error(err);
    }
    setSavingNote(false);
    setShowNote(false);
  };

  const getShareUrl = () => {
    // Prefer source_url (original source) over Google News redirect URL
    return item.source_url || item.url;
  };

  const handleShare = (platform) => {
    const text = encodeURIComponent(item.title);
    const shareUrl = getShareUrl();
    const url = encodeURIComponent(shareUrl);
    const urls = {
      twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      whatsapp: `https://wa.me/?text=${text}%20${url}`,
      copy: null,
    };
    if (platform === 'copy') {
      navigator.clipboard.writeText(shareUrl);
      return;
    }
    window.open(urls[platform], '_blank', 'width=600,height=400');
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}dk`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}sa`;
    const days = Math.floor(hours / 24);
    return `${days}g`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <article className={`news-card ${item.is_read ? 'read' : 'unread'}`} onClick={handleRead}>
      {item.thumbnail && (
        <div className="news-thumbnail">
          <img src={item.thumbnail} alt="" loading="lazy" onError={(e) => e.target.style.display = 'none'} />
        </div>
      )}

      <div className="news-content">
        <div className="news-meta">
          {item.source_name && <span className="news-source">{item.source_name}</span>}
          <span className="news-meta-sep">·</span>
          <span className="news-time" title={formatDate(item.published_at)}>
            {timeAgo(item.published_at)}
          </span>
          {item.published_at && (
            <>
              <span className="news-meta-sep">·</span>
              <span className="news-date">{formatDate(item.published_at)}</span>
            </>
          )}
        </div>

        {item.tag_name && (
          <span className="news-tag" style={{ backgroundColor: item.tag_color + '22', color: item.tag_color, borderColor: item.tag_color }}>
            {item.tag_name}
          </span>
        )}

        {item.sentiment && (
          <span className={`sentiment-badge sentiment-${item.sentiment}`} title={`Güven: %${Math.round((item.sentiment_score || 0) * 100)}`}>
            <span className="sentiment-emoji" style={{ display: 'inline-flex', alignItems: 'center' }}>
              {item.sentiment === 'positive' ? <TrendingUp size={14} /> : item.sentiment === 'negative' ? <TrendingDown size={14} /> : <Minus size={14} />}
            </span>
            <span className="sentiment-label">
              {item.sentiment === 'positive' ? 'Pozitif' : item.sentiment === 'negative' ? 'Negatif' : 'Nötr'}
            </span>
            <span className="sentiment-score">
              %{Math.round((item.sentiment_score || 0) * 100)}
            </span>
          </span>
        )}

        <h3 className="news-title">{decodeHtml(item.title)}</h3>
        {item.summary && <p className="news-summary">{decodeHtml(item.summary)}</p>}

        {/* Existing note display */}
        {item.user_note && !showNote && (
          <div className="news-note-display" onClick={(e) => e.stopPropagation()}>
            <span className="note-icon">📝</span>
            <span className="note-text">{item.user_note}</span>
          </div>
        )}

        {/* Note editor */}
        {showNote && (
          <div className="news-note-editor" onClick={(e) => e.stopPropagation()}>
            <textarea
              className="note-textarea"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Bu haber hakkında notunuzu yazın..."
              rows={3}
              autoFocus
            />
            <div className="note-actions">
              <button className="btn btn-sm btn-primary" onClick={handleSaveNote} disabled={savingNote}>
                {savingNote ? '⏳' : '💾'} Kaydet
              </button>
              <button className="btn btn-sm btn-outline" onClick={(e) => { e.stopPropagation(); setShowNote(false); setNoteText(item.user_note || ''); }}>
                İptal
              </button>
              {item.user_note && (
                <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); setNoteText(''); }} title="Notu sil">
                  🗑️
                </button>
              )}
            </div>
          </div>
        )}

        <div className="news-actions">
          <button
            className={`action-btn fav-btn ${item.is_favorite ? 'active' : ''}`}
            onClick={handleFavorite}
            disabled={loading}
            title={item.is_favorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
          >
            {item.is_favorite ? '★' : '☆'}
          </button>
          <button
            className={`action-btn note-btn ${item.user_note ? 'has-note' : ''}`}
            onClick={(e) => { e.stopPropagation(); setShowNote(!showNote); }}
            title={item.user_note ? 'Notu düzenle' : 'Not ekle'}
          >
            📝
          </button>
          <button className="action-btn" onClick={(e) => { e.stopPropagation(); handleShare('copy'); }} title="Linki kopyala">📋</button>
          <button className="action-btn" onClick={(e) => { e.stopPropagation(); handleShare('twitter'); }} title="Twitter'da paylaş">𝕏</button>
          <button className="action-btn" onClick={(e) => { e.stopPropagation(); handleShare('whatsapp'); }} title="WhatsApp'ta paylaş">💬</button>
        </div>
      </div>
    </article>
  );
}
