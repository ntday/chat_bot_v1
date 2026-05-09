
export async function loadChatbot() {
    console.log('[Chatbot/Template] Ready');
    return null;
}

export function buildPrompt(context, question) {
    return context;
}

export async function chat(_generator, context, question) {
    
    if (!context || context.trim().length === 0) {
        return 'Tôi không tìm thấy thông tin về vấn đề này trong tài liệu.';
    }

    const qType = detectQuestionType(question);

    switch (qType) {
        case 'duration':  return handleDuration(context, question);
        case 'procedure': return handleProcedure(context, question);
        default:          return handleGeneral(context, question);
    }
}

// ─── Phát hiện loại câu hỏi ──────────────────────────────────────────────────

function detectQuestionType(q) {
    const lower = q.toLowerCase();
    if (/thời hạn|thời gian|bao lâu|mấy ngày|mấy tháng|bao nhiêu ngày/.test(lower)) {
        return 'duration';
    }
    if (/thủ tục|quy trình|hồ sơ|giấy tờ|nhập trại|cần những gì|bao gồm/.test(lower)) {
        return 'procedure';
    }
    return 'general';
}

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * Câu hỏi về thời hạn: ưu tiên câu chứa con số + keyword
 */
function handleDuration(context, question) {
    const lines = splitLines(context);
    const keywords = extractKeywords(question);
    const durationPattern = /\d+\s*(ngày|tháng|năm|giờ)|tối đa|tối thiểu/i;

    // Câu vừa có số thời gian vừa match keyword, giữ thứ tự gốc
    const matched = lines
        .map((text, idx) => ({ text, idx, score: scoreKeywords(text, keywords) }))
        .filter(s => s.score > 0 && durationPattern.test(s.text))
        .sort((a, b) => a.idx - b.idx)   // thứ tự gốc
        .slice(0, 3)
        .map(s => s.text);

    if (matched.length > 0) return matched.join('\n');
    return handleGeneral(context, question);
}

/**
 * Câu hỏi về thủ tục: tìm chunk liên quan nhất, format thành danh sách,
 * KHÔNG xáo trộn thứ tự nội dung bên trong chunk
 */
function handleProcedure(context, question) {
    const keywords = extractKeywords(question);

    // Tách context thành các chunk (phân cách bởi dòng trống)
    const chunks = context.split(/\n{2,}/).map(c => c.trim()).filter(Boolean);

    // Tìm chunk match keyword nhiều nhất (nếu chỉ có 1 chunk thì dùng luôn)
    const best = chunks
        .map(chunk => ({ chunk, score: scoreKeywords(chunk, keywords) }))
        .sort((a, b) => b.score - a.score)[0]?.chunk || context;

    // Tách chunk thành các mục theo dấu phẩy hoặc dấu chấm phẩy
    // (vì data.txt dùng dấu phẩy để liệt kê các giấy tờ)
    const rawItems = best
        .split(/,\s*|;\s*|\n/)
        .map(l => l.trim())
        .filter(l => l.length > 5);

    if (rawItems.length <= 1) return best;

    // Câu đầu tiên thường là header ("Thủ tục ... bao gồm:")
    const firstItem = rawItems[0];
    const isHeader = /bao gồm|gồm|như sau/i.test(firstItem) || firstItem.endsWith(':');

    if (isHeader) {
        const header = firstItem.replace(/:$/, '').trim() + ':';
        const items = rawItems.slice(1).map(l => `  • ${capitalize(l)}`).join('\n');
        return `${header}\n${items}`;
    }

    // Không có header rõ ràng → liệt kê toàn bộ
    return rawItems.map(l => `  • ${capitalize(l)}`).join('\n');
}

/**
 * Câu hỏi tổng quát: lấy top câu liên quan, sắp lại theo thứ tự gốc
 */
function handleGeneral(context, question) {
    const lines = splitLines(context);
    const keywords = extractKeywords(question);

    if (keywords.length === 0) return lines.slice(0, 3).join(' ');

    const scored = lines
        .map((text, idx) => ({ text, idx, score: scoreKeywords(text, keywords) }))
        .filter(s => s.score > 0);

    if (scored.length === 0) return lines.slice(0, 2).join(' ');

    // Sort theo score để chọn top 4, rồi sort lại theo idx để giữ thứ tự gốc
    const top = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .sort((a, b) => a.idx - b.idx)
        .map(s => s.text);

    return top.join(' ');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function splitLines(context) {
    return context
        .split(/\n+/)
        .map(s => s.trim())
        .filter(s => s.length > 10);
}

function extractKeywords(text) {
    const stopWords = new Set([
        'là', 'và', 'của', 'có', 'được', 'trong', 'với', 'cho', 'các', 'những',
        'một', 'này', 'đó', 'để', 'khi', 'thì', 'mà', 'hay', 'hoặc', 'như',
        'về', 'từ', 'tại', 'theo', 'bởi', 'do', 'nên', 'vì', 'nếu', 'thế',
        'bao', 'nhiêu', 'gì', 'nào', 'sao', 'đâu', 'ai', 'hỏi', 'hãy', 'xin',
        'tôi', 'bạn', 'mình', 'chúng', 'họ', 'ta', 'lâu', 'mấy',
    ]);
    return text
        .toLowerCase()
        .replace(/[?!.,;:]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w));
}

function scoreKeywords(sentence, keywords) {
    const lower = sentence.toLowerCase();
    return keywords.reduce((score, kw) => score + (lower.includes(kw) ? 1 : 0), 0);
}

function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}