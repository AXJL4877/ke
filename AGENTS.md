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

表单只呈现：**短 label + 必填输入 +（折叠）可选项**。不要解释性段落。

### 禁止出现在用户可见 UI

| 禁止 | 示例 |
|------|------|
| 端口 / 代理路径 | `:8789`、`/transcript-api`、`/cookies/*` |
| 开发黑话 | 「独立检验」「对应模块」「ports.json」「handler」「must_keep」 |
| 模型内部 ID 当主文案 | `deepseek-v4-flash-260425`、`当前：xxx-id` |
| 默认展开的联调块 | 「Cookie 管理（B 站 412…）」整段技术说明 |
| schema `description` 小字 | 一律不渲染；需要时只写进 AGENTS / capabilities |

这些内容只写在：`capabilities[].desc`、源模块 `AGENTS.md`、`integration.contract.json`、开发文档。

### 表单怎么写

- `label`：短、口语（如「视频链接」「总结模型」）
- `description`：**默认不要写**；壳层 DynamicForm / FormField **不展示** description
- 必填主区可见；非必填 / 枚举 / 数字进「更多」
- `enum` 选项：给人看的名字；需要底层 id 时用「可读名」作展示，id 放 value（或可读名前缀），禁止选项旁再跟一行 `当前：模型id`
- Cookie / 登录类：若必须有 UI，用折叠「高级」+ 用户话（「登录网站并保存」），禁止写代理路径与端口
- 自定义 `Form.tsx` 同样遵守；宁可用自动 DynamicForm，也不要为「提示开发」加一堆 muted 小字

### 壳层已做

- `FormField` / `DynamicForm`：不渲染 schema `description`；控件有 `id` + `data-testid=ke-field-*`
- 任务页：模块标题下不展示 `module.description`
- 假数据：仅结果卡软提示，不拦截

## 浏览器智能体 · 点击验收（新功能自测）

新模块/改功能后，优先让 Cursor **模拟人类点击**跑通同一条 UI 路径，而不是你手点一遍。

1. 启动 ke，打开工作台
2. （可选）`GET http://127.0.0.1:8000/api/agent/playbook` 读 testid / 深链 / 宏 / 字段
3. 打开 `/tasks?module=<id>&open=1`，或带宏 `/tasks?module=echo&macro=echo-hello`
4. snapshot 定位：`ke-field-*` → `ke-task-submit`（或 `ke-macro-*`）
5. 断言 `ke-task-status` 为 `done`，并查看 `ke-task-result`

稳定选择器约定：`ke-{区域}-{对象}`（如 `ke-nav-home`、`ke-module-nav-echo`、`ke-task-submit`）。  
`echo` 默认 `ui_hint.hidden`，导航不显示，深链仍可用。

HTTP `POST /api/tasks` 与点击提交同一后端；**验收以点击跑通为准**。catalog `recipes` 只表示该装哪些模块，不是一键运行时。

## 资产部门（一期）

任务成功后，可复用产物会自动登记到 **资产库**（侧栏「资产」）：

- 触发：`execute_task` 成功 persist 之后；失败不入库
- 抽取：优先 `module.json` 的 `asset_extract`；否则保守启发式（长文本 / `/files` URL）
- 删除任务：**不**级联删资产
- API：`/api/assets`；详情见 `docs/ASSET_VAULT_DESIGN.md`

接入模块成功返回时尽量带可读 `title`、正文或文件 URL，并建议声明：

```json
"asset_extract": [
  { "from": "text", "kind": "text", "title_from": "title" },
  { "from": "result_file", "kind": "audio", "is_file": true }
]
```

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
| `scripts/Start-LocalServices.ps1` | 契约下游静默拉起（按需 / 手动 / 可选开机全拉） |
| `docs/INTEGRATION_GUIDE.md` | 人读详解 |
| `docs/ASSET_VAULT_DESIGN.md` | 资产部门设计与验收 |
| `backend/core/assets.py` | 资产抽取 / 自动入库 |
| `GET /api/agent/playbook` | 浏览器智能体：testid / 深链 / 宏 / 字段地图 |
| `.cursor/rules/module-integration.mdc` | Cursor 始终生效规则 |

## 一键启动下游（静默无黑窗）

`.\start.ps1` / `start.bat` 默认会：

1. 扫描已接入模块的 `integration.contract.json`（`source` + `depends_on`）
2. 用 `manifest_path` / 同级 `mo_kuai/<folder>` 找到源目录
3. 启动前检查源目录内 `.venv`：必须同时有 `pyvenv.cfg`、`Scripts/python.exe` 且能运行最小 Python 探针；损坏则删除，让源启动脚本重建
4. 读源 `module.json` → `local.start`，**静默**启动（`CreateNoWindow` + `KE_SILENT=1`，无黑窗；优先 `start_api` / `start.bat`，避免 `start_web` 弹浏览器；日志在 `logs/locals/`）
5. **并行**探活 `/health.service === label`（共享等待预算，默认 90s；进程已死 / 日志 fatal 提前失败，不串行白等 N×90s），写 `ports.json` 由源脚本自己完成
6. 再启 ke 前后端

**默认**：`start.ps1` 启动时**静默拉起全部**契约下游（不弹模块命令窗）；关闭最后一个 KE 浏览器标签或点「退出 KE」会调用 `stop.ps1` 停掉壳 + 全部接入模块。  
**跳过启动时全拉**：`$env:KE_AUTO_START_LOCAL='0'`（用到再由 on-demand 拉）  
**只停壳、保留模块**：`$env:KE_STOP_LOCALS='0'`  
**按需补拉**（任务执行前兜底）：`worker/tasks.py` + `KE_ON_DEMAND_LOCAL=1`（默认开）  
**加速技巧**：各模块先手动起通一次 → 下次 `already online` 几乎不等；或 `KE_AUTO_START_LOCAL=0` 跳过开机全拉

单独补拉：`.\scripts\Start-LocalServices.ps1` 或带 `-ServiceIds download`  
无等待只拉起：`.\scripts\Start-LocalServices.ps1 -NoWait`

关闭 venv 自愈（仅排障）：`$env:KE_REPAIR_VENV='0'`

> 若仍看到模块黑窗，确认是通过 `ke\start.ps1` / `Start-LocalServices.ps1` 拉起的（会设 `KE_SILENT=1`），而不是手动双击了模块目录里的 `start.bat`。

> 组装项目时不要复制 `.venv` / `node_modules`。虚拟环境不是源码，必须由目标机器按依赖清单创建；启动器自愈是第二道保险。

## 完成定义（DoD）

- 源模块全部 `must_keep` 已出现在 `capability_wiring`
- 有 endpoints 的能力已声明 `proxy_paths`（或 `preserved_internal`）
- 直连 / 过代理 verify 中 auto 项全绿；manual 项有 `manual_acceptance`
- 任务结果含真实 `provenance`，无 mock 文案；异步含 `job_id`/`archive_id`
- **禁止**用秒级假成功冒充下载/转写/TTS/渲染
- **产品 UI 干净**：无端口/代理路径/模型内部 id/默认展开的联调 Cookie 技术说明；表单仅短 label + 必填/可选
- 新功能可用 Cursor 按 `AGENTS.md`「浏览器智能体 · 点击验收」跑通 UI（`data-testid` + `/api/agent/playbook`）

## 反例（联调已踩）

- 漏接 `/cookies/*` → B 站 412 / 无法一键导入（接在契约与代理里，**不要**画在用户表单上）
- 写死端口 → 顺延后连错服务
- 只返回固定文案 → 壳层 `_ke` 软提示
- 表单堆「独立检验 / :8789 / 当前：model-id」→ 不符合普通用户需求（见「产品 UI 文案」）
