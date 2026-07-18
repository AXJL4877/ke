from core.anti_mock import (
    annotate_shell_result,
    detect_mock_result,
    find_mock_params,
    find_mock_schema_fields,
    strip_mock_from_schema,
)
from core.capabilities import CapabilitiesError, integration_report, validate_capabilities


def test_strip_mock_schema_fields():
    schema = {
        "url": {"type": "string", "label": "链接"},
        "demo_mode": {"type": "boolean", "label": "演示模式"},
        "use_mock": {"type": "boolean", "label": "使用假数据"},
        "quality": {"type": "enum", "label": "清晰度"},
    }
    cleaned, stripped = strip_mock_from_schema(schema)
    assert "url" in cleaned and "quality" in cleaned
    assert "demo_mode" in stripped and "use_mock" in stripped
    assert find_mock_schema_fields(schema) == ["demo_mode", "use_mock"]


def test_reject_mock_params():
    assert find_mock_params({"url": "https://x", "demo": True}) == ["demo"]
    assert find_mock_params({"url": "https://x", "demo": False}) == []


def test_detect_mock_result_copy():
    d = detect_mock_result({"title": "演示·财经", "text": "【演示转写】hello"})
    assert d["is_mock"] is True
    assert d["signals"]


def test_annotate_fast_completion():
    out = annotate_shell_result({"ok": True}, duration_ms=500, module_id="cj-collect")
    assert out["_ke"]["fast_completion"] is True
    assert out["_ke"]["duration_ms"] == 500


def test_capabilities_required():
    try:
        validate_capabilities(None, module_id="biz", required=True)
        assert False, "expected CapabilitiesError"
    except CapabilitiesError as exc:
        assert "capabilities" in str(exc)


def test_capabilities_shape_ok():
    caps = [
        {
            "id": "main",
            "desc": "主能力",
            "kind": "core",
            "must_keep": True,
            "endpoints": ["POST /run"],
            "verify": {"method": "GET", "path": "/health", "expect": {"status": 200}},
        }
    ]
    warnings = validate_capabilities(caps, module_id="biz", required=True)
    assert isinstance(warnings, list)
    report = integration_report({"id": "biz", "capabilities": caps})
    assert report["ok"] is True
    assert report["must_keep_count"] == 1


def test_loader_echo_still_loads():
    from pathlib import Path

    from worker.module_loader import ModuleLoader

    modules_dir = Path(__file__).resolve().parents[1] / "modules"
    loader = ModuleLoader(modules_dir)
    ids = {m["id"] for m in loader.list_manifests(for_api=False)}
    assert "echo" in ids
    echo = loader.get_manifest("echo", for_api=True)
    assert echo is not None
    assert echo.get("capabilities")
