#!/bin/bash

# ATRI Server 故障诊断脚本
# 用于快速检查部署状态和常见问题

echo "========================================="
echo "ATRI Server 故障诊断工具"
echo "========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否在正确的目录
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}错误：请在项目根目录运行此脚本${NC}"
    exit 1
fi

echo "1. 检查 Docker 安装..."
if command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
    echo -e "${GREEN}✓ Docker 已安装${NC}"
    docker --version
    docker-compose --version
else
    echo -e "${RED}✗ Docker 或 Docker Compose 未安装${NC}"
    echo "请先安装 Docker: curl -fsSL https://get.docker.com | bash"
    exit 1
fi
echo ""

echo "2. 检查环境变量配置..."
if [ -f ".env" ]; then
    echo -e "${GREEN}✓ .env 文件存在${NC}"

    # 检查必填项
    if grep -q "^APP_TOKEN=" .env && [ -n "$(grep '^APP_TOKEN=' .env | cut -d'=' -f2)" ]; then
        echo -e "${GREEN}  ✓ APP_TOKEN 已配置${NC}"
    else
        echo -e "${RED}  ✗ APP_TOKEN 未配置${NC}"
    fi

    if grep -q "^OPENAI_API_KEY=" .env && [ -n "$(grep '^OPENAI_API_KEY=' .env | cut -d'=' -f2)" ]; then
        echo -e "${GREEN}  ✓ OPENAI_API_KEY 已配置${NC}"
    else
        echo -e "${YELLOW}  ! OPENAI_API_KEY 未配置（可能影响功能）${NC}"
    fi

    if grep -q "^EMBEDDINGS_API_KEY=" .env && [ -n "$(grep '^EMBEDDINGS_API_KEY=' .env | cut -d'=' -f2)" ]; then
        echo -e "${GREEN}  ✓ EMBEDDINGS_API_KEY 已配置${NC}"
    else
        echo -e "${YELLOW}  ! EMBEDDINGS_API_KEY 未配置（可能影响功能）${NC}"
    fi
else
    echo -e "${RED}✗ .env 文件不存在${NC}"
    echo "请复制 .env.example 为 .env 并配置"
    exit 1
fi
echo ""

echo "3. 检查数据目录..."
for dir in data/postgres data/media data/import; do
    if [ -d "$dir" ]; then
        echo -e "${GREEN}✓ $dir 存在${NC}"
    else
        echo -e "${YELLOW}! $dir 不存在，将自动创建${NC}"
        mkdir -p "$dir"
    fi
done
echo ""

echo "4. 检查容器状态..."
if docker-compose ps | grep -q "Up"; then
    echo -e "${GREEN}✓ 容器正在运行${NC}"
    docker-compose ps
else
    echo -e "${RED}✗ 容器未运行${NC}"
    echo "尝试启动容器..."
    docker-compose up -d
fi
echo ""

echo "5. 检查服务健康状态..."
echo "等待 5 秒让服务启动..."
sleep 5

# 检查数据库
if docker-compose exec -T db pg_isready -U atri &> /dev/null; then
    echo -e "${GREEN}✓ 数据库连接正常${NC}"
else
    echo -e "${RED}✗ 数据库连接失败${NC}"
    echo "查看数据库日志："
    docker-compose logs --tail=20 db
fi

# 检查 API
if curl -s http://localhost:3111/health | grep -q "ok"; then
    echo -e "${GREEN}✓ API 服务正常${NC}"
    echo "  健康检查响应: $(curl -s http://localhost:3111/health)"
else
    echo -e "${RED}✗ API 服务异常${NC}"
    echo "查看 API 日志："
    docker-compose logs --tail=20 api
fi
echo ""

echo "6. 检查端口占用..."
if netstat -tlnp 2>/dev/null | grep -q ":3111"; then
    echo -e "${GREEN}✓ 端口 3111 已监听${NC}"
    netstat -tlnp | grep ":3111"
else
    echo -e "${RED}✗ 端口 3111 未监听${NC}"
fi

if netstat -tlnp 2>/dev/null | grep -q ":5432"; then
    echo -e "${GREEN}✓ 端口 5432 已监听${NC}"
else
    echo -e "${YELLOW}! 端口 5432 未监听（可能配置为仅本地访问）${NC}"
fi
echo ""

echo "7. 检查磁盘空间..."
df -h | grep -E "Filesystem|/$"
echo ""

echo "8. 检查内存使用..."
free -h
echo ""

echo "9. 检查容器资源占用..."
docker stats --no-stream
echo ""

echo "10. 检查最近的日志..."
echo "=== API 日志（最近 10 行）==="
docker-compose logs --tail=10 api
echo ""
echo "=== DB 日志（最近 10 行）==="
docker-compose logs --tail=10 db
echo ""

echo "========================================="
echo "诊断完成！"
echo "========================================="
echo ""
echo "常见问题解决："
echo "1. 容器未运行：docker-compose up -d"
echo "2. 查看完整日志：docker-compose logs -f"
echo "3. 重启服务：docker-compose restart"
echo "4. 重建服务：docker-compose down && docker-compose up -d --build"
echo "5. 清理并重启：docker-compose down && rm -rf data/postgres && docker-compose up -d"
echo ""
echo "如果问题仍未解决，请将本诊断结果发送给技术支持。"
