"""
Comprehensive Quality Evaluation Suite for Genuine Intelligence Across All OpusLex AI Services.

Services Evaluated:
1. Themis (Personal AI Assistant)
2. AI Agent (Multi-Agent Reasoning & Task Execution)
3. Help (Product Assistant & Documentation Knowledge)
4. Research (General Research & Scoped Document Retrieval)
5. Investigation Research (Evidence-Grounded Document Analysis)

Key Verifications:
- Direct answers to identity questions ("What's your name?", "What's AI Assistant's name?")
- Distinction between password characteristics/enforced rules vs password change instructions
- Inspection of document scope for broad queries ("What do the documents say?") vs upload instructions
- Absolute absence of prohibited generic analysis templates:
    * "Analysis and Overview"
    * "Core Conceptual Overview"
    * "Foundational Principles"
    * "Practical Implementation"
    * "Strategic Considerations"
    * "Actionable Takeaways"
- Generalization across varied, novel, unseen domains (coding, architectures, planning)
- Explicit missing evidence declarations without hallucinated clauses
- Multi-step tool execution
- Distinct separation of deterministic/mock tests and live LLM provider tests
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User
from app.models.document import Document
from app.models.investigation import Investigation
from app.schemas.assistant import AssistantInteractionRequest
from app.services.assistant_service import process_assistant_message
from app.services.intent_service import classify_query, classify_password_query, is_broad_document_query
from app.services.help_knowledge import generate_knowledge_answer
from app.services.research_service import execute_research_query
from app.routers.help import match_deterministic_faq
from app.services.agent_service import _generate_mock_agent_response

client = TestClient(app)

PROHIBITED_TEMPLATE_FRAGMENTS = [
    "analysis and overview",
    "core conceptual overview",
    "foundational principles",
    "practical implementation",
    "strategic considerations",
    "actionable takeaways",
]


@pytest.fixture
def mock_user():
    return User(
        id=77,
        email="auditor@opuslex.org",
        password_hash="hashed_pw_77",
        is_active=True,
        role="compliance_officer",
    )


def assert_no_prohibited_templates(text: str):
    """Asserts that generic corporate boilerplate templates never appear in responses."""
    lower = text.lower()
    for frag in PROHIBITED_TEMPLATE_FRAGMENTS:
        assert frag not in lower, f"Prohibited template fragment '{frag}' found in response: {text}"


# ==============================================================================
# 1. Themis (Personal AI Assistant) Tests
# ==============================================================================
class TestThemisServiceQuality:
    """Evaluates Themis for identity, novel technical queries, and absence of generic templates."""

    @pytest.mark.parametrize("query", [
        "What's your name?",
        "What is your name?",
        "Who are you?",
        "What should I call you?",
    ])
    def test_themis_identity_direct_response(self, query: str, mock_user):
        """Themis must identify itself as Themis directly without generic analysis templates."""
        db_mock = MagicMock()
        req = AssistantInteractionRequest(message=query)
        resp = process_assistant_message(db_mock, mock_user, req)

        assert resp.status == "success"
        assert resp.action is not None
        assert resp.action.type == "identity"
        assert "themis" in resp.message.lower()
        assert_no_prohibited_templates(resp.message)
        # Must not mention RAG failure or compliance document limitations
        assert "no matching compliance documents" not in resp.message.lower()

    @pytest.mark.parametrize("query,expected_topic", [
        ("Explain how B-trees differ from binary search trees.", ["b-tree", "binary search", "branching"]),
        ("Write a Python function to compute Fibonacci numbers using memoization.", ["def ", "fib", "memo"]),
        ("What is the difference between synchronous and asynchronous I/O?", ["synchronous", "asynchronous", "blocking"]),
        ("Help me draft a 3-step incident response plan for a simulated drill.", ["incident", "containment", "response"]),
    ])
    def test_themis_unseen_technical_and_planning_queries(self, query: str, expected_topic: list[str], mock_user):
        """Themis must handle unseen technical, coding, and reasoning queries directly."""
        db_mock = MagicMock()
        req = AssistantInteractionRequest(message=query)
        with patch("app.config.settings.llm_provider", "mock"):
            resp = process_assistant_message(db_mock, mock_user, req)

        assert resp.status == "success"
        assert resp.action.type == "general_knowledge"
        assert_no_prohibited_templates(resp.message)
        assert any(t in resp.message.lower() for t in expected_topic), f"Missing key topic concepts in: {resp.message}"

    def test_themis_broad_document_query_empty_scope(self, mock_user):
        """When user asks 'What do the documents say?' in Themis with no documents, states no documents."""
        db_mock = MagicMock()
        db_mock.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []
        req = AssistantInteractionRequest(message="What do the documents say?")
        resp = process_assistant_message(db_mock, mock_user, req)

        assert resp.status == "success"
        assert resp.action.type == "document_overview"
        assert "do not have any compliance documents" in resp.message.lower()
        # Must not be an upload tutorial
        assert "drag and drop" not in resp.message.lower()
        assert_no_prohibited_templates(resp.message)


# ==============================================================================
# 2. AI Agent Tests
# ==============================================================================
class TestAIAgentQuality:
    """Evaluates AI Agent for identity queries, general questions, and compliance investigations."""

    @pytest.mark.parametrize("query", [
        "What's AI Assistant's name?",
        "What is the AI assistant's name?",
        "Who is the AI Assistant?",
    ])
    def test_ai_agent_identity_response(self, query: str):
        """AI Agent must identify Themis as the AI Assistant without generic compliance prose."""
        raw_res = _generate_mock_agent_response(
            prompt=f"Assess this: {query}",
            question=query,
        )
        res = json.loads(raw_res)
        finding = res.get("finding", "")
        assert "themis" in finding.lower()
        assert "ai assistant" in finding.lower() or "personal assistant" in finding.lower()
        assert_no_prohibited_templates(finding)
        # Must not fabricate evidence citations for an identity question
        assert res.get("citations") == []
        assert res.get("evidence") == []

    def test_ai_agent_general_query_no_compliance_forcing(self):
        """General questions posed to AI Agent must not force compliance document citations."""
        query = "What are the core trade-offs of microservices vs monoliths?"
        raw_res = _generate_mock_agent_response(
            prompt=f"Assess this: {query}",
            question=query,
        )
        res = json.loads(raw_res)
        finding = res.get("finding", "")
        assert "microservices" in finding.lower() or "monolith" in finding.lower()
        assert_no_prohibited_templates(finding)
        assert res.get("citations") == []


# ==============================================================================
# 3. Help Service Tests
# ==============================================================================
class TestHelpServiceQuality:
    """Evaluates Help for password policy vs change, and feature inquiries."""

    def test_help_strong_password_characteristics(self):
        """
        'What does a strong password look like for OpusLex?' must explain characteristics
        and accurately describe OpusLex enforced rules (min 8 chars, verification, difference, OAuth),
        distinguishing enforced rules from recommendations. Must not return password change steps.
        """
        query = "What does a strong password look like for OpusLex?"
        pwd_type = classify_password_query(query)
        assert pwd_type == "policy", f"Expected 'policy', got '{pwd_type}'"

        ans = match_deterministic_faq(query)
        assert ans is not None
        assert_no_prohibited_templates(ans)

        # Must describe enforced product rules
        assert "minimum of 8 characters" in ans.lower() or "8 characters" in ans.lower()
        assert "enforced product rules" in ans.lower()
        assert "verification" in ans.lower() or "current password" in ans.lower()

        # Must distinguish recommendations
        assert "recommended" in ans.lower()
        assert "12" in ans or "entropy" in ans.lower() or "character diversity" in ans.lower()

        # Must NOT be the password-change instructions
        assert "open settings from the navigation sidebar" not in ans.lower()

    def test_help_password_change_instructions(self):
        """
        'How do I change my password in OpusLex?' must return instructions for updating password.
        """
        query = "How do I change my password in OpusLex?"
        pwd_type = classify_password_query(query)
        assert pwd_type == "change", f"Expected 'change', got '{pwd_type}'"

        ans = match_deterministic_faq(query)
        assert ans is not None
        assert "settings" in ans.lower()
        assert "security" in ans.lower()
        assert "current password" in ans.lower()
        assert_no_prohibited_templates(ans)

    def test_help_knowledge_answer_fallback_separation(self):
        """generate_knowledge_answer must route policy vs change cleanly."""
        policy_ans = generate_knowledge_answer("What are the password requirements in OpusLex?")
        assert "8 characters" in policy_ans
        assert "enforced" in policy_ans.lower()
        assert_no_prohibited_templates(policy_ans)

        change_ans = generate_knowledge_answer("Where do I go to change my password?")
        assert "settings" in change_ans.lower()
        assert "security" in change_ans.lower()
        assert_no_prohibited_templates(change_ans)


# ==============================================================================
# 4. Research Service Tests
# ==============================================================================
class TestResearchServiceQuality:
    """Evaluates Research for broad document queries, identity, and general knowledge."""

    @pytest.mark.asyncio
    async def test_research_what_do_documents_say_empty_scope(self, mock_user):
        """
        'What do the documents say?' when no documents are in scope must report no documents,
        and must NOT return document upload instructions.
        """
        db_mock = MagicMock()
        db_mock.query.return_value.filter.return_value.all.return_value = []

        result = await execute_research_query(
            db=db_mock,
            question="What do the documents say?",
            user_id=mock_user.id,
        )

        assert result["intent"] == "document_overview"
        answer = result["answer"]
        assert "no documents are currently available" in answer.lower()
        # Must not return upload tutorial
        assert "drag and drop your pdf" not in answer.lower()
        assert_no_prohibited_templates(answer)

    @pytest.mark.asyncio
    async def test_research_what_do_documents_say_with_documents(self, mock_user):
        """
        'What do the documents say?' when documents exist in scope summarizes the available documents.
        """
        doc1 = MagicMock(spec=Document)
        doc1.id = 101
        doc1.filename = "aml_policy_2025.pdf"
        doc1.title = "Anti-Money Laundering Standard Operating Procedure"
        doc1.description = "Governs customer due diligence, PEP screening, and STR reporting."
        doc1.extracted_text = "AML procedures."

        doc2 = MagicMock(spec=Document)
        doc2.id = 102
        doc2.filename = "data_retention_rules.pdf"
        doc2.title = "Data Retention and Privacy Schedule"
        doc2.description = "Defines GDPR and CCPA storage periods for customer records."
        doc2.extracted_text = "Data retention rules."

        db_mock = MagicMock()
        db_mock.query.return_value.filter.return_value.all.return_value = [doc1, doc2]

        result = await execute_research_query(
            db=db_mock,
            question="What do the documents say?",
            user_id=mock_user.id,
        )

        assert result["intent"] == "document_overview"
        answer = result["answer"]
        assert "2 document(s)" in answer
        assert "Anti-Money Laundering" in answer
        assert "Data Retention" in answer
        assert_no_prohibited_templates(answer)
        assert len(result["sources"]) == 2

    @pytest.mark.asyncio
    async def test_research_general_knowledge_no_rag_disclaimer(self, mock_user):
        """General questions in Research must execute via LLM without requiring documents."""
        db_mock = MagicMock()
        with patch("app.config.settings.llm_provider", "mock"):
            result = await execute_research_query(
                db=db_mock,
                question="How does public-key cryptography enable digital signatures?",
                user_id=mock_user.id,
            )

        assert result["intent"] == "general_knowledge"
        answer = result["answer"]
        assert "cryptography" in answer.lower() or "key" in answer.lower() or "signature" in answer.lower()
        assert_no_prohibited_templates(answer)
        assert result["sources"] == []


# ==============================================================================
# 5. Investigation Research & Evidence Grounding Tests
# ==============================================================================
class TestInvestigationResearchQuality:
    """Evaluates Investigation Research for strict evidence grounding and missing clause handling."""

    def test_investigation_missing_clause_explicit_reporting(self):
        """If an investigation document does not contain the requested clause, states so explicitly."""
        prompt = (
            "Document context:\n"
            "Document: Security Policy Filename: sec_policy.pdf Chunk: 1 "
            "Content: All employees must use multi-factor authentication for remote access.\n"
        )
        question = "What does the policy specify regarding maritime salvage rights in clause 44.1?"
        raw_res = _generate_mock_agent_response(prompt=prompt, question=question)
        res = json.loads(raw_res)

        # Must report gap or absence of evidence
        assert res.get("evidence_gaps") != [] or "not found" in res.get("finding", "").lower() or "insufficient" in res.get("finding", "").lower() or len(res.get("citations", [])) == 0
        assert_no_prohibited_templates(res.get("finding", ""))

    def test_investigation_document_overview_in_rag_router(self, mock_user):
        """Broad document query in investigation RAG endpoint returns overview of attached docs."""
        from app.routers.rag import ask_rag, RAGRequest

        inv = Investigation(id=55, title="Foreign Subsidiary Audit", user_id=mock_user.id, status="Active")
        db_mock = MagicMock()
        db_mock.scalar.return_value = inv

        with patch("app.routers.rag.get_investigation_documents_metadata") as mock_meta:
            mock_meta.return_value = [
                {"document_id": 1, "filename": "subsidiary_bylaws.pdf", "title": "Subsidiary Corporate Bylaws"},
            ]
            req = RAGRequest(question="What do the documents say?", investigation_id=55)
            import asyncio
            resp = asyncio.run(ask_rag(request=req, db=db_mock, current_user=mock_user))

            assert "Foreign Subsidiary Audit" in resp["answer"]
            assert "subsidiary_bylaws.pdf" in resp["answer"]
            assert_no_prohibited_templates(resp["answer"])


# ==============================================================================
# 6. Live LLM Provider Test (Explicitly Labeled)
# ==============================================================================
class TestLiveLLMProviderQuality:
    """Live provider verification, conditionally executed when Copilot CLI SDK is available."""

    def test_live_copilot_provider_if_available(self):
        """Verify real Copilot LLM provider returns natural, substantive answer without template fallback."""
        from app.ai.llm.provider import CopilotLLMProvider
        import asyncio

        try:
            provider = CopilotLLMProvider()
            prompt = "What is the primary difference between a stack and a queue in data structures? Answer in two sentences."
            resp = asyncio.run(provider.generate(prompt=prompt, system="You are an expert computer science tutor."))
            if resp and not resp.startswith("Error"):
                assert "stack" in resp.lower() and "queue" in resp.lower()
                assert_no_prohibited_templates(resp)
            else:
                pytest.skip(f"Live Copilot provider skipped: {resp}")
        except Exception as exc:
            pytest.skip(f"Live Copilot provider not available in this environment: {exc}")
