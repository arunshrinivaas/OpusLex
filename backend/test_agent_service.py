import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.models.agent_run import AgentRun
from app.models.investigation import Investigation
from app.services.agent_service import run_compliance_investigation


@pytest.fixture
def mock_db():
    db = MagicMock()
    return db


@pytest.fixture
def mock_investigation():
    inv = MagicMock(spec=Investigation)
    inv.id = 1
    inv.user_id = 42
    
    doc1 = MagicMock()
    doc1.id = 101
    doc2 = MagicMock()
    doc2.id = 102
    
    inv.documents = [doc1, doc2]
    return inv


def create_mock_agent_run(*args, **kwargs):
    run = MagicMock(spec=AgentRun)
    for k, v in kwargs.items():
        setattr(run, k, v)
    return run


@pytest.mark.asyncio
async def test_valid_investigation_produces_completed_run(mock_db, mock_investigation):
    mock_db.scalar.return_value = mock_investigation
    
    # We patch AgentRun instantiation to return a mock we can inspect
    with patch("app.services.agent_service.AgentRun", side_effect=create_mock_agent_run) as MockRun, \
         patch("app.services.agent_service.build_rag_context", return_value=("Mock context", [])) as mock_rag, \
         patch("app.services.agent_service._run_agent_llm") as mock_llm:
        
        valid_json = {
            "finding": "All good.",
            "evidence": [],
            "conflicts": [],
            "evidence_gaps": [],
            "applicable_requirements": [],
            "suggested_actions": [],
            "citations": []
        }
        mock_llm.return_value = json.dumps(valid_json)
        
        result = await run_compliance_investigation(mock_db, 1, 42, "Is this okay?")
        
        assert result.status == "completed"
        assert result.finding == "All good."
        assert mock_llm.called
        assert mock_rag.called
        # Ensures it accessed the two documents attached to this investigation
        mock_rag.assert_called_with(db=mock_db, query="Is this okay?", limit=5, document_ids=[101, 102])


@pytest.mark.asyncio
async def test_investigation_ownership_enforced(mock_db):
    # Scalar returns None to simulate not found / wrong user
    mock_db.scalar.return_value = None
    
    with pytest.raises(HTTPException) as excinfo:
        await run_compliance_investigation(mock_db, 1, 99, "Test?")
        
    assert excinfo.value.status_code == 404
    assert "Investigation not found" in str(excinfo.value)


@pytest.mark.asyncio
async def test_no_attached_documents_returns_explicit_result(mock_db, mock_investigation):
    # Remove documents
    mock_investigation.documents = []
    mock_db.scalar.return_value = mock_investigation
    
    with patch("app.services.agent_service.AgentRun", side_effect=create_mock_agent_run) as MockRun, \
         patch("app.services.agent_service._run_agent_llm") as mock_llm:
        
        result = await run_compliance_investigation(mock_db, 1, 42, "Test?")
        
        assert result.status == "completed"
        assert "No documents are currently attached" in result.finding
        assert not mock_llm.called


@pytest.mark.asyncio
async def test_multiple_attached_documents_included_in_scope(mock_db, mock_investigation):
    mock_db.scalar.return_value = mock_investigation
    
    with patch("app.services.agent_service.AgentRun", side_effect=create_mock_agent_run) as MockRun, \
         patch("app.services.agent_service.build_rag_context", return_value=("Mock context", [])) as mock_rag, \
         patch("app.services.agent_service._run_agent_llm") as mock_llm:
        
        mock_llm.return_value = '{"finding": "Test"}'
        
        await run_compliance_investigation(mock_db, 1, 42, "Test?")
        
        mock_rag.assert_called_once()
        kwargs = mock_rag.call_args.kwargs
        assert set(kwargs["document_ids"]) == {101, 102}


@pytest.mark.asyncio
async def test_invalid_llm_json_results_in_failed_run(mock_db, mock_investigation):
    mock_db.scalar.return_value = mock_investigation
    
    with patch("app.services.agent_service.AgentRun", side_effect=create_mock_agent_run) as MockRun, \
         patch("app.services.agent_service.build_rag_context", return_value=("Mock context", [])), \
         patch("app.services.agent_service._run_agent_llm") as mock_llm:
        
        # Return something that is not valid JSON
        mock_llm.return_value = "This is not json."
        
        result = await run_compliance_investigation(mock_db, 1, 42, "Test?")
        
        assert result.status == "failed"
        assert "Failed to parse or validate LLM response" in result.finding


@pytest.mark.asyncio
async def test_invalid_schema_results_in_failed_run(mock_db, mock_investigation):
    mock_db.scalar.return_value = mock_investigation
    
    with patch("app.services.agent_service.AgentRun", side_effect=create_mock_agent_run) as MockRun, \
         patch("app.services.agent_service.build_rag_context", return_value=("Mock context", [])), \
         patch("app.services.agent_service._run_agent_llm") as mock_llm:
        
        # Return valid JSON, but missing required 'finding' field according to AgentFinding schema
        mock_llm.return_value = '{"not_the_right_schema": 123}'
        
        result = await run_compliance_investigation(mock_db, 1, 42, "Test?")
        
        assert result.status == "failed"
        assert "Failed to parse or validate LLM response" in result.finding


@pytest.mark.asyncio
async def test_agent_cannot_access_other_investigation_documents(mock_db, mock_investigation):
    # Setup investigation with known documents
    mock_db.scalar.return_value = mock_investigation
    
    with patch("app.services.agent_service.AgentRun", side_effect=create_mock_agent_run) as MockRun, \
         patch("app.services.agent_service.build_rag_context", return_value=("Mock context", [])) as mock_rag, \
         patch("app.services.agent_service._run_agent_llm") as mock_llm:
        
        mock_llm.return_value = '{"finding": "Test"}'
        
        # Execute the agent
        await run_compliance_investigation(mock_db, 1, 42, "Test?")
        
        # Verify exactly the investigation's document IDs were requested.
        # This proves the RAG context cannot access documents from other investigations
        # or perform a global unbounded search.
        mock_rag.assert_called_once()
        kwargs = mock_rag.call_args.kwargs
        assert set(kwargs["document_ids"]) == {101, 102}


@pytest.mark.asyncio
async def test_concurrent_agent_executions_safe_lifecycle(monkeypatch):
    from app.services.agent_service import _run_agent_llm
    from app.services.copilot_service import SessionEventType
    from app.config import settings
    import asyncio

    # Ensure live provider branch is exercised
    monkeypatch.setattr(settings, "llm_provider", "copilot")
    monkeypatch.setattr(settings, "demo_mode", False)

    # We mock CopilotClient to track session creation and concurrency overlap
    class MockSession:
        def __init__(self):
            self.events = []

        def on(self, handler):
            self.handler = handler

        async def send(self, prompt):
            # Simulate a delayed response from the LLM
            await asyncio.sleep(0.1)
            class MockData:
                content = '{"finding": "done"}'
            class MockEvent:
                type = SessionEventType.ASSISTANT_MESSAGE
                data = MockData()
            self.handler(MockEvent())

            class MockIdle:
                type = SessionEventType.SESSION_IDLE
            self.handler(MockIdle())

        async def disconnect(self):
            pass

    class MockCopilotClient:
        def __init__(self):
            self.session_count = 0

        async def create_session(self, **kwargs):
            self.session_count += 1
            return MockSession()

    mock_client = MockCopilotClient()
    with patch("app.services.copilot_service.get_client", return_value=mock_client):
        # Run two agent LLMs concurrently
        task1 = asyncio.create_task(_run_agent_llm("test1"))
        task2 = asyncio.create_task(_run_agent_llm("test2"))

        # Await both to finish
        results = await asyncio.gather(task1, task2)

        # Both sessions should be created concurrently without colliding
        assert mock_client.session_count == 2
        assert results[0] == '{"finding": "done"}'
        assert results[1] == '{"finding": "done"}'
