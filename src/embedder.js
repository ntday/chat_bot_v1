import { pipeline, env } from '@huggingface/transformers';

env.allowRemoteModels = false;
env.localModelPath = './store_model/';

let _embedder = null;

export async function loadEmbedder() {
    if (_embedder) return _embedder;
    console.log('[Embedder] Loading model...');
    // Dùng đường dẫn đầy đủ thay vì tên ngắn
    _embedder = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small');
    console.log('[Embedder] Ready');
    return _embedder;
}

export async function embedDocument(embedder, text) {
    const output = await embedder('passage: ' + text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

export async function embedQuery(embedder, text) {
    const output = await embedder('query: ' + text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

// Giữ hàm embed chung cho backward compat
export async function embed(embedder, text) {
    return embedDocument(embedder, text);
}