"""Infrastructure tests for integration contract + local_service_bridge.

Uses an in-process fake HTTP service — does NOT call real mo_kuai modules.
"""
from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import pytest

from core.integration_contract import (
    IntegrationContractError,
    build_contract_skeleton_from_source,
    load_and_validate_contract,
    validate_capability_coverage,
    validate_contract_shape,
    validate_task_result_against_contract,
)
from core.local_service_bridge import (
    LocalServiceClient,
    LocalServiceError,
    discover_service,
    map_params,
    probe_health,
)


# ---------------------------------------------------------------------------
# Fake HTTP downstream
# ---------------------------------------------------------------------------


class _FakeState:
    service_label = "fake_download"
    jobs: dict[str, dict[str, Any]] = {}
    poll_count: dict[str, int] = {}


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        return

    def _json(self, code: int, body: Any) -> None:
        raw = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _bytes(self, code: int, data: bytes, content_type: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/health":
            self._json(200, {"service": _FakeState.service_label, "ok": True})
            return
        if path == "/cookies/sites":
            self._json(200, {"sites": [{"id": "bilibili", "label": "B站"}]})
            return
        if path.startswith("/jobs/"):
            job_id = path.rsplit("/", 1)[-1]
            job = _FakeState.jobs.get(job_id)
            if not job:
                self._json(404, {"error": "not found"})
                return
            n = _FakeState.poll_count.get(job_id, 0) + 1
            _FakeState.poll_count[job_id] = n
            if n >= 2:
                job = {**job, "status": "done", "file": "out.mp4"}
                _FakeState.jobs[job_id] = job
            self._json(200, job)
            return
        if path == "/jobs":
            self._json(200, {"jobs": list(_FakeState.jobs.values())})
            return
        self._json(404, {"error": "no route"})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        ctype = self.headers.get("Content-Type") or ""

        if path == "/download":
            body = json.loads(raw.decode("utf-8") or "{}")
            if not body.get("url"):
                self._json(400, {"error": "url required"})
                return
            job_id = "job-1"
            _FakeState.jobs[job_id] = {"job_id": job_id, "status": "running"}
            _FakeState.poll_count[job_id] = 0
            self._json(200, {"job_id": job_id, "status": "queued"})
            return

        if path == "/compose":
            # binary mp4-ish
            self._bytes(200, b"\x00\x00\x00\x18ftypmp42fake", "video/mp4")
            return

        if path == "/run" and "multipart" in ctype:
            # minimal: accept any multipart
            self._json(200, {"text": "hello from asr", "ok": True})
            return

        self._json(404, {"error": "no route"})


@pytest.fixture()
def fake_server():
    _FakeState.jobs.clear()
    _FakeState.poll_count.clear()
    _FakeState.service_label = "fake_download"
    server = HTTPServer(("127.0.0.1", 0), _Handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{port}"
    yield {"base": base, "port": port, "server": server}
    server.shutdown()


SOURCE_MANIFEST = {
    "id": "download",
    "version": "1.0.0",
    "local": {"label": "fake_download", "defaultPort": 18789, "maxTries": 3},
    "runtime": {"async": True, "timeout_seconds": 60},
    "capabilities": [
        {
            "id": "download-core",
            "desc": "main",
            "kind": "core",
            "must_keep": True,
            "endpoints": ["POST /download"],
            "verify": {"method": "POST", "path": "/download", "expect": {"status": 400}},
        },
        {
            "id": "cookie-one-click-import",
            "desc": "cookies",
            "kind": "aux",
            "must_keep": True,
            "endpoints": ["GET /cookies/sites", "POST /cookies/login"],
            "verify": {
                "method": "GET",
                "path": "/cookies/sites",
                "expect": {"status": 200, "jsonHas": "sites"},
            },
        },
        {
            "id": "cookie-auto-resolve",
            "desc": "auto cookies",
            "kind": "aux",
            "must_keep": True,
            "endpoints": [],
            "verify": {"manual": "place bilibili.txt"},
        },
        {
            "id": "health-probe",
            "desc": "health",
            "kind": "invariant",
            "must_keep": True,
            "endpoints": ["GET /health"],
            "verify": {"method": "GET", "path": "/health", "expect": {"status": 200}},
        },
        {
            "id": "optional-info",
            "desc": "optional",
            "kind": "aux",
            "must_keep": False,
            "endpoints": ["GET /info"],
            "verify": {"method": "GET", "path": "/info", "expect": {"status": 400}},
        },
    ],
}


def _full_wiring() -> list[dict[str, Any]]:
    return [
        {
            "capability_id": "download-core",
            "wiring": "handler",
            "proxy_paths": ["/download"],
        },
        {
            "capability_id": "cookie-one-click-import",
            "wiring": "proxy",
            "proxy_paths": ["/cookies/sites", "/cookies/login"],
        },
        {
            "capability_id": "cookie-auto-resolve",
            "wiring": "preserved_internal",
        },
        {
            "capability_id": "health-probe",
            "wiring": "handler",
            "proxy_paths": ["/health"],
        },
    ]


def _base_contract(manifest_path: str) -> dict[str, Any]:
    return {
        "schema_version": "1.0.0",
        "module_id": "cj-download",
        "source": {
            "service_id": "download",
            "label": "fake_download",
            "manifest_path": manifest_path,
            "version": "1.0.0",
            "default_port": 18789,
            "max_tries": 3,
        },
        "capability_wiring": _full_wiring(),
        "params_map": {},
        "execution": {
            "mode": "async_job",
            "timeout_seconds": 30,
            "poll_interval_ms": 50,
            "job_path_template": "/jobs/{job_id}",
            "min_duration_ms": 10,
            "fast_completion_ok": False,
        },
        "success_evidence": {
            "require_provenance": True,
            "required_result_keys": ["job_id"],
            "provenance_fields": ["source", "service", "mock"],
            "forbid_mock": True,
        },
        "manual_acceptance": [
            {
                "capability_id": "cookie-auto-resolve",
                "accepted": True,
                "note": "fixture accepted for tests",
            }
        ],
    }


# ---------------------------------------------------------------------------
# Contract tests
# ---------------------------------------------------------------------------


def test_missing_must_keep_cookie_fails(tmp_path: Path):
    src = tmp_path / "module.json"
    src.write_text(json.dumps(SOURCE_MANIFEST), encoding="utf-8")
    contract = _base_contract(str(src))
    # Drop cookie-one-click-import — classic AI miss
    contract["capability_wiring"] = [
        w
        for w in contract["capability_wiring"]
        if w["capability_id"] != "cookie-one-click-import"
    ]
    with pytest.raises(IntegrationContractError) as ei:
        validate_capability_coverage(contract, SOURCE_MANIFEST)
    assert "cookie-one-click-import" in str(ei.value)


def test_missing_proxy_paths_for_endpoints_fails(tmp_path: Path):
    contract = _base_contract("x")
    for w in contract["capability_wiring"]:
        if w["capability_id"] == "cookie-one-click-import":
            w.pop("proxy_paths", None)
    with pytest.raises(IntegrationContractError) as ei:
        validate_capability_coverage(contract, SOURCE_MANIFEST)
    assert "proxy_paths" in str(ei.value) or "cookie-one-click-import" in str(ei.value)


def test_full_coverage_ok(tmp_path: Path):
    src = tmp_path / "module.json"
    src.write_text(json.dumps(SOURCE_MANIFEST), encoding="utf-8")
    contract = _base_contract(str(src))
    report = validate_capability_coverage(contract, SOURCE_MANIFEST)
    assert report["missing_must_keep"] == []
    assert report["manual_pending"] == []


def test_async_job_requires_job_or_archive_key():
    c = _base_contract("x")
    c["success_evidence"]["required_result_keys"] = []
    with pytest.raises(IntegrationContractError):
        validate_contract_shape(c, module_id="cj-download")


def test_result_missing_provenance_soft_warns():
    c = _base_contract("x")
    warns = validate_task_result_against_contract({"job_id": "1"}, c, duration_ms=100)
    assert any("provenance" in w for w in warns)


def test_result_mock_soft_warns():
    c = _base_contract("x")
    warns = validate_task_result_against_contract(
        {
            "job_id": "1",
            "title": "演示·假数据",
            "provenance": {"source": "download", "service": "fake_download", "mock": False},
        },
        c,
        duration_ms=100,
    )
    assert any("mock" in w.lower() or "演示" in w for w in warns)


def test_result_too_fast_soft_warns():
    c = _base_contract("x")
    c["execution"]["min_duration_ms"] = 5000
    warns = validate_task_result_against_contract(
        {
            "job_id": "1",
            "provenance": {"source": "download", "service": "fake_download", "mock": False},
        },
        c,
        duration_ms=100,
    )
    assert any("快" in w for w in warns)


def test_fast_completion_ok_allows_short():
    c = _base_contract("x")
    c["execution"]["mode"] = "sync"
    c["execution"]["fast_completion_ok"] = True
    c["execution"]["min_duration_ms"] = 5000
    c["success_evidence"]["required_result_keys"] = []
    validate_contract_shape(c, module_id="cj-download")
    warns = validate_task_result_against_contract(
        {
            "ok": True,
            "provenance": {"source": "richtext", "service": "rich_txt", "mock": False},
        },
        c,
        duration_ms=50,
    )
    assert warns == []


def test_load_contract_from_module_dir(tmp_path: Path):
    src = tmp_path / "src_module.json"
    src.write_text(json.dumps(SOURCE_MANIFEST), encoding="utf-8")
    mod = tmp_path / "cj-download"
    mod.mkdir()
    contract = _base_contract(str(src))
    (mod / "integration.contract.json").write_text(
        json.dumps(contract), encoding="utf-8"
    )
    loaded, source, coverage = load_and_validate_contract(
        mod, module_id="cj-download", require_source_file=True
    )
    assert loaded["module_id"] == "cj-download"
    assert source is not None
    assert coverage["ok"] is True


def test_manual_pending_blocks_strict_verify(tmp_path: Path):
    src = tmp_path / "src_module.json"
    src.write_text(json.dumps(SOURCE_MANIFEST), encoding="utf-8")
    mod = tmp_path / "cj-download"
    mod.mkdir()
    contract = _base_contract(str(src))
    contract["manual_acceptance"] = []  # missing acceptance
    (mod / "integration.contract.json").write_text(
        json.dumps(contract), encoding="utf-8"
    )
    with pytest.raises(IntegrationContractError) as ei:
        load_and_validate_contract(
            mod,
            module_id="cj-download",
            require_source_file=True,
            require_manual_acceptance=True,
        )
    assert "cookie-auto-resolve" in str(ei.value)


def test_skeleton_includes_all_must_keep():
    sk = build_contract_skeleton_from_source(
        SOURCE_MANIFEST, module_id="cj-download", manifest_path="../x/module.json"
    )
    ids = {w["capability_id"] for w in sk["capability_wiring"]}
    assert "cookie-one-click-import" in ids
    assert "download-core" in ids


# ---------------------------------------------------------------------------
# Bridge / discovery tests
# ---------------------------------------------------------------------------


def test_probe_rejects_wrong_service(fake_server):
    assert probe_health(fake_server["base"], "fake_download") is True
    assert probe_health(fake_server["base"], "video_download") is False


def test_discover_wrong_port_fails(fake_server, monkeypatch, tmp_path: Path):
    # No env, empty registry, wrong default port → fail
    monkeypatch.delenv("DOWNLOAD_BASE_URL", raising=False)
    reg = tmp_path / "ports.json"
    reg.write_text("{}", encoding="utf-8")
    with pytest.raises(LocalServiceError):
        discover_service(
            "download",
            "fake_download",
            default_port=fake_server["port"] + 50,
            max_tries=2,
            registry_path=reg,
            deep=True,
            timeout=0.5,
        )


def test_discover_via_env(fake_server, monkeypatch):
    monkeypatch.setenv("DOWNLOAD_BASE_URL", fake_server["base"])
    base = discover_service(
        "download",
        "fake_download",
        default_port=1,
        max_tries=1,
        deep=False,
        timeout=2.0,
    )
    assert base == fake_server["base"]


def test_poll_job(fake_server):
    client = LocalServiceClient(fake_server["base"], service_id="download", timeout_seconds=10)
    sub = client.post_json("/download", {"url": "https://example.com/v"})
    assert sub["job_id"] == "job-1"
    done = client.poll_job("job-1", interval_ms=20, timeout_seconds=5)
    assert done["status"] == "done"


def test_binary_response(fake_server):
    client = LocalServiceClient(fake_server["base"], timeout_seconds=10)
    data = client.post_binary("/compose", {"clips": []})
    assert data.startswith(b"\x00\x00")


def test_multipart(fake_server):
    client = LocalServiceClient(fake_server["base"], timeout_seconds=10)
    files = {"audio": ("a.mp3", b"ID3fake", "audio/mpeg")}
    out = client.post_multipart("/run", files=files, data={"format": "txt"})
    assert out["ok"] is True


def test_map_params():
    assert map_params({"url": "a", "q": 1}, {"url": "video_url"}) == {
        "video_url": "a",
        "q": 1,
    }


def test_loader_skips_underscore_template():
    from worker.module_loader import ModuleLoader

    modules_dir = Path(__file__).resolve().parents[1] / "modules"
    loader = ModuleLoader(modules_dir)
    ids = {m["id"] for m in loader.list_manifests(for_api=False)}
    assert "echo" in ids
    assert "_template-http-bridge" not in ids
