# ATRI - AI 情感陪伴项目

ATRI 是一个「Android 客户端 + Cloudflare Worker」的双端项目。手机端负责界面展示与本地存档，Worker 负责调用大模型、写入向量记忆、上传附件。整个仓库已经按“共享资源 → Worker → App”分层，提示词等文案也通过脚本保持一致。

> ⚠️ 当前版本没有任何云端定时器或推送。日记、总结、提醒都需要客户端主动触发。

---

## 1. 功能概览（现状说明）
- **聊天（/chat）**：支持文本 + 图片上传，后端使用 SSE 流式返回。Worker 每次都会检索 Cloudflare Vectorize 中的记忆，并把结果附加到 system prompt。
- **记忆写入（/memory/extract、/diary/index）**：对话记忆通过大模型抽取，日记记忆直接向量化。所有向量都写入 `atri-memories` 索引。
- **日记**：
  - 客户端：在日记页点击“立即生成日记”时，请求 `/diary/generate`，并把结果写入本地 Room 表。
  - Worker：暴露 `/diary/generate`（生成文本）和 `/diary/index`（向量化）。
  - ❌ 没有自动任务；需要手动点击。
- **聊天总结（/chat/summarize）**：客户端可在需要时调用，默认不自动执行。
- **提醒决策（/notify/decide）**：后端提供接口，但 APP 不再在 22:30 自动调用，也不再弹系统通知。
- **附件上传（/upload）**：上传到 Cloudflare R2，再通过 `/media/:key` 访问。

---

## 2. 目录速览
```
ATRI/
├─ ATRI/                   # Android 客户端
│  ├─ app/src/main/java/me/atri/
│  │  ├─ ui/               # Compose 界面（Chat、Sheet、Settings、Welcome）
│  │  ├─ data/             # 数据层：Room DAO、Repository、Retrofit API、DataStore
│  │  ├─ di/               # Koin 模块，集中声明依赖
│  │  ├─ utils/            # 会话格式化、扩展函数等
│  │  └─ worker/           # （已移除推送）历史保留目录
│  └─ app/src/main/assets/prompts.json  # 由 shared 同步的提示词
│
├─ worker/                 # Cloudflare Worker 后端
│  ├─ src/index.ts         # itty-router 入口
│  ├─ src/routes/          # chat / diary / memory / notify / media
│  ├─ src/services/        # OpenAI 调用、向量读写、附件处理
│  ├─ src/utils/           # 文本清洗、SSE 管道、ID 生成
│  └─ src/config/prompts.json  # 与 Android 共用的提示词
│
├─ shared/prompts.json     # 提示词母本
├─ scripts/sync_shared.py  # 将 shared/prompts.json 复制到 App 与 Worker
└─ README.md               # 当前文档
```

---

## 3. Android 端代码导览
| 模块 | 说明 | 关键文件 |
| --- | --- | --- |
| UI | Compose 页面 + BottomSheet。`ChatScreen` 负责聊天界面，`DiaryTab` 展示本地日记，`SettingsScreen` 用于填写 Worker URL / 昵称，并提供“清空记忆”按钮。 | `ATRI/app/src/main/java/me/atri/ui/*` |
| 数据层 | Room DAO（`DiaryDao`、`MessageDao`）、`DiaryRepository` 等封装本地数据库 + API 调用。 | `ATRI/app/src/main/java/me/atri/data/*` |
| 网络层 | `AtriApiService` 使用 Retrofit 定义所有后台接口；`NetworkModule` 从 DataStore 读取 base URL 构造 Retrofit。 | `ATRI/app/src/main/java/me/atri/data/api/*`, `ATRI/app/src/main/java/me/atri/di/NetworkModule.kt` |
| 数据存储 | PreferencesStore 使用 DataStore 保存 userId、Worker URL 等。userId 默认自动生成，如需“忘掉旧记忆”可在设置页清空数据并生成新 ID。 | `ATRI/app/src/main/java/me/atri/data/datastore/PreferencesStore.kt` |
| 日记流程 | `DiaryRepository.generateDiaryNow()`：① 读取当天聊天记录 → ② 调 `/diary/generate` → ③ 写入 Room → ④ 调 `/diary/index` 写入向量库。 | `ATRI/app/src/main/java/me/atri/data/repository/DiaryRepository.kt` |
| 记忆展示 | 聊天界面在发消息前会调用 `/memory/extract`（写入）和 `/memory/search`（检索），这些逻辑封装在 `ChatRepository`。 | `ATRI/app/src/main/java/me/atri/data/repository/ChatRepository.kt` |

> 提示词：APP 启动时由 `PromptProvider` 读取 `assets/prompts.json`，用于展示阶段提示等。本地文件由脚本同步，保持与 Worker 一致。

---

## 4. Worker 端代码导览
| 路由 | 作用 | 关键逻辑 |
| --- | --- | --- |
| `/chat` | SSE 流式聊天接口。`routes/chat.ts` 负责拼装 system prompt、构造消息上下文、调用 `callChatCompletions`，并将大模型返回的 body 直接 `pipeChatStream` 到客户端。 | `worker/src/routes/chat.ts` |
| `/memory/extract` | 让模型把对话总结成结构化记忆，再写入 Vectorize。 | `worker/src/routes/memory.ts` + `services/memory-service.ts` |
| `/memory/search` | 对输入进行向量化后查询 Vectorize，按 userId 过滤。 | 同上 |
| `/diary/generate` | 根据“当天对话”生成文本，返回 content + timestamp。 | `worker/src/routes/diary.ts` |
| `/diary/index` | 将日记文案写入 Vectorize，metadata 中包含 `userId/diaryId`。 | 同上 |
| `/chat/summarize` | 输出 50-120 字的回忆 + 标签。当前由客户端按需调用。 | 同上 |
| `/notify/decide` | 根据传入的 `localTimeIso + hasChattedToday` 让模型判断是否需要提醒。APP 目前未使用。 | `worker/src/routes/notify.ts` |
| `/upload` & `/media/:key` | 上传附件到 R2，并提供公开访问链接。 | `worker/src/routes/media.ts` |

Worker 所有路由都依赖共享提示词（`src/config/prompts.json`）和封装好的工具：
- `services/openai-service.ts`：统一封装 Chat Completions 请求与错误处理。
- `services/memory-service.ts`：调用 SiliconFlow embeddings，写入 / 查询 Vectorize。
- `utils/sanitize.ts`：统一清洗输入，避免脏字符或 ID 过长。

`wrangler.toml` 内定义了 Vectorize/R2 绑定、开放 API URL、embedding 模型等。部署时需要在 Cloudflare Dashboard 配置自定义域名（示例：`mikuscat.qzz.io`）。

---

## 5. 提示词与共享资源
1. 修改 `shared/prompts.json`。
2. 运行 `python scripts/sync_shared.py`，脚本会把同一份文件复制到：
   - `ATRI/app/src/main/assets/prompts.json`
   - `worker/src/config/prompts.json`
3. 重新构建 APP / 重新部署 Worker。

这样可以保证手机展示的提示词、后端实际使用的 prompt 永远一致，避免“看见 A 说 B”的情况。

---

## 6. 快速开始
### 6.1 部署 Cloudflare Worker
```bash
cd worker
npm install
python ../scripts/sync_shared.py   # 同步提示词
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put EMBEDDINGS_API_KEY
npm run deploy
```
部署成功后记下 Worker URL（示例 `https://atri-worker.<subdomain>.workers.dev`），或在 Dashboard 为其绑定自定义域名。

### 6.2 构建 Android 客户端
```bash
cd ATRI
python ../scripts/sync_shared.py   # 同步提示词
./gradlew assembleDebug            # Windows 用 .\gradlew.bat
```
调试时可直接在 Android Studio 里运行 `app` 模块。首次进入会提示你填写昵称，然后可以在设置页输入 Worker URL。

### 6.3 手机端配置
1. 打开设置页，填入 Worker URL（必须是 https）。
2. 若想“清空记忆”，点击同页的按钮即可删除本地聊天/日记并重新生成一个新的 userId，之后的对话会以全新身份存储。
3. 保存后返回聊天界面即可使用。日记需要在「日记」页手动点击生成。

---

## 7. API 简表
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/chat` | 主聊天接口，流式返回。 |
| POST | `/memory/extract` | 将对话内容提取为 1-3 条记忆（写入 Vectorize）。 |
| POST | `/memory/search` | 根据 query 检索当前用户的记忆。 |
| POST | `/diary/generate` | 根据当天聊天记录生成一篇 80-120 字日记。 |
| POST | `/diary/index` | 将指定日记写入向量库（需要 userId + diaryId + content）。 |
| POST | `/chat/summarize` | 生成 50-120 字的聊天总结。 |
| POST | `/notify/decide` | （可选）根据时间判断是否需要提醒。当前 APP 未调用。 |
| POST | `/upload` | 上传任意文件到 R2。 |
| GET  | `/media/:key` | 下载指定 R2 文件。 |

所有接口都要求 `Content-Type: application/json`，除上传以外均为 JSON 请求/响应。

---

## 8. 常见问题 & 当前限制
1. **为什么日记 200 但 Vectorize 没有记录？**  
   生成后还需调用 `/diary/index`。APP 已自动调用，但如果你用 curl 只调生成接口，就不会写入记忆。

2. **我想在后台看到 APP 写入的记忆，结果查不到？**  
   APP 默认使用 DataStore 里自动生成的 `userId`，只要不清空记忆就会一直沿用。如果你在后台用其他 ID 查询，就看不到这位用户的记录；如需重新开始，可在设置页点击“清空记忆”，系统会换一个全新的 ID。

3. **能否自动推送 / 自动生成日记？**  
   当前没有。之前依赖 Android 本地定时任务，已被移除。若要真正云端自动化，需要：
   - 定时把当天聊天记录上传；
   - 在 Cloudflare 侧接 Cron Trigger 或自建服务调用 `/diary/generate`；
   - 增加云端存储与同步接口；
   - 在 APP 里实现“从云端同步日记”。

4. **向量检索不到结果？**  
   检查 `EMBEDDINGS_API_KEY`，确认 Worker 能访问 SiliconFlow。也可在日志中查看 `Embeddings API error`。

5. **提示词修改没生效？**  
   是否运行了 `scripts/sync_shared.py`？若没同步，APP 和 Worker 读到的还是旧版本。

---

## 9. 后续规划建议
- ✅（已完成）移除本地推送，避免“看似会提醒，实际没有”。
- ⏳ 建议补上“云端同步日记”的接口与数据库，才能真正做到多设备共用。
- ⏳ 若需要自动提醒，考虑 Cloudflare Cron + 外部推送服务，或集成国内厂商推送 SDK。
- ⏳ 编写端到端测试（对 `/chat`、`/diary/index` 等）保证改动后行为一致。

---

## 10. 开发者速查
- 运行 Lint：`./gradlew lint`
- 运行单元测试：`./gradlew test`
- 清理构建：`./gradlew clean`
- Worker 本地调试：`cd worker && npm run dev`（注意：本地 dev 无 Vectorize 绑定，向量操作需 `--remote`）

如需贡献新的模块或修复，请优先更新 `shared/prompts.json`、编写 README 中提到的步骤，并在 PR 内说明测试方式。
