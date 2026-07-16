# MODULE_SPEC.md

> KE 壳仓库内的完整规范副本。开发时以本文件为准；`mo_kuai/MODULE_SPEC.md` 应保持同步。  
> 壳实现：`_registry` / `_ui-registry` / `module_loader` / `DynamicForm`。

## ke shell（任务型模块速览）

- 扫描 `backend/modules/<id>/module.json` + `handler.py`
- 可选镜像：`frontend/modules/<id>/module.json`
- 自定义 UI：`frontend/modules/<id>/index.ts` → `{ Form?, Result? }`（自动发现，§9）
- 默认表单：`DynamicForm`；长文本用 schema `format: "textarea"`
- API：`GET /api/modules`，`POST /api/tasks`，`GET /api/tasks/{id}`
- 调度：`get_handler(module_id).run(params)` — 禁止 if-else
- 本地运行：SQLite + 同步执行（无需 Docker / Redis）

---

本文档定义处理模块 `module.json` 必须遵守的规范。任何新增模块（或 AI 助手）都必须严格按本规范编写，否则前端 DynamicForm / 结果展示与后端处理会对不上。

本地 HTTP 微服务（如 `text_to_voice`）在遵守本规范核心字段的同时，使用 **`local` 扩展** 声明端口与代理（见 §8）。宿主扫描 `module.json` 自动注册，禁止再改硬编码表。

---

## 1. 目录结构约定

每个模块必须是一个独立文件夹。

**理想形态（任务型前后端分离）**
```
frontend/modules/<module-id>/
├── module.json     # 必须（可与后端一致，或为子集）
├── index.ts        # 可选：仅当需要自定义 UI 时导出 { Form?, Result? }
├── Form.tsx        # 可选，缺省 DynamicForm（§9）
├── Result.tsx      # 可选，缺省按 output_schema 渲染（§9）
└── hooks.ts        # 可选

backend/modules/<module-id>/
├── module.json     # 必须，与前端一致（或前端为子集）
└── handler.py      # 必须，实现统一 run()
```

**当前仓库形态（本机独立 HTTP 服务）**
```
mo_kuai/<folder>/
├── module.json     # 必须（含 §2 核心字段 + §8 local）
├── AGENTS.md
├── web/            # 必须：独立检验 UI（挂到 /ui）
├── start_web.*     # 必须：一键启动并打开 /ui
└── …服务代码与启动脚本
```

> 任务型模块：`<module-id>` 与 `id` 均为 kebab-case 且一致。  
> 已上线本地服务：`id` 已固定为 `tts` / `compose` / `download` / `richtext` / `ai-in`（不可为兼容性而改名；展示用 `name`）。

---

## 1.1 独立检验（强制）

**每个模块必须能在不接入宿主（不启动 video_1 / 壳）的情况下，被人工独立验收。**

最低要求（本机 HTTP 模块）：

| 项 | 要求 |
|---|---|
| `GET /health` | 已有；`service` === `local.label` |
| `GET /ui`（或 `/ui/`） | 浏览器可操作的调试页，能覆盖本模块主能力（对应 `local.endpoint` / 主业务流程） |
| `start_web.bat`（及对应 `.ps1`） | 启动服务（若未运行）并打开 `/ui`；用户双击即可验收 |

禁止只靠「让宿主调 API」才能验证。单元测试 / curl 脚本可作为补充，**不能替代** `/ui` + `start_web`。

任务型模块：至少提供可本地跑通的最小验收路径（示例输入 + 预期输出，或本地 smoke 命令），写进该模块 `AGENTS.md`。

---

## 2. module.json 完整字段规范

```json
{
  "id": "video-upscale",
  "name": "视频超分辨率",
  "description": "将输入视频提升到指定分辨率",
  "version": "1.0.0",
  "category": "video",

  "input_schema": {
    "video_file": {
      "type": "file",
      "accept": ["video/mp4", "video/mov"],
      "required": true,
      "label": "原始视频"
    },
    "scale": {
      "type": "enum",
      "options": [2, 4],
      "default": 2,
      "required": true,
      "label": "放大倍数"
    }
  },

  "output_schema": {
    "result_video": {
      "type": "file",
      "mime": "video/mp4"
    },
    "log": {
      "type": "string"
    }
  },

  "ui_hint": {
    "form_layout": "vertical",
    "icon": "video",
    "estimated_time_seconds": 60
  },

  "runtime": {
    "async": true,
    "queue": "gpu-queue",
    "timeout_seconds": 600
  }
}
```

### 字段说明

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✅ | 全局唯一；任务型用 kebab-case 且与文件夹名一致；一旦发布不可更改 |
| `name` | ✅ | 前端展示名 |
| `description` | ✅ | 模块简介 |
| `version` | ✅ | 模块版本，如 `1.0.0` |
| `category` | ✅ | `video` / `image` / `text` / `system` 等 |
| `input_schema` | ✅ | 输入参数，见 §3 |
| `output_schema` | ✅ | 输出结果，结构同 §3 |
| `ui_hint` | ❌ | 渲染提示；本地服务可用 `service_panel` / `hidden` |
| `runtime` | ✅ | 调度信息；AI 类建议 `timeout_seconds` ≥ 120 |
| `local` | △ | 本机 HTTP 服务必填，见 §8 |

---

## 3. input_schema / output_schema 字段类型

每个参数为 key → 描述对象：

| type | 说明 | 额外属性 |
|---|---|---|
| `string` | 文本 | `max_length`, `default`, **`format`**（见下） |
| `number` | 数字 | `min`, `max`, `default` |
| `enum` | 下拉 | `options`, `default` |
| `boolean` | 开关 | `default` |
| `file` | 单文件 | `accept`（MIME 数组）, `max_size_mb`, `mime`（输出） |
| `file[]` | 多文件 | 同上 |

通用属性：`required`、`label`、`description`。

### `format`（string 专用）

| format | 渲染 |
|---|---|
| （缺省） | 单行 `<input>` |
| `textarea` | 多行 `<textarea>`（系统提示词 / 正文 / 长 prompt **优先用这个**，不要为此单独写 Form.tsx） |

示例：

```json
"prompt": {
  "type": "string",
  "format": "textarea",
  "required": true,
  "label": "提示词",
  "description": "描述希望生成的内容",
  "default": ""
}
```

> DynamicForm 按此表渲染。新增 type / format 必须同步更新 DynamicForm、`FieldSpec` 与本文档。

### 默认值同源（强制）

- 表单默认值**只**来自 `input_schema.*.default`
- 禁止在 `Form.tsx` 里另维护一套 `DEFAULTS` 硬编码（长期与 schema 漂移）
- 自定义 Form 若存在，初始化时必须 `defaultsFromSchema(manifest.input_schema)`

---

## 4. 后端 handler.py（任务型模块）

```python
from modules._base import BaseModuleHandler

class Handler(BaseModuleHandler):
    def run(self, params: dict) -> dict:
        # params 符合 input_schema；文件字段为本地路径字符串
        # return 符合 output_schema；文件输出为 storage.upload() 后的 URL
        ...
```

约定：

- **只暴露** `run(params) -> dict`；返回 key 必须对齐 `output_schema`
- 密钥走环境变量 / 共享配置，**禁止**写进模块源码或提交 `.env`
- 超时写进 `runtime.timeout_seconds`（AI 类建议 ≥ 120）
- 同目录依赖：壳可能按单文件加载 handler；**避免**脆弱的相对导入（`from .foo import`）。优先同目录 `importlib` 加载，或把共享代码放到可导入包路径
- 启动时 `module_loader` 扫描并校验 `module.json` + `handler.py`，失败则拒绝启动

---

## 5. 任务数据流（任务型）

1. `GET /api/modules` → 所有 module.json  
2. `POST /api/tasks { module_id, input_params }` → `{ task_id, status: "pending" }`  
3. Worker：`get_handler(module_id).run(input_params)`  
4. `GET /api/tasks/{task_id}` → status / result / error  
5. 前端：有自定义 `Result` 则用之，否则按 `output_schema` 默认渲染  

**本机服务流（mo_kuai HTTP）**

1. `GET /studio-api/launcher/modules` → 扫描到的 module.json  
2. 前端/代理按 `local.proxy` 转发到独立进程  
3. 按 `local.endpoint` 调用 HTTP；`runtime.async=true` 时轮询任务接口  

---

## 6. 命名与版本

- `id` 上线后永久不可改；展示改名只用 `name`
- breaking change → 新 `id`（如 `tts-v2`），不要改旧 schema
- `version` 暂仅记录，不做自动兼容校验

---

## 7. 新增模块 Checklist

**任务型（KE 壳）**
- [ ] `backend/modules/<id>/module.json` + `handler.py`（§4）
- [ ] `frontend/modules/<id>/module.json`（一致）
- [ ] **默认 DynamicForm**；仅必要时才加 `Form.tsx` / `Result.tsx` + `index.ts`（§9）
- [ ] 长文本字段用 `format: "textarea"`，不要为此手写 Form
- [ ] 默认值只写在 schema；自定义 Form 不另写 DEFAULTS
- [ ] **不**改 worker if-else、导航硬编码表、`tasks.py` 里的 module_id 分支

**本机 HTTP（mo_kuai）**
- [ ] 文件夹 + 符合 §2 的 `module.json`（含 §8 `local`）
- [ ] 实现 `/health`（`service` === `local.label`）+ 业务 API
- [ ] **独立检验**：`GET /ui` + `start_web.*`（§1.1）；不接宿主也能验收主能力
- [ ] 放到 Desktop 或 `Desktop/mo_kuai/` 扫描根
- [ ] 重启 studio-api / Vite；确认 `/launcher/modules` 可见
- [ ] **不**改 launcher / vite-local-proxy / LocalServiceId 硬编码表

---

## 8. `local` 扩展（本机 HTTP 服务）

```json
"local": {
  "label": "text_to_voice",
  "defaultPort": 8765,
  "maxTries": 15,
  "envPort": "TTS_PORT",
  "healthPath": "/health",
  "endpoint": { "method": "POST", "path": "/tts" },
  "start": {
    "windows": { "script": "start_api.ps1", "runtime": "powershell" }
  },
  "proxy": [
    {
      "prefix": "/tts-api",
      "rewrite": { "pattern": "^/tts-api", "replacement": "" }
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `label` | `/health.service` 必须等于此值 |
| `defaultPort` / `maxTries` / `envPort` | 端口协商 → ports.json |
| `start` | launcher 一键启动 |
| `proxy` | Vite 代理；`pathEquals` 精确匹配 |
| `endpoint` | 主操作 HTTP 路径（对应 input/output_schema） |

`ui_hint.service_panel: false` 或 `ui_hint.hidden: true` → 不出现在设置「本地后端」列表。

扫描实现：`video_1/shared/discoverModules.mjs`  
列表 API：`GET /studio-api/launcher/modules`

### 现有模块

| 目录 | id | category |
|------|-----|----------|
| text_to_voice | tts | text |
| video_creat | compose | video |
| video_download | download | video |
| rich_txt | richtext | text |
| AI_in | ai-in | text |

---

## 9. 前端 UI 约定（任务型 / KE 壳）

### 9.1 默认优先 DynamicForm

- **默认**只用 `module.json` + DynamicForm，不要为「好看」手写表单
- 仅当 DynamicForm 撑不住时才写 `Form.tsx` / `Result.tsx`：多步交互、富文本编辑器、复杂预览等
- 简单字段（string / number / enum / boolean / file）禁止自定义 Form
- 长 prompt / 正文 → `format: "textarea"`，仍走 DynamicForm

### 9.2 自定义 UI 注册（禁止手写 module_id 表）

```
frontend/modules/<id>/index.ts  →  export { Form?, Result? }
```

- 壳通过 `import(\`./${id}/index\`)` **自动发现**；有则用之，无则 DynamicForm / 默认 Result
- **禁止**在 `tasks.py`、导航、worker if-else、手动 `_ui-registry` 大表里写死 `module_id`
- 无自定义 UI 的模块**不要**建空的 `index.ts`

### 9.3 视觉 token（自定义 Form 必须遵守）

全模块共用壳的设计 token，**禁止**模块内再引入第二套颜色 / 圆角 / 阴影：

| 用途 | class |
|------|--------|
| 容器（短表单） | `max-w-lg space-y-4` |
| 容器（长文案 / textarea） | `max-w-3xl space-y-4` |
| 控件 | `border-input bg-background rounded-md text-sm`（及壳统一的 h/px） |
| 说明文案 | `text-xs text-muted-foreground`，放在 **label 下方** |
| 主提交 | 一个主按钮 |
| 次要操作 | `variant="outline"` + `size="sm"` |

### 9.4 字段布局

| 类型 | 布局 |
|------|------|
| 主题 / 提示词 / 正文等长文本 | **一栏**（`format: "textarea"`） |
| model、temperature、max_tokens 等参数条 | **两栏** `grid grid-cols-2 gap-3`（自定义 Form 时） |
| 文件 | 一栏 |

### 9.5 Result 区

- 成功态：标题 + 次要 meta（模型、字数等）**一行**，下面才是主内容
- 富文本 / 视频 / 文件：一种主预览即可，**不要**堆原始 JSON
- 操作：复制 / 下载用一排 `outline` + `sm`，文案短（如「复制 HTML」）

### 9.6 第三方编辑器依赖

若模块依赖 wangEditor 等：安装后需**重启前端**；补齐 CSS module 类型声明（如 `*.css`），避免 TS 报错阻塞接入。
