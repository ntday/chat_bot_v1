/**
 * chat-ui.js — Render messages, typing effect, sources, suggestions, sidebar
 * Phụ thuộc: jQuery, ChatSession
 */

const ChatUI = (() => {
  // ─── DOM refs (set bởi init) ─────────────────────────────────────────────
  let $messages, $history, $welcome, $sidebar, $input;

  const SUGGESTIONS = {
    'tạm giam': ['Tạm giam tối đa bao lâu?', 'Điều kiện được tạm giam là gì?', 'Có được gặp người thân không?', 'Quy định gia hạn tạm giam như thế nào?'],
    'tạm giữ': ['Tạm giữ tối đa bao nhiêu ngày?', 'Khác gì giữa tạm giữ và tạm giam?', 'Có được bảo lãnh khi tạm giữ không?', 'Quyền của người bị tạm giữ là gì?'],
    'trộm': ['Trộm dưới 2 triệu có bị truy cứu hình sự không?', 'Trộm bao nhiêu thì bị đi tù?', 'Khung hình phạt tội trộm cắp tài sản?', 'Có được hưởng án treo không?'],
    'ma túy': ['Tàng trữ ma túy bị xử lý thế nào?', 'Mua bán ma túy bị phạt bao nhiêu năm tù?', 'Sử dụng ma túy có bị đi tù không?', 'Phân biệt tàng trữ và vận chuyển ma túy'],
    'đánh nhau|cố ý gây thương tích': ['Đánh nhau gây thương tích bị xử lý thế nào?', 'Bao nhiêu % thương tật thì bị truy cứu hình sự?', 'Có phải đi tù không nếu hòa giải?', 'Khung hình phạt tội cố ý gây thương tích'],
    'lừa đảo': ['Lừa đảo chiếm đoạt tài sản bị phạt bao nhiêu năm tù?', 'Số tiền bao nhiêu thì bị truy cứu hình sự?', 'Phân biệt lừa đảo và tranh chấp dân sự', 'Có được giảm nhẹ hình phạt không?'],
    'thi hành án|giam giữ': ['Thời hạn thi hành án phạt tù là bao lâu?', 'Điều kiện giảm án, tha tù trước thời hạn?', 'Quy định về trại giam như thế nào?', 'Quyền của phạm nhân là gì?'],
    'thăm gặp': ['Quy định thăm gặp người bị tạm giam?', 'Bao lâu được thăm gặp 1 lần?', 'Ai được quyền thăm gặp?', 'Có được gửi đồ vào trại không?'],
  };

  // ─── Init ────────────────────────────────────────────────────────────────
  function init(refs) {
    $messages = refs.$messages;
    $history  = refs.$history;
    $welcome  = refs.$welcome;
    $sidebar  = refs.$sidebar;
    $input    = refs.$input;
  }

  // ─── Show/Hide welcome ───────────────────────────────────────────────────
  function showChat() {
    $welcome.fadeOut(180, () => $messages.fadeIn(180));
  }

  function showWelcome() {
    $messages.empty().hide();
    $welcome.show();
  }

  // ─── Append một message bubble ───────────────────────────────────────────
  function appendMsg(html, role, isThinking = false) {
    const cls = role === 'user'
      ? 'msg msg-user'
      : 'msg msg-bot' + (isThinking ? ' thinking' : '');
    const $div = $('<div>').addClass(cls);
    if (role === 'user') {
      $div.text(html); // user text là plain text
    } else {
      $div.html(isThinking ? html : html); // bot có thể chứa html đã format
    }
    $messages.append($div);
    scrollBottom();
    return $div;
  }

  // ─── Format text từ LLM → HTML an toàn ──────────────────────────────────
  function formatBotText(raw) {
    return raw
      .replace(/<[^>]*>/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/^[*\-]\s+/gm, '• ')
      .replace(/\n/g, '<br>');
  }

  // ─── Typing effect (trả về Promise) ─────────────────────────────────────
  function typeText($el, html) {
    const tokens = html.split(/(<br>)/);
    let i = 0;
    $el.html('');

    return new Promise(resolve => {
      function nextToken() {
        if (i >= tokens.length) { resolve(); return; }
        const tok = tokens[i++];
        if (tok === '<br>') {
          $el.html($el.html() + '<br>');
          scrollBottom();
          setTimeout(nextToken, 0);
        } else {
          let j = 0;
          function charTick() {
            if (j < tok.length) {
              $el.html($el.html() + tok[j++]);
              scrollBottom();
              setTimeout(charTick, 14);
            } else {
              nextToken();
            }
          }
          charTick();
        }
      }
      nextToken();
    });
  }

  // ─── Render sources block ────────────────────────────────────────────────
  function renderSources(sources) {
    const id = 'src-' + Date.now();
    const rows = sources.map(s =>
      `<div>📄 <b>${escHtml(s.source)}</b> <span class="text-muted">(${escHtml(s.score)})</span><br>
       <span class="text-muted">${escHtml(s.preview)}</span></div>`
    ).join('<hr class="my-1">');

    $messages.append($(`
      <div class="sources-wrap">
        <button class="sources-toggle" data-bs-toggle="collapse" data-bs-target="#${id}">
          📚 Xem nguồn tham khảo ▾
        </button>
        <div class="collapse sources-body" id="${id}">${rows}</div>
      </div>
    `));
    scrollBottom();
  }

  // ─── Render suggestion chips ─────────────────────────────────────────────
  function renderSuggestions(msg, onClickCb) {
    const lower = msg.toLowerCase();
    let list = [];
    for (const [key, items] of Object.entries(SUGGESTIONS)) {
      if (new RegExp(key).test(lower)) { list = items; break; }
    }
    if (!list.length) return;
    const $wrap = $('<div class="suggest-wrap">');
    list.forEach(s =>
      $('<button class="suggest-btn">').text(s).on('click', () => onClickCb(s)).appendTo($wrap)
    );
    $messages.append($wrap);
    scrollBottom();
  }

  // ─── Render sidebar session list ─────────────────────────────────────────
  function renderSessionList(onClickCb, onDeleteCb, onClearAllCb) {
    $history.empty();
    const all = ChatSession.getAll();
    const currentId = ChatSession.getCurrentId();

    if (!all.length) {
      $('<div class="hist-empty">Chưa có lịch sử 🌸</div>').appendTo($history);
      return;
    }

    all.forEach(s => {
      const $item = $('<div>').addClass('hist-item' + (s.id === currentId ? ' active' : ''));

      $('<span class="hist-title">').text(s.title).on('click', () => onClickCb(s.id)).appendTo($item);

      $('<button class="hist-del" title="Xóa">✕</button>')
        .on('click', e => { e.stopPropagation(); onDeleteCb(s.id); })
        .appendTo($item);

      $item.appendTo($history);
    });

    // Nút xóa tất cả ở cuối
    $('<button class="hist-clear-all">🗑 Xóa tất cả lịch sử</button>')
      .on('click', () => onClearAllCb())
      .appendTo($history);
  }

  // ─── Restore toàn bộ tin nhắn của 1 session ──────────────────────────────
  function renderRestoredSession(messages) {
    $messages.empty();
    $welcome.hide();
    $messages.show();

    messages.forEach(m => {
      const $div = $('<div>').addClass('msg ' + (m.role === 'user' ? 'msg-user' : 'msg-bot'));
      $div.html(m.html);
      $messages.append($div);
    });
    scrollBottom();
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  function scrollBottom() {
    $messages.scrollTop($messages[0].scrollHeight);
  }

  function escHtml(str) {
    return $('<div>').text(String(str)).html();
  }

  return {
    init,
    showChat,
    showWelcome,
    appendMsg,
    formatBotText,
    typeText,
    renderSources,
    renderSuggestions,
    renderSessionList,
    renderRestoredSession,
    escHtml,
  };
})();