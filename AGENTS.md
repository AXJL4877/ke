# KE — Agent / AI 接入指南

本文件随 **ke 仓库**分发。把 ke 复制或 clone 到任意文件夹后，Cursor 规则与本文档仍然有效。

## 两套模型（不要混淆）

| 模型 | 是什么 | 放哪里 |
|------|--------|--------|
| **任务型** | `handler.run(params)` 同步任务 | `backend/modules/<id>/` |
| **本机 HTTP** | 独立 FastAPI/Express + `ports.json` | 源仓库 / `mo_kuai/<folder>/` |

接入 HTTP 能力 = 在 ke 里写 **带契约的 handler**，通过 `local_service_bridge` 调已跑通的源服务，**不是**把源服务逻辑抄进 handler。

## 标准接入 SOP

```text
1. 取得源模块（本地路径或 git clone）
2. 读 module.json → capabilities[]（逐条）+ AGENTS.md
3. python -m scripts.gen_contract --source <源>/module.json --module-id <id> --out modules/<id>/integration.contract.json
4. 复制 modules/_template/ 为 modules/<id>/，改 module.json / handler
5. 补齐 proxy / UI（cookie、upload 等 wiring=proxy 项）
6. 把 manual_acceptance[].accepted 在人工验收后改为 true
7. .\scripts\verify-integration.ps1 -StrictManual
8. pytest backend/tests -q
```

## 关键文件

| 路径 | 用途 |
|------|------|
| `schema/integration.contract.schema.json` | 契约 JSON Schema |
| `backend/core/integration_contract.py` | 加载/覆盖校验/结果证据 |
| `backend/core/local_service_bridge.py` | 服务发现 + HTTP/multipart/二进制/轮询 |
| `backend/modules/_template/` | 可复制模板（下划线开头，不加载） |
| `scripts/verify-integration.ps1` | 一键契约检查 |
| `docs/INTEGRATION_GUIDE.md` | 人读详解 |
| `.cursor/rules/module-integration.mdc` | Cursor 始终生效规则 |

## 完成定义（DoD）

- 源模块全部 `must_keep` 已出现在 `capability_wiring`
- 有 endpoints 的能力已声明 `proxy_paths`（或 `preserved_internal`）
- 直连 / 过代理 verify 中 auto 项全绿；manual 项有 `manual_acceptance`
- 任务结果含真实 `provenance`，无 mock 文案；异步含 `job_id`/`archive_id`
- **禁止**用秒级假成功冒充下载/转写/TTS/渲染

## 反例（联调已踩）

- 漏接 `/cookies/*` → B 站 412 / 无法一键导入
- 写死端口 → 顺延后连错服务
- 只返回固定文案 → 壳层 `_ke.mock` / 证据门禁失败
