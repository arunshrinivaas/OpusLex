"""
General Answering Node for OpusLex LangGraph Orchestration.

Answers general knowledge, technical, explanatory, and arithmetic questions
directly via the configured LLM or deterministic calculation engine without
requiring document retrieval.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from app.ai.graph.state import AgentWorkflowState
from app.services.copilot_service import ask_copilot_with_context
from app.services.intent_service import evaluate_arithmetic_query

logger = logging.getLogger(__name__)


async def general_node(state: AgentWorkflowState) -> dict[str, Any]:
    start_time = time.perf_counter()
    question = state.get("question", "")

    # 1. Deterministic arithmetic check
    is_calc, calc_exp, _ = evaluate_arithmetic_query(question)
    if is_calc and calc_exp:
        answer = calc_exp
    else:
        from app.services.intent_service import extract_identity_or_name_query
        is_id, target = extract_identity_or_name_query(question)
        if is_id:
            if target == "assistant_name":
                answer = (
                    "The OpusLex AI Assistant is named Themis. In this investigation workspace, I operate as an autonomous "
                    "AI Compliance Agent capable of auditing attached documents, identifying regulatory conflicts, "
                    "detecting unverified evidence gaps, and recommending remediation actions."
                )
            else:
                answer = (
                    "I am Themis, your AI personal assistant in OpusLex. In this workspace, I operate as an autonomous "
                    "AI Compliance Agent capable of auditing attached documents, identifying regulatory conflicts, "
                    "detecting unverified evidence gaps, and recommending remediation actions."
                )
        else:
            answer = await ask_copilot_with_context(
                question=question,
                context="",
                strict_grounding=False,
                system_prompt=(
                    "You are Themis, the autonomous AI assistant for OpusLex. Provide clear, direct, and accurate "
                    "answers to general knowledge, technical, explanatory, and reasoning questions. "
                    "Do not require uploaded documents or emit document-evidence limitation notices for general questions."
                ),
            )

    elapsed_ms = (time.perf_counter() - start_time) * 1000
    logger.info(f"[GRAPH:general_node] generated general response in {elapsed_ms:.2f}ms")

    return {
        "finding": answer,
        "general_answer": answer,
        "evidence": [],
        "conflicts": [],
        "evidence_gaps": [],
        "applicable_requirements": [],
        "suggested_actions": [],
        "citations": [],
        "risk_score": 0,
        "risk_level": "Low",
        "status": "completed",
        "node_timings": {"general_node": elapsed_ms},
    }
