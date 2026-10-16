"""
Agent Workflow State Schema for OpusLex Multi-Agent Compliance Investigations.

Strictly serializable TypedDict tracking execution identifiers, query intent,
authorized document scope, retrieval state, candidate and verified findings,
bounded retry tracking, risk metrics, and observability timings.
"""

from __future__ import annotations

from typing import Annotated, Any, TypedDict


def merge_dicts(
    a: dict[str, Any] | None, b: dict[str, Any] | None
) -> dict[str, Any]:
    """Reducer for merging dictionary entries (e.g. per-node timings)."""
    res = dict(a or {})
    if b:
        res.update(b)
    return res


def append_history(
    existing: list[str] | None, new_items: list[str] | None
) -> list[str]:
    """Reducer for accumulating retrieval query history."""
    return (existing or []) + (new_items or [])


class AgentWorkflowState(TypedDict, total=False):
    # Identifiers
    investigation_id: int
    user_id: int
    agent_run_id: int

    # Question & Scope
    question: str
    document_ids: list[int]
    target_document_ids: list[int]
    document_metadata: list[dict[str, Any]]  # id, filename, title

    # Intent Classification
    query_intent: str
    is_cross_doc: bool
    is_conflict_only: bool
    is_gaps_only: bool
    is_compact: bool
    no_exec_summary: bool

    # Retrieval State
    retrieved_chunks: list[dict[str, Any]]
    retrieval_history: Annotated[list[str], append_history]
    context_text: str

    # Analysis State (Candidate Findings)
    candidate_finding: dict[str, Any] | None

    # Verification State
    verification_passed: bool
    verification_details: dict[str, Any]
    retry_count: int
    max_retries: int
    refinement_query: str | None

    # Verified Final Findings (Matching AgentFinding schema)
    finding: str | None
    evidence: list[dict[str, Any]]
    conflicts: list[dict[str, Any]]
    evidence_gaps: list[dict[str, Any]]
    applicable_requirements: list[dict[str, Any]]
    suggested_actions: list[dict[str, Any]]
    citations: list[dict[str, Any]]

    # Final Risk Assessment & Run Status
    risk_score: int | None
    risk_level: str | None
    status: str  # "pending", "completed", "failed"
    error_message: str | None

    # Observability & Metrics
    node_timings: Annotated[dict[str, float], merge_dicts]
