#!/usr/bin/env bash
# ==========================================================
# NhanHoaCaptcha 1-Click Deployment & Rapid Fallback Script
# ==========================================================
set -e

# Màu sắc thông báo
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}==========================================================${NC}"
echo -e "${BLUE}🚀 [NhanHoaCaptcha] Bắt đầu quy trình kiểm tra & triển khai...${NC}"
echo -e "${BLUE}==========================================================${NC}"

# ==========================================================
# 1. KIỂM TRA YÊU CẦU PHẦN CỨNG TỐI THIỂU (HARDWARE CHECKS)
# ==========================================================
echo -e "🔍 Đang kiểm tra cấu hình phần cứng & môi trường máy chủ..."

# 1.1. Kiểm tra Docker & Docker Compose
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Lỗi: Docker chưa được cài đặt trên máy chủ.${NC}"
    echo -e "💡 Vui lòng cài đặt Docker bằng lệnh: ${YELLOW}curl -fsSL https://get.docker.com | sh${NC}"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo -e "${RED}❌ Lỗi: Docker daemon chưa hoạt động hoặc user hiện tại không có quyền truy cập docker socket.${NC}"
    echo -e "💡 Vui lòng khởi động Docker (sudo systemctl start docker) hoặc thêm user vào group: ${YELLOW}sudo usermod -aG docker \$USER${NC}"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Lỗi: Docker Compose (V2 plugin) chưa được cài đặt.${NC}"
    echo -e "💡 Vui lòng cài đặt docker-compose-plugin hoặc cập nhật Docker.${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Docker & Docker Compose: ${GREEN}Đã sẵn sàng${NC}"

# 1.2. Kiểm tra CPU Cores (Tối thiểu 1 vCPU)
MIN_CPU_CORES=1
if command -v nproc &> /dev/null; then
    CPU_CORES=$(nproc)
else
    CPU_CORES=$(grep -c ^processor /proc/cpuinfo 2>/dev/null || echo 1)
fi

if [ "$CPU_CORES" -lt "$MIN_CPU_CORES" ]; then
    echo -e "  ${RED}❌ CPU: $CPU_CORES core (Yêu cầu tối thiểu $MIN_CPU_CORES core)${NC}"
    exit 1
else
    echo -e "  ${GREEN}✓${NC} CPU Cores: ${GREEN}$CPU_CORES core(s)${NC} (Tối thiểu: $MIN_CPU_CORES)"
fi

# 1.3. Kiểm tra RAM & Swap (Tối thiểu 1GB, Tối ưu 3GB+)
MIN_RAM_MB=950
if [ -f /proc/meminfo ]; then
    TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    TOTAL_RAM_MB=$((TOTAL_RAM_KB / 1024))
else
    TOTAL_RAM_MB=1024
fi

SWAP_TOTAL_MB=$(free -m 2>/dev/null | awk '/^Swap:/ {print $2}' || echo 0)

if [ "$TOTAL_RAM_MB" -ge 2800 ]; then
    echo -e "  ${GREEN}✓${NC} Bộ nhớ RAM: ${GREEN}${TOTAL_RAM_MB} MB (Tier 3GB+ Khuyến Nghị / Hiệu Năng Cao)${NC} | Swap: ${SWAP_TOTAL_MB} MB"
elif [ "$TOTAL_RAM_MB" -ge 1800 ]; then
    echo -e "  ${GREEN}✓${NC} Bộ nhớ RAM: ${GREEN}${TOTAL_RAM_MB} MB (Tier 2GB Chuẩn)${NC} | Swap: ${SWAP_TOTAL_MB} MB"
elif [ "$TOTAL_RAM_MB" -ge "$MIN_RAM_MB" ]; then
    echo -e "  ${YELLOW}✓${NC} Bộ nhớ RAM: ${YELLOW}${TOTAL_RAM_MB} MB (Tier Tối Thiểu 1GB)${NC} | Swap: ${SWAP_TOTAL_MB} MB"
    if [ "$SWAP_TOTAL_MB" -lt 1024 ]; then
        echo -e "  ${YELLOW}⚠️ Khuyến nghị: VPS 1GB RAM nên bật ít nhất 2GB Swap để tránh nghẽn khi Docker compile mã nguồn.${NC}"
    fi
else
    echo -e "  ${RED}❌ RAM: ${TOTAL_RAM_MB}MB (Yêu cầu tối thiểu: 1024MB / 1GB)${NC}"
    echo -e "  ${YELLOW}⚠️ Lưu ý: Máy chủ thiếu RAM có thể gây lỗi OOM (Out Of Memory) khi build/chạy.${NC}"
    read -p "Bạn có muốn tiếp tục ép buộc chạy không? (y/N): " FORCE_RAM
    if [[ ! "$FORCE_RAM" =~ ^[yY]$ ]]; then
        echo -e "${RED}Đã hủy triển khai.${NC}"
        exit 1
    fi
fi

# 1.4. Kiểm tra Dung lượng ổ cứng trống (Tối thiểu 3GB = 3072MB)
MIN_DISK_MB=3072
AVAILABLE_DISK_KB=$(df -k . | awk 'NR==2 {print $4}')
AVAILABLE_DISK_MB=$((AVAILABLE_DISK_KB / 1024))
AVAILABLE_DISK_GB=$((AVAILABLE_DISK_MB / 1024))

if [ "$AVAILABLE_DISK_MB" -lt "$MIN_DISK_MB" ]; then
    echo -e "  ${RED}❌ Dung lượng ổ cứng trống: ${AVAILABLE_DISK_MB}MB (Yêu cầu tối thiểu ${MIN_DISK_MB}MB / 3GB)${NC}"
    echo -e "  ${YELLOW}⚠️ Không đủ dung lượng để tải Docker images và build ứng dụng.${NC}"
    exit 1
else
    echo -e "  ${GREEN}✓${NC} Dung lượng đĩa trống: ${GREEN}${AVAILABLE_DISK_GB} GB (${AVAILABLE_DISK_MB} MB)${NC} (Tối thiểu: 3GB)"
fi

echo -e "${GREEN}🎉 Cấu hình máy chủ đáp ứng đầy đủ yêu cầu!${NC}\n"

# ==========================================================
# 2. KIỂM TRA BIẾN MÔI TRƯỜNG (.ENV)
# ==========================================================
if [ ! -f .env ]; then
    echo -e "⚠️ Chưa tìm thấy file .env, tự động tạo và sinh khóa bảo mật ngẫu nhiên..."
    cp .env.example .env

    # Sinh mật khẩu và key ngẫu nhiên mạnh
    RAND_DB_PASS=$(openssl rand -hex 16 2>/dev/null || date +%s%N | sha256sum | head -c 32)
    RAND_JWT_SECRET=$(openssl rand -hex 24 2>/dev/null || date +%s%N | sha256sum | head -c 48)
    RAND_SALT=$(openssl rand -hex 16 2>/dev/null || date +%s%N | sha256sum | head -c 32)

    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${RAND_DB_PASS}/" .env
        sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=${RAND_JWT_SECRET}/" .env
    else
        sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${RAND_DB_PASS}/" .env
        sed -i "s/JWT_SECRET=.*/JWT_SECRET=${RAND_JWT_SECRET}/" .env
    fi
    echo -e "  ${GREEN}✓${NC} Đã tạo file .env với mật khẩu Database & JWT Secret ngẫu nhiên an toàn."
fi

# ==========================================================
# 3. BUILD WIDGET JS CLIENT BUNDLE
# ==========================================================
echo -e "📦 [1/3] Đang build Widget client bundle..."
if [ -d "widget" ]; then
    if command -v npm &> /dev/null; then
        cd widget
        if [ ! -d "node_modules" ]; then
            npm ci --quiet 2>/dev/null || npm install --quiet
        fi
        npm run build
        cd ..
    else
        echo -e "  💡 Host không có sẵn Node.js/NPM, tự động build Widget bằng Docker container..."
        docker run --rm -v "$(pwd)/widget:/app" -w /app node:20-alpine sh -c "npm ci --quiet && npm run build"
    fi
    echo -e "  ${GREEN}✓${NC} Widget bundle: ${GREEN}Đã sẵn sàng (/widget/dist/vina-captcha.js)${NC}"
fi

# ==========================================================
# 4. PULL & BUILD DOCKER CONTAINERS
# ==========================================================
echo -e "🐳 [2/3] Đang build và khởi động hệ thống Docker..."
docker compose build --parallel

# ==========================================================
# 5. KHỞI ĐỘNG DỊCH VỤ BACKGROUND
# ==========================================================
echo -e "⚡ [3/3] Khởi động các container..."
docker compose up -d

echo ""
echo -e "${GREEN}==========================================================${NC}"
echo -e "${GREEN}🎉 [NhanHoaCaptcha] Triển khai thành công!${NC}"
echo -e "${GREEN}==========================================================${NC}"
echo -e "🌐 Dashboard / Setup  : ${BLUE}http://localhost${NC} (hoặc http://IP_VPS của bạn)"
echo -e "📡 Widget Script       : ${BLUE}http://localhost/widget/vina-captcha.js${NC}"
echo -e "🚀 Trình cài đặt CMS   : Truy cập trang chủ lần đầu để điền tên miền & tạo Super Admin"
echo -e "${GREEN}==========================================================${NC}"
