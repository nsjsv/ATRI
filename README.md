# ATRI - My Dear Moments

![ATRI应用截图](ATRI-APP.jpg)

**像ATRI一样会写日记的 AI 情感陪伴系统**

现代化的 Android 客户端 + Cloudflare Worker 边缘计算后端

---

ATRI 是一个「Android 客户端 + Cloudflare Worker」的双端项目。手机端负责界面展示与本地存档，Worker 负责调用大模型、写入向量记忆、上传附件。整个仓库已经按"共享资源 → Worker → App"分层，提示词等文案也通过脚本保持一致。

> ⚠️ 当前版本没有任何云端定时器或推送。日记、总结、提醒都需要客户端主动触发。

---

## 🚀 技术创新亮点

ATRI 不仅仅是普通的AI聊天应用，我们在以下领域参考ATRI进行了设计：

### 🧠 **混合记忆检索系统 (Hybrid Memory Retrieval)**
业界首创的多层记忆架构，让AI真正拥有"记忆"和"回忆"能力：

- **长期日记记忆**：通过 Vectorize 向量数据库检索历史日记，匹配时自动回溯完整对话记录
- **短期工作记忆**：实时构建当日对话时间线，保持对话的连贯性和上下文
- **动态记忆组合**：智能融合长期记忆与短期记忆，为每次对话提供个性化的历史上下文

**实现原理**：当用户输入内容时，系统会：
1. 向量检索相关记忆片段（日记、对话片段等）
2. 匹配到日记记录时，获取当天的完整对话历史
3. 将相关记忆动态注入到AI的提示词中，形成连贯的"回忆"体验

### 🎭 **动态提示词系统**
突破传统静态提示词限制，实现实时动态人格构建：

- **时空感知**：根据客户端时间自动调整AI状态（清晨的困意、深夜的感性）
- **分阶段关系模型**：5个情感阶段（初遇→熟识→亲近→心动→挚爱），每阶段不同的表达方式
- **记忆上下文注入**：实时检索的相关记忆、长期回忆、工作记忆动态组合
- **人格一致性**：核心记忆碎片确保亚托莉的性格特征在对话中保持一致

### 🌐 **Cloudflare Workers 边缘计算**
充分利用现代云原生技术的优势：

- **全球低延迟**：基于 Cloudflare 全球网络，智能路由到最近的边缘节点
- **无服务器架构**：自动扩缩容，按实际使用量付费，零运维成本
- **现代技术栈**：TypeScript + itty-router + Vectorize + D1 + R2 的全栈解决方案

### 📔 **智能日记生成系统**
让AI拥有真正的"自我反思"能力：

- **自动化生成**：定时任务分析每日对话，自动生成个性化日记
- **情感状态分析**：智能检测对话中的情绪变化，记录真实情感历程
- **记忆巩固机制**：生成的日记自动向量化存储，成为长期记忆的一部分
- **混合回忆触发**：日记内容可通过向量检索触发完整的历史回忆

### 🎨 **多模态交互体验**
丰富的交互方式，让沟通更自然：

- **图片理解**：支持图片输入和描述
- **流式响应**：SSE实时流式输出，如同真人对话
- **附件处理**：支持文档、图片等多种文件类型
- **跨平台同步**：Android客户端与云端无缝同步

---

## 2. 功能概览（现状说明）
- **聊天（/chat）**：支持文本 + 图片上传，后端使用 SSE 流式返回。Worker 每次都会检索 Cloudflare Vectorize 中的记忆，并把结果附加到 system prompt。
- **记忆写入（/memory/extract、/diary/index）**：对话记忆通过大模型抽取，日记记忆直接向量化。所有向量都写入 `atri-memories` 索引。
- **日记**：
  - 客户端：在日记页点击"立即生成日记"时，请求 `/diary/generate`，并把结果写入本地 Room 表。
  - Worker：暴露 `/diary/generate`（生成文本）和 `/diary/index`（向量化）。
  - ❌ 没有自动任务；需要手动点击。
- **聊天总结（/chat/summarize）**：客户端可在需要时调用，默认不自动执行。
- **提醒决策（/notify/decide）**：后端提供接口，但 APP 不再在 22:30 自动调用，也不再弹系统通知。
- **附件上传（/upload）**：上传到 Cloudflare R2，再通过 `/media/:key` 访问。

---

## 3. 目录速览
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

## 4. Android 端代码导览
| 模块 | 说明 | 关键文件 |
| --- | --- | --- |
| UI | Compose 页面 + BottomSheet。`ChatScreen` 负责聊天界面，`DiaryTab` 展示本地日记，`SettingsScreen` 用于填写 Worker URL / 昵称，并提供"清空记忆"按钮。 | `ATRI/app/src/main/java/me/atri/ui/*` |
| 数据层 | Room DAO（`DiaryDao`、`MessageDao`）、`DiaryRepository` 等封装本地数据库 + API 调用。 | `ATRI/app/src/main/java/me/atri/data/*` |
| 网络层 | `AtriApiService` 使用 Retrofit 定义所有后台接口；`NetworkModule` 从 DataStore 读取 base URL 构造 Retrofit。 | `ATRI/app/src/main/java/me/atri/data/api/*`, `ATRI/app/src/main/java/me/atri/di/NetworkModule.kt` |
| 数据存储 | PreferencesStore 使用 DataStore 保存 userId、Worker URL 等。userId 默认自动生成，如需"忘掉旧记忆"可在设置页清空数据并生成新 ID。 | `ATRI/app/src/main/java/me/atri/data/datastore/PreferencesStore.kt` |
| 日记流程 | `DiaryRepository.generateDiaryNow()`：① 读取当天聊天记录 → ② 调 `/diary/generate` → ③ 写入 Room → ④ 调 `/diary/index` 写入向量库。 | `ATRI/app/src/main/java/me/atri/data/repository/DiaryRepository.kt` |
| 记忆展示 | 聊天界面在发消息前会调用 `/memory/extract`（写入）和 `/memory/search`（检索），这些逻辑封装在 `ChatRepository`。 | `ATRI/app/src/main/java/me/atri/data/repository/ChatRepository.kt` |

> 提示词：APP 启动时由 `PromptProvider` 读取 `assets/prompts.json`，用于展示阶段提示等。本地文件由脚本同步，保持与 Worker 一致。

---

## 5. Worker 端代码导览
| 路由 | 作用 | 关键逻辑 |
| --- | --- | --- |
| `/chat` | SSE 流式聊天接口。`routes/chat.ts` 负责拼装 system prompt、构造消息上下文、调用 `callChatCompletions`，并将大模型返回的 body 直接 `pipeChatStream` 到客户端。 | `worker/src/routes/chat.ts` |
| `/memory/extract` | 让模型把对话总结成结构化记忆，再写入 Vectorize。 | `worker/src/routes/memory.ts` + `services/memory-service.ts` |
| `/memory/search` | 对输入进行向量化后查询 Vectorize，按 userId 过滤。 | 同上 |
| `/diary/generate` | 根据"当天对话"生成文本，返回 content + timestamp。 | `worker/src/routes/diary.ts` |
| `/diary/index` | 将日记文案写入 Vectorize，metadata 中包含 `userId/diaryId`。 | 同上 |
| `/chat/summarize` | 输出 50-120 字的回忆 + 标签。当前由客户端按需调用。 | 同上 |
| `/notify/decide` | 根据传入的 `localTimeIso + hasChattedToday` 让模型判断是否需要提醒。APP 目前未使用。 | `worker/src/routes/notify.ts` |
| `/upload` & `/media/:key` | 上传附件到 R2，并提供公开访问链接。 | `worker/src/routes/media.ts` |

Worker 所有路由都依赖共享提示词（`src/config/prompts.json`）和封装好的工具：
- `services/openai-service.ts`：统一封装 ChatCompletions 请求与错误处理。
- `services/memory-service.ts`：调用自定义的 Embedding API，写入 / 查询 Vectorize。
- `utils/sanitize.ts`：统一清洗输入，避免脏字符或 ID 过长。

`wrangler.toml` 内定义了 Vectorize/R2 绑定、开放 API URL、embedding 模型等。部署时可以在 Cloudflare Dashboard 配置自定义域名。

| 组件 | 技术栈 | 核心创新 | 主要职责 |
|------|--------|----------|----------|
| **Android 客户端** | Kotlin + Jetpack Compose + Room | 响应式UI + 本地缓存 | 用户界面、实时交互、离线支持 |
| **Cloudflare Worker** | TypeScript + itty-router | **混合记忆检索 + 动态提示词** | API 服务、AI 调用、记忆管理 |
| **向量数据库** | Cloudflare Vectorize | **多层记忆架构** | 日记向量化、语义检索、记忆关联 |
| **结构化存储** | Cloudflare D1 | 对话日志 + 日记管理 | 历史对话、日记条目、用户数据 |
| **文件存储** | Cloudflare R2 | 多媒体处理 | 图片、文档、附件存储 |
| **AI 服务** | AI大模型 + 向量模型 | **情感化对话 + 智能日记** | 自然语言生成、语义嵌入 |

---

## 6. 提示词与共享资源
1. 修改 `shared/prompts.json`。
2. 运行 `python scripts/sync_shared.py`，脚本会把同一份文件复制到：
   - `ATRI/app/src/main/assets/prompts.json`
   - `worker/src/config/prompts.json`
3. 重新构建 APP / 重新部署 Worker。

这样可以保证手机展示的提示词、后端实际使用的 prompt 永远一致，避免"看见 A 说 B"的情况。

---

## 7. 完整配置指南

### 7.0 前置准备
在开始之前，请确保你拥有以下内容：
- **Cloudflare 账号**（免费或付费）
- **OpenAI API Key** 或兼容的大模型服务（如 DeepSeek、阿里等）
- **Embedding API**（用于向量化，可用 OpenAI 的 embedding 服务）
- **Node.js 18+** 和 **Python 3.7+**
- **Android Studio**（用于构建 Android 客户端）

### 7.1 Cloudflare 资源创建与配置

#### 7.1.1 创建 D1 数据库
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages** → **D1**
3. 点击「创建数据库」，命名为 `atri_diary`（或你偏好的名称）
4. 创建后，在数据库详情页中记下 **Database ID**
5. 在「SQL 编辑器」中复制 `worker/db/schema.sql` 的所有内容并执行，建立表结构

#### 7.1.2 创建 Vectorize 索引
1. 进入 **Workers & Pages** → **Vectorize**
2. 点击「创建索引」，设置如下：
   - 名称：`atri-memories`
   - 维度数：`1536`（OpenAI embedding 维度）
   - 距离度量：`cosine`
3. 记下 **索引 ID**

#### 7.1.3 创建 R2 Bucket
1. 进入 **R2**
2. 点击「创建存储桶」，命名为 `atri-media`（或你偏好的名称）
3. 配置 CORS（如需跨域上传）：
   ```json
   [
     {
       "allowedOrigins": ["*"],
       "allowedMethods": ["GET", "PUT", "POST"],
       "allowedHeaders": ["*"]
     }
   ]
   ```
4. 记下 **Bucket 名称**

#### 7.1.4 获取账号信息
1. 进入 **账户设置** → **账户详情**
2. 记下 **账号 ID**（32 位字符串）

### 7.2 部署 Cloudflare Worker

#### 7.2.1 更新配置文件
编辑 `worker/wrangler.toml`，替换以下占位符：

```toml
account_id = "your-account-id"  # 替换为你的账号 ID
name = "atri-worker"             # Worker 名称，可自定义

[[d1_databases]]
binding = "DB"
database_name = "atri_diary"     # 替换为你创建的 D1 数据库名
database_id = "your-database-id" # 替换为你的 D1 ID

[[r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = "atri-media"       # 替换为你创建的 R2 Bucket 名

[[vectorize]]
binding = "VECTORIZE"
index_name = "atri-memories"     # 替换为你创建的 Vectorize 索引名
```

#### 7.2.2 安装依赖并登录
```bash
cd worker
npm install
```

#### 7.2.3 配置 API Key
```bash
# 设置 OpenAI API Key
npx wrangler secret put OPENAI_API_KEY
# 将你的 OpenAI API Key 粘贴并回车

# 设置 Embedding API Key（如使用 OpenAI）
npx wrangler secret put EMBEDDINGS_API_KEY
# 将你的 Embedding API Key 粘贴并回车

# （可选）如果使用非 OpenAI 的大模型服务
npx wrangler secret put OPENAI_API_URL
# 例如 https://api.deepseek.com/v1

# （可选）如果使用非 OpenAI 的向量服务
npx wrangler secret put EMBEDDINGS_API_URL
# 例如 https://your-embedding-service.com/v1
```

#### 7.2.4 同步提示词并部署
```bash
# 同步提示词到 Worker 配置
python ../scripts/sync_shared.py

# 部署到 Cloudflare
npm run deploy
```

部署成功后，你会看到类似的输出：
```
✨ Successfully published your Worker to:
https://atri-worker.<your-subdomain>.workers.dev
```

**记下这个 URL**，之后在 Android 客户端需要填入。

### 7.3 本地调试（可选）
如果想在本地调试 Worker，可以：
```bash
npm run dev
```

本地 dev 服务会运行在 `http://localhost:8787`。注意：
- 本地调试 **不能访问** Vectorize、R2、D1（需要加 `--remote` 标志）
- 如需调用云端资源，运行：`npm run dev -- --remote`

### 7.4 构建 Android 客户端

#### 7.4.1 同步提示词
```bash
cd ATRI
python ../scripts/sync_shared.py
```

#### 7.4.2 编译 APK（Debug 版本）
```bash
./gradlew assembleDebug  # Windows: .\gradlew.bat assembleDebug
```

APK 会生成在 `ATRI/app/build/outputs/apk/debug/app-debug.apk`

#### 7.4.3 或在 Android Studio 中运行
1. 用 Android Studio 打开 `ATRI/` 目录
2. 等待 Gradle 同步完成
3. 点击「Run」或按 `Shift + F10`，选择目标设备或模拟器

### 7.5 Android 客户端配置

#### 7.5.1 首次启动
1. 安装 APK 或在 Android Studio 中运行 App
2. 首次进入时会要求填写**昵称**（可自定义，如"阿栖"）
3. 点击「下一步」进入聊天界面

#### 7.5.2 填写 Worker URL
1. 点击右下角**设置**按钮（⚙️）
2. 在「Worker 地址」字段填入你的 Worker URL，例如：
   ```
   https://atri-worker.<your-subdomain>.workers.dev
   ```
   或你绑定的自定义域名，例如：
   ```
   https://atri.example.com
   ```
   > ⚠️ 必须使用 **HTTPS** 协议
3. 点击「保存」

#### 7.5.3 验证连接
1. 返回聊天界面
2. 尝试发送一条消息，例如「你好」
3. 如果 Worker 返回了 AI 的回复，说明连接成功！

#### 7.5.4 使用日记功能
1. 点击底部「日记」标签
2. 与 ATRI 对话若干条消息
3. 点击「立即生成日记」按钮
4. 等待约 10-30 秒，日记生成完成后会显示在列表中

#### 7.5.5 清空记忆
如果想"遗忘"旧的对话记录，在设置页面点击「清空所有数据」：
- 会删除本地所有聊天记录和日记
- 自动生成新的 userId
- 之后的对话会以全新身份开始

### 7.6 生产环境部署建议

#### 7.6.1 绑定自定义域名
1. 在 Cloudflare Dashboard 的 **Workers & Pages** 中找到 `atri-worker`
2. 点击「设置」→「自定义域」
3. 输入你的域名（需要通过 Cloudflare 管理），例如 `atri.example.com`
4. 配置 DNS 记录指向 Cloudflare

#### 7.6.2 启用安全控制（可选）
如果担心接口被滥用，可以：
- 为 Worker 添加 API Key 校验
- 使用 Cloudflare Access 限制访问源
- 设置速率限制规则

#### 7.6.3 监控与告警
- 使用 `wrangler tail` 查看实时日志
- 在 Cloudflare Dashboard 的「Analytics」标签监控请求
- 配置 webhook 在错误时发送告警（可集成钉钉、飞书等）

---

## 8. API 简表
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

## 9. 常见问题 & 当前限制
1. **为什么日记 200 但 Vectorize 没有记录？**
   生成后还需调用 `/diary/index`。APP 已自动调用，但如果你用 curl 只调生成接口，就不会写入记忆。

2. **我想在后台看到 APP 写入的记忆，结果查不到？**
   APP 默认使用 DataStore 里自动生成的 `userId`，只要不清空记忆就会一直沿用。如果你在后台用其他 ID 查询，就看不到这位用户的记录；如需重新开始，可在设置页点击"清空记忆"，系统会换一个全新的 ID。

3. **能否自动推送 / 自动生成日记？**
   当前没有。之前依赖 Android 本地定时任务，已被移除。若要真正云端自动化，需要：
   - 定时把当天聊天记录上传；
   - 在 Cloudflare 侧接 Cron Trigger 或自建服务调用 `/diary/generate`；
   - 增加云端存储与同步接口；
   - 在 APP 里实现"从云端同步日记"。

4. **向量检索不到结果？**
   检查 `EMBEDDINGS_API_KEY` 与 `EMBEDDINGS_API_URL` 是否填写正确，并确认 Cloudflare Worker 能访问你选择的向量服务。遇到报错可在日志中搜索 `Embeddings API error`。

5. **提示词修改没生效？**
   是否运行了 `scripts/sync_shared.py`？若没同步，APP 和 Worker 读到的还是旧版本。

**"其实呢，我现在心跳得好快…这就是喜欢吗？"**

---

## 10. 后续规划建议
- ✅（已完成）移除本地推送，避免"看似会提醒，实际没有"。
- ⏳ 建议补上"云端同步日记"的接口与数据库，才能真正做到多设备共用。
- ⏳ 若需要自动提醒，考虑 Cloudflare Cron + 外部推送服务，或集成国内厂商推送 SDK。
- ⏳ 编写端到端测试（对 `/chat`、`/diary/index` 等）保证改动后行为一致。

---

## 11. 开发者速查
- 运行 Lint：`./gradlew lint`
- 运行单元测试：`./gradlew test`
- 清理构建：`./gradlew clean`
- Worker 本地调试：`cd worker && npm run dev`（注意：本地 dev 无 Vectorize 绑定，向量操作需 `--remote`）

如需贡献新的模块或修复，请优先更新 `shared/prompts.json`、编写 README 中提到的步骤，并在 PR 内说明测试方式。

---

## 📋 技术文档

想要深入了解系统的技术架构、数据流向、API接口详情和二次开发指南，请查看完整的技术蓝图文档：

**[📖 技术架构蓝图 (TECH_ARCHITECTURE_BLUEPRINT.md)](./TECH_ARCHITECTURE_BLUEPRINT.md)**

该文档包含：
- 🏗️ 系统架构与数据流设计
- 🔌 完整的API接口文档
- 💾 数据模型与存储策略
- 🛠️ 部署指南与环境配置
- 🔧 二次开发与扩展方法
- 📊 性能优化与安全建议

---

# 🚀 ATRI

**我是高性能哒**
