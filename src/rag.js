import { loadEmbedder } from './embedder.js';
import { loadIndex, search } from './vectorStore.js';
import { GREETING_RESPONSE, BEHAVIOR } from './persona.js';
import { chat } from './chatbot.js';

const THRESHOLD = 0.78;
const TOP_K = 5;

// Nếu score cao nhất vẫn dưới mức này → chắc chắn off-topic, không cần LLM
const HARD_FLOOR = 0.60;

export async function initRAG() {
    const [embedder, table] = await Promise.all([
        loadEmbedder(),
        loadIndex(),
    ]);
    return { embedder, table };
}

export async function ask(rag, question, topK = TOP_K) {
    const { embedder, table } = rag;
    const q = question.trim();

    // ── Lớp 1: Chào hỏi / giới thiệu ─────────────────────────────────────────
    if (isGreeting(q)) {
        return {
            answer: 'Xin chào nha! Cô Út đây 😄 Bạn đang cần hỏi về thủ tục, thời hạn hay quy định pháp lý nào vậy? Cứ hỏi tự nhiên nghen, Cô Út chỉ hết cho!',
            sources: [],
        };
    }

    // ── Lớp 2: Self-intro ──────────────────────────────────────────────────────
    if (isSelfIntro(q)) {
        return {
            answer: 'Cô Út đây nha 😄 Mình là trợ lý nghiệp vụ pháp luật nội bộ — chuyên hỗ trợ các thủ tục, thời hạn, quy định pháp lý. Cứ hỏi tự nhiên nghen, Cô Út chỉ hết cho!',
            sources: [],
        };
    }

    // ── Lớp 3: Câu cảm thán / phản hồi xã giao ngắn ──────────────────────────
    if (isSmallTalk(q)) {
        return { answer: smallTalkReply(q), sources: [] };
    }

    // ── Lớp 4: Câu quá ngắn / vô nghĩa ───────────────────────────────────────
    if (isTooShortOrNonsense(q)) {
        return {
            answer: 'Bạn hỏi cụ thể hơn chút được không nha? Ví dụ: "Thời hạn tạm giữ tối đa là bao lâu?" — Cô Út chỉ hết cho! 😄',
            sources: [],
        };
    }

    // ── RAG pipeline ───────────────────────────────────────────────────────────
    const output = await embedder('query: ' + q, { pooling: 'mean', normalize: true });
    const queryVector = Array.from(output.data);

    const topDocs = await search(table, queryVector, topK);

    // Lớp 5: Score cao nhất vẫn quá thấp → chắc chắn không liên quan pháp luật
    const bestScore = topDocs[0]?.score ?? 0;
    if (bestScore < HARD_FLOOR) {
        return {
            answer: 'Câu hỏi này nằm ngoài phạm vi tài liệu pháp luật Cô Út đang có nha. Bạn thử hỏi về thủ tục, thời hạn, hoặc quy định cụ thể nghen 😄',
            sources: [],
        };
    }

    const relevant = topDocs.filter(d => d.score >= THRESHOLD);

    // Lớp 6: Có docs nhưng không đủ threshold
    if (relevant.length === 0) {
        return {
            answer: 'Cô Út tìm trong tài liệu chưa thấy thông tin chính xác về vấn đề này nha. Mình thử hỏi lại cụ thể hơn hoặc tra thêm nguồn chính thức nghen.',
            sources: [],
        };
    }

    const context = relevant.map(d => d.text).join('\n\n');
    const answer = await chat(null, context, q);

    // Deduplicate sources theo file
    const seen = new Set();
    const sources = relevant
        .filter(d => {
            const key = d.metadata?.source || 'unknown';
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .map(d => ({
            score: d.score.toFixed(4),
            source: d.metadata?.source || 'unknown',
            preview: d.text.slice(0, 80) + '...',
        }));

    return { answer, sources };
}

// ─── Classifiers ──────────────────────────────────────────────────────────────

function isGreeting(text) {
    return /^(xin chào|chào|hello|hi+|hey|alo|chào bạn|xin hỏi|good morning|good afternoon|good evening)\s*[!.]*$/i
        .test(text);
}

function isSelfIntro(text) {
    return /giới thiệu|bạn là ai|mày là ai|bạn tên gì|ai vậy|mày là gì|cô út là ai/i
        .test(text);
}

/**
 * Bắt các câu cảm thán, phản hồi xã giao thường gặp
 * — KHÔNG embed, trả lời ngay
 */
function isSmallTalk(text) {
    const t = text.toLowerCase().replace(/[!.?😄😊🤣😂]+/g, '').trim();
    const patterns = [
        // Cảm ơn
        /^(cảm ơn|cam on|thanks?|thank you|cảm ơn (bạn|cô|cô út)?)\s*[!.]*$/,
        // Khen ngợi / hài lòng
        /^(ok|oke|okay|được rồi|hiểu rồi|rõ rồi|rõ|biết rồi|nghe rồi|nhận rồi|good|great|tốt|hay|hay vậy|giỏi|giỏi quá|tuyệt|tuyệt vời|perfect|awesome)\s*[!.]*$/,
        // Ngạc nhiên / vô nghĩa
        /^(haha+|hihi+|hehe+|lol|huhu+|hmm+|ừ+|uh+|uhm+|à+|ờ+|ơ+|oh+|wow+|ồ+|ôi+)\s*[!.]*$/,
        // Tạm biệt
        /^(tạm biệt|bye+|goodbye|gặp lại|hẹn gặp lại|chào nhé)\s*[!.]*$/,
        // Không muốn hỏi nữa
        /^(thôi|thôi được rồi|không cần|không có gì|vậy thôi)\s*[!.]*$/,
    ];
    return patterns.some(p => p.test(t));
}

function smallTalkReply(text) {
    const t = text.toLowerCase();
    if (/cảm ơn|thanks|thank/.test(t))
        return 'Không có gì nha! Cô Út luôn sẵn sàng hỗ trợ 😄 Bạn còn câu hỏi nào về pháp luật không?';
    if (/tạm biệt|bye|gặp lại/.test(t))
        return 'Tạm biệt nha! Lần sau có gì vướng cứ ghé hỏi Cô Út liền nghen 🌸';
    if (/tuyệt|hay|giỏi|good|great|perfect|awesome/.test(t))
        return 'Cô Út cảm ơn lời khen nha 😄 Còn vấn đề pháp lý nào cần hỗ trợ không?';
    // default — cảm thán / tiếng ồn
    return 'Hehe 😄 Bạn có câu hỏi gì về pháp luật không? Cứ hỏi tự nhiên nghen, Cô Út chỉ hết cho!';
}

/**
 * Câu quá ngắn (< 3 ký tự) hoặc toàn ký tự đặc biệt / số
 */
function isTooShortOrNonsense(text) {
    const clean = text.replace(/\s+/g, '');
    if (clean.length < 3) return true;
    if (/^[\d\W]+$/.test(clean)) return true; // chỉ toàn số + ký tự đặc biệt
    return false;
}