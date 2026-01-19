# 1Panel 部署指南

本文档记录了使用 1Panel 面板部署 ATRI 后端的完整步骤和注意事项。

## 环境要求

- 已安装 1Panel 面板的 Linux 服务器
- Docker 和 Docker Compose（1Panel 通常已内置）
- 至少 1GB RAM，2GB 推荐
- 开放端口：3111（API 服务）

---

## 部署步骤

### 1. 上传项目文件

将 `server` 目录上传到服务器，例如通过 1Panel 的文件管理器上传到：
```
/opt/1panel/docker/compose/atri-server/
```

或任意目录，只要后续创建编排时选择该目录即可。

### 2. 在 1Panel 创建编排

1. 进入 1Panel 面板 → **容器** → **编排**
2. 点击 **创建编排**
3. 选择 **本地编排**（如果已上传文件）或 **编辑器**（粘贴 compose 内容）
4. 选择项目所在目录

### 3. 配置环境变量（关键步骤）

在编排编辑界面，你会看到：
- **docker-compose.yml 编辑器**（主编辑区）
- **环境变量** 文本框
- **env_file 引用** 编辑器

#### 3.1 设置环境变量

在「环境变量」文本框中填入（每行一个 KEY=VALUE）：

```env
APP_TOKEN=你的鉴权令牌
OPENAI_API_URL=https://your-api-provider.com
OPENAI_API_KEY=sk-xxxxxx
EMBEDDINGS_API_KEY=sk-yyyyyy
```

这些值会被保存到 `1panel.env` 文件中。

#### 3.2 修改 docker-compose.yml（重要！）

**问题背景**：docker-compose.yml 中的 `${VAR:-}` 语法会在 compose 解析时从宿主机环境读取变量，如果未设置则使用空字符串作为默认值。这会**覆盖** env_file 中的值。

**解决方案**：

1. 在 api 服务的 `depends_on` 之后、`environment` 之前，添加 `env_file` 引用：

```yaml
  api:
    build: .
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    env_file:                    # <-- 添加这两行
      - 1panel.env               # <-- 添加这两行
    environment:
      # ...
```

2. 从 `environment` 部分**删除**以下带空默认值的行（因为它们会覆盖 env_file）：

```yaml
# 删除这些行：
APP_TOKEN: "${APP_TOKEN:-}"
OPENAI_API_URL: "${OPENAI_API_URL:-}"
OPENAI_API_KEY: "${OPENAI_API_KEY:-}"
EMBEDDINGS_API_KEY: "${EMBEDDINGS_API_KEY:-}"
```

**保留**其他有默认值的配置，如：
```yaml
DATABASE_URL: "${DATABASE_URL:-postgres://atri:114514@db:5432/atri}"
EMBEDDINGS_API_URL: "${EMBEDDINGS_API_URL:-https://api.siliconflow.cn/v1}"
EMBEDDINGS_MODEL: "${EMBEDDINGS_MODEL:-BAAI/bge-m3}"
```

### 4. 确认并启动

1. 点击「确认」保存配置
2. 1Panel 会自动重建容器
3. 等待容器状态变为「运行中 (2/2)」

### 5. 验证部署

```bash
# 测试健康检查
curl http://你的服务器IP:3111/health
# 应返回: {"ok":true}

# 测试鉴权（使用你设置的 APP_TOKEN）
curl http://你的服务器IP:3111/models -H "X-App-Token: 你的APP_TOKEN"
# 应返回模型列表
```

---

## 常见问题

### 问题 1：`{"error":"app_token_missing"}`

**原因**：环境变量未正确注入到容器中。

**排查步骤**：
1. 确认 `env_file: - 1panel.env` 已添加到 api 服务中
2. 确认 `APP_TOKEN: "${APP_TOKEN:-}"` 行已从 environment 部分删除
3. 确认环境变量文本框中有 `APP_TOKEN=xxx` 且值非空
4. 重新点击「确认」让容器重建

**原理解释**：
- `env_file` 会在容器运行时注入环境变量
- `environment` 部分的 `${VAR:-}` 语法在 compose 解析时就会被替换
- 如果宿主机没有设置该变量，`:-` 后面的空字符串会成为默认值
- 这个空字符串会**覆盖** env_file 中的同名变量

### 问题 2：数据库连接失败

```bash
# 在 1Panel 终端或 SSH 执行：
docker logs atri-server-db-1
docker logs atri-server-api-1
```

检查数据库是否健康启动，API 是否能连接数据库。

### 问题 3：容器一直重启

```bash
# 查看详细日志
docker logs atri-server-api-1 --tail 100
```

常见原因：
- 缺少必需的环境变量
- 数据库连接字符串错误
- 端口冲突

---

## 环境变量说明

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `APP_TOKEN` | 是 | - | 客户端鉴权令牌 |
| `OPENAI_API_URL` | 是 | - | OpenAI 兼容 API 地址 |
| `OPENAI_API_KEY` | 是 | - | API 密钥 |
| `EMBEDDINGS_API_URL` | 否 | `https://api.siliconflow.cn/v1` | 向量 API 地址 |
| `EMBEDDINGS_API_KEY` | 是 | - | 向量 API 密钥 |
| `EMBEDDINGS_MODEL` | 否 | `BAAI/bge-m3` | 向量模型名称 |
| `DATABASE_URL` | 否 | `postgres://atri:114514@db:5432/atri` | 数据库连接串 |
| `DIARY_API_URL` | 否 | 同 OPENAI_API_URL | 日记生成专用 API |
| `DIARY_API_KEY` | 否 | 同 OPENAI_API_KEY | 日记生成专用密钥 |
| `DIARY_MODEL` | 否 | - | 日记生成专用模型 |
| `TAVILY_API_KEY` | 否 | - | 联网搜索 API 密钥 |

---

## 部署经验总结

### 本次部署遇到的坑

1. **1Panel 的 env_file 不会自动添加到服务中**
   - 1Panel 界面底部有一个 `env_file:` 编辑器，但这只是个模板/提示
   - 你需要**手动**将 `env_file: - 1panel.env` 添加到 docker-compose.yml 的 api 服务中

2. **`${VAR:-}` 语法的陷阱**
   - 这个语法表示「如果 VAR 未设置或为空，使用 `:-` 后面的值作为默认值」
   - `${VAR:-}` 后面是空的，所以默认值是空字符串
   - 这会在 compose 解析阶段就被替换为空字符串，覆盖 env_file 的值
   - 解决方案：删除这些行，让 env_file 直接提供值

3. **environment 优先级高于 env_file**
   - Docker Compose 中，`environment` 部分的值会覆盖 `env_file` 的同名变量
   - 所以如果 `environment` 里设置了 `APP_TOKEN: ""`，即使 env_file 有值也会被覆盖

### 最佳实践

1. **敏感信息放 env_file**：API Key、Token 等敏感信息通过 env_file 注入
2. **有默认值的放 environment**：如 `DATABASE_URL`、`EMBEDDINGS_MODEL` 等
3. **不要在 environment 中设置空默认值**：要么给个有意义的默认值，要么直接删掉让 env_file 提供

---

## 安全建议

1. **不要在 docker-compose.yml 中硬编码密钥**
2. **使用强随机 APP_TOKEN**（建议 32 位以上）
3. **定期轮换 API Key**
4. **数据库端口不要暴露到公网**（当前配置已是 `127.0.0.1:5433:5432`）
5. **生产环境配置反向代理和 HTTPS**
