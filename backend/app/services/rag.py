from __future__ import annotations

import logging
import re
from typing import Optional
from urllib.parse import urljoin, urlparse

import faiss
import httpx
import numpy as np
from bs4 import BeautifulSoup
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

_model: Optional[SentenceTransformer] = None

CHUNK_SIZE = 512
CHUNK_OVERLAP = 64
TOP_K = 5


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


class RAGIndex:
    """Stores scraped text chunks + FAISS index for a single scenario."""

    def __init__(self) -> None:
        self.chunks: list[str] = []
        self.index: Optional[faiss.IndexFlatIP] = None

    async def build_from_url(self, url: str, max_depth: int = 2) -> None:
        raw_texts = await _scrape(url, max_depth=max_depth)
        self.chunks = _chunk_texts(raw_texts)
        if not self.chunks:
            logger.warning("No text chunks extracted from %s", url)
            return
        model = _get_model()
        embeddings = model.encode(self.chunks, normalize_embeddings=True)
        dim = embeddings.shape[1]
        self.index = faiss.IndexFlatIP(dim)
        self.index.add(np.asarray(embeddings, dtype=np.float32))
        logger.info("RAG index built: %d chunks from %s", len(self.chunks), url)

    def query(self, text: str, top_k: int = TOP_K) -> list[str]:
        if self.index is None or not self.chunks:
            return []
        model = _get_model()
        vec = model.encode([text], normalize_embeddings=True)
        distances, indices = self.index.search(np.asarray(vec, dtype=np.float32), top_k)
        results: list[str] = []
        for idx in indices[0]:
            if 0 <= idx < len(self.chunks):
                results.append(self.chunks[idx])
        return results


_rag_store: dict[int, RAGIndex] = {}


async def index_scenario(scenario_id: int, url: str) -> RAGIndex:
    rag = RAGIndex()
    await rag.build_from_url(url)
    _rag_store[scenario_id] = rag
    return rag


def get_rag(scenario_id: int) -> Optional[RAGIndex]:
    return _rag_store.get(scenario_id)


# --------------- scraping helpers ---------------

async def _scrape(
    start_url: str, max_depth: int = 2, max_pages: int = 20
) -> list[str]:
    visited: set[str] = set()
    texts: list[str] = []
    queue: list[tuple[str, int]] = [(start_url, 0)]
    base_domain = urlparse(start_url).netloc

    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        while queue and len(visited) < max_pages:
            url, depth = queue.pop(0)
            if url in visited:
                continue
            visited.add(url)
            try:
                resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
                resp.raise_for_status()
            except Exception:
                logger.debug("Failed to fetch %s", url)
                continue

            soup = BeautifulSoup(resp.text, "html.parser")
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.decompose()
            page_text = soup.get_text(separator="\n", strip=True)
            if page_text:
                texts.append(page_text)

            if depth < max_depth:
                for a in soup.find_all("a", href=True):
                    link = urljoin(url, a["href"])
                    if urlparse(link).netloc == base_domain and link not in visited:
                        queue.append((link, depth + 1))
    return texts


def _chunk_texts(texts: list[str]) -> list[str]:
    chunks: list[str] = []
    for text in texts:
        text = re.sub(r"\n{3,}", "\n\n", text)
        words = text.split()
        for i in range(0, len(words), CHUNK_SIZE - CHUNK_OVERLAP):
            chunk = " ".join(words[i : i + CHUNK_SIZE])
            if len(chunk.strip()) > 40:
                chunks.append(chunk.strip())
    return chunks
