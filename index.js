const express = require("express");
const cors = require("cors");
const fs = require("fs");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* ======================
   CONFIG
====================== */
const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash"
];

/* ======================
   LOAD DATA
====================== */
const laws = JSON.parse(fs.readFileSync("laws.json", "utf-8"));

/* ======================
   NORMALIZE TEXT
====================== */
function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/* ======================
   SIMILARITY ENGINE
====================== */
function similarityScore(queryWords, textWords) {
  let score = 0;

  queryWords.forEach(qw => {
    textWords.forEach(tw => {
      if (qw === tw) score += 5;
      else if (tw.includes(qw) || qw.includes(tw)) score += 2;
    });
  });

  return score;
}

/* ======================
   LOCAL SEARCH (GOOGLE STYLE)
====================== */
function searchLaw(msg) {
  const queryWords = normalize(msg);

  let best = null;
  let maxScore = 0;

  for (const law of laws) {
    const titleWords = normalize(law.title);
    const contentWords = normalize(law.content);
    const keywordWords = normalize((law.keywords || []).join(" "));
    const groupWords = normalize(law.group || "");

    let score =
      similarityScore(queryWords, titleWords) * 4 +
      similarityScore(queryWords, keywordWords) * 5 +
      similarityScore(queryWords, contentWords) * 2 +
      similarityScore(queryWords, groupWords) * 3;

    // boost nếu match group
    if (groupWords.some(w => queryWords.includes(w))) {
      score += 5;
    }

    if (score > maxScore) {
      maxScore = score;
      best = law;
    }
  }

  return maxScore > 6 ? best : null;
}

/* ======================
   GEMINI CALL (RETRY + QUOTA SAFE)
====================== */
async function callGemini(prompt) {
  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      );

      const data = await res.json();

      if (data?.error) {
        const code = data.error.code;
        console.log("⚠️ Gemini error:", data.error.message);

        if (code === 429) {
          throw new Error("QUOTA_EXCEEDED");
        }

        if (code === 503) {
          continue;
        }

        continue;
      }

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;

    } catch (err) {
      console.log("❌ Model fail:", err.message);
    }
  }

  throw new Error("AI_UNAVAILABLE");
}

/* ======================
   FALLBACK RULE ENGINE
====================== */
function smartFallback(msg) {
  const q = msg.toLowerCase();

  if (q.includes("tạm giữ")) {
    return `📘 Giải thích: Tạm giữ tối đa 3 ngày, gia hạn tối đa 9 ngày.
📖 Căn cứ: Điều 118 BLTTHS 2015`;
  }

  if (q.includes("tạm giam")) {
    return `📘 Giải thích: Tạm giam từ 2–4 tháng tùy vụ án.
📖 Căn cứ: BLTTHS 2015`;
  }

  if (q.includes("ma túy")) {
    return `📘 Giải thích: Có thể bị xử lý hình sự hoặc cai nghiện bắt buộc.
📖 Căn cứ: Luật Phòng, chống ma túy 2021`;
  }

  return "⚠️ Không tìm thấy thông tin phù hợp.";
}

/* ======================
   API CHAT
====================== */
app.post("/chat", async (req, res) => {
  const msg = req.body.message;

  if (!msg) {
    return res.json({ answer: "Vui lòng nhập câu hỏi." });
  }

  const lower = msg.toLowerCase();

  /* TIME */
  if (lower.includes("ngày") && lower.includes("hiện")) {
    const now = new Date().toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh"
    });

    return res.json({
      answer: `📅 Thời gian hiện tại: ${now}`
    });
  }

  /* ======================
     1. LOCAL SEARCH
  ====================== */
  const local = searchLaw(msg);

  if (local) {
    const penaltyText =
      local.penalty?.criminal
        ?.map(p => `- ${p.level}: ${p.detail}`)
        .join("\n") || "";

    return res.json({
      answer:
`📘 Giải thích:
${local.content}

📖 Căn cứ pháp lý:
${local.law}

🔒 Mức hình phạt:
${penaltyText}

🔎 Nguồn: dữ liệu nội bộ`
    });
  }

  /* ======================
     2. AI FALLBACK
  ====================== */
  try {
    const prompt = `
Bạn là chatbot luật Việt Nam.

QUY TẮC:
- Rất ngắn (tối đa 3 dòng mỗi mục)
- Không phân tích dài
- Chỉ chọn 1 tội danh phù hợp nhất

FORMAT:
📘 Giải thích
📖 Căn cứ pháp lý
🔒 Hình phạt

Nếu không chắc:
"Không đủ dữ liệu pháp lý"

Câu hỏi: ${msg}
`;

    const text = await callGemini(prompt);

    return res.json({
      answer: `🤖 AI pháp luật:\n\n${text}`
    });

  } catch (err) {
    if (err.message === "QUOTA_EXCEEDED") {
      return res.json({
        answer: "⚠️ Hết quota AI. Vui lòng thử lại sau 24h."
      });
    }

    /* ======================
       3. FALLBACK RULE
    ====================== */
    const fallback = smartFallback(msg);

    return res.json({
      answer: fallback
    });
  }
});

/* ======================
   START SERVER
====================== */
app.listen(3000, () => {
  console.log("🚀 Server running: http://localhost:3000");
});