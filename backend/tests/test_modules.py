from worker.module_loader import ModuleLoader, ModuleLoadError


def test_list_modules_includes_echo():
    from pathlib import Path

    modules_dir = Path(__file__).resolve().parents[1] / "modules"
    loader = ModuleLoader(modules_dir)
    ids = {m["id"] for m in loader.list_manifests()}
    assert "echo" in ids
    echo = next(m for m in loader.list_manifests() if m["id"] == "echo")
    assert "message" in echo["input_schema"]
    assert echo["category"] == "system"


def test_echo_handler_run():
    from pathlib import Path

    modules_dir = Path(__file__).resolve().parents[1] / "modules"
    loader = ModuleLoader(modules_dir)
    handler = loader.get_handler("echo")
    result = handler.run({"message": "hi"})
    assert result == {"echo": "hi"}


def test_handler_missing_run_raises(tmp_path):
    bad = tmp_path / "badmod"
    bad.mkdir()
    (bad / "module.json").write_text(
        '{"id":"bad","name":"Bad","description":"x","version":"1.0.0","category":"system",'
        '"input_schema":{},"output_schema":{},"runtime":{"async":false},'
        '"capabilities":[{"id":"x","desc":"x","kind":"core","must_keep":true,'
        '"verify":{"manual":"n/a"}}]}',
        encoding="utf-8",
    )
    (bad / "handler.py").write_text("x = 1\n", encoding="utf-8")
    loader = ModuleLoader(tmp_path)
    assert "bad" not in {m["id"] for m in loader.list_manifests(for_api=False)}
    assert any("handler" in e.lower() or "run" in e.lower() for e in loader.get_load_errors())


def test_missing_capabilities_rejected(tmp_path, monkeypatch):
    from api.config import clear_settings_cache, get_settings

    monkeypatch.setenv("KE_REQUIRE_CAPABILITIES", "true")
    monkeypatch.setenv("KE_CAPABILITIES_EXEMPT", "echo")
    clear_settings_cache()
    get_settings()

    mod = tmp_path / "nocap"
    mod.mkdir()
    (mod / "module.json").write_text(
        '{"id":"nocap","name":"NoCap","description":"x","version":"1.0.0","category":"system",'
        '"input_schema":{},"output_schema":{},"runtime":{"async":false}}',
        encoding="utf-8",
    )
    (mod / "handler.py").write_text("def run(params):\n    return {}\n", encoding="utf-8")
    try:
        loader = ModuleLoader(tmp_path)
        assert "nocap" not in {m["id"] for m in loader.list_manifests(for_api=False)}
        assert any("capabilities" in e.lower() for e in loader.get_load_errors())
    finally:
        clear_settings_cache()
