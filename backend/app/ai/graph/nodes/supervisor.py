"""
Supervisor Node for OpusLex Compliance Investigation Multi-Agent Workflow.

Classifies incoming question intent, extracts document constraints,
resolves authorized scope, and configures routing flags.
"""

from __future__ import annotations

import logging
import re
import time
from typing import Any

from app.ai.graph.state import AgentWorkflowState

logger = logging.getLogger(__name__)


async def supervisor_node(
    state: AgentWorkflowState,
) -> dict[str, Any]:
    start_time = time.perf_counter()
    question = state.get("question", "")
    lower_q = question.lower().strip()
    document_ids = state.get("document_ids", [])
    doc_metadata = state.get("document_metadata", [])

    # 1. Detect Scope & Intent Directives
    is_cross_doc = bool(
        re.search(
            r"\b(cross-document|between attached documents|across documents|across all documents|all attached documents|compare|conflicts? between|discrepanc(?:y|ies) between)\b",
            lower_q,
        )
    )

    scoped_doc_codes = [
        m.lower()
        for m in re.findall(
            r"\b(?:STD|POL|PROC)-[A-Z]+-\d+\b", question, re.IGNORECASE
        )
    ]
    scoped_pdf_names = [
        m.lower()
        for m in re.findall(r"\b[A-Za-z0-9_\-]+\.pdf\b", question, re.IGNORECASE)
    ]

    has_explicit_doc_target = bool(
        scoped_doc_codes or scoped_pdf_names
    ) and not is_cross_doc

    target_document_ids: list[int] = []
    if has_explicit_doc_target and doc_metadata:
        for doc in doc_metadata:
            fn = (doc.get("filename") or "").lower()
            code = fn.split("_")[0] if "_" in fn else ""
            base = fn.replace(".pdf", "")
            if (
                any(sc in fn for sc in scoped_pdf_names)
                or any(sc in code for sc in scoped_doc_codes)
                or any(sc in base for sc in scoped_doc_codes)
            ):
                target_document_ids.append(doc["id"])

    # If no specific doc was matched or cross-doc was requested, use all attached document IDs
    if not target_document_ids:
        target_document_ids = list(document_ids)

    # 2. Structural & Exclusion Constraints
    no_exec_summary = bool(
        re.search(
            r"\b(do not include|without|no)\b.*?\bexecutive summary\b", lower_q
        )
    )

    is_conflict_only = (
        "conflict" in lower_q
        and (
            "only" in lower_q
            or "do not repeat" in lower_q
            or "without" in lower_q
            or "just" in lower_q
        )
        and not re.search(
            r"\b(broad|comprehensive|all requirements|status)\b", lower_q
        )
    )

    is_gaps_only = (
        (
            "evidence gap" in lower_q
            or "gap" in lower_q
            or "missing evidence" in lower_q
        )
        and ("only" in lower_q or "just" in lower_q or "exactly" in lower_q)
        and not (
            "conflict" in lower_q
            or "broad" in lower_q
            or "comprehensive" in lower_q
        )
        and not re.search(
            r"\b(key findings|applicable requirements|recommended actions|suggested actions)\b",
            lower_q,
        )
    )

    is_compact = "compact" in lower_q

    # 3. Overall Category Classification
    if is_conflict_only:
        query_intent = "conflict_only"
    elif is_gaps_only:
        query_intent = "gaps_only"
    elif is_compact:
        query_intent = "compact"
    elif (
        ("broad" in lower_q or "comprehensive" in lower_q or "assess the attached" in lower_q)
        and ("applicable requirements" in lower_q or "all requirements" in lower_q or "key findings" in lower_q)
    ):
        query_intent = "broad_assessment"
    elif (
        lower_q.startswith("according to")
        or "what does" in lower_q
        or "who is" in lower_q
    ):
        query_intent = "policy_lookup"
    else:
        query_intent = "general_compliance_inquiry"

    elapsed_ms = (time.perf_counter() - start_time) * 1000
    logger.info(
        f"[GRAPH:supervisor] classified intent={query_intent}, "
        f"target_docs={target_document_ids} in {elapsed_ms:.2f}ms"
    )

    return {
        "target_document_ids": target_document_ids,
        "is_cross_doc": is_cross_doc,
        "is_conflict_only": is_conflict_only,
        "is_gaps_only": is_gaps_only,
        "is_compact": is_compact,
        "no_exec_summary": no_exec_summary,
        "query_intent": query_intent,
        "node_timings": {"supervisor": elapsed_ms},
    }
