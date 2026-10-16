"""
Synthesis Node for OpusLex Multi-Agent Compliance Workflow.

Assembles and validates verified findings into the canonical AgentFinding schema,
enforces output formatting and exclusion constraints, and computes the
deterministic OpusLex compliance risk score and risk level.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from langchain_core.runnables import RunnableConfig

from app.ai.graph.state import AgentWorkflowState
from app.schemas.agent import AgentFinding

logger = logging.getLogger(__name__)


async def synthesis_node(
    state: AgentWorkflowState,
) -> dict[str, Any]:
    start_time = time.perf_counter()

    document_ids = state.get("document_ids")
    if document_ids is not None and len(document_ids) == 0 and not state.get("evidence") and not state.get("conflicts"):
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return {
            "finding": (
                "No documents are currently attached to this investigation. "
                "I cannot answer this question because there is no relevant evidence in the attached investigation documents. "
                "I am a Compliance Investigation Agent and am restricted to reasoning only from the provided investigation documents. "
                "For general legal questions, please use the Research Assistant."
            ),
            "evidence": [],
            "conflicts": [],
            "evidence_gaps": [],
            "applicable_requirements": [],
            "suggested_actions": [],
            "citations": [],
            "risk_score": 0,
            "risk_level": "Low",
            "status": "completed",
            "node_timings": {"synthesis": elapsed_ms},
        }

    finding = state.get("finding")
    evidence = state.get("evidence", [])
    conflicts = state.get("conflicts", [])
    evidence_gaps = state.get("evidence_gaps", [])
    applicable_requirements = state.get("applicable_requirements", [])
    suggested_actions = state.get("suggested_actions", [])
    citations = state.get("citations", [])

    is_conflict_only = state.get("is_conflict_only", False)
    is_gaps_only = state.get("is_gaps_only", False)
    no_exec_summary = state.get("no_exec_summary", False)

    # Apply strict exclusion constraints
    if no_exec_summary or is_conflict_only:
        finding = None

    if is_conflict_only:
        applicable_requirements = []
        evidence_gaps = []
        suggested_actions = []

    if is_gaps_only:
        conflicts = []
        applicable_requirements = []
        suggested_actions = []

    # Explicit evidence qualification if verification did not pass
    verification_passed = state.get("verification_passed", True)
    if not verification_passed and finding and not is_conflict_only and not no_exec_summary:
        unsupported_count = state.get("verification_details", {}).get("unsupported_count", 0)
        if unsupported_count > 0:
            finding = f"{finding}\n\n[Note: Supporting evidence could not be fully verified against the attached documents within retry limits.]"

    # Validate against canonical Pydantic model
    try:
        finding_obj = AgentFinding.model_validate({
            "finding": finding,
            "evidence": evidence,
            "conflicts": conflicts,
            "evidence_gaps": evidence_gaps,
            "applicable_requirements": applicable_requirements,
            "suggested_actions": suggested_actions,
            "citations": citations,
        })
    except Exception as exc:
        logger.warning(f"[GRAPH:synthesis] Validation warning: {exc}, using raw values")
        finding_obj = None

    # Calculate deterministic OpusLex heuristic risk score
    num_conflicts = len(conflicts)
    num_gaps = len(evidence_gaps)
    num_actions = len(suggested_actions)

    calculated_score = 100 - (20 * num_conflicts) - (10 * num_gaps) - (5 * num_actions)
    risk_score = max(0, calculated_score)

    if risk_score >= 80:
        risk_level = "Low"
    elif risk_score >= 50:
        risk_level = "Medium"
    else:
        risk_level = "High"

    elapsed_ms = (time.perf_counter() - start_time) * 1000
    logger.info(
        f"[GRAPH:synthesis] synthesized AgentFinding: risk_score={risk_score} ({risk_level}) "
        f"in {elapsed_ms:.2f}ms"
    )

    return {
        "finding": finding,
        "evidence": [e.model_dump() for e in finding_obj.evidence] if finding_obj else evidence,
        "conflicts": [c.model_dump() for c in finding_obj.conflicts] if finding_obj else conflicts,
        "evidence_gaps": [g.model_dump() for g in finding_obj.evidence_gaps] if finding_obj else evidence_gaps,
        "applicable_requirements": [r.model_dump() for r in finding_obj.applicable_requirements] if finding_obj else applicable_requirements,
        "suggested_actions": [a.model_dump() for a in finding_obj.suggested_actions] if finding_obj else suggested_actions,
        "citations": [c.model_dump() for c in finding_obj.citations] if finding_obj else citations,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "status": "completed",
        "node_timings": {"synthesis": elapsed_ms},
    }
