# KE Studio shell

模块底座（非业务模块）：统一 UI、任务调度、分阶段报错。  
按仓库根 [MODULE_SPEC.md](../MODULE_SPEC.md) 投放 `modules/<id>`，勿在壳里写死注册表。

本地运行，无 Docker。

## One-click start (Windows，静默)

双击 `start.bat`，或在 `ke/` 下：

```powershell
.\start.ps1
```

- **静默**：backend / frontend **不弹命令窗**，日志写入 `logs/backend.log`、`logs/frontend.log`
- 健康检查通过后自动打开浏览器 `http://localhost:3000`
- 停止：双击 `stop.bat` 或 `.\stop.ps1`

排障：看 `logs/`；启动失败时 `start.ps1` 会打印日志末尾。

## Layout

```
ke/
├── MODULE_SPEC.md
├── start.bat / start.ps1   # 静默启动
├── stop.bat / stop.ps1     # 停止 :8000 / :3000
├── logs/                   # 运行日志（gitignore 可选）
├── frontend/               # Next.js App Router
└── backend/                # FastAPI (SQLite + sync task runner)
```

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
2. Optional: `frontend/modules/<id>/module.json`（及 Form/Result，仅复杂 UI）
3. 重启 uvicorn **或** `POST /api/modules/reload`；`GET /api/modules` 应列出该 `id`
4. **不要**改 worker if-else、导航硬编码、DB 表结构

新模块默认走壳层 DynamicForm，UI 自动统一。
