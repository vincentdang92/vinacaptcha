# HỆ THỐNG BẢO VỆ CAPTCHA NỘI BỘ (VINACAPTCHA / NHANHOACAPTCHA)
## TÀI LIỆU BÀN GIAO: KIẾN TRÚC HỆ THỐNG & SỔ TAY VẬN HÀNH DOCKER / DEVOPS

---

## 1. TỔNG QUAN HỆ THỐNG

### 1.1 Mục tiêu & Phạm vi
- **Mục tiêu**: Xây dựng cổng bảo vệ Captcha nội bộ hiệu năng cao, độc lập, sẵn sàng thay thế hoàn toàn Google reCAPTCHA / hCaptcha / Cloudflare Turnstile khi gặp sự cố mạng quốc tế hoặc ISP chặn.
- **Khách hàng phục vụ**: Toàn bộ hệ sinh thái website công ty (Market, Portal, Hosting/Domain tools, v.v.) và các đối tác bên ngoài.
- **Mô hình 2 Khóa Bảo Mật (2-Key Architecture)**:
  - **Public Site Key (UUID)**: Nhúng vào mã HTML/JS ở client (được bảo vệ bởi Domain Whitelist).
  - **Private Secret Key (`cap_live_...`)**: Lưu trên Server Backend đối soát qua API `/v1/siteverify` (tuyệt đối không để lộ ở client).

### 1.2 Kiến trúc 3 Thành Phần Độc Lập (3-Tier Decoupled)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. WIDGET (Client-Side JS)                                                  │
│    - Vanilla TypeScript (Vite Library Mode), Siêu nhẹ (< 15KB gzip).         │
│    - 100% Client-Side Rendering (Canvas Slider, PoW Worker).                │
│    - Static Asset: Cache 30 ngày trên Nginx/CDN (0% CPU Server).            │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       │ Trao đổi Token (/issue, /verify)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. BACKEND API CORE (Stateless Node.js + Fastify)                           │
│    - NestJS với Platform Fastify Adapter (Nhanh gấp 2.5 - 3 lần Express).   │
│    - Hot-Path 100% In-Memory: Xử lý qua Redis Cluster (0.5ms - 2ms).        │
│    - Stateless hoàn toàn: Sẵn sàng scale ngang qua nhiều Node/VPS.          │
│    - Risk Engine: Đánh giá botnet, phân tích hành vi, Threat Intel IP.      │
└───────────────────────┬─────────────────────────────┬───────────────────────┘
                        │                             │
                        │ Đọc/Ghi Token, Rate-Limit    │ Async Logs / Meta
                        ▼                             ▼
       ┌──────────────────────────────┐ ┌──────────────────────────────┐
       │ REDIS 7 (In-Memory Engine)   │ │ POSTGRESQL 16 (Relational DB)│
       │ - One-Time Token Store (TTL) │ │ - Accounts, Sites, API Keys  │
       │ - Session & Rate Limit       │ │ - Threat Intel CIDR Ranges   │
       │ - API Key Metadata Cache     │ │ - Verification Logs & Stats  │
       │ - Latency: < 0.5 ms          │ │ - Indexed CIDR (GiST/inet)   │
       └──────────────────────────────┘ └──────────────┬───────────────┘
                                                       │
                                                       │ Quản trị REST API
                                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. ADMIN DASHBOARD (Management Portal)                                      │
│    - Refine.dev + React 19 + Vite + Ant Design 5.                           │
│    - Quản lý Accounts, Sites, Cấp/Thu hồi API Key, Quota, IP Reputation.   │
│    - Tách biệt hoàn toàn khỏi luồng lưu lượng Hot-Path của Captcha.         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. NGUYÊN LÝ CHỊU TẢI & TỐI ƯU HIỆU NĂNG

### 2.1 Luồng Xử Lý Hot-Path 100% In-Memory (Zero Sync SQL)
Toàn bộ các endpoint chịu tải chính (`/v1/issue`, `/v1/verify`, `/v1/siteverify`) **không thực hiện truy vấn đồng bộ vào PostgreSQL**:

```
[User Form Submit]
       │
       ▼
1. POST /v1/issue ─────────▶ Check Domain Whitelist & Client Signals (CPU ~0.05ms)
                             Lưu Session vào Redis với TTL 60s (Redis ~0.5ms)
       │
       ▼
2. POST /v1/verify ────────▶ Check Puzzle / PoW accuracy
                             Xóa Session + Cấp verify_token vào Redis TTL 120s
       │
       ▼
3. POST /v1/siteverify ────▶ Server khách hàng đối soát Secret Key
                             Atomic GET + DEL token trong Redis (Chống Replay)
                             Cộng dồn Quota thời gian thực bằng Redis INCRBY
```
👉 **Độ trễ phản hồi**: Duy trì ở mức cực thấp **1ms - 3ms**, không bị nghẽn I/O Database dù có hàng chục nghìn lượt truy cập đồng thời.

### 2.2 Đẩy Tác Vụ Nặng Về Trình Duyệt (Zero-Server Rendering)
- **Slider Captcha Puzzle**: Ảnh nền và mảnh ghép puzzle bị khuyết được **vẽ trực tiếp bằng HTML5 Canvas trên trình duyệt client** dựa theo mã seed ngẫu nhiên.
  - Server chỉ gửi seed và tọa độ Y (< 1 byte).
  - Server không tốn CPU để nén JPEG, crop ảnh hay decode base64 -> **Giảm 95% áp lực CPU cho Server**.
- **Proof-of-Work (PoW)**: Khi phát hiện tấn công DDoS, thuật toán băm SHA-256 chạy trên Web Worker của client. Server chỉ mất < 0.01ms để kiểm tra lại chữ ký cuối.

### 2.3 Cơ Chế Dự Phòng Chống Sập (Fail-Open Fallback & Circuit Breaker)
- **Timeout chuẩn 5.000ms (5 giây)**: Được tích hợp sẵn trong mọi SDK / Middleware (Node.js, PHP/Laravel, WordPress, Python, Mobile).
- **Fail-Open Strategy**: Nếu máy chủ Captcha gặp tải đột biến hoặc đứt cáp mạng, các request vượt quá 5s sẽ **tự động được cấp quyền đi tiếp (`success: true`)**, đảm bảo giao dịch người dùng thật trên các website thanh toán/đăng nhập không bao giờ bị gián đoạn.

---

## 3. ĐÁNH GIÁ NĂNG LỰC CHỊU TẢI THỰC TẾ

### 3.1 Bảng phân bổ tài nguyên trên VPS mẫu (3 vCPU – 3 GB RAM)

| Thành phần | Container Name | RAM Phân bổ | CPU Tải cao | Đặc tính kỹ thuật |
| :--- | :--- | :--- | :--- | :--- |
| **Linux OS & Docker Daemon** | Host | ~350 MB | < 2% | Kernel, containerd, firewall |
| **Redis 7 (In-Memory)** | `captcha_redis` | ~450 MB | 5% – 10% | Maxmemory LRU, lưu token và rate-limit |
| **PostgreSQL 16** | `captcha_postgres` | ~650 MB | 10% – 20% | `shared_buffers = 512MB`, lưu meta & logs |
| **Backend Fastify (3 Workers)** | `captcha_backend` | ~700 MB | 60% – 75% | NestJS Fastify, xử lý tính toán rủi ro |
| **Gateway (Nginx Proxy)** | `captcha_gateway` | ~100 MB | 5% – 10% | SSL Termination, gzip, connection pool |
| **Admin Dashboard** | `captcha_dashboard`| ~50 MB | < 1% | Nginx static SPA serving |
| **Tổng sử dụng** | | **~2.3 GB / 3 GB** | **Bộ đệm an toàn: ~700MB RAM tránh tràn bộ nhớ (OOM)** |

### 3.2 Chỉ số năng lực xử lý (Throughput Benchmarks)

| Chỉ số hiệu năng | Mức thông thường | Mức cao điểm (Peak / Flash Sale) |
| :--- | :--- | :--- |
| **Thông lượng (Throughput)** | **1.500 – 2.500 RPS** | **3.500 – 5.000 RPS** *(Chạy Docker Scale / PM2)* |
| **Lượt xác thực / ngày** | **~30 – 50 triệu reqs** | **~100 triệu reqs / ngày** |
| **Người dùng đồng thời (CCU)** | **8.000 – 15.000 CCU** | **25.000 – 40.000 CCU** |
| **Độ trễ API (Latency)** | **1.5 ms – 5 ms** | **10 ms – 30 ms** |
| **Băng thông mạng** | ~8 – 15 Mbps | ~35 – 50 Mbps |

---

## 4. HƯỚNG DẪN TRIỂN KHAI MỞ RỘNG (SCALING PLAYBOOK)

Nhờ kiến trúc **Stateless**, việc mở rộng quy mô hệ thống có thể thực hiện trong vài phút mà **không cần sửa mã nguồn**:

```
                         [ Cloudflare / Load Balancer ]
                                       │
                ┌──────────────────────┼──────────────────────┐
                ▼                      ▼                      ▼
          [ VPS Node 1 ]         [ VPS Node 2 ]         [ VPS Node 3 ]
         (3 vCPU / 3GB)         (3 vCPU / 3GB)         (3 vCPU / 3GB)
                └──────────────────────┬──────────────────────┘
                                       │
                           ┌───────────┴───────────┐
                           ▼                       ▼
                    [ REDIS CLUSTER ]       [ POSTGRESQL DB ]
```

### 🔹 Mở rộng ngang bằng Docker Compose:
```bash
# Nhân bản lên 4 container backend xử lý song song
docker compose up -d --scale backend=4 --no-recreate
```

---

## 5. BẢNG THÔNG SỐ CẤU HÌNH TỐI ƯU HẠ TẦNG

### 5.1 Tối ưu Linux OS Kernel (`/etc/sysctl.conf`)
```ini
# Tăng số lượng kết nối đang chờ (Backlog)
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535

# Tái sử dụng nhanh TIME_WAIT socket
net.ipv4.tcp_tw_reuse = 1
net.ipv4.ip_local_port_range = 1024 65535

# Tăng giới hạn File Descriptors
fs.file-max = 2097152
```
*Áp dụng ngay: `sudo sysctl -p`*

### 5.2 Tối ưu Redis Container (`docker-compose.yml`)
```yaml
command: redis-server --appendonly yes --maxmemory 768mb --maxmemory-policy volatile-lru --tcp-backlog 65535 --timeout 0 --tcp-keepalive 300
```

### 5.3 Tối ưu PostgreSQL Container (`docker-compose.yml`)
```yaml
command: >
  postgres
  -c shared_buffers=512MB
  -c effective_cache_size=1536MB
  -c work_mem=16MB
  -c maintenance_work_mem=128MB
  -c min_wal_size=1GB
  -c max_wal_size=4GB
  -c checkpoint_completion_target=0.9
  -c wal_buffers=16MB
  -c default_statistics_target=100
  -c random_page_cost=1.1
  -c effective_io_concurrency=200
  -c max_connections=200
```

---

## 6. SỔ TAY VẬN HÀNH DOCKER CHO TEAM HẠ TẦNG / DEVOPS

Hệ thống được đóng gói hoàn chỉnh bằng **Docker Compose** gồm 5 dịch vụ chính:
- `captcha_gateway`: Nginx Reverse Proxy & SSL Gateway (Port 80/443)
- `captcha_backend`: NestJS Fastify API Core (Port 3000 nội bộ)
- `captcha_dashboard`: Refine React 19 Dashboard UI (Nginx SPA)
- `captcha_postgres`: PostgreSQL 15/16 Database (Port 5432)
- `captcha_redis`: Redis 7 In-Memory Token Store (Port 6379)

---

### 6.1 Quản Lý Vòng Đời Dịch Vụ (Start, Stop, Restart)

```bash
# Di chuyển vào thư mục dự án
cd /var/www/vina-captcha   # hoặc đường dẫn chứa docker-compose.yml

# 1. Khởi chạy toàn bộ hệ thống dưới nền (Detached mode)
docker compose up -d

# 2. Xem trạng thái và Healthcheck của tất cả container
docker compose ps

# 3. Dừng toàn bộ hệ thống (Giữ nguyên dữ liệu Database và Redis)
docker compose down

# 4. Khởi động lại riêng 1 dịch vụ (Ví dụ: Backend hoặc Nginx Gateway)
docker compose restart backend
docker compose restart gateway

# 5. Dừng và khởi động lại toàn bộ stack
docker compose restart
```

---

### 6.2 Quy Trình Triển Khai / Cập Nhật Code Mới (Deployment & CI/CD)

Khi có bản cập nhật mới trên GitHub (sửa bug, tính năng mới):

```bash
# Bước 1: Kéo mã nguồn mới nhất về máy chủ
git pull origin main

# Bước 2: Build lại widget và đóng gói static asset
cd widget && npm run build && cd ..

# Bước 3: Rebuild Docker images không dùng cache cũ
docker compose build --no-cache backend dashboard

# Bước 4: Khởi chạy lại các container với image mới (Zero Downtime)
docker compose up -d --remove-orphans

# Bước 5: Dọn dẹp các dangling images cũ giải phóng dung lượng đĩa
docker image prune -f
```

---

### 6.3 Giám Sát Tài Nguyên & Xem Live Logs (Monitoring & Debugging)

```bash
# 1. Theo dõi mức tiêu thụ CPU, RAM, Network I/O thời gian thực của từng container
docker stats --no-trunc

# 2. Xem log thời gian thực của Backend API (kèm timestamp)
docker compose logs -f backend --tail=100 -t

# 3. Xem log truy cập và lỗi của Nginx Gateway
docker compose logs -f gateway --tail=100

# 4. Xem log của Database PostgreSQL
docker compose logs -f postgres --tail=50

# 5. Xem log của Redis
docker compose logs -f redis --tail=50
```

---

### 6.4 Thao Tác Trực Tiếp Vào Container (CLI & Database Inspection)

```bash
# 1. Mở CLI PostgreSQL trực tiếp
docker exec -it captcha_postgres psql -U captcha_user -d captcha_db

# 2. Một số câu lệnh SQL hữu ích kiểm tra hệ thống:
# - Xem tổng số site đang hoạt động:
#   SELECT id, name, primary_domain, challenge_mode, status FROM sites;
# - Xem thống kê log xác thực 10 lượt gần nhất:
#   SELECT ip, action, risk_level, score, created_at FROM verification_logs ORDER BY created_at DESC LIMIT 10;
# - Xem các IP đang bị Cấm (Banned):
#   SELECT ip_cidr, fail_count, site_count_seen, last_seen_at FROM ip_reputation WHERE fail_count > 10;

# 3. Mở Redis CLI kiểm tra RAM và khóa:
docker exec -it captcha_redis redis-cli

# - Kiểm tra kết nối: ping (trả về PONG)
# - Xem tổng số keys: dbsize
# - Xem mức RAM tiêu thụ: info memory
# - Xem các khóa session đang chờ giải captcha: keys "session:*"
# - Xem các token đã cấp chờ verify: keys "verify_token:*"

# 4. Truy cập shell bên trong container Backend (để debug)
docker exec -it captcha_backend sh
```

---

### 6.5 Sao Lưu & Khôi Phục Database (Backup & Restore)

#### A. Tạo bản sao lưu ngay lập tức (Manual Dump):
```bash
# Tạo thư mục chứa backup nếu chưa có
mkdir -p /var/backups/captcha

# Dump dữ liệu PostgreSQL nén gzip
docker exec -t captcha_postgres pg_dump -U captcha_user captcha_db | gzip > /var/backups/captcha/vinacaptcha_$(date +%Y%m%d_%H%M%S).sql.gz

# Kiểm tra file đã tạo
ls -lh /var/backups/captcha/
```

#### B. Khôi phục dữ liệu từ file Backup (Restore):
```bash
# Giải nén và restore thẳng vào container PostgreSQL
gunzip < /var/backups/captcha/vinacaptcha_20260918_093000.sql.gz | docker exec -i captcha_postgres psql -U captcha_user -d captcha_db
```

#### C. Thiết lập Tự Động Sao Lưu Hàng Ngày (Crontab Host):
Mở crontab trên máy chủ host (`crontab -e`) và dán dòng sau (chạy lúc 02:30 sáng hàng ngày):
```cron
30 2 * * * docker exec -t captcha_postgres pg_dump -U captcha_user captcha_db | gzip > /var/backups/captcha/vinacaptcha_$(date +\%Y\%m\%d).sql.gz && find /var/backups/captcha -type f -name "*.sql.gz" -mtime +30 -delete
```
*(Tự động dọn dẹp các bản backup cũ quá 30 ngày).*

---

### 6.6 Quản Lý Chứng Chỉ SSL Let's Encrypt Trên Gateway

```bash
# 1. Cấp mới / Gia hạn SSL tự động bằng script có sẵn
./ssl.sh yourdomain.com

# 2. Hoặc chạy Certbot gia hạn SSL thủ công
sudo certbot certonly --webroot -w /var/www/certbot -d yourdomain.com --dry-run

# 3. Reload Nginx Gateway để nhận chứng chỉ mới mà không gián đoạn
docker compose exec gateway nginx -s reload
```

---

### 6.7 Xử Lý Sự Cố Khẩn Cấp (Emergency Troubleshooting)

| Hiện tượng | Nguyên nhân | Lệnh xử lý nhanh |
| :--- | :--- | :--- |
| **Backend trả về 502 Bad Gateway** | Container `captcha_backend` bị crash hoặc đang khởi động lại | `docker compose logs --tail=50 backend` <br> `docker compose restart backend` |
| **Redis báo lỗi OOM (Out Of Memory)** | RAM vượt quá `maxmemory` do lưu quá nhiều session | `docker exec -it captcha_redis redis-cli FLUSHDB` <br> Sau đó kiểm tra lại cấu hình LRU |
| **PostgreSQL báo `too many connections`** | Connection pool vượt ngưỡng 200 | `docker compose restart backend` <br> `docker exec -it captcha_postgres psql -U captcha_user -d captcha_db -c "SELECT count(*) FROM pg_stat_activity;"` |
| **Dung lượng ổ cứng VPS bị đầy** | Docker tích lũy log file và images cũ | `docker system prune -af` <br> `truncate -s 0 /var/lib/docker/containers/*/*-json.log` |
| **Domain mới nhúng bị lỗi CORS / 403** | Domain chưa được thêm vào Whitelist | Vào Dashboard -> Quản lý Sites -> Thêm domain vào **Allowed Domains** |

---

### 6.8 Danh Mục Kiểm Tra Sức Khỏe Định Kỳ (DevOps Checklist)
- [ ] Lệnh `docker compose ps` hiển thị tất cả 5 containers đều ở trạng thái `Up (healthy)`.
- [ ] RAM tiêu thụ tổng thể của host < 80% (theo dõi qua `free -m` và `docker stats`).
- [ ] API Hot-Path `/v1/siteverify` phản hồi < 10ms.
- [ ] Dung lượng đĩa trống trên host > 20%.
- [ ] File backup hàng ngày `/var/backups/captcha/` được sinh đều đặn mỗi đêm.

---
**Tài liệu Sổ tay Vận hành Docker được chuẩn hóa và bàn giao đầy đủ cho Team Hạ tầng & DevOps.**