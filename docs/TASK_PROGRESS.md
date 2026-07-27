# 任务业务进度规范（TASK_PROGRESS）

> 权威位置：`scripts/docs/specs/TASK_PROGRESS.md`  
> 实现：ke `core/progress_stages.py` + `core/task_progress_ctx.report_stage` + 前端 `ProgressTracker`  
> 目的：进度条显示**业务环节**（撰写文案 / 画面 / 配音 / 叠 BGM…），方便智能体按约定改 Handler。

壳层仍有 `validate → load → run → persist`（技术流水线）。  
**产品进度条优先展示业务环节**；技术环节仅作失败定位。

---

## 1. 字段契约（Task API）

| 字段 | 类型 | 说明 |
|------|------|------|
| `progress` | `0–100` number | 整体百分比 |
| `progress_stage` | string | **业务环节 id**（kebab-case），见 §2 |
| `progress_message` | string | 给人看的短句，优先用标准 `label`，可附细节 |

Handler / 胶水在每个业务步骤**开始时**上报一次；长步骤可在中间刷新 `%` 与 `message`。

```python
from core.task_progress_ctx import report_stage

report_stage("write_copy")                    # 用标准 label + 默认进度锚点
report_stage("voiceover", progress=62, message="配音 3/8 句")
report_stage("mix_bgm")                       # 叠 BGM 开始
```

禁止只写笼统 `run` / 「处理中」而不报业务 id。

---

## 2. 标准业务环节表（全局词表）

智能体**只能**用下表 id（或模块 `progress_pipeline` 声明的子集）。新增环节先改本表再改代码。

| id | 中文 label | 默认锚点% | 典型动作 |
|----|------------|-----------|----------|
| `fetch_data` | 拉取数据 | 8 | info_fetch / 归档快照 |
| `write_copy` | 撰写文案 | 18 | 标题/简介/话题/解说词 |
| `render_cover` | 渲封面 | 30 | Remotion still / 封面图 |
| `render_video` | 渲画面 | 45 | Remotion 成片 |
| `voiceover` | 配音 | 60 | TTS / AI_in |
| `mix_voice` | 混解说 | 72 | 解说轨混入成片 |
| `mix_bgm` | 叠 BGM | 82 | video_creat `/bgm` |
| `export` | 导出成片 | 90 | 落盘带日期产物 / 镜像 latest |
| `publish_prepare` | 发布预填 | 96 | douyin_assist 半自动 |
| `done` | 完成 | 100 | 成功结束 |

可选扩展（按需加入 `progress_pipeline`，勿滥用）：

| id | label | 说明 |
|----|-------|------|
| `ensure_deps` | 探活依赖 | 拉起 remotion / TTS 等 |
| `upload` | 上传素材 | 上传到创作者中心 |
| `transcribe` | 转写 | ASR |
| `download` | 下载源片 | yt-dlp 等 |

---

## 3. 配方预设（presets）

### `fund-flow-daily`（每日板块资金流向）

```text
fetch_data → write_copy → render_cover → render_video → voiceover → mix_voice → mix_bgm → export → publish_prepare
```

- `publish_prepare` 失败 = **软失败**（成片已 export，进度可停在 export=90 并 message 标明发布失败）
- 无解说：跳过 `voiceover` / `mix_voice`，锚点可直接从 `render_video` 跳到 `mix_bgm`

### `transcript-pipeline`（视频文案）

```text
download → transcribe → write_copy → export
```

### 单能力模块

短任务可只报 1–2 个环节（如 TTS 模块：`voiceover` → `done`）。  
在 `module.json` 声明 `progress_pipeline` 即可。

---

## 4. module.json 声明

```json
{
  "id": "cj-fund-flow",
  "progress_pipeline": [
    "fetch_data",
    "write_copy",
    "render_cover",
    "render_video",
    "voiceover",
    "mix_voice",
    "mix_bgm",
    "export",
    "publish_prepare"
  ]
}
```

- 缺省：前端用当前 `progress_stage` 所属 preset 推断，或只显示消息条
- `progress_pipeline` 中的 id **必须**落在 §2 词表（或本模块文档声明的扩展 id）

---

## 5. 智能体改 Handler 检查清单

- [ ] 每个耗时步骤入口调用 `report_stage("<id>")`
- [ ] id 来自 §2 或模块 `progress_pipeline`
- [ ] `progress_message` 可读（中文），不要堆端口 / 路径
- [ ] 长轮询（`poll_job`）用下游 `stage`/`progress` 映射进当前业务 id（`report_stage(..., progress=…)`）
- [ ] 发布失败不把整单 `failed` 抹掉已 export 产物（见 MODULE_SPEC §12.5）
- [ ] 模块 `progress_pipeline` 与真实步骤顺序一致

---

## 6. 与壳层技术阶段的关系

| 层 | stage 例子 | 谁写 | UI |
|----|------------|------|-----|
| 壳 | `validate` / `load` / `run` / `persist` | `worker/tasks.py` | 失败时节点徽章；默认不抢业务芯片 |
| 业务 | `write_copy` / `voiceover` / … | Handler `report_stage` | **进度条主展示** |

`progress_stage` 以**最后一次业务上报**为准；进入 `persist` 时可写 `done`。
