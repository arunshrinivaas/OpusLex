from sqlalchemy.orm import Session
from sentence_transformers import SentenceTransformer

from app.models.document import Document
from app.models.document_chunk import DocumentChunk


MODEL_NAME = "all-MiniLM-L6-v2"

model = SentenceTransformer(MODEL_NAME)


import asyncio


def generate_embedding(text: str) -> list[float]:
    embedding = model.encode(
        text,
        normalize_embeddings=True,
    )

    return embedding.tolist()


async def generate_embedding_async(text: str) -> list[float]:
    """Asynchronously generates normalized embeddings off the main event loop thread."""
    return await asyncio.to_thread(generate_embedding, text)


def embed_document_chunks(
    db: Session,
    document_id: int,
) -> int:
    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == document_id)
        .order_by(DocumentChunk.chunk_index)
        .all()
    )

    for chunk in chunks:
        chunk.embedding = generate_embedding(chunk.content)

    db.commit()

    return len(chunks)