# -*- coding: utf-8 -*-
"""标准业务进度环节词表（与 scripts/docs/specs/TASK_PROGRESS.md 同步）。

智能体改 Handler 时：只用这里的 id，通过 report_stage() 上报。
"""
from __future__ import annotations

from typing import Any

# id -> {label, anchor 0-100}
STAGES: dict[str, dict[str, Any]] = {
    "fetch_data": {"label": "拉取数据", "anchor": 8},
    "write_copy": {"label": "撰写文案", "anchor": 18},
    "render_cover": {"label": "渲封面", "anchor": 30},
    "render_video": {"label": "渲画面", "anchor": 45},
    "voiceover": {"label": "配音", "anchor": 60},
    "mix_voice": {"label": "混解说", "anchor": 72},
    "mix_bgm": {"label": "叠 BGM", "anchor": 82},
    "export": {"label": "导出成片", "anchor": 90},
    "publish_prepare": {"label": "发布预填", "anchor": 96},
    "done": {"label": "完成", "anchor": 100},
    # 可选扩展
    "ensure_deps": {"label": "探活依赖", "anchor": 12},
    "upload": {"label": "上传素材", "anchor": 94},
    "transcribe": {"label": "转写", "anchor": 55},
    "download": {"label": "下载源片", "anchor": 25},
    # 壳层技术阶段（失败定位用；业务进度优先用上表）
    "validate": {"label": "校验", "anchor": 5},
    "load": {"label": "加载模块", "anchor": 15},
    "run": {"label": "执行", "anchor": 28},
    "persist": {"label": "落库", "anchor": 92},
}

PRESETS: dict[str, list[str]] = {
    "fund-flow-daily": [
        "fetch_data",
        "write_copy",
        "render_cover",
        "render_video",
        "voiceover",
        "mix_voice",
        "mix_bgm",
        "export",
        "publish_prepare",
    ],
    "transcript-pipeline": [
        "download",
        "transcribe",
        "write_copy",
        "export",
    ],
    "voice-only": ["voiceover", "done"],
    "bgm-only": ["mix_bgm", "export"],
}


def stage_label(stage_id: str) -> str:
    meta = STAGES.get(stage_id)
    if meta:
        return str(meta["label"])
    return stage_id


def stage_anchor(stage_id: str) -> float | None:
    meta = STAGES.get(stage_id)
    if not meta:
        return None
    return float(meta["anchor"])


def catalog_payload() -> dict[str, Any]:
    return {
        "stages": {
            k: {"id": k, "label": v["label"], "anchor": v["anchor"]}
            for k, v in STAGES.items()
            if k not in ("validate", "load", "run", "persist")
        },
        "presets": PRESETS,
        "spec": "scripts/docs/specs/TASK_PROGRESS.md",
    }
