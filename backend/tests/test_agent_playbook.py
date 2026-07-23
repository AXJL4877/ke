"""Smoke test for GET /api/agent/playbook."""

from fastapi.testclient import TestClient

from api.main import app


def test_agent_playbook_shape():
    client = TestClient(app)
    r = client.get("/api/agent/playbook")
    assert r.status_code == 200
    data = r.json()
    assert "click_acceptance" in data
    assert "testid" in data["click_acceptance"]
    assert data["click_acceptance"]["testid"]["task_submit"] == "ke-task-submit"
    assert isinstance(data.get("modules"), list)
    assert any(m.get("id") == "echo" for m in data["modules"])
