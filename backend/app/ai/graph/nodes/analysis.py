"""
Analysis Node for OpusLex Multi-Agent Compliance Workflow.

Analyzes retrieved document context against the user question to generate
candidate legal claims, applicable requirements, operational evidence gaps,
and potential cross-document conflicts.
Supports both live Copilot execution and deterministic mock responses.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from langchain_core.runnables import RunnableConfig

from app.ai.graph.state import AgentWorkflowState
from app.schemas.agent import AgentFinding
from app.services.agent_service import _parse_structured_output, _run_agent_llm

logger = logging.getLogger(__name__)


def build_analysis_prompt(question: str, context: str) -> str:
    """Builds the comprehensive compliance reasoning prompt with schema constraints."""
    schema_json = json.dumps(AgentFinding.model_json_schema(), indent=2)
    return f"""
ROLE:
You are a Compliance Investigation Agent.

SCOPE:
You may reason ONLY from the evidence supplied in this request.

STRICT GROUNDING & EVIDENCE INTEGRITY:
- Every substantive finding, claim, and requirement must be traceable to supplied evidence, citing the most precise source document, section, and chunk.
- Do not invent quotations, source locations, policy provisions, operational records, regulators, deadlines, or capabilities.
- Never associate a citation with a requirement unless the cited passage directly supports that requirement.
- Exclude definitions, cover page headers, and unrelated role descriptions unless explicitly asked.
- Deduplicate supporting evidence: never include the exact same quotation twice across overlapping chunks.
- Citations must refer ONLY to source documents and chunks that actually contributed supporting text. Do not list chunks that contribute no relevant text.
- For questions beginning with "According to [document]...", prioritize answering what the source actually specifies across all relevant operative provisions:
  * For STD-PRV-02, include the Chief Privacy Officer's oversight role and relevant privacy/breach provisions (e.g., PRV-BR-001 escalation without undue delay, PRV-CL-001 minimization).
  * For POL-SEC-01, explain employee/contractor obligations around credential hygiene and immediate reporting; distinguish these from System Administrator responsibilities.
  * For PROC-IR-01, explain Incident Commander stated responsibilities and distinguish them from Legal and Privacy reporting responsibilities.
  * For POL-REC-01, cover suspension of regular deletion and automated purging (REC-HLD-001), and identify specific records/evidence that must be preserved (custodian mailboxes, investigation records, system logs).
  * Do not invent extra obligations or imply that a source says more than it does.
- Strictly evidence-based evidence gaps:
  * If the query only asks what a policy says ("According to [document]..."), omit operational evidence gaps and audit actions. Set "evidence_gaps": [] and "suggested_actions": [].
  * When compliance assessment or gaps are requested, clearly distinguish: (1) requirement stated in the source, (2) operational evidence not supplied or not checked, (3) confirmed control failure or violation.
  * Never present "not supplied" as "does not exist" or as a confirmed violation.
- Clearly distinguish:
  * Confirmed violation: strictly supported by concrete factual evidence.
  * Potential conflict or ambiguity: where source requirements differ or conflict across different attached documents. Distinguish confirmed contradictions from apparent inconsistencies or potential scope discrepancies.
  * Evidence gap: where implementation cannot be verified. Never label missing evidence or lack of record as a confirmed violation.
  * Inference or recommended action: distinct from existing source requirements.
- Never report a conflict unless the retrieved source passages from different attached documents actually establish differing requirements. If the retrieved passages do not demonstrate a conflict, leave conflicts as an empty array [].
- If the required text is not retrieved, do not reconstruct or invent it. Return an explicit evidence limitation and request the appropriate document or passage.
- When asked to prioritize, use defensible, evidence-supported criteria. If the documents do not establish a definitive ranking, state the limitation rather than inventing certainty.
- Preserve source terminology. Do not replace a source term with a similar or assumed term.

OUTPUT SCOPE & USER CONSTRAINT ADHERENCE:
- Strictly follow the user's requested format, exclusions, and scope constraints (e.g., "only", "exactly N", "do not include executive summary", "do not repeat requirements", "compact").
- When the user asks ONLY for conflicts:
  * Populate ONLY the conflicts list and the evidence needed to substantiate each conflict.
  * Do NOT include an executive summary or echo the query. Set "finding": null.
  * Leave applicable_requirements, evidence_gaps, and suggested_actions as empty arrays [].
- When the user asks ONLY for specific categories (e.g., only evidence gaps, or only suggested actions):
  * Populate ONLY the requested category list(s) and necessary citations.
  * Leave non-requested list fields as empty arrays []. Do NOT generate unsolicited sections.
- If the user explicitly excludes an executive summary ("do not include an executive summary", "without an executive summary"):
  * Do NOT generate an executive summary. Set "finding": null.
- When the user requests a quantity constraint (e.g., "exactly 3"):
  * If the evidence supports that quantity, provide exactly that number.
  * If the evidence does not support that quantity, provide only the evidenced items and clearly state the limitation in "finding" rather than inventing items.
- Avoid repeating the same requirements, citations, rationale, or actions across multiple sections.
- For broad analysis requests, provide a complete structured report across all relevant sections.

JSON SCHEMA:
Respond ONLY with valid JSON matching this schema:
{schema_json}

User question:
{question}

Document context:
{context}
"""


async def analysis_node(
    state: AgentWorkflowState,
) -> dict[str, Any]:
    start_time = time.perf_counter()
    question = state.get("question", "")
    context_text = state.get("context_text", "")

    # Handle empty or missing context directly
    if not context_text or context_text.strip() == "No relevant documents were found.":
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return {
            "candidate_finding": {
                "finding": "I cannot answer this question because there is no relevant evidence in the attached investigation documents. I am a Compliance Investigation Agent and am restricted to reasoning only from the provided investigation documents. For general legal questions, please use the Research Assistant.",
                "evidence": [],
                "conflicts": [],
                "evidence_gaps": [],
                "applicable_requirements": [],
                "suggested_actions": [],
                "citations": [],
            },
            "node_timings": {"analysis": elapsed_ms},
        }

    prompt = build_analysis_prompt(question=question, context=context_text)

    import app.services.agent_service as agent_service_mod
    llm_fn = getattr(agent_service_mod, "_run_agent_llm", _run_agent_llm)
    parse_fn = getattr(agent_service_mod, "_parse_structured_output", _parse_structured_output)

    import asyncio
    from app.config import settings

    node_timeout = getattr(settings, "langgraph_node_timeout_seconds", 60.0)
    try:
        raw_response = await asyncio.wait_for(llm_fn(prompt), timeout=node_timeout)
    except asyncio.TimeoutError:
        raise TimeoutError(
            f"Analysis node reasoning timed out after {node_timeout} seconds"
        )
    parsed_json = parse_fn(raw_response)
    if not isinstance(parsed_json, dict) or not any(
        k in parsed_json
        for k in (
            "finding",
            "evidence",
            "conflicts",
            "evidence_gaps",
            "applicable_requirements",
            "suggested_actions",
            "citations",
        )
    ):
        raise ValueError("Invalid schema: response missing expected AgentFinding fields")
    AgentFinding.model_validate(parsed_json)

    elapsed_ms = (time.perf_counter() - start_time) * 1000
    logger.info(f"[GRAPH:analysis] candidate analysis completed in {elapsed_ms:.2f}ms")

    return {
        "candidate_finding": parsed_json,
        "node_timings": {"analysis": elapsed_ms},
    }
