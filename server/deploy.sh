#!/bin/bash
# ============================================================
# ATRI Server 一键部署脚本
# 适用于：Ubuntu 20.04/22.04, Debian 11/12
# ============================================================

set -e

# 颜色
R='\033[0;31m'
G='\033[0;32m'
Y='\033[1;33m'
B='\033[0;34m'
C='\033[0;36m'
N='\033[0m'

print_banner() {
    echo -e "${C}"
    echo "    _  _____ ____  ___ "
    echo "   / \|_   _|  _ \|_ _|"
    echo "  / _ \ | | | |_) || | "
    echo " / ___ \| | |  _ < | | "
    echo "/_/   \_\_| |_| \_\___|"
    echo ""
    echo -e "${N}ATRI Server 部署脚本 v1.0"
    echo "=========================================="
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo -e "${R}请使用 root 用户运行此脚本${N}"
        echo "sudo bash deploy.sh"
        exit 1
    fi
}

check_system() {
    echo -e "${B}[1/7] 检测系统环境...${N}"
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        echo "  系统: $NAME $VERSION_ID"
    fi

    # 检查内存
    MEM=$(free -m | awk '/^Mem:/{print $2}')
    if [ "$MEM" -lt 900 ]; then
        echo -e "${Y}  警告: 内存 ${MEM}MB，建议至少 1GB${N}"
    else
        echo -e "${G}  内存: ${MEM}MB${N}"
    fi

    # 检查磁盘
    DISK=$(df -m / | awk 'NR==2{print $4}')
    if [ "$DISK" -lt 5000 ]; then
        echo -e "${Y}  警告: 磁盘剩余 ${DISK}MB，建议至少 5GB${N}"
    else
        echo -e "${G}  磁盘: ${DISK}MB 可用${N}"
    fi
}

install_docker() {
    echo -e "${B}[2/7] 安装 Docker...${N}"

    if command -v docker &> /dev/null; then
        echo -e "${G}  Docker 已安装: $(docker --version)${N}"
    else
        echo "  正在安装 Docker..."
        curl -fsSL https://get.docker.com | bash
        systemctl start docker
        systemctl enable docker
        echo -e "${G}  Docker 安装完成${N}"
    fi

    if command -v docker-compose &> /dev/null; then
        echo -e "${G}  Docker Compose 已安装${N}"
    else
        echo "  正在安装 Docker Compose..."
        curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
            -o /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose
        echo -e "${G}  Docker Compose 安装完成${N}"
    fi
}

setup_project() {
    echo -e "${B}[3/7] 准备项目文件...${N}"

    # 创建数据目录
    mkdir -p data/postgres data/media data/import
    chmod -R 755 data

    echo -e "${G}  数据目录已创建${N}"
}

generate_secrets() {
    echo -e "${B}[4/7] 生成安全密钥...${N}"

    APP_TOKEN=$(openssl rand -hex 24)
    DB_PASSWORD=$(openssl rand -hex 16)
    ADMIN_KEY=$(openssl rand -hex 24)
    ENCRYPT_KEY=$(openssl rand -base64 32)
    MEDIA_KEY=$(openssl rand -hex 16)

    echo -e "${G}  密钥生成完成${N}"
}

configure_env() {
    echo -e "${B}[5/7] 配置环境变量...${N}"

    if [ -f ".env" ]; then
        echo -e "${Y}  .env 已存在，跳过生成${N}"
        return
    fi

    cat > .env << EOF
# ATRI Server 配置
# 由部署脚本自动生成于 $(date)

# ===== 鉴权 =====
APP_TOKEN=${APP_TOKEN}

# ===== 数据库 =====
POSTGRES_USER=atri
POSTGRES_PASSWORD=${DB_PASSWORD}
POSTGRES_DB=atri
DATABASE_URL=postgres://atri:${DB_PASSWORD}@db:5432/atri

# ===== 聊天 API（必填）=====
# OpenAI 兼容接口
OPENAI_API_URL=
OPENAI_API_KEY=

# ===== Embedding API（必填）=====
EMBEDDINGS_API_URL=https://api.siliconflow.cn/v1
EMBEDDINGS_API_KEY=
EMBEDDINGS_MODEL=BAAI/bge-m3

# ===== 可选配置 =====
DIARY_API_URL=
DIARY_API_KEY=
DIARY_MODEL=
TAVILY_API_KEY=

# ===== 媒体 =====
MEDIA_ROOT=/data/media
PUBLIC_BASE_URL=
MEDIA_SIGNING_KEY=${MEDIA_KEY}

# ===== 管理后台 =====
ADMIN_API_KEY=${ADMIN_KEY}
ADMIN_CONFIG_ENCRYPTION_KEY=${ENCRYPT_KEY}
ADMIN_ALLOWED_IPS=

# ===== 服务 =====
HOST=0.0.0.0
PORT=3111
EOF

    chmod 600 .env
    echo -e "${G}  .env 配置文件已生成${N}"
    echo ""
    echo -e "${Y}  重要！请编辑 .env 填写以下必填项：${N}"
    echo "    - OPENAI_API_URL (聊天接口地址)"
    echo "    - OPENAI_API_KEY (聊天接口密钥)"
    echo "    - EMBEDDINGS_API_KEY (Embedding 接口密钥)"
    echo ""
}

start_services() {
    echo -e "${B}[6/7] 启动服务...${N}"

    docker-compose pull
    docker-compose up -d

    echo "  等待服务启动..."
    sleep 8

    # 检查健康状态
    if curl -s http://localhost:3111/health | grep -q "ok"; then
        echo -e "${G}  服务启动成功${N}"
    else
        echo -e "${Y}  服务可能仍在启动，请稍后检查${N}"
    fi
}

print_result() {
    echo -e "${B}[7/7] 部署完成${N}"
    echo ""
    echo "=========================================="
    echo -e "${G}ATRI Server 部署成功！${N}"
    echo "=========================================="
    echo ""
    echo "访问地址:"
    echo "  本地测试: http://localhost:3111/health"
    echo "  管理后台: http://localhost:3111/admin"
    echo ""
    echo "重要凭证 (请妥善保存):"
    echo "  APP_TOKEN: ${APP_TOKEN}"
    echo "  ADMIN_API_KEY: ${ADMIN_KEY}"
    echo "  数据库密码: ${DB_PASSWORD}"
    echo ""
    echo "下一步:"
    echo "  1. 编辑 .env 填写 API 密钥"
    echo "  2. 重启服务: docker-compose restart"
    echo "  3. 配置 Nginx 反向代理 + SSL"
    echo ""
    echo "常用命令:"
    echo "  查看日志: docker-compose logs -f"
    echo "  重启服务: docker-compose restart"
    echo "  停止服务: docker-compose down"
    echo "  故障诊断: bash diagnose.sh"
    echo ""
}

# 主流程
print_banner
check_root
check_system
install_docker
setup_project
generate_secrets
configure_env
start_services
print_result
