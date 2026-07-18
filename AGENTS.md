# KE — Agent / AI 接入指南

本文件随 **ke 仓库**分发。把 ke 复制或 clone 到任意文件夹后，Cursor 规则与本文档仍然有效。

## 两套模型（不要混淆）

| 模型 | 是什么 | 放哪里 |
|------|--------|--------|
| **任务型** | `handler.run(params)` 同步任务 | `backend/modules/<id>/` |
| **本机 HTTP** | 独立 FastAPI/Express + `ports.json` | 源仓库 / `mo_kuai/<folder>/` |

接入 HTTP 能力 = 在 ke 里写 **带契约的 handler**，通过 `local_service_bridge` 调已跑通的源服务，**不是**把源服务逻辑抄进 handler。

## 产品 UI 文案（强制 · 面向普通用户）

工作台给最终用户用，**不是**联调控制台。接入模块时能力要接全，但**不要把接线说明画在表单上**。

### 禁止出现在用户可见 UI

| 禁止 | 示例 |
|------|------|
| 端口 / 代理路径 | `:8789`、`/transcript-api`、`/cookies/*` |
| 开发黑话 | 「独立检验」「对应模块」「ports.json」「handler」「must_keep」 |
| 模型内部 ID 当主文案 | `deepseek-v4-flash-260425`、`当前：xxx-id` |
| 默认展开的联调块 | 「Cookie 管理（B 站 412…）」整段技术说明 |

这些内容只写在：`capabilities[].desc`、源模块 `AGENTS.md`、`integration.contract.json`、开发文档。

### 表单怎么写

- `label`：短、口语（如「视频链接」「总结模型」）
- `description`：**默认不要写**；壳层 DynamicForm / FormField **不展示** description 小字
- `enum` 选项：给人看的名字；需要底层 id 时用「可读名」作展示，id 放 value（或可读名前缀），禁止选项旁再跟一行 `当前：模型id`
- Cookie / 登录类：若必须有 UI，用折叠「高级」+ 用户话（「登录网站并保存」），禁止写代理路径与端口
- 自定义 `Form.tsx` 同样遵守；宁可用自动 DynamicForm，也不要为「提示开发」加一堆 muted 小字

### 壳层已做

- `FormField` / `DynamicForm`：不渲染 schema `description`
- 任务页：模块标题下不展示 `module.description`
- 假数据：仅结果卡软提示，不拦截

## 标准接入 SOP

```text
0. 查 modules.catalog.json（或 python scripts/resolve_catalog.py resolve <id…> / recipe <配方>）
1. 取得源模块：git clone catalog.git_url → ke/deps/<folder> 或同级目录（私有仓需已登录 gh）
2. 读 module.json → capabilities[]（逐条）+ AGENTS.md
3. python -m scripts.gen_contract --source <源>/module.json --module-id <id> --out modules/<id>/integration.contract.json
4. 复制 modules/_template/ 为 modules/<id>/，改 module.json / handler
5. 补齐 proxy / UI（cookie、upload 等 wiring=proxy 项）；前缀见 catalog.proxy_prefixes
6. 把 manual_acceptance[].accepted 在人工验收后改为 true
7. .\scripts\verify-integration.ps1 -StrictManual
8. pytest backend/tests -q
```

用户说「用 transcript」时：以 catalog 的 `depends_on` / `recipes` 展开（transcript → 含 download+asr），禁止只接编排、漏下游。

## 关键文件

| 路径 | 用途 |
|------|------|
| `modules.catalog.json` | 模块 GitHub / 端口 / 依赖 / 配方目录 |
| `scripts/resolve_catalog.py` | list / resolve / recipe / clone-cmds |
| `schema/modules.catalog.schema.json` | 目录 Schema |
| `schema/integration.contract.schema.json` | 契约 JSON Schema |
| `backend/core/integration_contract.py` | 加载/覆盖校验/结果证据 |
| `backend/core/local_service_bridge.py` | 服务发现 + HTTP/multipart/二进制/轮询 |
| `backend/modules/_template/` | 可复制模板（下划线开头，不加载） |
| `scripts/verify-integration.ps1` | 一键契约检查 |
| `scripts/Start-LocalServices.ps1` | 按契约静默拉起本机 HTTP 后端（start.ps1 自动调用） |
| `docs/INTEGRATION_GUIDE.md` | 人读详解 |
| `.cursor/rules/module-integration.mdc` | Cursor 始终生效规则 |

## 一键启动下游

`.\start.ps1` / `start.bat` 会：

1. 扫描已接入模块的 `integration.contract.json`（`source` + `depends_on`）
2. 用 `manifest_path` / 同级 `mo_kuai/<folder>` 找到源目录
3. 启动前检查源目录内 `.venv`：必须同时有 `pyvenv.cfg`、`Scripts/python.exe` 且能运行最小 Python 探针；损坏则删除，让源启动脚本重建
4. 读源 `module.json` → `local.start`，**静默**启动（无黑窗；优先 `start_api` / `start.bat`，避免 `start_web` 弹浏览器）
5. 探活 `/health.service === label`，写 `ports.json` 由源脚本自己完成
6. 再启 ke 前后端

单独补拉：`.\scripts\Start-LocalServices.ps1`

跳过下游：`$env:KE_AUTO_START_LOCAL='0'`

关闭 venv 自愈（仅排障）：`$env:KE_REPAIR_VENV='0'`

> 组装项目时不要复制 `.venv` / `node_modules`。虚拟环境不是源码，必须由目标机器按依赖清单创建；启动器自愈是第二道保险。

## 完成定义（DoD）

- 源模块全部 `must_keep` 已出现在 `capability_wiring`
- 有 endpoints 的能力已声明 `proxy_paths`（或 `preserved_internal`）
- 直连 / 过代理 verify 中 auto 项全绿；manual 项有 `manual_acceptance`
- 任务结果含真实 `provenance`，无 mock 文案；异步含 `job_id`/`archive_id`
- **禁止**用秒级假成功冒充下载/转写/TTS/渲染
- **产品 UI 干净**：无端口/代理路径/模型内部 id/默认展开的联调 Cookie 技术说明

## 反例（联调已踩）

- 漏接 `/cookies/*` → B 站 412 / 无法一键导入（接在契约与代理里，**不要**画在用户表单上）
- 写死端口 → 顺延后连错服务
- 只返回固定文案 → 壳层 `_ke` 软提示
- 表单堆「独立检验 / :8789 / 当前：model-id」→ 不符合普通用户需求（见「产品 UI 文案」）
