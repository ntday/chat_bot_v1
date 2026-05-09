/**
 * chat.js — Orchestrator chính
 * Phụ thuộc: jQuery, Bootstrap, GSAP, tsParticles
 *            chat-session.js, chat-ui.js, chat-api.js
 */

$(function () {
  // ─── State ────────────────────────────────────────────────────────────────
  let isProcessing = false;
  let chatStarted = false;

  // ─── DOM refs ─────────────────────────────────────────────────────────────
  const $messages  = $('#messages');
  const $input     = $('#user-input');
  const $btnSend   = $('#btn-send');
  const $history   = $('#history');
  const $btnNew    = $('#btn-new-chat');
  const $btnSidebar = $('#btn-toggle-sidebar');
  const $welcome   = $('#welcome');
  const $sidebar   = $('#sidebar');
  const $richMode  = $('#rich-mode');
  const $body      = $('body');

  // ─── Init modules ─────────────────────────────────────────────────────────
  ChatSession.load();
  ChatSession.newSession();

  ChatUI.init({ $messages, $history, $welcome, $sidebar, $input });
  ChatUI.renderSessionList(handleLoadSession, handleDeleteSession, handleClearAll);

  // ─── Rich Mode ────────────────────────────────────────────────────────────
  if (localStorage.getItem('richMode') !== 'false') {
    $richMode.prop('checked', true);
    $body.addClass('rich-mode');
  }

  $richMode.on('change', function () {
    if (this.checked) {
      $body.addClass('rich-mode');
      initParticles();
      gsap.from('.msg', { y: 30, opacity: 0, stagger: 0.1, duration: 0.6, ease: 'power2.out' });
    } else {
      $body.removeClass('rich-mode');
      if (window.particlesInstance) window.particlesInstance.stop();
    }
    localStorage.setItem('richMode', this.checked ? 'true' : 'false');
  });

  function initParticles() {
    if (window.particlesInstance) return;
    tsParticles.load('particles-js', {
      fpsLimit: 60,
      particles: {
        number: { value: 60, density: { enable: true, value_area: 800 } },
        color: { value: ['#f8c1d1', '#e4a1b3', '#c08497'] },
        shape: { type: ['circle', 'star'] },
        opacity: { value: 0.6, random: true },
        size: { value: 3, random: true },
        move: { enable: true, speed: 0.8, direction: 'none', random: true, straight: false, outModes: 'out' },
      },
      interactivity: {
        events: { onHover: { enable: true, mode: 'bubble' }, resize: true },
        modes: { bubble: { distance: 200, size: 6, duration: 2, opacity: 0.8 } },
      },
      detectRetina: true,
    }).then(p => window.particlesInstance = p);
  }

  // ─── Send ─────────────────────────────────────────────────────────────────
  async function send(text) {
    if (isProcessing) {
      $input.val('').attr('placeholder', 'Cô Út đang trả lời, chờ xíu nhé 🌸');
      setTimeout(() => $input.attr('placeholder', 'Nhập câu hỏi… VD: Thời hạn tạm giữ tối đa là bao lâu?'), 1500);
      return;
    }

    const msg = (text || $input.val()).trim();
    if (!msg) return;

    isProcessing = true;
    setProcessingState(true);

    // Lần đầu gửi → ẩn welcome, hiện chat
    if (!chatStarted) {
      chatStarted = true;
      ChatUI.showChat();
    }

    // Hiện user message
    ChatUI.appendMsg(msg, 'user');
    ChatSession.addMessage('user', ChatUI.escHtml(msg));
    $input.val('');

    // Thinking indicator
    const $thinking = ChatUI.appendMsg('Đang suy nghĩ...', 'bot', true);

    try {
      const res = await ChatAPI.ask(msg);
      $thinking.remove();

      const formatted = ChatUI.formatBotText(res.answer);
      const $botMsg = ChatUI.appendMsg('', 'bot');
      await ChatUI.typeText($botMsg, formatted);

      ChatSession.addMessage('bot', formatted);

      if (res.sources?.length) ChatUI.renderSources(res.sources);

    } catch (err) {
      $thinking.remove();
      const errText = err.responseJSON?.error || 'Lỗi kết nối — thử lại nghen 😅';
      ChatUI.appendMsg(errText, 'bot');
    }

    ChatUI.renderSuggestions(msg, send);
    ChatUI.renderSessionList(handleLoadSession, handleDeleteSession, handleClearAll);

    isProcessing = false;
    setProcessingState(false);
  }

  // ─── Load session từ sidebar ───────────────────────────────────────────────
  function handleLoadSession(sessionId) {
    const ok = ChatSession.restoreSession(sessionId);
    if (!ok) return;

    const s = ChatSession.getSession(sessionId);
    ChatUI.renderRestoredSession(s.messages);
    chatStarted = true;
    ChatUI.renderSessionList(handleLoadSession, handleDeleteSession, handleClearAll);

    // Đóng sidebar trên mobile
    $sidebar.removeClass('open');
  }

  // ─── Xóa 1 session ────────────────────────────────────────────────────────
  function handleDeleteSession(sessionId) {
    const wasActive = sessionId === ChatSession.getCurrentId();
    ChatSession.deleteSession(sessionId);
    if (wasActive) {
      chatStarted = false;
      ChatUI.showWelcome();
    }
    ChatUI.renderSessionList(handleLoadSession, handleDeleteSession, handleClearAll);
  }

  // ─── Xóa toàn bộ lịch sử ──────────────────────────────────────────────────
  function handleClearAll() {
    if (!confirm('Xóa toàn bộ lịch sử trò chuyện?')) return;
    ChatSession.clearAll();
    chatStarted = false;
    ChatUI.showWelcome();
    ChatUI.renderSessionList(handleLoadSession, handleDeleteSession, handleClearAll);
  }

  // ─── New Chat ──────────────────────────────────────────────────────────────
  $btnNew.on('click', () => {
    ChatSession.newSession();
    chatStarted = false;
    ChatUI.showWelcome();
    ChatUI.renderSessionList(handleLoadSession, handleDeleteSession, handleClearAll);
  });

  // ─── Sidebar toggle (mobile) ───────────────────────────────────────────────
  $btnSidebar.on('click', () => $sidebar.toggleClass('open'));
  $(document).on('click', e => {
    if ($sidebar.hasClass('open') &&
        !$sidebar.is(e.target) &&
        $sidebar.has(e.target).length === 0 &&
        !$btnSidebar.is(e.target)) {
      $sidebar.removeClass('open');
    }
  });

  // ─── Input events ──────────────────────────────────────────────────────────
  $btnSend.on('click', () => send());
  $input.on('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) send(); });

  // ─── Sample questions ──────────────────────────────────────────────────────
  $('.sample-btn').on('click', function () { send($(this).text().trim()); });

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function setProcessingState(on) {
    $btnSend.prop('disabled', on);
    $input.prop('disabled', on);
    $input.attr('placeholder', on
      ? '🌸 Cô Út đang trả lời, chờ xíu...'
      : 'Nhập câu hỏi… VD: Thời hạn tạm giữ tối đa là bao lâu?'
    );
  }
});