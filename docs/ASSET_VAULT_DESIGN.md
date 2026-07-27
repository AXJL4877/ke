# ke 资产部门（Asset Vault）详细设计

> 状态：**一期已实现（浏览 + 自动入库）**  
> 目标：统一收纳各模块产出，可检索、可互通；模块仍可本地缓存，但「可复用结果」进资产库。  
> 原则：一期先解决「难找」；二期再解决「跨模块用 asset_id 引用」。

---

## 1. 问题与目标

### 1.1 现状问题

| 数据在哪 | 表现 |
|----------|------|
| 模块 `outputs/` / `downloads/` / 模块自有 SQLite | 散落、互不可见 |
| ke `tasks.result` JSON | 绑在任务上，不是资产目录 |
| ke `storage/` + `/files` | 只有文件盘，无元数据/检索 |

### 1.2 目标

1. **一处查找**：按模块、类型、时间、关键词找到产物  
2. **可互通**：下游模块可引用 `asset_id`，不必只粘路径/URL  
3. **不破坏模块独立**：HTTP 模块仍可本地落盘；入库是「登记到 ke」  
4. **产品 UI 干净**：资产页给人用，不堆端口/代理路径（遵守 AGENTS 产品文案）

### 1.3 非目标（本期不做）

- 不改造 8 个源模块内部存储结构（不强制改 transcript.db 等）  
- 不做多租户权限细粒度 ACL（可先跟现有 JWT 用户可选绑定）  
- 不做对象存储必选（继续本地 `storage/`，接口预留 S3）  
- 不做全文检索引擎（一期 SQLite LIKE / 简单索引即可）

---

## 2. 概念模型

```text
Module (能力) ──run──► Task (一次执行)
                         │
                         ▼ 成功后登记（一期自动 / 二期也可显式上传）
                      Asset (资产条目)
                         │
                         ├── 元数据（title, kind, module_id, tags…）
                         ├── 正文或摘要（text / json）
                         └── 文件（可选，存 storage，URL 可访问）
```

| 概念 | 含义 |
|------|------|
| **Asset** | 一条可复用产物：一段文案、一个音频、一个视频、一份 JSON 等 |
| **kind** | 资产类型枚举，便于筛选 |
| **source** | 从哪来：`task` / `upload` / `import` |
| **provenance** | 来源模块、下游 job_id、是否 mock 等（与现有约定对齐） |

---

## 3. 资产类型（kind）

| kind | 说明 | 典型来源 |
|------|------|----------|
| `text` | 纯文本 / 文案 | transcript、AI chat |
| `subtitle` | SRT 等 | asr / transcript |
| `audio` | 音頻文件 | tts、download audio |
| `video` | 视频文件 | compose、remotion、download |
| `image` | 图片 | AI_in 生图、rich_txt |
| `json` | 结构化结果 | 风格提示词、segments |
| `file` | 其他文件 | 通用 |
| `bundle` | 一组相关资产的父条目（可选二期） | 一次转写的 txt+srt |

一期实现：`text` / `audio` / `video` / `image` / `json` / `file` 即可；`subtitle` 可并入 `text`+mime 或单独 kind。

---

## 4. 数据模型

### 4.1 表 `assets`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID PK | `asset_id` |
| `title` | str | 展示标题（可自动从结果推断） |
| `kind` | str | 见上表 |
| `module_id` | str | 产生该资产的 ke 模块 id（业务模块或桥接模块） |
| `source_service` | str? | 本机服务 id，如 `transcript` / `tts`（可选） |
| `task_id` | UUID? FK→tasks | 由哪次任务登记 |
| `source` | str | `task` \| `upload` \| `import` |
| `mime` | str? | 如 `text/plain`、`audio/wav`、`video/mp4` |
| `text_content` | Text? | 短/中等正文直接入库（文案、提示词）；大文本可截断+文件 |
| `storage_key` | str? | 文件在 storage 中的 key |
| `url` | str? | 可访问 URL（`/files/...` 或外链） |
| `bytes_size` | int? | 文件大小 |
| `checksum` | str? | 可选 sha256，去重用 |
| `tags` | JSON list | 用户/系统标签 |
| `meta` | JSON | 扩展：duration、archive_id、job_id、language… |
| `provenance` | JSON | `{source, service, job_id, mock}` |
| `user_id` | UUID? | 可选归属 |
| `created_at` / `updated_at` | datetime | |

索引：`module_id`、`kind`、`created_at`、`task_id`；标题/正文可用 SQLite `LIKE`（一期）。

### 4.2 与 Task 关系

- 一次 Task 成功可登记 **1～N** 条 Asset（例如同时有 txt + srt + 音频）。  
- Task.result 仍保留（任务卡展示）；Asset 是「可检索的长期目录」。  
- 删除 Task **默认不级联删 Asset**（资产独立于任务历史）；可提供「删除任务时是否删除关联资产」选项（二期）。

### 4.3 文件策略

| 内容 | 策略 |
|------|------|
| 短文本（&lt; 例如 200KB） | 优先 `text_content` |
| 长文本 / 二进制 | `storage.upload` → `storage_key` + `url` |
| 模块本地路径 | handler/壳在登记时 **复制进 ke storage**，不依赖模块目录长期存在 |
| 外链 URL | 可只记 `url`，`storage_key` 为空（标记 `meta.external=true`） |

---

## 5. API 设计

前缀：`/api/assets`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/assets` | 列表：`?module_id=&kind=&q=&tag=&limit=&offset=` |
| GET | `/api/assets/{id}` | 详情（含 text_content / url） |
| POST | `/api/assets` | 手动创建/上传（multipart 或 JSON） |
| PATCH | `/api/assets/{id}` | 改 title、tags |
| DELETE | `/api/assets/{id}` | 删元数据；可选删 storage 文件 |
| POST | `/api/assets/from-task/{task_id}` | 把已有成功任务补登记（修复/回填） |

### 5.1 列表项（精简，给 UI）

```json
{
  "id": "...",
  "title": "B站xxx 转写",
  "kind": "text",
  "module_id": "style-from-video",
  "source_service": "transcript",
  "created_at": "...",
  "has_file": true,
  "url": "http://localhost:8000/files/...",
  "preview": "前 120 字…"
}
```

### 5.2 创建体（手动）

```json
{
  "title": "风格提示词",
  "kind": "json",
  "module_id": "style-from-video",
  "text_content": "{...}",
  "tags": ["style"],
  "meta": {},
  "provenance": {"source": "ai-in", "service": "ai_in", "mock": false}
}
```

鉴权：与现有 tasks 一致（开发态可 `auth: false`）；有 user 时写入 `user_id`。

---

## 6. 自动入库（一期核心）

### 6.1 触发点

在 `execute_task` **成功 persist 之后**（`status=done`）：

1. 读 `result` + 模块 `output_schema` / 可选 `asset_extract` 约定  
2. 抽出候选资产 → 写入 `assets`  
3. 在 `result` 中附加 `_assets: [{id, kind, title}]`（软提示，不破坏原字段）

失败任务不入库。mock 软提示仍可入库，但 `provenance.mock=true` 并打标签 `可疑`（可配置关闭）。

### 6.2 抽取规则（约定优于猜测）

**优先级 A — 模块显式声明（推荐）**

在 `module.json` 增加可选：

```json
"asset_extract": [
  {
    "from": "result_text",
    "kind": "text",
    "title_from": "title",
    "title_default": "转写文案"
  },
  {
    "from": "result_audio",
    "kind": "audio",
    "is_file": true
  }
]
```

**优先级 B — 启发式（无声明时）**

| result 字段模式 | 动作 |
|-----------------|------|
| `*text*` / `transcript` / `echo` 长字符串 | → kind=text |
| `*.srt` / `subtitle` | → kind=text 或 subtitle |
| URL 含 `/files/` 或结果 file 字段 | → 按 mime/扩展名定 kind，登记 url；若是本地可拉则拷贝 |
| `provenance` | 原样写入资产 |

启发式必须保守：宁可不入库，不要把整份巨大 result JSON 当一条垃圾资产。

### 6.3 Handler 侧最佳实践（写进 AGENTS）

接入模块成功返回时尽量：

```json
{
  "title": "可读标题",
  "text": "...",
  "result_file": "http://localhost:8000/files/...",
  "provenance": {"source": "transcript", "service": "video_transcript", "job_id": "...", "mock": false}
}
```

并建议增加 `asset_extract`，避免壳层瞎猜。

---

## 7. 跨模块互通（二期）

### 7.1 输入类型扩展

`input_schema` 新类型（或 format）：

```json
"source_asset": {
  "type": "string",
  "format": "asset_id",
  "label": "选用资产",
  "accept_kinds": ["text", "audio"]
}
```

DynamicForm：弹出资产选择器（按 kind 过滤），写入 `asset_id`。

### 7.2 Handler 解析

```python
from core.assets import resolve_asset

asset = resolve_asset(params["source_asset"])
text = asset.text_content or download(asset.url)
```

### 7.3 典型链路

```text
collect 任务 → Asset(text 文案)
style 任务 → 输入选该 asset_id → AI_in → Asset(json 风格提示词)
compose 任务 → 选 Asset(audio) + Asset(image) → 成片 Asset(video)
```

---

## 8. 前端（产品 UI）

### 8.1 导航

增加「资产」入口（与「工作台 / 任务」并列），文案口语化，不出现 storage_key、ports。

### 8.2 资产页 `/assets`

- 筛选：模块、类型、搜索框  
- 列表：标题、类型、来源模块、时间、短预览  
- 详情：正文 / 播放器 / 下载 / 复制 / 编辑标签 / 删除  
- **不要**：默认展示 job_id、代理路径、端口（可放「技术信息」折叠，默认关）

### 8.3 任务卡

成功结果若有 `_assets`，显示「已存入资产」+ 链到资产详情（一行即可，勿堆小字）。

---

## 9. 与现有模块的关系

| 模块本地数据 | 资产部门 |
|--------------|----------|
| transcript `transcripts.db` | 登记文案/srt 副本到 assets；不强制迁库 |
| download `downloads/` | 若结果进 ke，拷贝到 storage 再登记 |
| tts `outputs/` | 同上 |
| AI_in `outputs/` | 生图/文本登记 |

**原则：** 模块本地 = 运行缓存；资产部门 = 产品级可发现资产。  
允许两端短期重复；以资产库为「找得到」的真源。

---

## 10. 实现分期

### 一期（MVP）

1. DB 表 `assets` + `GET/POST/PATCH/DELETE /api/assets`  
2. `execute_task` 成功后自动抽取入库（声明 + 保守启发式）  
3. 前端 `/assets` 列表 + 详情 + 搜索  
4. AGENTS / MODULE_SPEC 补充 `asset_extract` 与返回约定  
5. 单测：入库抽取、列表过滤、删除

### 二期

1. `format: asset_id` + 表单选择器  
2. `resolve_asset` 给 handler  
3. 标签、checksum 去重、从任务回填  
4. bundle（一次任务多产物成组）

### 三期（可选）

1. 权限/多用户隔离  
2. S3  
3. 从模块目录 / `storage/`「扫描导入」历史 orphans（DB 重建后回填索引；默认谨慎、可手动触发）

> 一期已提供 `POST /api/assets/from-task/{task_id}` 从成功任务回填。全量 orphan 扫描为后续能力。

---

## 11. 文件与目录规划（实现时）

```text
ke/backend/
  db/models.py          # + Asset
  api/routers/assets.py # 新路由
  core/assets.py        # 抽取、resolve、登记
  storage/client.py     # 复用
ke/frontend/
  app/assets/page.tsx   # 资产页
  components/assets/    # 列表、详情、选择器（二期）
ke/docs/
  ASSET_VAULT_DESIGN.md # 本文档
```

---

## 12. 风险与对策

| 风险 | 对策 |
|------|------|
| 自动抽取误入库垃圾 | 优先 `asset_extract`；启发式保守；支持删除 |
| 磁盘膨胀 | 大文件进 storage；可配保留策略（二期） |
| 模块文件被清掉 | 入库时拷贝进 ke storage |
| 与任务结果重复 | 接受；职责不同（执行记录 vs 资产目录） |
| UI 又变联调面板 | 遵守 product-ui 规则 |

---

## 13. 验收标准（一期）

- [x] 成功跑完带文本/文件的任务后，资产页能看到对应条目  
- [x] 可按 module_id / kind / 关键词找到  
- [x] 打开详情可复制文本或下载文件  
- [x] 删除资产不导致 ke 崩溃；文件可选删除  
- [x] 产品文案无端口/代理路径堆砌  
- [x] 现有任务流与 soft anti-mock 行为不变  

---

## 14. 已确认决策

1. **一期默认「任务成功自动入库」** — 是  
2. **删除任务时默认保留资产** — 是（`task_id` SET NULL）  
3. **资产页鉴权与任务页一致** — 开发态可匿名  
4. **一期只浏览**；`asset_id` 互通放二期