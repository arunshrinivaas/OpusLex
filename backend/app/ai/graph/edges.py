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
) -> Literal["research", "synthesis"]:
    """
    Evaluates whether an investigation has attached documents.
    If no documents are attached, routes directly to synthesis for an immediate
    evidence-limitation finding, avoiding unnecessary downstream retrieval and model calls.
    """
    document_ids = state.get("document_ids", [])
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
    max_retries = state.get("max_retries", 2)

    if retry_count <= max_retries:
        logger.info(
            f"[GRAPH:edge] Evidence insufficient; triggering retry {retry_count}/{max_retries} back to research"
        )
        return "research"

    logger.info(
        f"[GRAPH:edge] Max retries ({max_retries}) reached; proceeding to synthesis with limitations"
    )
    return "synthesis"
