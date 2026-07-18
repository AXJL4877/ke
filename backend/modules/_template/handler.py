"""
HTTP 桥接 handler 模板（文件夹名以下划线开头，不会被扫描加载）。

复制本目录为 backend/modules/<your-id>/ 后：
1. 改 module.json id/name/schema
2. 按源模块 capabilities 填写 integration.contract.json（可用
   `python -m scripts.gen_contract` 从源 module.json 生成骨架）
3. 在 run() 里用 LocalServiceClient 调真实下游——禁止返回演示文案
"""
from __future__ import annotations

from typing import Any

from modules._base import BaseModuleHandler


class Handler(BaseModuleHandler):
    def run(self, params: dict[str, Any]) -> dict[str, Any]:
        # 延迟导入：模板目录不被加载时不影响壳启动
        from pathlib import Path

        from core.integration_contract import (
            IntegrationContractError,
            load_json,
            validate_contract_shape,
        )
        from core.local_service_bridge import (
            LocalServiceError,
            build_provenance,
            client_from_source,
            map_params,
        )

        contract_path = Path(__file__).resolve().parent / "integration.contract.json"
        contract = load_json(contract_path)
        # 复制后请把 module_id 改成真实 id；此处仅示范调用链
        try:
            validate_contract_shape(contract)
        except IntegrationContractError:
            # 模板文件里的 REPLACE_WITH_KE_MODULE_ID 会在真实模块中改掉
            pass

        source = contract["source"]
        execution = contract.get("execution") or {}
        timeout = float(execution.get("timeout_seconds") or 1800)

        try:
            client = client_from_source(source, timeout_seconds=timeout)
        except LocalServiceError as exc:
            raise RuntimeError(str(exc)) from exc

        body = map_params(params, contract.get("params_map"))
        # 示例：异步下载类。真实模块按源 local.endpoint 调整 path。
        endpoint = "/download"
        submitted = client.post_json(endpoint, body)
        if not isinstance(submitted, dict):
            raise RuntimeError("下游返回非 JSON 对象")

        job_id = submitted.get("job_id") or submitted.get("id")
        if not job_id:
            # 同步短路径：直接带 provenance 返回（仍禁止 mock）
            return {
                **submitted,
                "ok": True,
                "provenance": build_provenance(
                    source_service_id=str(source["service_id"]),
                    service_label=str(source["label"]),
                    base_url=client.base_url,
                ),
            }

        job = client.poll_job(
            str(job_id),
            path_template=str(execution.get("job_path_template") or "/jobs/{job_id}"),
            interval_ms=int(execution.get("poll_interval_ms") or 2000),
            timeout_seconds=timeout,
        )
        return {
            "ok": True,
            "job_id": str(job_id),
            "status": job.get("status"),
            "result": job,
            "provenance": build_provenance(
                source_service_id=str(source["service_id"]),
                service_label=str(source["label"]),
                base_url=client.base_url,
                job_id=str(job_id),
            ),
        }
