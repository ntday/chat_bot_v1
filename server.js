/**
 * server.js — Web server cho Cô Út Pháp Luật
 *
 * Thay thế index.js (CLI) bằng Express HTTP server.
 * Route: POST /chat  →  { answer, sources }
 *
 * Cài thêm: npm install express
 * Chạy:     node --env-file=.env server.js
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { initRAG, ask } from './src/rag.js';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Serve static files (index.html, chat.js, …) từ thư mục gốc project
app.use(express.static(path.join(__dirname, 'public')));

// ─── Khởi tạo RAG một lần khi server start ───────────────────────────────────
let rag = null;

async function bootstrap() {
    console.log('========================================');
    console.log('     Cô Út Pháp Luật — Web Server       ');
    console.log('========================================\n');
    console.log('Đang khởi tạo RAG pipeline...');
    rag = await initRAG();
    console.log('✅ Sẵn sàng!\n');

    app.listen(PORT, () => {
        console.log(`🌸 Server đang chạy tại http://localhost:${PORT}`);
    });
}

// ─── Route: POST /chat ────────────────────────────────────────────────────────
app.post('/chat', async (req, res) => {
    const { message } = req.body;

    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'message không được để trống' });
    }

    if (!rag) {
        return res.status(503).json({ error: 'Hệ thống chưa sẵn sàng, thử lại sau' });
    }

    try {
        const { answer, sources } = await ask(rag, message.trim());
        res.json({ answer, sources });
    } catch (err) {
        console.error('[/chat] Lỗi:', err.message);
        res.status(500).json({ error: 'Lỗi hệ thống: ' + err.message });
    }
});

// ─── Catch-all: trả về index.html cho SPA ────────────────────────────────────
app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

bootstrap().catch(err => {
    console.error('❌ Không thể khởi động server:', err.message);
    process.exit(1);
});