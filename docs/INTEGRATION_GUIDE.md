# ke 接入本机 HTTP 模块指南

> 目标：把已在独立仓库验证过的能力（下载、转写、TTS…）接到 ke，且 **不漏小功能、不做 demo**。

## 1. 准备源模块

源模块需符合根规范 / 本仓库 `MODULE_SPEC.md`：

- 顶层 `capabilities[]`（含 `must_keep`）
- `local`（端口、label、proxy、endpoint）
- 可独立 `start_web` + `/ui` 验收

可从 GitHub clone 到 ke 同级目录，或任意路径；契约里写相对/绝对 `manifest_path`。

## 2. 生成契约

在 `ke/backend`：

```powershell
$env:PYTHONPATH="."
python -m scripts.gen_contract `
  --source ..\..\video_download\module.json `
  --module-id cj-download `
  --out modules\cj-download\integration.contract.json `
  --fingerprint
```

检查生成的 `capability_wiring`：**每一个**源 `must_keep` 都必须在列。漏掉（例如 `cookie-one-click-import`）→ 加载/校验失败。

### wiring 取值

| wiring | 含义 |
|--------|------|
| `handler` | 任务执行路径会调用 |
| `proxy` | 宿主必须 HTTP 代理这些路径，并通常要有 UI 入口 |
| `ui` | 仅表单/面板暴露（可与 proxy 组合说明写在 notes） |
| `preserved_internal` | 源服务内部行为（如 cookies.txt 自动回退）；宿主不得屏蔽 |

有 `endpoints` 的 must_keep：除非 `preserved_internal`，否则必须填 `proxy_paths`。

## 3. 实现 handler

参考 `backend/modules/_template/handler.py`：

```python
from core.local_service_bridge import (
    client_from_source,
    map_params,
    build_provenance,
)

client = client_from_source(contract["source"], timeout_seconds=1800)
# discover: env → ports.json → default_port 范围，且校验 health.service
```

异步：`post_json` → `poll_job`。  
二进制：`post_binary` → `upload_bytes_to_storage`。  
Multipart：`post_multipart`。

返回必须带：

```python
"provenance": {
  "source": "<service_id>",
  "service": "<label>",
  "mock": False,
  "job_id": "...",   # async 时
}
```

## 4. 代理与 UI

把源 `local.proxy` 前缀接到 Next/网关（或开发期直连 ports.json）。  
凡 `wiring=proxy` 的路径（尤其 `/cookies/*`、`/upload`、`/voices`）必须可达。

Cookie：默认 **不要** 填 `cookiesFromBrowser=edge`；留空走源模块 `cookies/*.txt` 回退，并暴露一键导入 UI。

## 5. 验收

```powershell
# 静态：契约结构 + must_keep 覆盖
.\scripts\verify-integration.ps1

# 人工项也要过
.\scripts\verify-integration.ps1 -StrictManual

# 下游：start.ps1 会按契约静默拉起；也可单独：
.\scripts\Start-LocalServices.ps1

# 下游已启动时：直连探活
.\scripts\verify-integration.ps1 -Base http://127.0.0.1:8789 -Module cj-download

# 过宿主代理
.\scripts\verify-integration.ps1 -Base http://localhost:3000 -Prefix /download-api -Module cj-download

cd backend
$env:PYTHONPATH="."
python -m pytest tests/test_integration_gate.py -q
```

> **不要**再要求用户「先手动开 transcript/download」。契约写好 `source`/`depends_on` + 可解析的 `manifest_path` 后，由 ke 一键静默拉起。

## 6. 门禁行为

| 时机 | 行为 |
|------|------|
| 加载模块 | 有 `integration.contract.json` → 校验形状、源指纹（可选）、must_keep 全覆盖、endpoint 路径声明 |
| 任务完成 | `KE_ENFORCE_INTEGRATION_EVIDENCE=true`（默认）→ 校验 provenance / 禁 mock / 异步必填 job 类字段 / 可选 min_duration |
| verify 脚本 | `--strict-manual` 时未验收的 manual 能力 → exit 1 |

环境变量（`KE_` 前缀）：`REQUIRE_INTEGRATION_SOURCE`、`ENFORCE_INTEGRATION_EVIDENCE`。

## 7. 移植到新项目

复制整个 `ke/`（含 `.cursor/rules/`、`schema/`、`scripts/`、`backend/core/*`）。  
不必依赖原 `mo_kuai` 根目录；只需能解析契约里的 `source.manifest_path`。
