import * as lancedb from '@lancedb/lancedb';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'db_source', 'lancedb');
const TABLE_NAME = 'documents';

let _db = null;
let _table = null;

async function getDB() {
    if (_db) return _db;
    _db = await lancedb.connect(DB_PATH);
    return _db;
}

/**
 * Lưu documents vào LanceDB
 */
export async function saveIndex(documents) {
    const db = await getDB();

    // Chuẩn bị data theo format LanceDB
    const rows = documents.map(doc => ({
        id: doc.id,
        text: doc.text,
        chunk_index: doc.chunk_index,
        source: doc.metadata?.source || 'unknown',
        vector: doc.vector,
    }));

    // Xóa table cũ nếu có
    const tableNames = await db.tableNames();
    if (tableNames.includes(TABLE_NAME)) {
        await db.dropTable(TABLE_NAME);
    }

    // Tạo table mới
    _table = await db.createTable(TABLE_NAME, rows);

    console.log(`[VectorStore] Saved ${rows.length} documents to LanceDB`);
}

/**
 * Load table từ LanceDB
 */
export async function loadIndex() {
    const db = await getDB();
    const tableNames = await db.tableNames();

    if (!tableNames.includes(TABLE_NAME)) {
        throw new Error('Vector store chưa tồn tại. Hãy chạy: npm run build-index');
    }

    _table = await db.openTable(TABLE_NAME);
    const count = await _table.countRows();
    console.log(`[VectorStore] Loaded ${count} documents from LanceDB`);
    return _table;
}

/**
 * Tìm top-K documents gần nhất bằng ANN search
 */
export async function search(table, queryVector, topK = 3) {
    const results = await table
        .vectorSearch(queryVector)
        .distanceType('cosine')
        .limit(topK)
        .toArray();

    return results.map(r => ({
        text: r.text,
        score: 1 - r._distance, // LanceDB trả về distance, đổi sang similarity
        metadata: {
            id: r.id,
            source: r.source,
            chunk_index: r.chunk_index,
        },
    }));
}