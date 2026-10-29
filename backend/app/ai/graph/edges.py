"""
Conditional Routing Edges and Bounded Retry Logic for OpusLex LangGraph Workflow.
"""

from __future__ import annotations

import logging
from typing import Literal

from app.ai.graph.state import AgentWorkflowState

logger = logging.getLogger(__name__)


def supervisor_routing_edge(
    state: AgentWorkflowState,
) -> Literal["general", "tool", "research", "synthesis"]:
    """
    Conditionally routes execution based on classified task type and document availability:
    - "general" -> general (direct LLM / calculation without document requirement)
    - "tool"    -> tool (executes authorized application operations)
    - "hybrid"  -> research (combines evidence retrieval and analytical reasoning)
    - "rag"     -> research (if documents attached) or synthesis (if scope is empty)
    """
    task_type = state.get("task_type")
    if task_type == "general":
        logger.info("[GRAPH:edge] Routing to general")
        return "general"
    if task_type == "tool":
        logger.info("[GRAPH:edge] Routing to tool")
        return "tool"
    if task_type == "hybrid" or task_type == "rag":
        logger.info(f"[GRAPH:edge] Routing {task_type} task to research")
        return "research"

    document_ids = state.get("document_ids") or state.get("target_document_ids") or []
    if not document_ids:
        logger.info("[GRAPH:edge] No documents attached; routing directly to synthesis")
        return "synthesis"

    return "research"


def conditional_review_edge(
    state: AgentWorkflowState,
) -> Literal["research", "synthesis"]:
    """
    Evaluates verification confidence and bounded retry limits.
    - If verification passed: proceeds to response synthesis.
    - If verification flagged unsupported claims and retries remain: loops back to research.
    - If retry limit reached: proceeds to synthesis with documented limitations.
    """
    verification_passed = state.get("verification_passed", True)
    if verification_passed:
        logger.info("[GRAPH:edge] Verification passed; proceeding to synthesis")
        return "synthesis"

    retry_count = state.get("retry_count", 0)
    max_retries = state.get("max_retries", 1)

    if retry_count < max_retries:
        logger.info(
            f"[GRAPH:edge] Evidence insufficient; triggering retry {retry_count}/{max_retries} back to research"
        )
        return "research"

    logger.info(
        f"[GRAPH:edge] Max retries ({max_retries}) reached; proceeding to synthesis with limitations"
    )
    return "synthesis"
