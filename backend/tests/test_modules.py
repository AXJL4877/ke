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
        '"input_schema":{},"output_schema":{},"runtime":{"async":false}}',
        encoding="utf-8",
    )
    (bad / "handler.py").write_text("x = 1\n", encoding="utf-8")
    try:
        ModuleLoader(tmp_path)
        assert False, "expected ModuleLoadError"
    except ModuleLoadError as exc:
        assert "run" in str(exc).lower() or "handler" in str(exc).lower()
