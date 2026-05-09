/**
 * chat-api.js — Gọi backend /chat
 * Phụ thuộc: jQuery
 */

const ChatAPI = (() => {
  async function ask(message) {
    const res = await $.ajax({
      url: '/chat',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ message }),
    });
    return res; // { answer, sources? }
  }

  return { ask };
})();
