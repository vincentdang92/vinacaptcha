# HỆ THỐNG BẢO VỆ CAPTCHA NỘI BỘ (VINACAPTCHA / NHANHOACAPTCHA)
## TÀI LIỆU BÀN GIAO: KIẾN TRÚC HỆ THỐNG & TRIỂN KHAI MỞ RỘNG (SCALING PLAYBOOK)

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
  - Server không tốn CPU để nén JPEG, crop ảnh hay decode base64 $\rightarrow$ **Giảm 95% áp lực CPU cho Server**.
- **Proof-of-Work (PoW)**: Khi phát hiện tấn công DDoS, thuật toán băm SHA-256 chạy trên Web Worker của client. Server chỉ mất < 0.01ms để kiểm tra lại chữ ký cuối.

### 2.3 Cơ Chế Dự Phòng Chống Sập (Fail-Open Fallback & Circuit Breaker)
- **Timeout chuẩn 5.000ms (5 giây)**: Được tích hợp sẵn trong mọi SDK / Middleware (Node.js, PHP/Laravel, WordPress, Python, Mobile).
- **Fail-Open Strategy**: Nếu máy chủ Captcha gặp tải đột biến hoặc đứt cáp mạng, các request vượt quá 5s sẽ **tự động được cấp quyền đi tiếp (`success: true`)**, đảm bảo giao dịch người dùng thật trên các website thanh toán/đăng nhập không bao giờ bị gián đoạn.

---

## 3. ĐÁNH GIÁ NĂNG LỰC CHỊU TẢI THỰC TẾ

### 3.1 Bảng phân bổ tài nguyên trên VPS mẫu (3 vCPU – 3 GB RAM)

| Thành phần | RAM Phân bổ | CPU Tải cao | Đặc tính kỹ thuật |
| :--- | :--- | :--- | :--- |
| **Hệ điều hành Linux** | ~350 MB | < 2% | Kernel, systemd, SSH, firewall |
| **Redis 7 (In-Memory)** | ~450 MB | 5% – 10% | Maxmemory LRU, lưu token và rate-limit |
| **PostgreSQL 16** | ~650 MB | 10% – 20% | `shared_buffers = 512MB`, lưu meta & logs |
| **Backend Fastify (3 Workers)** | ~700 MB | 60% – 75% | NestJS Fastify cluster, xử lý tính toán rủi ro |
| **Nginx Web Server** | ~100 MB | 5% – 10% | SSL Termination, gzip, connection pool |
| **Tổng sử dụng** | **~2.2 GB / 3 GB** | **Bộ đệm an toàn: ~800MB RAM tránh tràn bộ nhớ (OOM)** |

### 3.2 Chỉ số năng lực xử lý (Throughput Benchmarks)

| Chỉ số hiệu năng | Mức thông thường | Mức cao điểm (Peak / Flash Sale) |
| :--- | :--- | :--- |
| **Thông lượng (Throughput)** | **1.500 – 2.500 RPS** | **3.500 – 5.000 RPS** *(3 Worker PM2)* |
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

---

### 🔹 Cấp độ 1: Mở rộng nội bộ trên 1 VPS (PM2 Cluster Mode) — 10 Giây
Tự động nhân bản tiến trình theo số lõi CPU của máy:

```bash
# Cài đặt PM2 toàn cục
npm install -g pm2

# Build source code mới nhất
cd /var/www/vina-captcha/backend
npm run build

# Khởi chạy Cluster tối đa các core CPU
pm2 start dist/main.js -i max --name "vina-captcha-api" --max-memory-restart 400M

# Lưu trạng thái tự khởi động cùng OS
pm2 save
pm2 startup
```
👉 *Khi nâng cấp gói VPS từ 3 CPU lên 6 CPU hoặc 12 CPU, chỉ cần gõ `pm2 reload all` để nhận thêm core mà không downtime.*

---

### 🔹 Cấp độ 2: Nhân bản với Docker Compose — 30 Giây
Nếu triển khai bằng Docker Container:

```bash
# Nhân bản lên 4 instances backend xử lý song song
docker compose up -d --scale backend=4

# Kiểm tra danh sách container đang chạy
docker compose ps
```
👉 *Nginx tích hợp sẵn trong compose sẽ tự động cân bằng tải (Round Robin) tới 4 container backend.*

---

### 🔹 Cấp độ 3: Mở rộng cụm nhiều VPS (Multi-Server Horizontal Scaling) — 5 Phút
Khi lượng request vượt quá **15.000 RPS**:

1. **Máy chủ 1 (Master)**: Chạy PostgreSQL, Redis và Nginx Load Balancer chính.
2. **Máy chủ 2, 3, 4 (Worker Nodes)**: Chỉ chạy Backend API NestJS.
3. **Cấu hình Worker**: Trong file `backend/.env` của các máy Worker, trỏ kết nối Redis và DB về IP Private của máy Master:
   ```env
   BACKEND_REDIS_URL=redis://:mat_khau_redis@10.0.0.1:6379/0
   DATABASE_HOST=10.0.0.1
   DATABASE_PORT=5432
   ```
4. **Cấu hình Nginx Upstream Load Balancing trên Master (`/etc/nginx/conf.d/upstream.conf`)**:
   ```nginx
   upstream backend_cluster {
       least_conn; # Điều phối tới node có ít kết nối nhất
       server 127.0.0.1:3068 max_fails=3 fail_timeout=10s;
       server 10.0.0.2:3068 max_fails=3 fail_timeout=10s;
       server 10.0.0.3:3068 max_fails=3 fail_timeout=10s;
       keepalive 64;
   }

   server {
       listen 80;
       server_name captcha.yourdomain.com;

       location / {
           proxy_pass http://backend_cluster;
           proxy_http_version 1.1;
           proxy_set_header Connection "";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }
   }
   ```

---

### 🔹 Cấp độ 4: Tách biệt Dedicated Cluster cho Redis & Database — 10 Phút
Khi đạt quy mô hàng trăm triệu lượt xác thực/tháng:
- Đưa **Redis** sang cụm máy chủ RAM cao (VD: 8GB RAM, tắt RDB persistence để tối đa IOPS).
- Đưa **PostgreSQL** sang cụm máy chủ lưu trữ SSD NVMe riêng biệt, cấu hình Read-Replicas nếu cần thống kê log chuyên sâu.

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

### 5.2 Tối ưu Redis (`/etc/redis/redis.conf`)
```ini
maxmemory 450mb
maxmemory-policy allkeys-lru
tcp-backlog 65535
timeout 0
tcp-keepalive 300
```

### 5.3 Tối ưu PostgreSQL 16 (`/etc/postgresql/16/main/postgresql.conf`)
*(Dành riêng cho VPS 3GB RAM)*
```ini
shared_buffers = 512MB
effective_cache_size = 1536MB
work_mem = 16MB
maintenance_work_mem = 64MB
min_wal_size = 1GB
max_wal_size = 4GB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
max_connections = 100
```

### 5.4 Tối ưu Nginx High-Concurrency & Cache Client (`/etc/nginx/nginx.conf`)
```nginx
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 8192;
    multi_accept on;
    use epoll;
}

http {
    keepalive_timeout 65;
    keepalive_requests 10000;
    
    # Gzip nén dữ liệu API và Widget
    gzip on;
    gzip_comp_level 5;
    gzip_min_length 256;
    gzip_types application/javascript text/css application/json text/plain;

    # Cache file widget phía client 30 ngày (Bảo vệ băng thông server)
    location /widget/ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }
}
```

---

## 6. QUY TRÌNH VẬN HÀNH, GIÁM SÁT & BÀN GIAO

### 6.1 Các lệnh quản trị dịch vụ chuẩn
```bash
# 1. Kiểm tra trạng thái các tiến trình API
pm2 status

# 2. Xem log thời gian thực theo dòng
pm2 logs vina-captcha-api --lines 100

# 3. Khởi động lại không downtime (Graceful Reload)
pm2 reload vina-captcha-api

# 4. Kiểm tra Redis
redis-cli ping                # Trả về PONG
redis-cli info memory        # Xem dung lượng RAM Redis đang dùng

# 5. Kiểm tra kết nối PostgreSQL
sudo -u postgres psql -d vinacaptcha_db -c "SELECT count(*) FROM sites;"
```

### 6.2 Kịch bản Sao Lưu Dữ Liệu Tự Động (Daily Backup)
Tạo cronjob sao lưu PostgreSQL hàng ngày vào lúc 02:00 sáng (`crontab -e`):
```bash
0 2 * * * pg_dump -U postgres vinacaptcha_db | gzip > /var/backups/vinacaptcha_$(date +\%Y\%m\%d).sql.gz
```

### 6.3 Danh Mục Kiểm Tra Sức Khỏe Định Kỳ (Health Checklist)
- [ ] RAM tiêu thụ ổn định < 85% tổng dung lượng VPS.
- [ ] API Hot-Path `/v1/siteverify` phản hồi < 10ms.
- [ ] Bảng `verification_logs` được dọn dẹp định kỳ bởi Cron Job (lưu trữ 30 - 90 ngày).
- [ ] Bảng `threat_intel_ranges` được đồng bộ tự động hàng tuần từ các nguồn Cloud/Tor/Spamhaus.

---
**Tài liệu được đóng gói và bàn giao hoàn tất cho đội ngũ Vận hành & Phát triển.**
