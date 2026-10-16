"""
Comprehensive Acceptance Tests for OpusLex LangGraph Multi-Agent Workflow.

Verifies:
1. Graph compilation and state graph structure.
2. Routing of specific, broad, conflict-only, and gap queries.
3. Empty document scope handling.
4. Retrieval and citation traceability.
5. Unsupported claims and evidence gaps.
6. Retry behavior and termination after configured limit.
7. Copilot and mock provider compatibility.
8. Provider exceptions and failed-run persistence.
9. Risk score and schema compatibility.
10. API response contract compatibility.
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from app.ai.graph import AgentWorkflowState, compliance_graph, create_compliance_graph
from app.ai.graph.edges import conditional_review_edge, supervisor_routing_edge
from app.ai.graph.nodes.analysis import analysis_node
from app.ai.graph.nodes.persistence import persistence_node
from app.ai.graph.nodes.research import research_node
from app.ai.graph.nodes.supervisor import supervisor_node
from app.ai.graph.nodes.synthesis import synthesis_node
from app.ai.graph.nodes.verification import verification_node
from app.models.agent_run import AgentRun
from app.models.investigation import Investigation
from app.schemas.agent import AgentFinding, AgentRunResponse
from app.services.agent_service import run_compliance_investigation


# 1. Graph Compilation and Normal Execution
def test_graph_compilation_and_structure():
    graph = create_compliance_graph()
    assert graph is not None
    # Inspect nodes
    node_names = set(graph.nodes.keys())
    expected_nodes = {
        "supervisor",
        "research",
        "analysis",
        "verification",
        "synthesis",
        "persistence",
    }
    assert expected_nodes.issubset(node_names)


# 2. Correct Routing of Standard and Broad Compliance Queries
@pytest.mark.asyncio
async def test_supervisor_routing_intent_classification():
    # Specific policy lookup
    state_specific: AgentWorkflowState = {
        "question": "According to STD-PRV-02, who is the designated lead?",
        "document_ids": [39, 40],
        "document_metadata": [{"id": 39, "filename": "STD-PRV-02_Privacy.pdf"}],
    }
    result_specific = await supervisor_node(state_specific)
    assert result_specific["query_intent"] == "policy_lookup"
    assert result_specific["target_document_ids"] == [39]

    # Broad assessment query
    state_broad: AgentWorkflowState = {
        "question": "Assess the attached documents for broad compliance requirements and key findings.",
        "document_ids": [36, 37, 38],
        "document_metadata": [
            {"id": 36, "filename": "POL-REC-01.pdf"},
            {"id": 37, "filename": "POL-SEC-01.pdf"},
        ],
    }
    result_broad = await supervisor_node(state_broad)
    assert result_broad["query_intent"] == "broad_assessment"
    assert set(result_broad["target_document_ids"]) == {36, 37, 38}

    # Conflict only query
    state_conflict: AgentWorkflowState = {
        "question": "Identify only conflicts between attached documents without executive summary.",
        "document_ids": [36, 37],
        "document_metadata": [],
    }
    result_conflict = await supervisor_node(state_conflict)
    assert result_conflict["is_conflict_only"] is True
    assert result_conflict["no_exec_summary"] is True


# 3. Empty Document Scope Early Exit
def test_empty_document_scope_routing():
    empty_state: AgentWorkflowState = {
        "question": "Is this compliant?",
        "document_ids": [],
    }
    # Supervisor routing edge should route directly to synthesis
    assert supervisor_routing_edge(empty_state) == "synthesis"


@pytest.mark.asyncio
async def test_synthesis_empty_documents_returns_explicit_message():
    empty_state: AgentWorkflowState = {
        "question": "Is this compliant?",
        "document_ids": [],
    }
    result = await synthesis_node(empty_state)
    assert "No documents are currently attached" in result["finding"]
    assert result["evidence"] == []
    assert result["conflicts"] == []
    assert result["status"] == "completed"


# 4. Retrieval and Citation Traceability
@pytest.mark.asyncio
async def test_verification_validates_grounded_evidence():
    context = (
        "Source:\nDocument: Information Security Policy\nFilename: POL-SEC-01.pdf\nChunk: 1\n\n"
        "Content:\nEmployees and contractors must report security incidents within 30 minutes."
    )
    candidate_finding = {
        "finding": "Summary of POL-SEC-01",
        "evidence": [
            {
                "claim": "Incident reporting requirement",
                "source_document": "POL-SEC-01.pdf",
                "source_section_or_chunk": "Chunk 1",
                "supporting_text": "Employees and contractors must report security incidents within 30 minutes.",
            }
        ],
        "citations": [
            {"source_document": "POL-SEC-01.pdf", "source_section_or_chunk": "Chunk 1"}
        ],
    }
    state: AgentWorkflowState = {
        "question": "What is the reporting deadline?",
        "context_text": context,
        "candidate_finding": candidate_finding,
        "retry_count": 0,
        "max_retries": 2,
    }
    res = await verification_node(state)
    assert res["verification_passed"] is True
    assert len(res["evidence"]) == 1
    assert len(res["citations"]) == 1
    assert res["verification_details"]["grounding_score"] == 1.0


# 5. Unsupported Claims and Evidence Gaps
@pytest.mark.asyncio
async def test_verification_flags_ungrounded_evidence():
    context = "Content: Data must be retained for at least 3 years."
    candidate_finding = {
        "finding": "Test finding",
        "evidence": [
            {
                "claim": "Unverified claim",
                "source_document": "UNGROUNDED.pdf",
                "source_section_or_chunk": "Chunk 99",
                "supporting_text": "Company mandates automated AI destruction within 2 hours.",
            }
        ],
        "citations": [{"source_document": "UNGROUNDED.pdf", "source_section_or_chunk": "Chunk 99"}],
    }
    state: AgentWorkflowState = {
        "question": "What is the destruction policy?",
        "context_text": context,
        "candidate_finding": candidate_finding,
        "retry_count": 0,
        "max_retries": 2,
    }
    res = await verification_node(state)
    assert res["verification_passed"] is False
    assert len(res["evidence"]) == 0
    assert res["refinement_query"] is not None


# 6. Retry Behavior and Termination after Configured Limit
def test_conditional_review_edge_retry_and_termination():
    # Retries available
    state_retry: AgentWorkflowState = {
        "verification_passed": False,
        "retry_count": 1,
        "max_retries": 2,
    }
    assert conditional_review_edge(state_retry) == "research"

    # Max retries reached
    state_max: AgentWorkflowState = {
        "verification_passed": False,
        "retry_count": 3,
        "max_retries": 2,
    }
    assert conditional_review_edge(state_max) == "synthesis"

    # Verification passed
    state_passed: AgentWorkflowState = {
        "verification_passed": True,
        "retry_count": 1,
        "max_retries": 2,
    }
    assert conditional_review_edge(state_passed) == "synthesis"


# 7. Copilot and Mock Provider Compatibility
@pytest.mark.asyncio
async def test_analysis_mock_provider_execution():
    context = (
        "Source:\nDocument: Records Retention\nFilename: POL-REC-01.pdf\nChunk: 0\n\n"
        "Content:\nIssuance of a Legal Hold mandates immediate suspension of regular deletion routines."
    )
    state: AgentWorkflowState = {
        "question": "According to POL-REC-01, what happens during legal hold?",
        "context_text": context,
    }
    result = await analysis_node(state)
    assert result["candidate_finding"] is not None
    assert "candidate_finding" in result
    finding_dict = result["candidate_finding"]
    assert "finding" in finding_dict
    assert isinstance(finding_dict.get("evidence"), list)


# 8. Provider Exceptions and Failed-Run Persistence
@pytest.mark.asyncio
async def test_persistence_handles_failed_status():
    mock_run = MagicMock(spec=AgentRun)
    mock_run.status = "pending"
    mock_db = MagicMock()

    config = {"configurable": {"db": mock_db, "agent_run": mock_run}}
    state: AgentWorkflowState = {
        "status": "failed",
        "error_message": "Upstream LLM network timeout",
        "finding": None,
    }
    await persistence_node(state, config=config)
    assert mock_run.status == "failed"
    assert "Upstream LLM network timeout" in mock_run.finding
    assert mock_run.evidence == []
    assert mock_db.commit.called


# 9. Risk Score and Response Schema Compatibility
@pytest.mark.asyncio
async def test_synthesis_computes_opuslex_risk_score():
    state: AgentWorkflowState = {
        "finding": "Identified potential issues",
        "evidence": [{"claim": "C1", "source_document": "D1", "source_section_or_chunk": "1", "supporting_text": "T1"}],
        "conflicts": [{"description": "Conf 1", "documents": ["D1", "D2"], "relationship": "contradicts"}],
        "evidence_gaps": [{"description": "Gap 1", "why_it_matters": "M1"}, {"description": "Gap 2", "why_it_matters": "M2"}],
        "suggested_actions": [{"action": "A1", "rationale": "R1"}],
        "applicable_requirements": [],
        "citations": [],
    }
    # Formula: 100 - (20 * 1) - (10 * 2) - (5 * 1) = 100 - 20 - 20 - 5 = 55
    res = await synthesis_node(state)
    assert res["risk_score"] == 55
    assert res["risk_level"] == "Medium"
    assert res["status"] == "completed"

    # Validate output conforms to canonical AgentFinding schema
    finding_obj = AgentFinding.model_validate(res)
    assert finding_obj.finding == "Identified potential issues"
    assert len(finding_obj.conflicts) == 1
    assert len(finding_obj.evidence_gaps) == 2


# 10. Existing API Response Contract Compatibility
@pytest.mark.asyncio
async def test_full_agent_service_delegation():
    mock_db = MagicMock()
    mock_inv = MagicMock(spec=Investigation)
    mock_inv.id = 1
    mock_inv.user_id = 42

    doc1 = MagicMock()
    doc1.id = 101
    doc1.filename = "POL-SEC-01_Security.pdf"
    doc1.title = "Security Policy"
    mock_inv.documents = [doc1]

    mock_db.scalar.return_value = mock_inv

    with patch("app.services.agent_service.AgentRun") as MockRunClass, \
         patch("app.services.agent_service.build_rag_context") as mock_rag, \
         patch("app.services.agent_service._run_agent_llm") as mock_llm:

        created_run = MagicMock(spec=AgentRun)
        created_run.id = 501
        created_run.status = "pending"
        MockRunClass.return_value = created_run

        mock_rag.return_value = (
            "Source:\nDocument: Security Policy\nFilename: POL-SEC-01_Security.pdf\nChunk: 1\n\nContent:\nCredentials must be rotated.",
            [{"document_title": "Security Policy", "filename": "POL-SEC-01_Security.pdf", "chunk": 1, "distance": 0.1}],
        )

        mock_llm.return_value = json.dumps({
            "finding": "According to POL-SEC-01_Security.pdf, credentials must be rotated.",
            "evidence": [{
                "claim": "Credential rotation",
                "source_document": "POL-SEC-01_Security.pdf",
                "source_section_or_chunk": "Chunk 1",
                "supporting_text": "Credentials must be rotated.",
            }],
            "conflicts": [],
            "evidence_gaps": [],
            "applicable_requirements": [],
            "suggested_actions": [],
            "citations": [{"source_document": "POL-SEC-01_Security.pdf", "source_section_or_chunk": "Chunk 1"}],
        })

        run_result = await run_compliance_investigation(
            db=mock_db,
            investigation_id=1,
            user_id=42,
            question="According to POL-SEC-01, what is required?",
        )

        assert run_result.status == "completed"
        assert "POL-SEC-01" in run_result.finding
        assert len(run_result.evidence) == 1
        assert run_result.risk_score == 100
        assert run_result.risk_level == "Low"
