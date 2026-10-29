"""
Research Service: Intent-Based Routing, General Knowledge Execution,
Document-Grounded RAG, and User-Scoped History Persistence.
"""

from __future__ import annotations

import logging
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.research import ResearchQuery
from app.services.copilot_service import ask_copilot_with_context
from app.services.intent_service import classify_query, evaluate_arithmetic_query
from app.services.rag_service import answer_with_rag

logger = logging.getLogger(__name__)


async def execute_research_query(
    db: Session,
    question: str,
    user_id: int,
    limit: int = 5,
    document_ids: list[int] | None = None,
) -> dict:
    """
    Executes a research query with intelligent intent routing:
    - Arithmetic / Calculation -> Deterministic calculation engine.
    - General Knowledge / Technical -> Configured LLM without document prerequisites.
    - Document / Compliance Research -> Scoped RAG over authorized documents.
    """
    cleaned_q = question.strip()
    if not cleaned_q:
        return {
            "question": "",
            "answer": "Please provide a question to research.",
            "sources": [],
            "intent": "empty",
        }

    # 1. Deterministic arithmetic calculation check
    is_calc, calc_exp, _ = evaluate_arithmetic_query(cleaned_q)
    if is_calc and calc_exp:
        session = ResearchQuery(
            user_id=user_id,
            question=cleaned_q,
            status="Completed",
            answer=calc_exp,
            sources=[],
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return {
            "id": session.id,
            "question": cleaned_q,
            "answer": calc_exp,
            "sources": [],
            "intent": "calculation",
        }

    # 2. Intent classification
    classification = classify_query(query=cleaned_q)
    intent = classification["intent"]

    # 3. Identity inquiry path
    if intent == "identity":
        answer = (
            "I am Themis, your AI research and compliance assistant for OpusLex. "
            "I can assist with legal research, policy analysis, investigation evidence synthesis, "
            "and general technical inquiries."
        )
        session = ResearchQuery(
            user_id=user_id,
            question=cleaned_q,
            status="Completed",
            answer=answer,
            sources=[],
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return {
            "id": session.id,
            "question": cleaned_q,
            "answer": answer,
            "sources": [],
            "intent": "identity",
        }

    # 4. Broad document inspection / overview path
    from app.services.intent_service import is_broad_document_query
    if intent == "document_overview" or is_broad_document_query(cleaned_q):
        from app.models.document import Document
        doc_q = db.query(Document).filter(
            or_(Document.user_id == user_id, Document.user_id.is_(None))
        )
        if document_ids:
            doc_q = doc_q.filter(Document.id.in_(document_ids))
        available_docs = doc_q.all()

        if available_docs:
            doc_summaries = []
            sources = []
            for d in available_docs:
                sources.append({
                    "document_id": d.id,
                    "filename": d.filename,
                    "title": d.title,
                })
                snippet = d.description or (d.extracted_text[:160] + "..." if d.extracted_text else "Compliance document")
                doc_summaries.append(f"• **{d.title}** (`{d.filename}`): {snippet}")

            docs_list_text = "\n".join(doc_summaries)
            answer = (
                f"Your authorized document scope includes {len(available_docs)} document(s):\n\n"
                f"{docs_list_text}\n\n"
                f"These documents cover organizational policies, compliance standards, and operating procedures. "
                f"If you need an in-depth analysis of a specific subject or clause, please specify the document name or question."
            )
        else:
            answer = (
                "No documents are currently available in your authorized scope. "
                "There are no documents uploaded to this workspace or attached to the current investigation. "
                "You can ask open-domain questions, or provide documents to perform grounded research."
            )
            sources = []

        session = ResearchQuery(
            user_id=user_id,
            question=cleaned_q,
            status="Completed",
            answer=answer,
            sources=sources,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return {
            "id": session.id,
            "question": cleaned_q,
            "answer": answer,
            "sources": sources,
            "intent": "document_overview",
        }

    if intent == "general_knowledge" and not document_ids:
        # General knowledge path: no document prerequisite
        answer = await ask_copilot_with_context(
            question=cleaned_q,
            context="",
            strict_grounding=False,
            system_prompt=(
                "You are an expert AI research assistant. Provide clear, accurate, and comprehensive "
                "answers to general knowledge, technical, explanatory, and reasoning questions. "
                "Do not require uploaded documents or emit document-evidence limitation notices for general questions."
            ),
        )
        from app.services.citation_validator import validate_and_sanitize_answer_citations
        clean_ans, _, _ = validate_and_sanitize_answer_citations(
            answer_text=answer,
            db=db,
            authorized_user_id=user_id,
        )
        answer = clean_ans
        session = ResearchQuery(
            user_id=user_id,
            question=cleaned_q,
            status="Completed",
            answer=answer,
            sources=[],
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return {
            "id": session.id,
            "question": cleaned_q,
            "answer": answer,
            "sources": [],
            "intent": "general_knowledge",
        }

    # 5. Document-grounded RAG path
    rag_res = await answer_with_rag(
        db=db,
        question=cleaned_q,
        limit=limit,
        document_ids=document_ids,
        user_id=user_id,
        strict_grounding=True,
    )

    answer = rag_res.get("answer", "")
    sources = rag_res.get("sources", [])

    if not sources and not answer:
        answer = (
            "Based on the documents in your authorized library, no matching evidence was found "
            "for this inquiry. The available documents do not appear to contain relevant provisions."
        )

    # Validate and sanitize citations before persisting session
    from app.services.citation_validator import validate_and_sanitize_answer_citations
    clean_answer, _, all_valid = validate_and_sanitize_answer_citations(
        answer_text=answer,
        db=db,
        authorized_user_id=user_id,
        allowed_document_ids=document_ids,
    )
    answer = clean_answer

    session = ResearchQuery(
        user_id=user_id,
        question=cleaned_q,
        status="Completed",
        answer=answer,
        sources=sources,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return {
        "id": session.id,
        "question": cleaned_q,
        "answer": answer,
        "sources": sources,
        "intent": "document_rag",
    }


def list_user_research_sessions(
    db: Session,
    user_id: int,
    limit: int = 50,
) -> list[ResearchQuery]:
    """Retrieve research query sessions scoped to the authenticated user."""
    return (
        db.query(ResearchQuery)
        .filter(ResearchQuery.user_id == user_id)
        .order_by(ResearchQuery.created_at.desc())
        .limit(limit)
        .all()
    )
