#!/usr/bin/env bash
# ==========================================================
# NhanHoaCaptcha Full Auto 1-Command Installer for Fresh VPS
# Supported: Ubuntu 20.04 / 22.04 / 24.04 LTS, Debian 11/12
# ==========================================================
set -e

# Màu sắc thông báo
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

clear 2>/dev/null || true
echo -e "${BLUE}==========================================================${NC}"
echo -e "${CYAN}   🇻🇳 NhanHoaCaptcha — Hệ Thống Captcha Nội Bộ Hiệu Năng Cao  ${NC}"
echo -e "${BLUE}==========================================================${NC}"
echo -e "${GREEN}🚀 Bắt đầu quy trình cài đặt trọn gói từ A-Z...${NC}\n"

# 1. KIỂM TRA QUYỀN ROOT / SUDO
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo &> /dev/null; then
        SUDO="sudo"
    else
        echo -e "${RED}❌ Lỗi: Vui lòng chạy script với quyền root hoặc cài đặt sudo.${NC}"
        exit 1
    fi
fi

# 2. CẬP NHẬT HỆ THỐNG & TỐI ƯU TÀI NGUYÊN (SWAPFILE)
echo -e "📦 [1/5] Đang cập nhật hệ thống và tối ưu tài nguyên máy chủ..."
$SUDO apt-get update -y -qq
$SUDO apt-get install -y -qq git curl ufw ca-certificates openssl > /dev/null 2>&1

# Kiểm tra và tự động kích hoạt Swap (2GB) nếu máy chủ chưa có Swap hoặc Swap < 1GB
SWAP_TOTAL_MB=$(free -m 2>/dev/null | awk '/^Swap:/ {print $2}' || echo 0)
if [ -z "$SWAP_TOTAL_MB" ] || [ "$SWAP_TOTAL_MB" -lt 1024 ]; then
    echo -e "  💡 Phát hiện Swap thấp (${SWAP_TOTAL_MB:-0}MB). Tự động tạo 2GB Swapfile bảo vệ RAM chống tràn bộ nhớ (OOM)..."
    $SUDO fallocate -l 2G /swapfile 2>/dev/null || $SUDO dd if=/dev/zero of=/swapfile bs=1M count=2048 2>/dev/null || true
    if [ -f /swapfile ]; then
        $SUDO chmod 600 /swapfile
        $SUDO mkswap /swapfile >/dev/null 2>&1 || true
        $SUDO swapon /swapfile 2>/dev/null || true
        if ! grep -q '/swapfile' /etc/fstab 2>/dev/null; then
            echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab >/dev/null 2>&1 || true
        fi
        echo -e "  ${GREEN}✓${NC} Đã kích hoạt 2GB Swapfile an toàn."
    fi
fi
echo -e "  ${GREEN}✓${NC} Cập nhật hệ thống & tối ưu tài nguyên hoàn tất."

# 3. TỰ ĐỘNG CÀI ĐẶT DOCKER & DOCKER COMPOSE NẾU CHƯA CÓ
echo -e "🐳 [2/5] Kiểm tra & cài đặt Docker Engine..."
if ! command -v docker &> /dev/null || ! docker compose version &> /dev/null; then
    echo -e "  💡 Đang tải và cài đặt Docker chính thức từ Docker Inc..."
    curl -fsSL https://get.docker.com | $SUDO sh > /dev/null 2>&1
    $SUDO systemctl enable docker > /dev/null 2>&1 || true
    $SUDO systemctl start docker > /dev/null 2>&1 || true
    if [ -n "$SUDO_USER" ]; then
        $SUDO usermod -aG docker "$SUDO_USER" 2>/dev/null || true
    fi
    echo -e "  ${GREEN}✓${NC} Đã cài đặt Docker & Docker Compose thành công."
else
    echo -e "  ${GREEN}✓${NC} Docker & Docker Compose: Đã có sẵn."
fi

# 4. MỞ CỔNG TƯỜNG LỬA (SSH 22, HTTP 80, HTTPS 443)
echo -e "🛡️ [3/5] Cấu hình tường lửa cho Web & API..."
$SUDO ufw allow 22/tcp > /dev/null 2>&1 || true
$SUDO ufw allow 80/tcp > /dev/null 2>&1 || true
$SUDO ufw allow 443/tcp > /dev/null 2>&1 || true
echo -e "  ${GREEN}✓${NC} Các cổng 22 (SSH), 80 (HTTP), 443 (HTTPS) đã sẵn sàng."

# 5. TẢI HOẶC CẬP NHẬT MÃ NGUỒN VINACAPTCHA
echo -e "📥 [4/5] Chuẩn bị mã nguồn NhanHoaCaptcha..."
TARGET_DIR="/opt/vinacaptcha"
REPO_URL="https://github.com/vincentdang92/vinacaptcha.git"

if [ -f "deploy.sh" ] && [ -f "docker-compose.yml" ]; then
    INSTALL_PATH=$(pwd)
    echo -e "  ${GREEN}✓${NC} Đang sử dụng thư mục hiện tại: $INSTALL_PATH"
else
    if [ -d "$TARGET_DIR/.git" ]; then
        echo -e "  💡 Đã tìm thấy mã nguồn tại $TARGET_DIR, cập nhật mới nhất..."
        cd "$TARGET_DIR"
        git pull origin main --quiet || true
    else
        echo -e "  💡 Đang clone mã nguồn về $TARGET_DIR..."
        $SUDO mkdir -p "$TARGET_DIR"
        $SUDO chown -R "$(id -un):$(id -gn)" "$TARGET_DIR" 2>/dev/null || true
        git clone "$REPO_URL" "$TARGET_DIR" --quiet
        cd "$TARGET_DIR"
    fi
    INSTALL_PATH="$TARGET_DIR"
fi

# 6. THỰC THI TRIỂN KHAI VÀ KHỞI ĐỘNG DỊCH VỤ
echo -e "🚀 [5/5] Tiến hành build và khởi chạy các dịch vụ Docker..."
chmod +x deploy.sh ssl.sh 2>/dev/null || true
./deploy.sh

# XỬ LÝ NẾU CÓ THAM SỐ CÀI SSL TRỰC TIẾP (--ssl domain [email])
if [ "$1" == "--ssl" ] && [ -n "$2" ]; then
    echo -e "\n🔒 Nhận diện tham số --ssl, tự động cấu hình chứng chỉ SSL cho $2..."
    ./ssl.sh "$2" "$3"
    exit 0
fi

# 7. LẤY IP PUBLIC CỦA VPS ĐỂ HIỂN THỊ
SERVER_IP=$(curl -4s --connect-timeout 3 https://ifconfig.me 2>/dev/null || curl -4s --connect-timeout 3 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}🎉 CHÚC MỪNG! HỆ THỐNG VINACAPTCHA ĐÃ CÀI ĐẶT THÀNH CÔNG TRỌN GÓI!${NC}"
echo -e "${GREEN}================================================================${NC}"
echo -e "📍 Thư mục cài đặt : ${CYAN}$INSTALL_PATH${NC}"
echo -e "🌐 Web Dashboard   : ${BLUE}http://$SERVER_IP${NC}"
echo -e "📦 Widget Script   : ${BLUE}http://$SERVER_IP/widget/vina-captcha.js${NC}"
echo -e "📡 Public API      : ${BLUE}http://$SERVER_IP/v1/issue${NC}"
echo -e "----------------------------------------------------------------"
echo -e "👉 ${YELLOW}BƯỚC 1:${NC} Mở trình duyệt truy cập ${BLUE}http://$SERVER_IP${NC} để hoàn tất"
echo -e "   thiết lập ban đầu qua màn hình ${GREEN}Setup Wizard${NC} (Tạo Super Admin & Site)."
echo -e "👉 ${YELLOW}BƯỚC 2 (Sau khi trỏ tên miền):${NC} Chạy lệnh kích hoạt HTTPS xanh:"
echo -e "   ${CYAN}cd $INSTALL_PATH && ./ssl.sh <ten_mien_cua_ban>${NC}"
echo -e "================================================================\n"
