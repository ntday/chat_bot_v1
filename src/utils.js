import crypto from 'crypto';

export function splitText(text, chunkSize = 500, overlap = 50) {
    const clean = text.replace(/\r/g, '').replace(/---\s*Trang \d+\s*---/g, '').trim();

    // Thử tách theo Điều trước (phù hợp văn bản luật)
    const dieu = splitByDieu(clean, chunkSize);
    if (dieu.length > 3) return dieu;

    // Fallback: tách theo đoạn văn có overlap
    return splitByParagraph(clean, chunkSize, overlap);
}

/**
 * Tách theo cấu trúc Điều X. ... của văn bản pháp luật
 */
function splitByDieu(text, maxSize) {
    // Match "Điều X." hoặc "Điều X:" ở đầu dòng
    const dieuPattern = /(?=\nĐiều \d+[.:）\s])/g;
    const parts = text.split(dieuPattern).map(p => p.trim()).filter(p => p.length > 30);

    const chunks = [];
    for (const part of parts) {
        if (part.length <= maxSize) {
            chunks.push(part);
        } else {
            // Điều quá dài → tách tiếp theo khoản
            const sub = splitByKhoan(part, maxSize);
            chunks.push(...sub);
        }
    }
    return chunks;
}

/**
 * Tách theo khoản (1. / 2. / a) / b) ) trong một Điều
 */
function splitByKhoan(text, maxSize) {
    const lines = text.split('\n');
    const chunks = [];
    let current = '';

    for (const line of lines) {
        const isKhoan = /^\s*\d+\.\s+|^\s*[a-zđ]\)\s+/i.test(line);

        if (isKhoan && current.length > 100 && (current + line).length > maxSize) {
            chunks.push(current.trim());
            current = line;
        } else {
            current = current ? `${current}\n${line}` : line;
        }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
}

/**
 * Tách theo đoạn văn với sliding window overlap
 */
function splitByParagraph(text, chunkSize, overlap) {
    const paragraphs = text
        .split(/\n{2,}/)
        .map(p => p.trim())
        .filter(p => p.length > 20);

    const chunks = [];
    let current = '';

    for (const p of paragraphs) {
        if ((current + '\n' + p).trim().length > chunkSize && current.trim()) {
            chunks.push(current.trim());
            // Overlap: giữ lại đoạn cuối của chunk trước
            const words = current.split(' ');
            current = words.slice(-overlap).join(' ') + '\n' + p;
        } else {
            current = current ? `${current}\n${p}` : p;
        }
    }
    if (current.trim().length > 20) chunks.push(current.trim());
    return chunks;
}

/**
 * Tạo document object từ chunk text
 */
export function buildDocument(chunk, index, source = 'unknown') {
    return {
        id: crypto.createHash('sha1').update(source + chunk).digest('hex'),
        chunk_index: index,
        text: chunk,
        metadata: {
            source,
            created_at: new Date().toISOString(),
            length: chunk.length,
        },
    };
}