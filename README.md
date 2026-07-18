# KE Studio shell

模块底座（非业务模块）：统一 UI、任务调度、分阶段报错、**接入契约门禁**。  
按 [MODULE_SPEC.md](./MODULE_SPEC.md) / [AGENTS.md](./AGENTS.md) 投放 `modules/<id>`，勿在壳里写死注册表。

本地运行，无 Docker。本仓库可整体复制到任意新项目；规则在 `.cursor/rules/`。

## One-click start (Windows，静默)

双击 `start.bat`，或在 `ke/` 下：

```powershell
.\start.ps1
```

- **静默**：backend / frontend **不弹命令窗**，日志写入 `logs/backend.log`、`logs/frontend.log`
- **一键拉起接入模块后端**：扫描 `backend/modules/*/integration.contract.json` 的 `source` / `depends_on`，若未在线则**静默**启动源模块（日志 `logs/locals/`）
- **Python 环境自愈**：启动下游前校验其 `.venv`（`pyvenv.cfg` + `Scripts/python.exe` + 最小运行探针）；残缺/不可运行则删除，由模块启动脚本在本机重建
- 健康检查通过后自动打开浏览器 `http://localhost:3000`
- 停止：双击 `stop.bat` 或 `.\stop.ps1`（默认连带停掉 ke 拉起的本地后端；只停壳：`$env:KE_STOP_LOCALS='0'`）
- 跳过拉起下游：`$env:KE_AUTO_START_LOCAL='0'`
- 关闭 `.venv` 自愈（仅排障）：`$env:KE_REPAIR_VENV='0'`

排障：看 `logs/`；启动失败时 `start.ps1` 会打印日志末尾。

## Layout

```
ke/
├── MODULE_SPEC.md
├── AGENTS.md                 # AI 接入 SOP
├── modules.catalog.json      # 可接入模块目录（GitHub / 依赖 / 配方）
├── docs/INTEGRATION_GUIDE.md # 人读接入详解
├── schema/integration.contract.schema.json
├── schema/modules.catalog.schema.json
├── .cursor/rules/            # 始终生效的接入规则
├── scripts/verify-integration.ps1
├── scripts/resolve_catalog.py       # 查目录 / 展开依赖 / 打印 clone 命令
├── scripts/Start-LocalServices.ps1  # 契约下游静默拉起
├── start.bat / start.ps1            # 壳 + 下游一键静默
├── stop.bat / stop.ps1
├── logs/                            # 含 locals/
├── frontend/
└── backend/
    ├── core/
    │   ├── anti_mock.py
    │   ├── capabilities.py
    │   ├── integration_contract.py   # 契约校验
    │   └── local_service_bridge.py   # 本机服务发现/HTTP
    ├── modules/
    │   ├── _template/                # 接入模板（不扫描）
    │   └── echo/
    ├── scripts/                      # gen_contract / check_contracts
    └── tests/
```

## 模块目录（选哪几个）

克隆 ke 后先看 [modules.catalog.json](./modules.catalog.json)：每个模块的 `service_id`、`git_url`、端口、`depends_on`、常用配方。

```powershell
python .\scripts\resolve_catalog.py list
python .\scripts\resolve_catalog.py recipe collect-transcript
python .\scripts\resolve_catalog.py resolve transcript
python .\scripts\resolve_catalog.py clone-cmds transcript --dest .\deps
```

私有仓库需本机已 `gh auth login` / git 凭据。指定 `transcript` 时会按 `depends_on` 自动带上 `download` + `asr`。

## Backend (manual)

```powershell
cd ke/backend
pip install -r requirements.txt
$env:PYTHONPATH="."
uvicorn api.main:app --reload --port 8000
```

- OpenAPI: http://localhost:8000/openapi.json
- Health: http://localhost:8000/health
- DB default: `./data/ke.db` (SQLite)
- 开发热加载模块：`POST /api/modules/reload`

## Frontend (manual)

```powershell
cd ke/frontend
npm install
npm run gen-types
npm run dev
```

Open http://localhost:3000

## Add a task module

1. `backend/modules/<id>/module.json` + `handler.py` (`BaseModuleHandler.run`)
2. **`capabilities[]` 必填**（MODULE_SPEC §10）：登记所有必要能力，`must_keep: true` 的不得在接入时漏掉
3. Optional: `frontend/modules/<id>/`（Form/Result，仅复杂 UI）
4. 工作台点「刷新模块」，或 `POST /api/modules/reload`；`GET /api/modules/{id}/integration` 看 DoD 清单
5. **不要**改 worker if-else、导航硬编码、DB 表结构
6. **禁止**擅自加演示/测试/mock 开关；壳默认剥离并拒绝（确需调试设 `KE_ALLOW_MOCK=1`）

新模块默认走壳层 DynamicForm，UI 自动统一。示例 `echo` 默认 `ui_hint.hidden`，不抢业务工作台。

## 接入本机 HTTP 模块（推荐路径）

详见 [docs/INTEGRATION_GUIDE.md](./docs/INTEGRATION_GUIDE.md) 与 [AGENTS.md](./AGENTS.md)。

```powershell
# 1) 从源 module.json 生成契约骨架
cd ke/backend
$env:PYTHONPATH="."
python -m scripts.gen_contract --source <源>/module.json --module-id <id> --out modules/<id>/integration.contract.json

# 2) 复制 modules/_template → modules/<id>，用 local_service_bridge 实现 handler

# 3) 验收
cd ..
.\scripts\verify-integration.ps1 -StrictManual
cd backend
python -m pytest tests/test_integration_gate.py -q
```

有 `integration.contract.json` 时：加载校验 must_keep 全覆盖；任务结果强制 `provenance`，禁止 mock 假成功。

## Anti-mock & capabilities（壳强制）

| 约定 | 行为 |
|------|------|
| 假数据提示 | 结果像演示文案 / 过快完成 → 任务卡黄标/橙标提示；**不拒绝提交、不因此失败** |
| 强制 capabilities | 业务模块缺 `capabilities[]` → **拒绝加载**；`echo` 默认豁免（`KE_CAPABILITIES_EXEMPT`） |
| 接入清单 | `GET /api/modules/{id}/integration` + 任务页展示 must_keep 项 |
| 接入契约 | 有 `integration.contract.json` → must_keep 映射校验；结果证据仅写入 `_ke.hints` 提示 |

环境变量（前缀 `KE_`）：`ALLOW_MOCK`、`REQUIRE_CAPABILITIES`、`CAPABILITIES_EXEMPT`、`FAST_COMPLETION_MS`、`REQUIRE_INTEGRATION_SOURCE`、`ENFORCE_INTEGRATION_EVIDENCE`。
