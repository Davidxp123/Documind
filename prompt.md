# DocuMind: Replace sentence-transformers with fastembed (Render free-tier memory fix)

## 1. Why

DocuMind will run on Render's free plan (512 MB RAM). `sentence-transformers` pulls in PyTorch and will exceed that limit. Replace it with **`fastembed`** (ONNX runtime, no PyTorch) using the **same model**, so existing vectors in the Pinecone index `docmind-index` stay valid. **No re-indexing is allowed or needed.**

## 2. Hard rules

- Keep the **same model**: `BAAI/bge-small-en-v1.5` (384 dimensions). Do not change the model, the vector size, the Pinecone index name, or the metric.
- Do not change the public interface of the Pinecone store class (method names, arguments, return shapes). Callers elsewhere in the backend must work without edits.
- Do not change UI, other services, or unrelated files.
- Never print or commit secrets.
- If anything below is not true in the actual code, stop and report instead of improvising.

## 3. Current state (already inspected)

`backend/app/services/pinecone_store.py` is the only file that uses embeddings:

- line 4: `from sentence_transformers import SentenceTransformer`
- line 18: `self.model = SentenceTransformer("BAAI/bge-small-en-v1.5")` (loaded in `__init__`)
- line 43: `embeddings = self.model.encode(documents).tolist()` (used to build the upsert vectors)
- line 67: `query_embedding = self.model.encode([query_text]).tolist()[0]` (used for the query)

`backend/requirements.txt` lists `sentence-transformers>=2.5.1`.

## 4. Tasks

1. **Audit first (no edits):** confirm with `grep -rn "sentence_transformers\|SentenceTransformer\|torch" backend --include=*.py` that no other file imports sentence-transformers or torch. Also check whether any other listed package in `requirements.txt` would still drag PyTorch in; report if so.
2. **Update `pinecone_store.py`:**
   - Replace the import with `from fastembed import TextEmbedding`.
   - Create the model with `TextEmbedding(model_name="BAAI/bge-small-en-v1.5")`.
   - Build a small helper (e.g. `_embed(texts: list[str]) -> list[list[float]]`) that calls `list(self.model.embed(texts))` and converts each numpy vector to a plain Python `list[float]`. Use it at both call sites so the shapes match exactly what `encode(...).tolist()` returned before (a list of lists for documents, a single list for the query).
   - Use `embed()` for **both** documents and queries (the old code did not add any query prefix; do not use `query_embed`, to keep behavior identical).
   - Make sure vectors are L2-normalized like before. The sentence-transformers BGE config normalizes, and fastembed's BGE output is normalized too; verify by checking the norm of one vector is about 1.0, and normalize manually if not.
   - Keep the model load where it is today, but make sure it is only created once per process (no re-loading per request).
3. **Model cache**: fastembed downloads the model on first use. Set an explicit `cache_dir` inside the backend (for example `backend/storage/fastembed_cache`, created with `os.makedirs(..., exist_ok=True)`) so the location is predictable, and make sure that folder is git-ignored. Do not commit model files. Note in the report that on Render's free plan the cache is wiped on each restart, so the first start after a restart re-downloads the model (small, but it adds startup time).
4. **`backend/requirements.txt`**: remove `sentence-transformers`, add `fastembed`. Do not touch other lines.
5. **Install and test locally** (in the existing venv): `pip uninstall sentence-transformers torch -y` (if installed), `pip install -r requirements.txt`, then start the backend and verify:
   - the app starts without importing torch
   - upload a small text document and confirm it is chunked, embedded, and upserted to Pinecone without errors
   - ask a question about it and confirm retrieval returns relevant chunks from both a **new** document and a document uploaded **before** the change (this proves the old vectors are still compatible)
   - report approximate process memory after startup (e.g. via Task Manager or `psutil`)

## 5. Final report (required)

1. Every file changed, one line each
2. The audit result for other torch/sentence-transformers usage
3. Test results, including the old-vs-new document retrieval check and the memory figure
4. Anything surprising or not matching this spec