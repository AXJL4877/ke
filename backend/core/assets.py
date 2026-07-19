"""Asset vault: extract task results into searchable assets."""
from __future__ import annotations

import logging
import mimetypes
import re
from pathlib import Path
from typing import Any
from uuid import UUID
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

TEXT_MAX_CHARS = 200_000
PREVIEW_CHARS = 120

# Heuristic field names → kind
_TEXT_KEYS = frozenset(
    {
        "text",
        "transcript",
        "echo",
        "content",
        "prompt",
        "style_prompt",
        "html",
        "markdown",
        "srt",
        "subtitle",
    }
)
_FILE_KEYS = frozenset(
    {
        "result_file",
        "result_video",
        "result_audio",
        "result_image",
        "audio_url",
        "video_url",
        "image_url",
        "url",
        "file",
        "output",
    }
)
_SKIP_KEYS = frozenset({"_ke", "_assets", "provenance", "input_params", "error", "log"})


def _preview(text: str | None) -> str | None:
    if not text:
        return None
    t = text.strip()
    if len(t) <= PREVIEW_CHARS:
        return t
    return t[: PREVIEW_CHARS - 1] + "…"


def _kind_from_mime_or_name(mime: str | None, name: str | None) -> str:
    m = (mime or "").lower()
    n = (name or "").lower()
    if m.startswith("audio/") or n.endswith((".wav", ".mp3", ".m4a", ".ogg")):
        return "audio"
    if m.startswith("video/") or n.endswith((".mp4", ".webm", ".mov")):
        return "video"
    if m.startswith("image/") or n.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")):
        return "image"
    if n.endswith(".srt") or m in ("application/x-subrip", "text/srt"):
        return "subtitle"
    if m in ("application/json",) or n.endswith(".json"):
        return "json"
    if m.startswith("text/") or n.endswith((".txt", ".md")):
        return "text"
    return "file"


def _looks_like_url(val: str) -> bool:
    return val.startswith("http://") or val.startswith("https://") or val.startswith("/files/")


def _title_from_result(result: dict[str, Any], default: str) -> str:
    for key in ("title", "name", "archive_title", "filename"):
        v = result.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()[:200]
    return default


def candidates_from_extract(
    result: dict[str, Any],
    extract_rules: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for rule in extract_rules:
        if not isinstance(rule, dict):
            continue
        field = rule.get("from")
        if not isinstance(field, str) or field not in result:
            continue
        val = result[field]
        kind = str(rule.get("kind") or "file")
        title = None
        tf = rule.get("title_from")
        if isinstance(tf, str) and isinstance(result.get(tf), str):
            title = str(result[tf]).strip()[:200]
        if not title:
            title = str(rule.get("title_default") or field)[:200]
        item: dict[str, Any] = {
            "title": title,
            "kind": kind,
            "field": field,
        }
        if rule.get("is_file") or (
            isinstance(val, str) and _looks_like_url(val)
        ):
            if isinstance(val, str):
                item["url"] = val
                item["mime"] = rule.get("mime")
            else:
                continue
        elif isinstance(val, str):
            item["text_content"] = val[:TEXT_MAX_CHARS]
            item["mime"] = rule.get("mime") or "text/plain"
        elif isinstance(val, (dict, list)):
            import json

            item["text_content"] = json.dumps(val, ensure_ascii=False)[:TEXT_MAX_CHARS]
            item["kind"] = kind if kind != "file" else "json"
            item["mime"] = "application/json"
        else:
            continue
        out.append(item)
    return out


def candidates_heuristic(result: dict[str, Any], module_id: str) -> list[dict[str, Any]]:
    """Conservative extraction when asset_extract is absent."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    for key, val in result.items():
        if key in _SKIP_KEYS or key.startswith("_"):
            continue
        kl = key.lower()

        if isinstance(val, str) and len(val.strip()) >= 8:
            if kl in _TEXT_KEYS or (kl.endswith("_text") and len(val) > 40):
                sig = f"text:{key}"
                if sig not in seen:
                    seen.add(sig)
                    kind = "subtitle" if "srt" in kl or kl == "subtitle" else "text"
                    out.append(
                        {
                            "title": _title_from_result(result, f"{module_id} · {key}"),
                            "kind": kind,
                            "text_content": val[:TEXT_MAX_CHARS],
                            "mime": "application/x-subrip" if kind == "subtitle" else "text/plain",
                            "field": key,
                        }
                    )
                continue

            if kl in _FILE_KEYS or _looks_like_url(val):
                if not _looks_like_url(val) and len(val) < 500 and "/" not in val:
                    continue
                if not _looks_like_url(val):
                    continue
                sig = f"url:{val[:120]}"
                if sig in seen:
                    continue
                seen.add(sig)
                name = Path(urlparse(val).path).name or key
                kind = _kind_from_mime_or_name(None, name)
                if kl.startswith("result_audio") or "audio" in kl:
                    kind = "audio"
                if kl.startswith("result_video") or "video" in kl:
                    kind = "video"
                if kl.startswith("result_image") or "image" in kl:
                    kind = "image"
                out.append(
                    {
                        "title": _title_from_result(result, name or f"{module_id} · {key}"),
                        "kind": kind,
                        "url": val,
                        "field": key,
                    }
                )

    # Cap heuristic assets per task
    return out[:8]


def extract_asset_candidates(
    result: dict[str, Any] | None,
    *,
    module_id: str,
    manifest: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    if not isinstance(result, dict):
        return []
    rules = []
    if isinstance(manifest, dict):
        raw = manifest.get("asset_extract")
        if isinstance(raw, list):
            rules = raw
    if rules:
        return candidates_from_extract(result, rules)
    return candidates_heuristic(result, module_id)


def _maybe_copy_local_file(url_or_path: str) -> tuple[str | None, str | None, int | None]:
    """
    If value is a ke /files URL or existing local path, ensure it's in storage.
    Returns (storage_key, public_url, bytes_size).
    """
    from storage.client import get_storage
    from api.config import get_settings

    settings = get_settings()
    storage = get_storage()
    raw = url_or_path.strip()

    # Already under /files/
    if "/files/" in raw:
        path_part = raw.split("/files/", 1)[-1].split("?", 1)[0]
        root = Path(settings.storage_local_path)
        if not root.is_absolute():
            root = (Path(__file__).resolve().parents[1] / root).resolve()
        local = root / path_part
        if local.is_file():
            return path_part, storage.get_url(path_part), local.stat().st_size
        return path_part, raw if raw.startswith("http") else storage.get_url(path_part), None

    # Local filesystem path from module
    p = Path(raw)
    if p.is_file():
        url = storage.upload(p)
        # derive key from url
        key = url.split("/files/", 1)[-1] if "/files/" in url else None
        return key, url, p.stat().st_size

    if raw.startswith("http://") or raw.startswith("https://"):
        return None, raw, None

    return None, None, None


def register_assets_from_task(
    db: Any,
    *,
    task_id: UUID,
    module_id: str,
    result: dict[str, Any],
    manifest: dict[str, Any] | None = None,
    user_id: UUID | None = None,
) -> list[dict[str, Any]]:
    """
    Persist asset rows for a successful task. Returns summary list for result[_assets].
    Never raises to caller — logs and returns [].
    """
    from db.models import Asset

    try:
        candidates = extract_asset_candidates(result, module_id=module_id, manifest=manifest)
        if not candidates:
            return []

        prov = result.get("provenance") if isinstance(result.get("provenance"), dict) else {}
        source_service = None
        if isinstance(prov.get("source"), str):
            source_service = prov["source"]
        elif isinstance(prov.get("service"), str):
            source_service = prov["service"]

        tags: list[str] = []
        if prov.get("mock") is True:
            tags.append("可疑")

        summaries: list[dict[str, Any]] = []
        for c in candidates:
            text = c.get("text_content")
            url = c.get("url")
            storage_key = None
            bytes_size = None
            mime = c.get("mime")

            if url and not text:
                storage_key, url, bytes_size = _maybe_copy_local_file(str(url))
                if not mime and url:
                    guess, _ = mimetypes.guess_type(url)
                    mime = guess

            if not text and not url:
                continue

            asset = Asset(
                title=str(c.get("title") or module_id)[:200],
                kind=str(c.get("kind") or "file"),
                module_id=module_id,
                source_service=source_service,
                task_id=task_id,
                source="task",
                mime=mime,
                text_content=text if isinstance(text, str) else None,
                storage_key=storage_key,
                url=url,
                bytes_size=bytes_size,
                tags=list(tags),
                meta={"field": c.get("field")} if c.get("field") else {},
                provenance=dict(prov) if prov else {},
                user_id=user_id,
            )
            db.add(asset)
            db.flush()
            summaries.append(
                {
                    "id": str(asset.id),
                    "kind": asset.kind,
                    "title": asset.title,
                }
            )

        if summaries:
            db.commit()
        return summaries
    except Exception:
        logger.exception("asset ingest failed for task %s", task_id)
        try:
            db.rollback()
        except Exception:
            pass
        return []


def asset_to_list_item(asset: Any) -> dict[str, Any]:
    text = asset.text_content
    return {
        "id": str(asset.id),
        "title": asset.title,
        "kind": asset.kind,
        "module_id": asset.module_id,
        "source_service": asset.source_service,
        "task_id": str(asset.task_id) if asset.task_id else None,
        "source": asset.source,
        "mime": asset.mime,
        "url": asset.url,
        "has_file": bool(asset.url or asset.storage_key),
        "has_text": bool(text),
        "preview": _preview(text),
        "tags": asset.tags or [],
        "created_at": asset.created_at,
        "updated_at": asset.updated_at,
    }
