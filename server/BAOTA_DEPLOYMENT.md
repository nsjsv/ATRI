# 宝塔面板 Docker 部署指南

## 快速解决你朋友遇到的问题

### 问题 1：OpenResty/Lua 错误

```
failed to load the 'resty.core' module
```

**根本原因**：宝塔的 Nginx 配置中包含了 Lua 相关指令，但系统安装的是普通 Nginx（不是 OpenResty）。

**解决方法（3 选 1）**：

#### 方法 A：删除 Lua 配置（推荐）

1. 登录宝塔面板
2. 点击 "软件商店" -> "已安装" -> 找到 "Nginx"
3. 点击 "设置" -> "配置修改"
4. 搜索并删除所有包含以下关键词的行：
   - `lua_`
   - `resty.core`
   - `content_by_lua`
   - `access_by_lua`
   - `init_by_lua`
5. 保存并重启 Nginx

#### 方法 B：卸载 Nginx 重装（彻底解决）

```bash
# SSH 登录 VPS，执行以下命令
cd /www/server/panel/plugin/nginx
./install.sh uninstall

# 重新安装纯净版 Nginx
./install.sh install
```

#### 方法 C：使用宝塔的反向代理功能（最简单）

不要手动修改 Nginx 配置，直接使用宝塔的界面添加反向代理（见下文详细步骤）。

---

### 问题 2：404 错误

```json
{"statusCode":404, "msg":"request completed"}
```

**根本原因**：请求到达了 API 服务，但路径不匹配。

**解决方法**：

#### 检查 Docker 服务是否正常

```bash
# SSH 登录 VPS
cd /www/wwwroot/atri-server  # 或你的项目路径

# 检查容器状态
docker-compose ps
# 应该看到 api 和 db 都是 Up 状态

# 测试健康检查端点
curl http://localhost:3111/health
# 应该返回: {"ok":true}
```

如果健康检查失败，检查日志：
```bash
docker-compose logs api
```

#### 检查反向代理配置

**正确的反向代理配置应该是：**

```nginx
location / {
    proxy_pass http://127.0.0.1:3111;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

**常见错误配置：**

```nginx
# ❌ 错误 1：多余的路径
location / {
    proxy_pass http://127.0.0.1:3111/api;  # 不要加 /api
}

# ❌ 错误 2：缺少 Headers
location / {
    proxy_pass http://127.0.0.1:3111;
    # 缺少 proxy_set_header 会导致问题
}

# ❌ 错误 3：路径匹配错误
location /api/ {  # 如果只代理 /api/ 路径，其他请求会 404
    proxy_pass http://127.0.0.1:3111;
}
```

---

## 宝塔面板完整部署步骤

### 第一步：安装 Docker

1. 登录宝塔面板
2. 点击 "软件商店" -> 搜索 "Docker"
3. 安装 "Docker 管理器" 和 "Docker Compose 管理器"

或者通过 SSH 手动安装：

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | bash
systemctl start docker
systemctl enable docker

# 验证安装
docker --version
docker-compose --version
```

### 第二步：上传项目文件

1. 在宝塔面板 "文件" 中创建目录：`/www/wwwroot/atri-server`
2. 上传整个 `server` 目录的所有文件到该目录
3. 或使用 SSH：
   ```bash
   cd /www/wwwroot
   git clone <你的仓库地址> atri-server
   # 或者用 scp 上传
   ```

### 第三步：配置环境变量

1. 在宝塔文件管理器中找到 `/www/wwwroot/atri-server/.env.example`
2. 复制为 `.env`
3. 编辑 `.env`，修改以下必填项：

```env
# 生成强密码（在 SSH 执行）
openssl rand -hex 32

# 然后填入配置：
APP_TOKEN=<刚生成的随机字符串>
POSTGRES_PASSWORD=<数据库密码，不要用默认的>
DATABASE_URL=postgres://atri:<数据库密码>@db:5432/atri

# 聊天上游 API（必填；只填到 /v1 之前，后台会自动补全版本路径）
OPENAI_API_URL=https://api.openai.com
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx

# Embedding API（必填）
EMBEDDINGS_API_URL=https://api.siliconflow.cn/v1
EMBEDDINGS_API_KEY=sk-xxxxxxxxxxxxxxxx
EMBEDDINGS_MODEL=BAAI/bge-m3
```

### 第四步：启动 Docker 服务

在宝塔终端（或 SSH）执行：

```bash
cd /www/wwwroot/atri-server

# 创建数据目录
mkdir -p data/postgres data/media data/import

# 启动服务（首次会拉取镜像，需要几分钟）
docker-compose up -d

# 查看启动日志
docker-compose logs -f
```

等待看到类似输出：
```
api-1  | [ATRI] server started
db-1   | database system is ready to accept connections
```

按 `Ctrl+C` 退出日志查看。

### 第五步：配置宝塔反向代理

#### 方法 1：使用宝塔界面（推荐）

1. **添加网站**
   - 点击 "网站" -> "添加站点"
   - 域名：`atri.yourdomain.com`（或你的域名）
   - 根目录：`/www/wwwroot/atri-server`（可以随便选）
   - PHP 版本：选择 "纯静态"
   - 点击 "提交"

2. **配置反向代理**
   - 点击刚创建的网站 -> "设置" -> "反向代理"
   - 点击 "添加反向代理"
   - 填写配置：
     ```
     代理名称：ATRI API
     目标 URL：http://127.0.0.1:3111
     发送域名：$host
     ```
   - 点击 "提交"

3. **修改配置文件（重要！）**
   - 点击刚创建的代理旁边的 "配置文件" 按钮
   - 在 `location /` 块中添加以下内容：
     ```nginx
     location / {
         proxy_pass http://127.0.0.1:3111;
         proxy_http_version 1.1;

         # WebSocket 支持
         proxy_set_header Upgrade $http_upgrade;
         proxy_set_header Connection "upgrade";

         # 转发真实信息
         proxy_set_header Host $host;
         proxy_set_header X-Real-IP $remote_addr;
         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
         proxy_set_header X-Forwarded-Proto $scheme;

         # 超时设置
         proxy_connect_timeout 60s;
         proxy_send_timeout 60s;
         proxy_read_timeout 60s;

         # 文件上传大小
         client_max_body_size 50M;
     }
     ```
   - 保存

4. **配置 SSL（可选但推荐）**
   - 点击网站 "设置" -> "SSL"
   - 选择 "Let's Encrypt"
   - 输入邮箱，勾选域名
   - 点击 "申请"

5. **测试访问**
   ```bash
   curl https://atri.yourdomain.com/health
   # 应该返回: {"ok":true}
   ```

#### 方法 2：手动修改配置文件

如果宝塔界面配置不生效，手动修改：

1. 找到网站配置文件：`/www/server/panel/vhost/nginx/<你的域名>.conf`
2. 替换为以下内容（参考 `nginx.conf.example`）：

```nginx
server {
    listen 80;
    server_name atri.yourdomain.com;  # 改成你的域名

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3111;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

3. 保存后重启 Nginx：
   ```bash
   nginx -t  # 测试配置
   nginx -s reload  # 重启
   ```

---

## 故障排查清单

### 1. 容器无法启动

```bash
# 查看日志
docker-compose logs

# 常见原因：
# - 端口冲突（3111 或 5432 已被占用）
# - 环境变量配置错误
# - 磁盘空间不足
```

**解决**：
```bash
# 检查端口占用
netstat -tlnp | grep 3111
netstat -tlnp | grep 5432

# 如果被占用，停止占用进程或修改 docker-compose.yml 中的端口
```

### 2. 数据库初始化失败

```bash
# 查看数据库日志
docker-compose logs db

# 如果看到权限错误或初始化失败
# 删除数据目录重新初始化：
docker-compose down
rm -rf data/postgres
mkdir -p data/postgres
docker-compose up -d
```

### 3. API 返回 500 错误

```bash
# 查看 API 日志
docker-compose logs api

# 常见原因：
# - 数据库连接失败（检查 DATABASE_URL）
# - API Key 配置错误
# - 内存不足
```

### 4. Nginx 502 Bad Gateway

```bash
# 原因：Docker 服务未启动或端口不对
docker-compose ps  # 检查容器状态
curl http://localhost:3111/health  # 直接测试

# 如果 Docker 服务正常但 Nginx 502：
# 检查防火墙是否阻止了本地回环
```

### 5. 宝塔面板访问慢或卡顿

```bash
# Docker 日志过大导致
du -sh /www/wwwroot/atri-server/data

# 清理日志（慎用）
docker-compose down
rm -rf /var/lib/docker/containers/*/*-json.log
docker-compose up -d
```

---

## 安全加固

### 1. 修改数据库端口（不对外暴露）

编辑 `docker-compose.yml`：

```yaml
db:
  ports:
    - "127.0.0.1:5432:5432"  # 只监听本地
```

### 2. 配置宝塔防火墙

1. 宝塔面板 -> "安全"
2. 只开放必要端口：
   - 22 (SSH)
   - 80 (HTTP)
   - 443 (HTTPS)
   - 8888 (宝塔面板，建议改成其他端口)

### 3. 启用 IP 访问限制

如果只给特定 IP 访问，在 Nginx 配置中添加：

```nginx
location / {
    allow 1.2.3.4;  # 允许的 IP
    deny all;       # 拒绝其他所有

    proxy_pass http://127.0.0.1:3111;
    # ... 其他配置
}
```

### 4. 配置自动备份

在宝塔面板 "计划任务" 中添加：

```bash
#!/bin/bash
# 每天凌晨 2 点备份数据库
cd /www/wwwroot/atri-server
docker-compose exec -T db pg_dump -U atri atri | gzip > /www/backup/atri_$(date +\%Y\%m\%d).sql.gz
# 只保留最近 7 天的备份
find /www/backup -name "atri_*.sql.gz" -mtime +7 -delete
```

---

## 更新和维护

### 更新代码

```bash
cd /www/wwwroot/atri-server

# 备份当前配置
cp .env .env.backup
cp docker-compose.yml docker-compose.yml.backup

# 拉取新代码（如果使用 git）
git pull

# 或重新上传文件（通过宝塔文件管理器）

# 重新构建并启动
docker-compose down
docker-compose up -d --build
```

### 查看资源占用

在宝塔面板 "监控" 中查看，或使用命令：

```bash
docker stats  # 实时查看容器资源占用
df -h         # 磁盘使用
free -h       # 内存使用
```

### 清理无用数据

```bash
# 清理 Docker 缓存
docker system prune -a

# 清理旧日志
truncate -s 0 /var/log/nginx/*.log
```

---

## 总结

针对你朋友遇到的问题：

1. **OpenResty 错误**：使用宝塔界面的反向代理功能，不要手动添加 Lua 配置
2. **404 错误**：确保反向代理配置为 `proxy_pass http://127.0.0.1:3111;`，不要加额外路径
3. **健康检查**：部署后先测试 `curl http://localhost:3111/health`

如果仍有问题，请提供：
- `docker-compose ps` 输出
- `docker-compose logs` 输出
- Nginx 配置文件内容
