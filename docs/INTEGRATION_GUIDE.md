# ke 接入本机 HTTP 模块指南

> 目标：把已在独立仓库验证过的能力（下载、转写、TTS…）接到 ke，且 **不漏小功能、不做 demo**。

## 1. 准备源模块

先查仓库根 **`modules.catalog.json`**（或 `python scripts/resolve_catalog.py`）：

- `service_id` / `git_url` / `folder` / `depends_on` / `proxy_prefixes`
- `recipes`：如 `collect-transcript` = transcript + download + asr

源模块需符合 `MODULE_SPEC.md`：`capabilities[]`、`local`、可独立 `start_web` + `/ui`。

建议布局：`ke/deps/<folder>` 或与 ke 同级；契约 `manifest_path` 指向源 `module.json`。  
私有仓（catalog 里 `visibility: private`）需已登录 GitHub。

### 复制边界（强制）

只复制源码与依赖清单，**不要复制 `.venv` / `node_modules`**。Python 虚拟环境含本机解释器路径，不是可移植产物。

ke 启动下游前会做统一自愈检查：

1. 在源模块目录有限深度内查找 `.venv`
2. 校验 `pyvenv.cfg`、Windows `Scripts/python.exe` 和最小 Python 运行探针
3. 判定损坏时只删除模块目录内、名称严格为 `.venv` 的目录
4. 随后调用源模块启动脚本，由其按 `requirements.txt` 在本机重建

因此该机制对 transcript / ASR / AI 等所有 Python 下游一致生效，不写业务模块特例。

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

# 下游：start.ps1 默认按契约静默拉起（无黑窗）；也可单独：
.\scripts\Start-LocalServices.ps1

# 下游已启动时：直连探活
.\scripts\verify-integration.ps1 -Base http://127.0.0.1:8789 -Module cj-download

# 过宿主代理
.\scripts\verify-integration.ps1 -Base http://localhost:3000 -Prefix /download-api -Module cj-download

cd backend
$env:PYTHONPATH="."
python -m pytest tests/test_integration_gate.py -q
```

> **不要**再要求用户「先手动开 transcript/download」。契约写好 `source`/`depends_on` + 可解析的 `manifest_path` 后，由 ke 一键静默拉起（无命令窗）。

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
