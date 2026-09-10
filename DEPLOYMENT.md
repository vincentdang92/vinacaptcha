# Cẩm Nang Triển Khai & Khắc Phục Sự Cố (Deployment & Fallback Runbook)

Tài liệu này hướng dẫn cách triển khai hệ thống **VinaCaptcha** trọn gói lên bất kỳ máy chủ VPS nào chỉ với Docker trong vòng 1 phút, đồng thời hướng dẫn quy trình **Dự phòng / Fallback khẩn cấp** khi máy chủ chính gặp sự cố.

---

## 1. Yêu Cầu Máy Chủ (Prerequisites)

* **Hệ điều hành**: Ubuntu 22.04 / 24.04 LTS, Debian 12, CentOS 9 Stream, hoặc bất kỳ Linux OS nào có hỗ trợ Docker.
* **Cấu hình phần cứng tối thiểu**:
  * **CPU**: 1 Core (vCPU)
  * **RAM**: 1 GB (1024 MB)
  * **Dung lượng đĩa trống**: Tối thiểu 3 GB trống (khuyến nghị 10GB SSD)
  *(Cấu hình này đủ phục vụ > 5.000 req/s nhờ kiến trúc NestJS Fastify & Redis O(1)).*
* **Kiểm tra tự động (Pre-flight Checks)**: Script `./deploy.sh` sẽ tự động quét và kiểm tra toàn bộ CPU, RAM, Disk, Docker daemon trước khi tiến hành cài đặt.
* **Phần mềm cần cài sẵn**:
  ```bash
  # Cài đặt Docker & Docker Compose trên Ubuntu/Debian
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  ```

---

## 2. Triển Khai Mới Lên VPS (1-Command Deploy)

### Bước 1: Clone mã nguồn về VPS
```bash
git clone https://github.com/your-repo/vina-captcha.git
cd vina-captcha
```

### Bước 2: Cấu hình biến môi trường
```bash
cp .env.example .env
nano .env  # Đổi lại mật khẩu POSTGRES_PASSWORD và JWT_SECRET an toàn
```

### Bước 3: Khởi chạy hệ thống
```bash
chmod +x deploy.sh
./deploy.sh
```
*Hoặc khởi chạy trực tiếp bằng Docker Compose:*
```bash
docker compose up -d --build
```

### 🎯 Trải nghiệm Khởi tạo như 1 CMS (Setup Wizard):
* **Tự động kích hoạt Wizard cài đặt**: Khi truy cập Dashboard lần đầu qua trình duyệt (`http://IP_VPS` hoặc `https://your-domain.com`), hệ thống tự động nhận diện cơ sở dữ liệu mới và chuyển hướng đến trang **Setup Wizard (`/setup`)** (tương tự quy trình cài đặt WordPress/Ghost CMS).
* **3 Bước thiết lập nhanh chóng**:
  1. **Bước 1 - Thông tin Hệ thống**: Nhập tên hệ thống & Tên miền chính (Primary Domain, VD: `nhanhoa.com`, `mywebsite.vn`).
  2. **Bước 2 - Tài khoản Quản trị Tối cao (Super Admin)**: Nhập Họ tên, Email quản trị & Mật khẩu khởi tạo.
  3. **Bước 3 - Hoàn tất**: Hệ thống tự động tạo tài khoản Super Admin, cấu hình Gói cước Enterprise, sinh Site ban đầu và tạo sẵn Production API Key (`cap_live_...`), tự động đăng nhập và đưa bạn vào thẳng trang quản trị.
* **Các Endpoint sẵn sàng phục vụ**:
  * **Admin Dashboard & Setup**: `http://IP_VPS`
  * **Widget Script**: `http://IP_VPS/widget/vina-captcha.js`
  * **Public API**: `http://IP_VPS/v1/issue`, `http://IP_VPS/v1/verify`, `http://IP_VPS/v1/siteverify`

---

## 3. Quy Trình Chuyển Vùng Dự Phòng Khẩn Cấp (Rapid Fallback / Failover)

Khi máy chủ chính gặp sự cố (ví dụ: bị tấn công DDoS nặng tầng mạng, nghẽn ISP quốc tế, trung tâm dữ liệu bảo trì):

### 3.1. Mô Hình Hot Standby (Khuyến Nghị)
1. Dựng sẵn một VPS thứ 2 (VPS Dự Phòng B) tại một Data Center hoặc nhà cung cấp khác (ví dụ: Nhanhoa DC2, Viettel, FPT, AWS, Linode).
2. Chạy `./deploy.sh` trên VPS B.
3. Cấu hình sao lưu định kỳ Database từ VPS A sang VPS B:
   ```bash
   # Lệnh dump DB trên VPS chính:
   docker exec captcha_postgres pg_dump -U captcha_user captcha_db | gzip > backup_$(date +%F).sql.gz

   # Import vào VPS dự phòng:
   gunzip < backup_*.sql.gz | docker exec -i captcha_postgres psql -U captcha_user -d captcha_db
   ```

### 3.2. Kích Hoạt Fallback trong 30 giây
Khi VPS A ngừng phản hồi:
1. Đăng nhập vào trang quản trị DNS của domain `captcha.nhanhoa.com`.
2. Trỏ lại bản ghi **A Record** `captcha.nhanhoa.com` sang địa chỉ IP của **VPS B**.
3. Hệ thống trên VPS B sẽ lập tức tiếp nhận toàn bộ traffic xác thực của các website/app mà không cần cài đặt thêm bất kỳ thứ gì.

---

## 4. Cấu Hình SSL / HTTPS Miễn Phí với Let's Encrypt

Khi đã trỏ Domain (ví dụ: `captcha.nhanhoa.com`) về IP VPS, bạn có thể cấp chứng chỉ SSL tự động bằng Certbot:

```bash
# Cài đặt certbot
sudo apt update && sudo apt install -y certbot

# Cấp chứng chỉ SSL (tạm tắt gateway port 80 trong 5 giây)
docker compose stop gateway
sudo certbot certonly --standalone -d captcha.nhanhoa.com
docker compose start gateway
```

Mount thư mục chứng chỉ `/etc/letsencrypt` vào file `docker-compose.yml` để Nginx Gateway tự động kích hoạt HTTPS (Port 443).

---

## 5. Lệnh Quản Trị Hệ Thống Hữu Ích

| Thao tác | Câu lệnh |
| :--- | :--- |
| **Xem logs realtime toàn hệ thống** | `docker compose logs -f` |
| **Xem logs riêng Backend API** | `docker compose logs -f backend` |
| **Khởi động lại toàn bộ dịch vụ** | `docker compose restart` |
| **Kiểm tra trạng thái các container** | `docker compose ps` |
| **Kiểm tra mức sử dụng RAM/CPU** | `docker stats` |
| **Truy cập Redis CLI** | `docker exec -it captcha_redis redis-cli` |
| **Truy cập PostgreSQL CLI** | `docker exec -it captcha_postgres psql -U captcha_user -d captcha_db` |
