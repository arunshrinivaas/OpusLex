"""
Research Node for OpusLex Multi-Agent Compliance Workflow.

Reuses existing OpusLex RAG retrieval and embedding services to fetch
evidence strictly scoped to authorized investigation documents.
Supports targeted query refinement on retry loops.
"""

import logging
import time
from typing import Any

from langchain_core.runnables import RunnableConfig

from app.ai.graph.state import AgentWorkflowState
from app.services.rag_service import build_rag_context

logger = logging.getLogger(__name__)


async def research_node(
    state: AgentWorkflowState, config: RunnableConfig
) -> dict[str, Any]:
    start_time = time.perf_counter()
    question = state.get("question", "")
    refinement_query = state.get("refinement_query")
    retry_count = state.get("retry_count", 0)

    # Use refinement query if available from a previous verification cycle, else original question
    active_query = (
        refinement_query
        if (refinement_query and retry_count > 0)
        else question
    )

    target_document_ids = state.get("target_document_ids") or state.get(
        "document_ids", []
    )

    db = config.get("configurable", {}).get("db") if config else None

    # If no db session is provided (e.g., in offline unit tests), preserve or fallback to existing state
    if db is None:
        context_text = state.get("context_text", "")
        retrieved_chunks = state.get("retrieved_chunks", [])
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return {
            "retrieval_history": [active_query],
            "context_text": context_text,
            "retrieved_chunks": retrieved_chunks,
            "node_timings": {"research": elapsed_ms},
        }

    # Execute scoped retrieval reusing build_rag_context from agent_service
    import app.services.agent_service as agent_service_mod
    rag_fn = getattr(agent_service_mod, "build_rag_context", build_rag_context)

    context_text, sources = rag_fn(
        db=db,
        query=active_query,
        limit=5,
        document_ids=target_document_ids if target_document_ids else None,
    )

    elapsed_ms = (time.perf_counter() - start_time) * 1000
    logger.info(
        f"[GRAPH:research] retrieved {len(sources)} chunk(s) for query='{active_query[:50]}' "
        f"in {elapsed_ms:.2f}ms"
    )

    return {
        "retrieval_history": [active_query],
        "context_text": context_text,
        "retrieved_chunks": sources,
        "refinement_query": None,  # reset after applying
        "node_timings": {"research": elapsed_ms},
    }
