"""
统一本机 HTTP 服务桥接：发现 → 请求 → 轮询 → 错误翻译 → 可选落盘。

发现顺序（禁止写死单一端口）：
  1. 环境变量（env_base_url 或 {SERVICE}_BASE_URL）
  2. %USERPROFILE%/.scene-studio/ports.json（或 SCENE_STUDIO_PORTS_FILE）
  3. default_port … default_port+max_tries-1 探活
探活必须校验 /health.service === expect_label。
"""
from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Callable

import httpx

logger = logging.getLogger(__name__)

DEFAULT_REGISTRY = Path(
    os.environ.get("SCENE_STUDIO_PORTS_FILE")
    or (Path.home() / ".scene-studio" / "ports.json")
)


class LocalServiceError(RuntimeError):
    """Downstream HTTP / discovery failure with product-facing message."""

    def __init__(self, message: str, *, service_id: str | None = None, status: int | None = None):
        self.service_id = service_id
        self.status = status
        super().__init__(message)


def read_ports_registry(registry_path: Path | None = None) -> dict[str, Any]:
    path = registry_path or DEFAULT_REGISTRY
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _normalize_base(url: str | None) -> str | None:
    if not url or not isinstance(url, str):
        return None
    u = url.strip().rstrip("/")
    return u or None


def probe_health(
    base_url: str,
    expect_label: str,
    *,
    timeout: float = 3.0,
    health_path: str = "/health",
) -> bool:
    """Return True only if /health is ok and service === expect_label."""
    try:
        with httpx.Client(timeout=timeout) as client:
            r = client.get(f"{base_url.rstrip('/')}{health_path}")
            if r.status_code != 200:
                return False
            body = r.json()
            svc = body.get("service") if isinstance(body, dict) else None
            return svc == expect_label
    except Exception:
        return False


def discover_service(
    service_id: str,
    expect_label: str,
    *,
    default_port: int | None = None,
    max_tries: int = 12,
    env_base_url: str | None = None,
    registry_path: Path | None = None,
    deep: bool = True,
    timeout: float = 3.0,
) -> str:
    """
    Return usable baseUrl. Raises LocalServiceError if not found.
    """
    candidates: list[str] = []

    def add(url: str | None) -> None:
        u = _normalize_base(url)
        if u and u not in candidates:
            candidates.append(u)

    # 1) explicit env
    if env_base_url:
        add(os.environ.get(env_base_url))
    add(os.environ.get(f"{service_id.upper().replace('-', '_')}_BASE_URL"))

    # 2) ports.json
    reg = read_ports_registry(registry_path)
    entry = reg.get(service_id)
    if isinstance(entry, dict):
        add(entry.get("baseUrl") or entry.get("base_url"))
    elif isinstance(entry, str):
        add(entry)

    # 3) default port range
    if default_port:
        add(f"http://127.0.0.1:{default_port}")
        if deep:
            for i in range(max(1, max_tries)):
                add(f"http://127.0.0.1:{default_port + i}")

    for base in candidates:
        if probe_health(base, expect_label, timeout=timeout):
            return base

    hint = (
        f"找不到本机服务 {service_id!r}（期望 /health.service={expect_label!r}）。"
        f"请先启动源模块；已试候选 {len(candidates)} 个"
        + (f"，含默认端口 {default_port}" if default_port else "")
        + f"。注册表: {registry_path or DEFAULT_REGISTRY}"
    )
    raise LocalServiceError(hint, service_id=service_id)


def discover_from_contract_source(
    source: dict[str, Any],
    *,
    deep: bool = True,
    registry_path: Path | None = None,
) -> str:
    return discover_service(
        str(source["service_id"]),
        str(source["label"]),
        default_port=source.get("default_port") or source.get("defaultPort"),
        max_tries=int(source.get("max_tries") or source.get("maxTries") or 12),
        env_base_url=source.get("env_base_url"),
        registry_path=registry_path,
        deep=deep,
    )


class LocalServiceClient:
    """Thin httpx wrapper bound to a discovered base URL."""

    def __init__(
        self,
        base_url: str,
        *,
        service_id: str | None = None,
        timeout_seconds: float = 120.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.service_id = service_id
        self.timeout_seconds = timeout_seconds

    def _url(self, path: str) -> str:
        if not path.startswith("/"):
            path = "/" + path
        return f"{self.base_url}{path}"

    def request(
        self,
        method: str,
        path: str,
        *,
        json_body: Any = None,
        data: Any = None,
        files: Any = None,
        headers: dict[str, str] | None = None,
        timeout: float | None = None,
        expect_json: bool = True,
    ) -> Any:
        t = timeout if timeout is not None else self.timeout_seconds
        try:
            with httpx.Client(timeout=t) as client:
                r = client.request(
                    method.upper(),
                    self._url(path),
                    json=json_body,
                    data=data,
                    files=files,
                    headers=headers,
                )
        except httpx.ConnectError as exc:
            raise LocalServiceError(
                f"无法连接 {self.service_id or self.base_url}: {exc}",
                service_id=self.service_id,
            ) from exc
        except httpx.TimeoutException as exc:
            raise LocalServiceError(
                f"请求超时 {self.service_id or self.base_url} {path}: {exc}",
                service_id=self.service_id,
            ) from exc

        if r.status_code >= 400:
            detail = _error_body(r)
            raise LocalServiceError(
                f"下游 HTTP {r.status_code} {path}: {detail}",
                service_id=self.service_id,
                status=r.status_code,
            )

        if not expect_json:
            return r.content

        ctype = (r.headers.get("content-type") or "").lower()
        if "application/json" in ctype or r.content[:1] in (b"{", b"["):
            try:
                return r.json()
            except Exception:
                return r.content
        return r.content

    def get_json(self, path: str, **kwargs: Any) -> Any:
        return self.request("GET", path, expect_json=True, **kwargs)

    def post_json(self, path: str, body: dict[str, Any], **kwargs: Any) -> Any:
        return self.request("POST", path, json_body=body, expect_json=True, **kwargs)

    def post_multipart(
        self,
        path: str,
        *,
        files: dict[str, Any],
        data: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> Any:
        return self.request(
            "POST", path, files=files, data=data, expect_json=True, **kwargs
        )

    def post_binary(self, path: str, body: dict[str, Any], **kwargs: Any) -> bytes:
        raw = self.request(
            "POST", path, json_body=body, expect_json=False, **kwargs
        )
        if not isinstance(raw, (bytes, bytearray)):
            raise LocalServiceError(
                f"期望二进制响应，收到 {type(raw).__name__}",
                service_id=self.service_id,
            )
        return bytes(raw)

    def poll_job(
        self,
        job_id: str,
        *,
        path_template: str = "/jobs/{job_id}",
        interval_ms: int = 2000,
        timeout_seconds: float = 1800.0,
        done_statuses: tuple[str, ...] = ("done", "completed", "success"),
        fail_statuses: tuple[str, ...] = ("error", "failed", "cancelled", "canceled"),
        on_tick: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        deadline = time.monotonic() + timeout_seconds
        path = path_template.format(job_id=job_id)
        last: dict[str, Any] | None = None
        while time.monotonic() < deadline:
            raw = self.get_json(path, timeout=min(60.0, timeout_seconds))
            if not isinstance(raw, dict):
                raise LocalServiceError(
                    f"job 响应不是对象: {path}",
                    service_id=self.service_id,
                )
            last = raw
            status = str(raw.get("status") or raw.get("state") or "").lower()
            if on_tick is not None:
                try:
                    on_tick(raw)
                except Exception:
                    pass
            else:
                # Default: push downstream progress into current ke task (if any)
                try:
                    from core.task_progress_ctx import report_progress

                    jp = raw.get("progress")
                    if jp is None and isinstance(raw.get("percent"), (int, float)):
                        jp = raw.get("percent")
                    msg = (
                        raw.get("stage")
                        or raw.get("message")
                        or raw.get("status_message")
                        or raw.get("step")
                    )
                    if isinstance(msg, str):
                        msg = msg.strip() or None
                    elif msg is not None:
                        msg = str(msg)
                    if jp is not None or msg:
                        report_progress(
                            job_progress=float(jp) if jp is not None else None,
                            message=msg,
                            stage="run",
                        )
                except Exception:
                    pass
            if status in done_statuses:
                return raw
            if status in fail_statuses:
                err = raw.get("error") or raw.get("message") or status
                raise LocalServiceError(
                    f"下游任务失败 job_id={job_id}: {err}",
                    service_id=self.service_id,
                )
            time.sleep(max(0.1, interval_ms / 1000.0))
        raise LocalServiceError(
            f"轮询超时 job_id={job_id}（>{timeout_seconds}s）最后状态={last}",
            service_id=self.service_id,
        )


def client_from_source(
    source: dict[str, Any],
    *,
    timeout_seconds: float = 120.0,
    deep: bool = True,
    registry_path: Path | None = None,
) -> LocalServiceClient:
    base = discover_from_contract_source(
        source, deep=deep, registry_path=registry_path
    )
    return LocalServiceClient(
        base,
        service_id=str(source.get("service_id")),
        timeout_seconds=timeout_seconds,
    )


def map_params(
    params: dict[str, Any],
    params_map: dict[str, str] | None,
) -> dict[str, Any]:
    """Map ke input keys → downstream keys; unmapped keys pass through."""
    if not params_map:
        return dict(params)
    out: dict[str, Any] = {}
    used_src: set[str] = set()
    for src, dst in params_map.items():
        if src in params:
            out[dst] = params[src]
            used_src.add(src)
    for k, v in params.items():
        if k not in used_src and k not in out:
            out[k] = v
    return out


def build_provenance(
    *,
    source_service_id: str,
    service_label: str,
    base_url: str | None = None,
    job_id: str | None = None,
    archive_id: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    prov: dict[str, Any] = {
        "source": source_service_id,
        "service": service_label,
        "mock": False,
    }
    if base_url:
        prov["base_url"] = base_url
    if job_id:
        prov["job_id"] = job_id
    if archive_id:
        prov["archive_id"] = archive_id
    if extra:
        prov.update(extra)
    return prov


def upload_bytes_to_storage(
    data: bytes,
    filename: str,
    *,
    content_type: str | None = None,
) -> str:
    """Persist bytes via ke storage client; return public URL."""
    import tempfile
    import uuid
    from storage.client import get_storage

    storage = get_storage()
    suffix = Path(filename).suffix or ".bin"
    safe_name = Path(filename).name or f"{uuid.uuid4().hex}{suffix}"
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / safe_name
        path.write_bytes(data)
        return storage.upload(path, key=f"{uuid.uuid4().hex}/{safe_name}", content_type=content_type)


def _error_body(r: httpx.Response) -> str:
    try:
        body = r.json()
        if isinstance(body, dict):
            return str(body.get("error") or body.get("detail") or body)[:500]
        return str(body)[:500]
    except Exception:
        return (r.text or "")[:500]
