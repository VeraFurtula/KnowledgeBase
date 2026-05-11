"""
RAG API: LangChain + Chroma + Ollama embeddings. Run from `server/`:
  pip install -r requirements.txt
  copy .env.example .env   # then edit
  python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

import chromadb
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from langchain_community.embeddings import OllamaEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pydantic import BaseModel, Field

load_dotenv()


def _setup_langsmith() -> None:
    tracing = os.getenv("LANGSMITH_TRACING", "").lower() in ("true", "1", "yes")
    if tracing:
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
    key = os.getenv("LANGSMITH_API_KEY", "").strip()
    if key:
        os.environ["LANGCHAIN_API_KEY"] = key
    proj = os.getenv("LANGSMITH_PROJECT", "").strip()
    if proj:
        os.environ["LANGCHAIN_PROJECT"] = proj
    endpoint = os.getenv("LANGSMITH_ENDPOINT", "").strip()
    if endpoint:
        os.environ["LANGCHAIN_ENDPOINT"] = endpoint


_setup_langsmith()

CHROMA_PATH = os.path.abspath(os.getenv("CHROMA_PATH", os.path.join(os.path.dirname(__file__), "data", "chroma")))
VECTOR_BACKEND = os.getenv("VECTOR_BACKEND", "chroma").lower().strip()
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
EMB_MODEL = os.getenv("EMB_MODEL", "nomic-embed-text").strip()

os.makedirs(CHROMA_PATH, exist_ok=True)

embeddings = OllamaEmbeddings(model=EMB_MODEL, base_url=OLLAMA_BASE_URL)


def _chunk_settings() -> tuple[int, int]:
    """eFront-style manuals: ~800–1200 tokens/chars window, 150–250 overlap (env-tunable)."""
    size = int(os.getenv("CHUNK_SIZE", "1000"))
    overlap = int(os.getenv("CHUNK_OVERLAP", "200"))
    size = max(800, min(size, 1200))
    overlap = max(150, min(overlap, 250))
    if overlap >= size:
        overlap = max(150, min(200, size // 2))
    return size, overlap


CHUNK_SIZE, CHUNK_OVERLAP = _chunk_settings()
splitter = RecursiveCharacterTextSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)

# Markers emitted by the browser extractor (see `extractDocumentText.ts`).
_MARK_PAGE_OR_SLIDE = re.compile(r"(?:^|\n)--- (?:PDF page|PPTX slide) (\d+) ---\n")


def collection_name(user_id: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_-]", "_", user_id.strip().lower())
    return (safe[:63] or "user") + "_kb"


app = FastAPI(title="Knowledge Base RAG")
_cors = os.getenv("CORS_ORIGINS", "").strip()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors.split(",") if _cors else ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class IndexDoc(BaseModel):
    id: str
    text: str
    filename: str = ""


class IndexRequest(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=256)
    documents: list[IndexDoc]


class SearchRequest(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=256)
    query: str = Field(..., min_length=1, max_length=32_000)
    k: int = Field(12, ge=1, le=40)


def _delete_collection(name: str) -> None:
    client = chromadb.PersistentClient(path=CHROMA_PATH)
    try:
        client.delete_collection(name)
    except Exception:
        pass


def _marked_blocks(text: str) -> list[tuple[int | None, str]]:
    """Split on PDF page / PPTX slide markers so chunk metadata can carry page/slide numbers."""
    matches = list(_MARK_PAGE_OR_SLIDE.finditer(text))
    if not matches:
        return [(None, text)]
    blocks: list[tuple[int | None, str]] = []
    first = matches[0].start()
    if first > 0:
        head = text[:first].strip()
        if head:
            blocks.append((None, head))
    for i, m in enumerate(matches):
        page = int(m.group(1))
        a = m.end()
        b = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[a:b].strip()
        if body:
            blocks.append((page, body))
    return blocks if blocks else [(None, text)]


def _section_hint(chunk: str) -> str:
    """First substantive line as a weak 'section' label for citations."""
    for line in chunk.splitlines():
        t = line.strip()
        if len(t) < 4:
            continue
        return t[:140] + ("…" if len(t) > 140 else "")
    return ""


def _documents_to_langchain_docs(rows: list[IndexDoc]) -> list[Document]:
    out: list[Document] = []
    g = 0
    for row in rows:
        text = (row.text or "").strip()
        if not text:
            continue
        src = row.filename or row.id
        module = (Path(src).stem[:80] or "document")
        for page_num, block in _marked_blocks(text):
            for chunk in splitter.split_text(block):
                chunk = chunk.strip()
                if not chunk:
                    continue
                meta: dict[str, Any] = {
                    "source": src,
                    "doc_id": row.id,
                    "chunk": g,
                    "module": module,
                    "section": _section_hint(chunk),
                }
                if page_num is not None:
                    meta["page"] = page_num
                out.append(Document(page_content=chunk, metadata=meta))
                g += 1
    return out


@app.get("/")
def root() -> dict[str, Any]:
    """Browser default is GET `/` — avoid a bare 404 when developers open the RAG port."""
    return {
        "service": "Knowledge Base RAG API",
        "note": "There is no page at `/`. Use the JSON endpoints below or open `/docs` for interactive API.",
        "endpoints": {
            "GET /health": "status, embedding model, chunk settings",
            "POST /index": "body: { user_id, documents: [{ id, text, filename }] }",
            "POST /search": "body: { user_id, query, k }",
            "GET /docs": "Swagger UI (try /health here)",
        },
    }


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "vector_backend": VECTOR_BACKEND,
        "chroma_path": CHROMA_PATH,
        "emb_model": EMB_MODEL,
        "ollama_base": OLLAMA_BASE_URL,
        "chunk_size": CHUNK_SIZE,
        "chunk_overlap": CHUNK_OVERLAP,
    }


@app.post("/index")
def index_docs(body: IndexRequest) -> dict[str, str]:
    if VECTOR_BACKEND != "chroma":
        raise HTTPException(400, f"Unsupported VECTOR_BACKEND={VECTOR_BACKEND!r} (only 'chroma').")

    name = collection_name(body.user_id)
    docs = _documents_to_langchain_docs(body.documents)
    _delete_collection(name)

    if not docs:
        return {"status": "empty", "collection": name}

    Chroma.from_documents(
        documents=docs,
        embedding=embeddings,
        persist_directory=CHROMA_PATH,
        collection_name=name,
    )
    return {"status": "indexed", "collection": name, "chunks": str(len(docs))}


@app.post("/search")
def search(body: SearchRequest) -> dict[str, str]:
    if VECTOR_BACKEND != "chroma":
        raise HTTPException(400, f"Unsupported VECTOR_BACKEND={VECTOR_BACKEND!r}.")

    name = collection_name(body.user_id)
    client = chromadb.PersistentClient(path=CHROMA_PATH)
    names = {c.name for c in client.list_collections()}
    if name not in names:
        return {"context": ""}

    store = Chroma(
        persist_directory=CHROMA_PATH,
        embedding=embeddings,
        collection_name=name,
    )
    hits = store.similarity_search(body.query, k=body.k)
    parts: list[str] = []
    for d in hits:
        src = d.metadata.get("source", "?")
        mod = d.metadata.get("module", "")
        sec = str(d.metadata.get("section", "") or "").replace("\n", " ")
        pg = d.metadata.get("page")
        head = f"Source: {src}"
        if mod:
            head += f" | module: {mod}"
        if pg is not None:
            head += f" | page: {pg}"
        if sec:
            head += f" | section: {sec[:160]}"
        parts.append(f"{head}\n{d.page_content}")
    return {"context": "\n\n══════════════\n\n".join(parts)}
