# VPS Docker 部署完整指南

## 环境要求

- Ubuntu 20.04/22.04 或 Debian 11/12
- Docker 和 Docker Compose
- 至少 1GB RAM，2GB 推荐
- 开放端口：80, 443（可选：3111 用于测试）

---

## 方案一：宝塔面板部署（推荐小白用户）

### 1. 安装 Docker（在宝塔终端执行）

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | bash

# 启动 Docker
systemctl start docker
systemctl enable docker

# 安装 Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
```

### 2. 上传项目文件

将 `server` 目录完整上传到 VPS，例如：`/www/wwwroot/atri-server`

### 3. 配置环境变量

```bash
cd /www/wwwroot/atri-server
cp .env.example .env
nano .env  # 或使用宝塔的文件管理器编辑
```

**必须修改的配置：**
```env
# 鉴权 Token（使用强密码）
APP_TOKEN=请生成一个复杂的随机字符串

# 数据库密码（修改默认密码）
POSTGRES_PASSWORD=你的数据库密码
DATABASE_URL=postgres://atri:你的数据库密码@db:5432/atri

# 聊天上游 API（必填；只填到 /v1 之前，后台会自动补全版本路径）
OPENAI_API_URL=https://api.openai.com
OPENAI_API_KEY=你的API密钥

# Embedding API（必填）
EMBEDDINGS_API_URL=https://api.siliconflow.cn/v1
EMBEDDINGS_API_KEY=你的API密钥
EMBEDDINGS_MODEL=BAAI/bge-m3
```

### 4. 启动服务

```bash
cd /www/wwwroot/atri-server

# 创建数据目录
mkdir -p data/postgres data/media data/import

# 启动服务（首次会拉取镜像，需要等待）
docker-compose up -d

# 查看日志（确认启动成功）
docker-compose logs -f
```

### 5. 配置宝塔反向代理

#### 方法 A：使用宝塔界面（推荐）

1. 打开宝塔面板 -> 网站 -> 添加站点
2. 域名：填写你的域名（如 `atri.yourdomain.com`）
3. 根目录：随便选一个（不重要）
4. PHP 版本：纯静态
5. 创建后，点击"设置" -> "反向代理"
6. 添加反向代理：
   - 代理名称：ATRI API
   - 目标 URL：`http://127.0.0.1:3111`
   - 发送域名：`$host`
   - 内容替换：留空
   - **高级设置**：复制以下配置

```nginx
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
client_max_body_size 50M;
```

7. 保存后，在"SSL" -> "Let's Encrypt" 申请免费证书

#### 方法 B：手动修改配置文件

找到宝塔 Nginx 配置文件（通常在 `/www/server/panel/vhost/nginx/`），参考 `nginx.conf.example`。

**关键点：不要使用任何 Lua 相关指令！**

### 6. 测试部署

```bash
# 测试健康检查
curl http://localhost:3111/health
# 应该返回: {"ok":true}

# 通过域名测试
curl https://你的域名/health
```

### 7. 常见问题排查

#### 问题 1：OpenResty/Lua 错误

**原因**：宝塔 Nginx 配置中包含了 Lua 相关指令

**解决**：
1. 打开网站配置文件
2. 删除所有包含 `lua_`、`resty.core` 的行
3. 重启 Nginx：`nginx -s reload`

#### 问题 2：404 错误

**原因**：反向代理路径配置错误

**解决**：
1. 确认 Docker 服务运行正常：`docker-compose ps`
2. 确认端口 3111 监听正常：`netstat -tlnp | grep 3111`
3. 检查 Nginx 反向代理配置：`proxy_pass http://127.0.0.1:3111;`
4. 确保路径匹配：`location / { ... }` 会代理所有请求

#### 问题 3：数据库连接失败

```bash
# 检查数据库容器状态
docker-compose logs db

# 进入数据库测试
docker-compose exec db psql -U atri -d atri -c "\dt"
```

#### 问题 4：容器无法启动

```bash
# 查看详细日志
docker-compose logs --tail=100

# 重建容器
docker-compose down
docker-compose up -d --build
```

---

## 方案二：纯 SSH 命令行部署

### 1. 安装 Docker

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | bash
systemctl start docker
systemctl enable docker

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. 上传项目

```bash
# 在本地压缩项目
cd E:\ATRI
tar -czf server.tar.gz server/

# 上传到 VPS（替换为你的 IP）
scp server.tar.gz root@your-vps-ip:/root/

# 在 VPS 上解压
ssh root@your-vps-ip
cd /root
tar -xzf server.tar.gz
cd server
```

### 3. 配置并启动

```bash
# 复制环境变量
cp .env.example .env
nano .env  # 修改必填项

# 创建数据目录
mkdir -p data/postgres data/media data/import

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 4. 安装 Nginx（可选，如果需要域名访问）

```bash
# 安装 Nginx
apt update
apt install -y nginx

# 创建配置文件
nano /etc/nginx/sites-available/atri
```

复制 `nginx.conf.example` 的内容，修改域名。

```bash
# 启用站点
ln -s /etc/nginx/sites-available/atri /etc/nginx/sites-enabled/
nginx -t  # 测试配置
systemctl reload nginx
```

### 5. 配置 SSL（推荐）

```bash
# 安装 Certbot
apt install -y certbot python3-certbot-nginx

# 申请证书（替换为你的域名和邮箱）
certbot --nginx -d your-domain.com -m your-email@example.com --agree-tos
```

---

## 维护命令

```bash
# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f api
docker-compose logs -f db

# 重启服务
docker-compose restart

# 停止服务
docker-compose down

# 更新代码后重新部署
docker-compose down
docker-compose up -d --build

# 备份数据库
docker-compose exec db pg_dump -U atri atri > backup_$(date +%Y%m%d).sql

# 清理旧容器和镜像
docker system prune -a
```

---

## 安全建议

1. **修改默认端口**：在 docker-compose.yml 中将 `5432:5432` 改为 `127.0.0.1:5432:5432`（数据库不对外暴露）
2. **使用强密码**：所有 Token、API Key、数据库密码都使用强随机字符串
3. **启用防火墙**：
   ```bash
   ufw allow 22/tcp
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw enable
   ```
4. **定期备份**：设置 cron 任务定期备份数据库和媒体文件
5. **配置 HTTPS**：生产环境必须使用 HTTPS

---

## 性能优化

1. **调整数据库连接池**：如果并发量大，修改 PostgreSQL 配置
2. **启用 Gzip 压缩**：在 Nginx 配置中启用
3. **配置 CDN**：媒体文件使用 CDN 加速
4. **增加内存**：pgvector 向量搜索需要足够内存

---

## 监控建议

```bash
# 查看容器资源占用
docker stats

# 查看磁盘使用
df -h
du -sh data/*

# 查看日志大小
docker-compose logs --tail=0 --timestamps | wc -l
```
