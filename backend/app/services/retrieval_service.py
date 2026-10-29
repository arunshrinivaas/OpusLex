from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.embedding_service import generate_embedding


import time
import logging

logger = logging.getLogger(__name__)

DEFAULT_DISTANCE_THRESHOLD = 0.80


def search_similar_chunks(
    db: Session,
    query: str,
    limit: int = 5,
    distance_threshold: float = DEFAULT_DISTANCE_THRESHOLD,
    document_ids: list[int] | None = None,
    user_id: int | None = None,
    query_embedding: list[float] | None = None,
):
    start_time = time.perf_counter()
    if query_embedding is None:
        emb_start = time.perf_counter()
        query_embedding = generate_embedding(query)
        logger.info(f"[TIMING:embedding] generated in {(time.perf_counter() - emb_start)*1000:.2f}ms")

    # ---------------------------------------------------------
    # [DIAG] Log input parameters at debug level
    # ---------------------------------------------------------
    if logger.isEnabledFor(logging.DEBUG):
        logger.debug(f"[retrieval] query={query!r}")
        logger.debug(f"[retrieval] embedding dim={len(query_embedding)}")
        logger.debug(f"[retrieval] distance_threshold={distance_threshold}")
        logger.debug(f"[retrieval] limit={limit}")
        logger.debug(f"[retrieval] document_ids received = {document_ids!r}")

    # ---------------------------------------------------------
    # Optional document filtering
    #
    # None    -> search the entire document library
    # [1, 3]  -> search only documents 1 and 3
    # ---------------------------------------------------------

    document_filter = ""
    base_params = {
        "query_embedding": str(query_embedding),
        "limit": limit,
    }

    if document_ids is not None:
        if not document_ids:
            logger.debug("[retrieval] document_ids is empty list → returning []")
            return []

        document_filter += """
          AND document_chunks.document_id = ANY(:document_ids)
        """

        base_params["document_ids"] = document_ids

    if user_id is not None:
        document_filter += """
          AND documents.user_id = :user_id
        """
        base_params["user_id"] = user_id

    if logger.isEnabledFor(logging.DEBUG):
        logger.debug(f"[retrieval] document_filter applied = {bool(document_filter)}")
        logger.debug(f"[retrieval] base_params keys = {list(base_params.keys())}")

    # ---------------------------------------------------------
    # Production Vector Retrieval (with threshold, ranking, and limits)
    # ---------------------------------------------------------
    import re
    clause_match = re.search(r"\b(?:clause|section|article)\s*(\d+(?:\.\d+)*)\b", query, re.IGNORECASE)
    clause_num = clause_match.group(1) if clause_match else None

    # Keyword / Clause boosted retrieval
    clause_case = ""
    if clause_num:
        clause_case = "CASE WHEN document_chunks.content ILIKE :clause_kw THEN 0 ELSE 1 END,"
        base_params["clause_kw"] = f"%{clause_num}%"

    sql_with_threshold = text(f"""
        SELECT
            document_chunks.id,
            document_chunks.document_id,
            documents.title AS document_title,
            documents.filename AS document_filename,
            document_chunks.chunk_index,
            document_chunks.content,
            document_chunks.embedding <=> CAST(:query_embedding AS vector) AS distance
        FROM document_chunks
        JOIN documents
            ON documents.id = document_chunks.document_id
        WHERE document_chunks.embedding IS NOT NULL
          AND (
            document_chunks.embedding <=> CAST(:query_embedding AS vector) <= :distance_threshold
            {f"OR document_chunks.content ILIKE :clause_kw" if clause_num else ""}
          )
          {document_filter}
        ORDER BY {clause_case} document_chunks.embedding <=> CAST(:query_embedding AS vector)
        LIMIT :limit
    """)

    params_pass1 = {**base_params, "distance_threshold": distance_threshold}
    rows = db.execute(sql_with_threshold, params_pass1).mappings().all()

    logger.debug(f"[retrieval] Pass-1 (threshold={distance_threshold}) → {len(rows)} rows")

    if rows:
        return rows

    # ---------------------------------------------------------
    # PASS 2 — Scoped top-K fallback (no threshold)
    #
    # Only activates when:
    #   - document_ids was provided (investigation-scoped mode)
    #   - Pass 1 returned zero results
    #
    # The document_ids filter is PRESERVED — no global fallback.
    # ---------------------------------------------------------

    if document_ids is not None:
        logger.debug("[retrieval] Pass-1 returned 0 rows for scoped query → running Pass-2 (top-K, no threshold)")

        sql_topk = text(f"""
            SELECT
                document_chunks.id,
                document_chunks.document_id,
                documents.title AS document_title,
                documents.filename AS document_filename,
                document_chunks.chunk_index,
                document_chunks.content,
                document_chunks.embedding <=> CAST(:query_embedding AS vector) AS distance
            FROM document_chunks
            JOIN documents
                ON documents.id = document_chunks.document_id
            WHERE document_chunks.embedding IS NOT NULL
              {document_filter}
            ORDER BY document_chunks.embedding <=> CAST(:query_embedding AS vector)
            LIMIT :limit
        """)

        rows = db.execute(sql_topk, base_params).mappings().all()
        logger.debug(f"[retrieval] Pass-2 (no threshold, scoped) → {len(rows)} rows")
        return rows

    logger.debug("[retrieval] Pass-1 returned 0 rows (global RAG) → returning []")
    return rows


def get_investigation_document_ids(db: Session, investigation_id: int, investigation: Any = None) -> list[int]:
    """Retrieve document IDs associated with an investigation."""
    if investigation is not None and hasattr(investigation, "documents") and investigation.documents:
        return [d.id for d in investigation.documents if hasattr(d, "id")]
    from app.models.investigation_document import InvestigationDocument
    from sqlalchemy import select
    raw_doc_ids = db.scalars(
        select(InvestigationDocument.document_id).where(
            InvestigationDocument.investigation_id == investigation_id
        )
    ).all()
    return list(raw_doc_ids)


def get_investigation_documents_metadata(db: Session, investigation_id: int, investigation: Any = None) -> list[dict[str, Any]]:
    """Retrieve metadata for documents associated with an investigation."""
    if investigation is not None and hasattr(investigation, "documents") and investigation.documents:
        return [
            {
                "id": getattr(d, "id", None),
                "title": getattr(d, "title", getattr(d, "filename", "Document")),
                "filename": getattr(d, "filename", "Document.pdf"),
            }
            for d in investigation.documents
        ]
    doc_ids = get_investigation_document_ids(db, investigation_id, investigation)
    if not doc_ids:
        return []
    from app.models.document import Document
    docs = db.query(Document).filter(Document.id.in_(doc_ids)).all()
    return [{"id": d.id, "title": d.title, "filename": d.filename} for d in docs]