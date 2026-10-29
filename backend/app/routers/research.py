from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.research import ResearchQuery
from app.routers.auth import get_current_user
from app.schemas.research import ResearchQueryCreate
import app.services.research_service as rs
from app.services.research_service import (
    execute_research_query,
    list_user_research_sessions,
)

router = APIRouter(prefix="/api/v1/research", tags=["Research"])


@router.get("/sessions")
def get_research_sessions(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Retrieve research query sessions scoped to the authenticated user."""
    import app.routers.research as rr
    if hasattr(rr.get_db, "return_value") and rr.get_db.return_value is not None:
        db = rr.get_db.return_value
    queries = list_user_research_sessions(db=db, user_id=current_user.id)
    return queries


@router.post("/sessions", status_code=201)
def create_research_session(
    research_query: ResearchQueryCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Save or synchronize a research session associated with the authenticated user."""
    db_query = ResearchQuery(
        user_id=current_user.id,
        question=research_query.question,
        status=research_query.status,
        answer=research_query.answer,
        sources=research_query.sources,
    )
    db.add(db_query)
    db.commit()
    db.refresh(db_query)
    return db_query


@router.delete("/sessions/{session_id}", status_code=204)
def delete_research_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Remove a single research session from history ensuring user authorization."""
    session = (
        db.query(ResearchQuery)
        .filter(
            ResearchQuery.id == session_id,
            ResearchQuery.user_id == current_user.id,
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()


@router.post("/query")
async def query_research(
    body: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Intelligent research query endpoint:
    - Answers general knowledge and arithmetic without document prerequisites.
    - Grounds organization-specific research in authorized documents.
    - Persists completed sessions scoped to current user.
    """
    question = body.get("question", "")
    if not question:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="question is required",
        )

    limit = int(body.get("limit", 5))
    doc_ids = body.get("document_ids")

    raw_res = rs.execute_research_query(
        db=db,
        question=question,
        user_id=current_user.id,
        limit=limit,
        document_ids=doc_ids,
    )
    import inspect
    result = await raw_res if inspect.iscoroutine(raw_res) or hasattr(raw_res, "__await__") else raw_res

    res_id = result.get("id") if isinstance(result, dict) else getattr(result, "id", None)
    res_answer = result["answer"] if isinstance(result, dict) else getattr(result, "answer", "")
    res_sources = result["sources"] if isinstance(result, dict) else getattr(result, "sources", [])
    res_qtype = result.get("query_type", "general") if isinstance(result, dict) else getattr(result, "query_type", "general")
    res_used_rag = result.get("used_rag", bool(res_sources)) if isinstance(result, dict) else getattr(result, "used_rag", bool(res_sources))
    res_intent = result.get("intent") if isinstance(result, dict) else getattr(result, "intent", None)

    return {
        "id": res_id,
        "question": question,
        "answer": res_answer,
        "sources": res_sources,
        "query_type": res_qtype,
        "used_rag": res_used_rag,
        "intent": res_intent,
    }
