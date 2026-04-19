import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  TrendingUp, Minus, TrendingDown,
  Star, NotebookPen, Clipboard, EyeOff, Eye, Save, X, Trash2,
  BookMarked, Plus, Check
} from 'lucide-react';
import { FaXTwitter, FaWhatsapp } from 'react-icons/fa6';
import { newsApi, listsApi } from '../services/api';

const decodeHtml = (html) => {
  if (!html) return '';
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  let decoded = txt.value;
  // Fallback for tricky spaces
  decoded = decoded.replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"');
  return decoded;
};

export default function NewsCard({ item, onUpdate, showRestoreButton = false }) {
  const [loading, setLoading] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [noteText, setNoteText] = useState(item.user_note || '');
  const [savingNote, setSavingNote] = useState(false);
  const [showHideConfirm, setShowHideConfirm] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showListPopup, setShowListPopup] = useState(false);
  const [userLists, setUserLists] = useState([]);
  const [itemListIds, setItemListIds] = useState([]);
  const [newListName, setNewListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);

  const openListPopup = async (e) => {
    e.stopPropagation();
    try {
      const [listsRes, forNewsRes] = await Promise.all([
        listsApi.list(),
        listsApi.getListsForNews(item.id),
      ]);
      setUserLists(listsRes.data);
      setItemListIds(forNewsRes.data.list_ids || []);
      setShowListPopup(true);
    } catch (err) { console.error(err); }
  };

  const toggleList = async (listId) => {
    try {
      if (itemListIds.includes(listId)) {
        await listsApi.removeItem(listId, item.id);
        setItemListIds(prev => prev.filter(id => id !== listId));
      } else {
        await listsApi.addItem(listId, item.id);
        setItemListIds(prev => [...prev, listId]);
      }
      onUpdate?.();
    } catch (err) { console.error(err); }
  };

  const createAndAddList = async (e) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    try {
      const res = await listsApi.create({ name: newListName.trim() });
      const newId = res.data.id;
      await listsApi.addItem(newId, item.id);
      setUserLists(prev => [...prev, res.data]);
      setItemListIds(prev => [...prev, newId]);
      setNewListName('');
      setCreatingList(false);
      onUpdate?.();
    } catch (err) { console.error(err); }
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

  const handleHide = (e) => {
    e.stopPropagation();
    setShowHideConfirm(true);
  };

  const confirmHide = async (e) => {
    e.stopPropagation();
    setShowHideConfirm(false);
    try {
      await newsApi.toggleHide(item.id);
      onUpdate?.();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRestore = (e) => {
    e.stopPropagation();
    setShowRestoreConfirm(true);
  };

  const confirmRestore = async (e) => {
    e.stopPropagation();
    setShowRestoreConfirm(false);
    try {
      await newsApi.toggleHide(item.id);
      onUpdate?.();
    } catch (err) {
      console.error(err);
    }
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
    <>
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
          <span className="news-time" title={formatDate(item.published_at || item.fetched_at)}>
            {timeAgo(item.published_at || item.fetched_at)}
          </span>
          {(item.published_at || item.fetched_at) && (
            <>
              <span className="news-meta-sep">·</span>
              <span className="news-date">{formatDate(item.published_at || item.fetched_at)}</span>
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
            <span className="note-icon"><NotebookPen size={13} /></span>
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
              <button className="btn btn-sm btn-primary" onClick={handleSaveNote} disabled={savingNote} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Save size={13} /> Kaydet
              </button>
              <button className="btn btn-sm btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }} onClick={(e) => { e.stopPropagation(); setShowNote(false); setNoteText(item.user_note || ''); }}>
                <X size={13} /> İptal
              </button>
              {item.user_note && (
                <button className="btn btn-sm btn-danger" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }} onClick={(e) => { e.stopPropagation(); setNoteText(''); }} title="Notu sil">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="news-actions">
          <button
            className={`action-btn fav-btn ${itemListIds.length > 0 ? 'active' : ''}`}
            onClick={openListPopup}
            title="Listeye ekle"
          >
            <Star size={15} style={itemListIds.length > 0 ? { fill: 'currentColor' } : {}} />
          </button>
          <button
            className={`action-btn note-btn ${item.user_note ? 'has-note' : ''}`}
            onClick={(e) => { e.stopPropagation(); setShowNote(!showNote); }}
            title={item.user_note ? 'Notu düzenle' : 'Not ekle'}
          >
            <NotebookPen size={15} />
          </button>
          <button className="action-btn" onClick={(e) => { e.stopPropagation(); handleShare('copy'); }} title="Linki kopyala">
            <Clipboard size={15} />
          </button>
          <button className="action-btn" onClick={(e) => { e.stopPropagation(); handleShare('twitter'); }} title="Twitter/X'te paylaş">
            <FaXTwitter size={15} />
          </button>
          <button className="action-btn" onClick={(e) => { e.stopPropagation(); handleShare('whatsapp'); }} title="WhatsApp'ta paylaş">
            <FaWhatsapp size={15} />
          </button>
          <button className="action-btn hide-btn" onClick={handleHide} title="Akıştan çıkar">
            <EyeOff size={15} />
          </button>
          {showRestoreButton && (
            <button className="btn btn-sm btn-outline" style={{ marginLeft: 'auto', gap: '0.3rem', display: 'flex', alignItems: 'center' }} onClick={handleRestore}>
              <Eye size={13} /> Akışa Geri Al
            </button>
          )}
        </div>
      </div>

    </article>

    {/* Tüm modal'lar document.body'e portal ile render edilir */}
    {(showListPopup || showHideConfirm || showRestoreConfirm) && createPortal(
      <>
        {showListPopup && (
          <div className="modal-overlay" onClick={() => { setShowListPopup(false); setCreatingList(false); }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 340, textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.9375rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <BookMarked size={16} /> Listeye Ekle
                </h3>
                <button className="icon-btn" onClick={() => setShowListPopup(false)}><X size={14} /></button>
              </div>
              {userLists.length === 0 && !creatingList ? (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Henüz liste yok. Bir liste oluşturun.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.75rem', maxHeight: 220, overflowY: 'auto' }}>
                  {userLists.map(lst => (
                    <label key={lst.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.625rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', boxShadow: itemListIds.includes(lst.id) ? 'var(--ring-accent)' : 'var(--ring)', background: itemListIds.includes(lst.id) ? 'rgba(0,112,243,0.05)' : 'transparent' }}
                      onClick={() => toggleList(lst.id)}>
                      <span style={{ width: 16, height: 16, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: itemListIds.includes(lst.id) ? 'var(--accent)' : 'transparent', boxShadow: itemListIds.includes(lst.id) ? 'none' : 'var(--ring)', flexShrink: 0 }}>
                        {itemListIds.includes(lst.id) && <Check size={11} color="white" />}
                      </span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 500, flex: 1 }}>{lst.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{lst.item_count}</span>
                    </label>
                  ))}
                </div>
              )}
              {creatingList ? (
                <form onSubmit={createAndAddList} style={{ display: 'flex', gap: '0.375rem' }}>
                  <input className="filter-select" style={{ flex: 1, padding: '0.375rem 0.625rem', fontSize: '0.875rem' }}
                    placeholder="Liste adı..." value={newListName} onChange={e => setNewListName(e.target.value)} autoFocus />
                  <button type="submit" className="btn btn-primary btn-sm" disabled={!newListName.trim()}><Check size={13} /></button>
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => setCreatingList(false)}><X size={13} /></button>
                </form>
              ) : (
                <button className="btn btn-sm btn-outline" style={{ width: '100%', gap: '0.375rem', justifyContent: 'center', display: 'flex', alignItems: 'center' }} onClick={() => setCreatingList(true)}>
                  <Plus size={13} /> Yeni Liste Oluştur
                </button>
              )}
            </div>
          </div>
        )}

        {showHideConfirm && (
          <div className="modal-overlay" onClick={() => setShowHideConfirm(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 380, textAlign: 'center' }}>
              <div style={{ marginBottom: '0.75rem' }}>
                <EyeOff size={32} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>Akıştan çıkarılsın mı?</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', margin: 0, lineHeight: 1.5 }}>
                  Bu haber ana akışınızdan kaldırılacak.<br />
                  Dilediğiniz zaman <strong>Akıştan Çıkarılanlar</strong> sayfasından geri alabilirsiniz.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                <button className="btn btn-sm btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }} onClick={() => setShowHideConfirm(false)}>
                  <X size={13} /> İptal
                </button>
                <button className="btn btn-sm btn-danger" onClick={confirmHide} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <EyeOff size={13} /> Akıştan Çıkar
                </button>
              </div>
            </div>
          </div>
        )}

        {showRestoreConfirm && (
          <div className="modal-overlay" onClick={() => setShowRestoreConfirm(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 380, textAlign: 'center' }}>
              <div style={{ marginBottom: '0.75rem' }}>
                <Eye size={32} style={{ color: 'var(--accent)', marginBottom: '0.5rem' }} />
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>Akışa geri alınsın mı?</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', margin: 0, lineHeight: 1.5 }}>
                  Bu haber tekrar ana akışınızda görünecek.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                <button className="btn btn-sm btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }} onClick={() => setShowRestoreConfirm(false)}>
                  <X size={13} /> İptal
                </button>
                <button className="btn btn-sm btn-primary" onClick={confirmRestore} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Eye size={13} /> Akışa Geri Al
                </button>
              </div>
            </div>
          </div>
        )}
      </>,
      document.body
    )}
    </>
  );
}
