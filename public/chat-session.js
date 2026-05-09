/**
 * chat-session.js — Quản lý lịch sử cuộc trò chuyện (localStorage)
 * Không liên quan đến AI context — chỉ là UI history đơn giản.
 */

const ChatSession = (() => {
  const STORAGE_KEY = 'coUt_sessions';
  const MAX_SESSIONS = 20;

  let sessions = [];
  let currentId = null;
  let currentMessages = []; // [{ role: 'user'|'bot', html: string }]

  // ─── Load từ localStorage ───────────────────────────────────────────────
  function load() {
    try {
      sessions = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      sessions = [];
    }
  }

  // ─── Tạo session mới ────────────────────────────────────────────────────
  function newSession() {
    currentId = 'ses_' + Date.now();
    currentMessages = [];
  }

  // ─── Lưu 1 tin nhắn vào session hiện tại ────────────────────────────────
  function addMessage(role, html) {
    currentMessages.push({ role, html });

    const title = _getTitle();
    const idx = sessions.findIndex(s => s.id === currentId);
    const data = {
      id: currentId,
      title,
      messages: [...currentMessages],
      updatedAt: Date.now(),
    };

    if (idx >= 0) {
      sessions[idx] = data;
    } else {
      sessions.unshift(data);
      if (sessions.length > MAX_SESSIONS) sessions = sessions.slice(0, MAX_SESSIONS);
    }

    _persist();
  }

  // ─── Lấy session theo id ────────────────────────────────────────────────
  function getSession(id) {
    return sessions.find(s => s.id === id) || null;
  }

  // ─── Danh sách tất cả sessions ──────────────────────────────────────────
  function getAll() {
    return sessions;
  }

  // ─── Id session đang active ─────────────────────────────────────────────
  function getCurrentId() {
    return currentId;
  }

  // ─── Restore session (khi user click vào lịch sử) ───────────────────────
  function restoreSession(id) {
    const s = getSession(id);
    if (!s) return false;
    currentId = id;
    currentMessages = [...s.messages];
    return true;
  }

  // ─── Xóa 1 session ──────────────────────────────────────────────────────
  function deleteSession(id) {
    sessions = sessions.filter(s => s.id !== id);
    if (currentId === id) {
      newSession(); // reset về session mới nếu đang xem session bị xóa
    }
    _persist();
  }

  // ─── Xóa toàn bộ lịch sử ────────────────────────────────────────────────
  function clearAll() {
    sessions = [];
    newSession();
    _persist();
  }

  // ─── Private ────────────────────────────────────────────────────────────
  function _getTitle() {
    const first = currentMessages.find(m => m.role === 'user');
    if (!first) return 'Cuộc trò chuyện';
    // strip html tags, giới hạn 50 ký tự
    return first.html.replace(/<[^>]*>/g, '').slice(0, 50);
  }

  function _persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.warn('ChatSession: không thể lưu localStorage', e);
    }
  }

  return { load, newSession, addMessage, getSession, getAll, getCurrentId, restoreSession, deleteSession, clearAll };
})();