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
        # 业务进度：见 scripts/docs/specs/TASK_PROGRESS.md
        from core.task_progress_ctx import report_stage

        contract_path = Path(__file__).resolve().parent / "integration.contract.json"
        contract = load_json(contract_path)
        try:
            validate_contract_shape(contract)
        except IntegrationContractError:
            pass

        source = contract["source"]
        execution = contract.get("execution") or {}
        timeout = float(execution.get("timeout_seconds") or 1800)

        # 示例：按业务环节上报（真实模块换成 fetch_data / write_copy / voiceover …）
        report_stage("download", message="提交下载任务")

        try:
            client = client_from_source(source, timeout_seconds=timeout)
        except LocalServiceError as exc:
            raise RuntimeError(str(exc)) from exc

        body = map_params(params, contract.get("params_map"))
        endpoint = "/download"
        submitted = client.post_json(endpoint, body)
        if not isinstance(submitted, dict):
            raise RuntimeError("下游返回非 JSON 对象")

        job_id = submitted.get("job_id") or submitted.get("id")
        if not job_id:
            report_stage("export")
            return {
                **submitted,
                "ok": True,
                "provenance": build_provenance(
                    source_service_id=str(source["service_id"]),
                    service_label=str(source["label"]),
                    base_url=client.base_url,
                ),
            }

        report_stage("download", message="下载进行中")
        job = client.poll_job(
            str(job_id),
            path_template=str(execution.get("job_path_template") or "/jobs/{job_id}"),
            interval_ms=int(execution.get("poll_interval_ms") or 2000),
            timeout_seconds=timeout,
        )
        report_stage("export")
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
