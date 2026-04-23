"""
Haberajani - YouTube Engine (RSS-based, no API key required)
Monitors a specific YouTube channel via its public RSS feed.
"""
import re
import xml.etree.ElementTree as ET
from typing import List, Dict, Any, Optional
from urllib.request import urlopen, Request
from urllib.error import URLError

from engines.base import BaseNewsEngine, NewsResult

# XML namespaces used in YouTube's Atom feed
_NS = {
    'atom':  'http://www.w3.org/2005/Atom',
    'media': 'http://search.yahoo.com/mrss/',
    'yt':    'http://www.youtube.com/xml/schemas/2015',
}

_UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) '
    'Chrome/124.0 Safari/537.36'
)


def _resolve_channel_id(url_or_handle: str) -> Optional[str]:
    """
    Resolve a YouTube channel URL / @handle / channel_id to a bare channel_id.
    Tries multiple strategies without any API key.
    """
    s = url_or_handle.strip().rstrip('/')

    # Already a bare channel_id (UCxxxxxxxxxxxxxxxxxxxxxxxx)
    if re.match(r'^UC[\w-]{22}$', s):
        return s

    # Extract from URL patterns
    for pat in [
        r'youtube\.com/channel/(UC[\w-]{22})',
        r'youtube\.com/c/(UC[\w-]{22})',
    ]:
        m = re.search(pat, s)
        if m:
            return m.group(1)

    # Build canonical URL to scrape
    if 'youtube.com/@' in s or s.startswith('@'):
        handle = re.sub(r'^.*@', '@', s)
        page_url = f'https://www.youtube.com/{handle}'
    elif 'youtube.com/' in s:
        page_url = s if s.startswith('http') else 'https://' + s
    else:
        # Assume it's a handle without @
        page_url = f'https://www.youtube.com/@{s.lstrip("@")}'

    try:
        req = Request(page_url, headers={'User-Agent': _UA})
        with urlopen(req, timeout=10) as resp:
            html = resp.read().decode('utf-8', errors='replace')

        # Try several patterns found in YouTube HTML
        for pat in [
            r'"channelId"\s*:\s*"(UC[\w-]{22})"',
            r'"externalId"\s*:\s*"(UC[\w-]{22})"',
            r'<link rel="canonical" href="https://www\.youtube\.com/channel/(UC[\w-]{22})"',
            r'data-channel-external-id="(UC[\w-]{22})"',
        ]:
            m = re.search(pat, html)
            if m:
                return m.group(1)
    except Exception as e:
        print(f'[YouTube] channel_id çözümleme hatası: {e}')

    return None


def _fetch_rss(channel_id: str) -> List[dict]:
    """Fetch and parse YouTube channel RSS feed. Returns list of entry dicts."""
    url = f'https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}'
    try:
        req = Request(url, headers={'User-Agent': _UA})
        with urlopen(req, timeout=10) as resp:
            xml_bytes = resp.read()
        root = ET.fromstring(xml_bytes)
    except Exception as e:
        print(f'[YouTube RSS] Fetch hatası ({channel_id}): {e}')
        return []

    channel_title = root.findtext('atom:title', default='YouTube', namespaces=_NS)
    entries = []
    for entry in root.findall('atom:entry', _NS):
        video_id = entry.findtext('yt:videoId', namespaces=_NS) or ''
        title    = entry.findtext('atom:title', default='', namespaces=_NS)
        published = entry.findtext('atom:published', namespaces=_NS)  # ISO 8601
        video_url = f'https://www.youtube.com/watch?v={video_id}' if video_id else ''

        # Description from media:group/media:description
        desc = ''
        media_group = entry.find('media:group', _NS)
        if media_group is not None:
            desc = media_group.findtext('media:description', default='', namespaces=_NS) or ''

        # Thumbnail
        thumbnail = None
        if media_group is not None:
            thumb_el = media_group.find('media:thumbnail', _NS)
            if thumb_el is not None:
                thumbnail = thumb_el.get('url')
        if not thumbnail and video_id:
            thumbnail = f'https://img.youtube.com/vi/{video_id}/hqdefault.jpg'

        entries.append({
            'video_id':     video_id,
            'title':        title,
            'description':  desc,
            'published_at': published,
            'url':          video_url,
            'thumbnail':    thumbnail,
            'channel_name': channel_title,
        })
    return entries


def _extract_snippet(text: str, keyword: str, context: int = 120) -> str:
    """Return ±context chars around first keyword occurrence, or first context*2 chars."""
    if not text:
        return ''
    low_text = text.lower()
    low_kw   = keyword.lower()
    idx = low_text.find(low_kw)
    if idx == -1:
        # Keyword not found — return beginning
        return text[:context * 2].strip()
    start = max(0, idx - context)
    end   = min(len(text), idx + len(keyword) + context)
    snippet = text[start:end].strip()
    if start > 0:
        snippet = '…' + snippet
    if end < len(text):
        snippet = snippet + '…'
    return snippet


class YoutubeEngine(BaseNewsEngine):
    """
    Monitor a specific YouTube channel via its public RSS feed.
    No API key required.
    source.url stores the channel URL or @handle.
    """

    def search(self, query: str, language: str = 'tr', max_results: int = 10) -> List[NewsResult]:
        """Generic keyword search — kept for backward compatibility (uses DuckDuckGo)."""
        results = []
        try:
            from duckduckgo_search import DDGS
            region = 'tr-tr' if language == 'tr' else 'wt-wt'
            with DDGS() as ddgs:
                exact_q = self.exact_query(query)
                for item in ddgs.videos(
                    keywords=f'{exact_q} site:youtube.com',
                    region=region,
                    max_results=max_results,
                ):
                    url = item.get('content', '')
                    if 'youtube.com' not in url and 'youtu.be' not in url:
                        continue
                    results.append(NewsResult(
                        title=item.get('title', ''),
                        url=url,
                        summary=item.get('description', '')[:300] if item.get('description') else None,
                        source_name=f'▶️ {item.get("publisher", "YouTube")}',
                        thumbnail=item.get('images', {}).get('large') or item.get('images', {}).get('medium'),
                        published_at=item.get('published'),
                        source_url=url,
                    ))
        except Exception as e:
            print(f'[YouTube DDG Search] Hata: {e}')
        return results

    def search_channel(self, url_or_handle: str, query: str,
                       language: str = 'tr', max_results: int = 20) -> List[NewsResult]:
        """
        Fetch latest videos from a specific channel and filter by keyword.
        No API key required — uses YouTube RSS feed.
        """
        channel_id = _resolve_channel_id(url_or_handle)
        if not channel_id:
            print(f'[YouTube] Kanal çözümlenemedi: {url_or_handle}')
            return []

        entries = _fetch_rss(channel_id)
        print(f'[YouTube] channel_id={channel_id} — RSS\'den {len(entries)} video alındı, sorgu="{query}"')
        results = []

        def _tr(t):
            return t.replace('i̇', 'i').replace('ı', 'i').replace('ş', 's').replace('ç', 'c').replace('ğ', 'g').replace('ö', 'o').replace('ü', 'u')

        for entry in entries[:max_results]:
            title = entry['title']
            desc  = entry['description']
            combined = f'{title} {desc}'.lower()

            # Keyword relevance check
            if query:
                kw_lower = query.lower()
                if _tr(kw_lower) not in _tr(combined):
                    continue

            # Build summary: video title + keyword snippet from description
            summary = title
            if desc:
                snippet = _extract_snippet(desc, query) if query else desc[:240]
                if snippet:
                    summary = f'{title}\n\n{snippet}'

            results.append(NewsResult(
                title=f'▶️ {title}',
                url=entry['url'],
                summary=summary,
                source_name=f'▶️ {entry["channel_name"]}',
                published_at=entry['published_at'],
                thumbnail=entry['thumbnail'],
                source_url=entry['url'],
            ))

        return results

    def verify_channel(self, url_or_handle: str) -> Dict[str, Any]:
        """
        Verify a YouTube channel and return metadata.
        Resolves channel_id and fetches RSS to confirm accessibility.
        """
        channel_id = _resolve_channel_id(url_or_handle)
        if not channel_id:
            return {'exists': False, 'error': 'Kanal bulunamadı veya erişilemiyor'}

        entries = _fetch_rss(channel_id)
        if not entries:
            return {'exists': False, 'error': 'Kanal RSS feed\'i alınamadı (gizli veya hatalı kanal)'}

        channel_name = entries[0]['channel_name'] if entries else 'Bilinmeyen Kanal'
        # Thumbnail: use first video's thumbnail as proxy
        thumb = entries[0]['thumbnail'] if entries else None

        return {
            'exists':      True,
            'channel_id':  channel_id,
            'name':        channel_name,
            'video_count': len(entries),
            'channel_url': f'https://www.youtube.com/channel/{channel_id}',
            'thumbnail':   thumb,
            'handle':      url_or_handle.strip(),
        }

    def get_engine_name(self) -> str:
        return 'youtube'
