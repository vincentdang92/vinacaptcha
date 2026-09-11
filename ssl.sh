#!/usr/bin/env bash
# ==========================================================
# NhanHoaCaptcha Automated SSL / HTTPS Provisioning Script
# Let's Encrypt + Auto Nginx Config + Auto-Renewal
# ==========================================================
set -e

# Màu sắc thông báo
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}==========================================================${NC}"
echo -e "${CYAN}🔒 [NhanHoaCaptcha] Thiết Lập Chứng Chỉ SSL / HTTPS Tự Động${NC}"
echo -e "${BLUE}==========================================================${NC}"

# 1. KIỂM TRA QUYỀN ROOT / SUDO
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo &> /dev/null; then
        SUDO="sudo"
    else
        echo -e "${RED}❌ Lỗi: Vui lòng chạy script với quyền root hoặc sudo.${NC}"
        exit 1
    fi
fi

# 2. LẤY TÊN MIỀN VÀ EMAIL
DOMAIN="$1"
EMAIL="$2"

if [ -z "$DOMAIN" ]; then
    read -p "👉 Nhập tên miền của bạn (VD: captcha.domaincuaban.com): " DOMAIN
fi

DOMAIN=$(echo "$DOMAIN" | sed -e 's|^[^/]*//||' -e 's|/.*$||' | tr '[:upper:]' '[:lower:]' | xargs)

if [ -z "$DOMAIN" ]; then
    echo -e "${RED}❌ Tên miền không được để trống!${NC}"
    exit 1
fi

if [ -z "$EMAIL" ]; then
    read -p "👉 Nhập email quản trị để nhận thông báo gia hạn SSL (tùy chọn): " EMAIL
fi

echo -e "\n📋 Thông tin cấu hình SSL:"
echo -e "  - Tên miền : ${GREEN}$DOMAIN${NC}"
echo -e "  - Email    : ${GREEN}${EMAIL:-Không cung cấp (tự động)}${NC}\n"

# 3. KIỂM TRA & CÀI ĐẶT CERTBOT
echo -e "📦 [1/5] Kiểm tra công cụ Certbot..."
if ! command -v certbot &> /dev/null; then
    echo -e "  💡 Đang cài đặt Certbot từ repository Ubuntu..."
    $SUDO apt-get update -y -qq
    $SUDO apt-get install -y -qq certbot > /dev/null 2>&1
    echo -e "  ${GREEN}✓${NC} Cài đặt Certbot thành công."
else
    echo -e "  ${GREEN}✓${NC} Certbot: Đã có sẵn."
fi

# 4. TẠM DỪNG NGINX GATEWAY ĐỂ GIẢI PHÓNG PORT 80 CHO CERTBOT
echo -e "⏳ [2/5] Tạm dừng cổng Gateway để cấp phát chứng chỉ..."
docker compose stop gateway > /dev/null 2>&1 || true

# 5. YÊU CẦU CẤP CHỨNG CHỈ TỪ LET'S ENCRYPT
echo -e "🌐 [3/5] Đang yêu cầu cấp chứng chỉ Let's Encrypt cho ${CYAN}$DOMAIN${NC}..."

EMAIL_ARG="--register-unsafely-without-email"
if [ -n "$EMAIL" ]; then
    EMAIL_ARG="--email $EMAIL"
fi

$SUDO certbot certonly --standalone --agree-tos --non-interactive $EMAIL_ARG -d "$DOMAIN"

CERT_PATH="/etc/letsencrypt/live/$DOMAIN"
if [ ! -f "$CERT_PATH/fullchain.pem" ]; then
    echo -e "${RED}❌ Không tìm thấy file chứng chỉ tại $CERT_PATH! Cấp SSL thất bại.${NC}"
    echo -e "💡 Vui lòng đảm bảo bạn đã trỏ bản ghi DNS (A Record) của ${YELLOW}$DOMAIN${NC} về IP VPS."
    echo -e "  Khởi động lại Gateway chế độ HTTP..."
    docker compose start gateway > /dev/null 2>&1 || true
    exit 1
fi

echo -e "  ${GREEN}✓${NC} Cấp chứng chỉ SSL thành công!"

# 6. TỰ ĐỘNG CẬP NHẬT CẤU HÌNH NGINX SANG HTTPS
echo -e "⚙️ [4/5] Cập nhật cấu hình Nginx sang giao thức HTTPS (Port 443)..."

cat <<EOF | $SUDO tee ./nginx/conf.d/vina-captcha.conf > /dev/null
# ==========================================================
# NhanHoaCaptcha Nginx Configuration (HTTPS Enabled)
# Domain: $DOMAIN
# ==========================================================

upstream backend_cluster {
    server backend:3000 max_fails=3 fail_timeout=10s;
    keepalive 64;
}

upstream dashboard_service {
    server dashboard:80;
    keepalive 32;
}

# 1. Chuyển hướng toàn bộ HTTP (Port 80) sang HTTPS (Port 443)
server {
    listen 80;
    server_name $DOMAIN _;

    # Cho phép Let's Encrypt renew tự động qua HTTP-01
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

# 2. Máy chủ HTTPS chính (Port 443)
server {
    listen 443 ssl http2;
    server_name $DOMAIN _;

    # SSL Certificates
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # SSL Optimization & Security
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    client_max_body_size 2M;

    # 1. Widget JS CDN Distribution (CORS mở cho mọi website nhúng)
    location /widget/ {
        alias /usr/share/nginx/widget/;
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
        # ETag revalidation: tải bản mới tức thì khi update widget, trả 304 khi không đổi
        add_header Cache-Control "no-cache, must-revalidate" always;
        etag on;
        try_files \$uri \$uri/ /vina-captcha.js =404;
    }

    # 2. Backend Public API (/v1/issue, /v1/verify, /v1/siteverify)
    location /v1/ {
        proxy_pass http://backend_cluster;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        proxy_connect_timeout 3s;
        proxy_read_timeout 10s;
        proxy_send_timeout 10s;
    }

    # 3. Backend Admin API (/admin/v1/*)
    location /admin/v1/ {
        proxy_pass http://backend_cluster;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        proxy_send_timeout 30s;
    }

    # 4. Admin Dashboard SPA
    location / {
        proxy_pass http://dashboard_service;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
EOF

# 7. KHỞI ĐỘNG LẠI NGINX GATEWAY
echo -e "🚀 [5/5] Khởi động lại dịch vụ Gateway với cấu hình SSL mới..."
docker compose up -d gateway

# 8. THIẾT LẬP TỰ ĐỘNG GIA HẠN SSL (CRONJOB)
CURRENT_CRON=$($SUDO crontab -l 2>/dev/null || true)
RENEW_CMD="0 3 * * * certbot renew --quiet --deploy-hook 'docker compose -f $(pwd)/docker-compose.yml restart gateway'"

if ! echo "$CURRENT_CRON" | grep -q "certbot renew"; then
    echo -e "⏰ Đang thiết lập lịch tự động gia hạn chứng chỉ SSL (3:00 AM hàng ngày)..."
    (echo "$CURRENT_CRON"; echo "$RENEW_CMD") | $SUDO crontab -
    echo -e "  ${GREEN}✓${NC} Tự động gia hạn SSL: Đã kích hoạt."
fi

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}🎉 KÍCH HOẠT SSL / HTTPS THÀNH CÔNG CHO TÊN MIỀN $DOMAIN!${NC}"
echo -e "${GREEN}================================================================${NC}"
echo -e "🌐 Dashboard HTTPS : ${BLUE}https://$DOMAIN${NC}"
echo -e "📦 Widget Script   : ${BLUE}https://$DOMAIN/widget/vina-captcha.js${NC}"
echo -e "📡 Public API      : ${BLUE}https://$DOMAIN/v1/issue${NC}"
echo -e "🔒 Ổ khóa xanh bảo mật: Đã sẵn sàng phục vụ production!"
echo -e "================================================================\n"
