
import { chat as templateFallback } from './chatbot_template.js';
import { SYSTEM_PROMPT, BEHAVIOR, GREETING_RESPONSE } from './persona.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.1-8b-instant';
const TIMEOUT_MS = 10_000;

// ─── Public API (giống interface chatbot_template.js) ─────────────────────────

export async function loadChatbot() {
    const key = _getApiKey();
    if (!key) {
        console.warn('[Groq] AI_API_KEY chưa được set → sẽ dùng template fallback');
    } else {
        console.log('[Groq] Ready — model:', MODEL);
    }
    return null; // không cần generator object
}

export async function chat(_generator, context, question) {
    // if (!context?.trim()) {
    //     return 'Tôi không tìm thấy thông tin về vấn đề này trong tài liệu.';
    // }
    if (!context?.trim()) {
        return templateFallback(null, context, question);
    }

    const key = _getApiKey();
    if (!key) return templateFallback(null, context, question);

    try {
        return await _callGroq(key, context, question);
    } catch (err) {
        console.error('[Groq] Lỗi, fallback về template:', err.message);
        return templateFallback(null, context, question);
    }
}

// ─── Groq API call ────────────────────────────────────────────────────────────

async function _callGroq(apiKey, context, question) {
    const userMessage = `[TÀI LIỆU PHÁP LUẬT]
${context}

[CÂU HỎI]
${question}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage },
            ],
            max_tokens: 512,
            temperature: 0.3, // thấp để bám sát tài liệu
        }),
        signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 100)}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim()
        ?? 'Không nhận được phản hồi từ Groq.';
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function _getApiKey() {
    // Hỗ trợ cả process.env (dotenv) lẫn --env-file flag của Node 20+
    return process.env.AI_API_KEY ?? null;
}