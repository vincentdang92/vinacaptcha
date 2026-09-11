# 🛡️ NhanHoaCaptcha — Hệ Thống Xác Thực Chống Bot & Captcha Nội Bộ

[![Build & Tests](https://img.shields.io/badge/tests-30%2F30%20passing-brightgreen)](#)
[![Widget Bundle Size](https://img.shields.io/badge/widget%20size-%3C%206.5KB%20gzip-blue)](#)
[![Fastify + NestJS](https://img.shields.io/badge/backend-Fastify%20%2B%20NestJS-red)](#)
[![Refine Dashboard](https://img.shields.io/badge/dashboard-Refine%20%2B%20React%2019-purple)](#)
[![License](https://img.shields.io/badge/license-MIT-green)](#)

**NhanHoaCaptcha** là giải pháp xác thực bảo mật và phòng chống bot tự động thế hệ mới, được thiết kế để tự host hoàn toàn (**Self-Hosted**), thay thế hoàn hảo cho *Google reCAPTCHA*, *Cloudflare Turnstile* hoặc *hCaptcha* trong các trường hợp bị chặn quốc tế, ISP throttle hoặc có yêu cầu chủ quyền dữ liệu nội bộ.

---

## 📑 Mục Lục
1. [Yêu Cầu Hệ Thống (Prerequisites)](#-1-yêu-cầu-hệ-thống)
2. [Cách 1: Cài Đặt Tự Động 1 Lệnh (Khuyến Nghị)](#-2-cài-đặt-tự-động-1-lệnh-khuyến-nghị-cho-vps)
3. [Cách 2: Cài Đặt Thủ Công Bằng Docker Compose](#-3-cài-đặt-thủ-công-bằng-docker-compose)
4. [Khởi Tạo Hệ Thống Qua Setup Wizard](#-4-khởi-tạo-hệ-thống-setup-wizard)
5. [Mô Hình 2 Khóa Bảo Mật (Site Key vs Secret Key)](#-5-mô-hình-2-khóa-bảo-mật)
6. [Hướng Dẫn Tích Hợp Đa Nền Tảng (Code Mẫu)](#-6-hướng-dẫn-tích-hợp-đa-nền-tảng)
7. [Các Lệnh Quản Trị & Cập Nhật Hệ Thống](#-7-các-lệnh-quản-trị--bảo-trì)
8. [Xử Lý Sự Cố Thường Gặp (Troubleshooting)](#-8-xử-lý-sự-cố-thường-gặp)

---

## 💻 1. Yêu Cầu Hệ Thống

- **Hệ điều hành**: Ubuntu 20.04 / 22.04 / 24.04 LTS (hoặc Debian 11/12).
- **Cấu hình tối thiểu**: 1 vCPU, 1 GB RAM, 10 GB SSD (Khuyến nghị: 2 vCPU, 2 GB RAM cho production).
- **Cổng mạng (Ports)**: Cần mở Port `80` (HTTP) và `443` (HTTPS) trên Firewall / Security Group.
- **Tên miền (Domain)**: 1 tên miền hoặc subdomain trỏ bản ghi `A` về IP của VPS (VD: `captcha.domaincuaban.com`).

---

## ⚡ 2. Cài Đặt Tự Động 1 Lệnh (Khuyến Nghị Cho VPS)

Chỉ cần SSH vào máy chủ VPS Ubuntu mới của bạn (dưới quyền `root` hoặc `sudo`) và chạy lệnh duy nhất sau:

```bash
curl -fsSL https://raw.githubusercontent.com/vincentdang92/vinacaptcha/main/install.sh | bash
```

> **Script sẽ tự động:**
> - Cài đặt Docker & Docker Compose plugin mới nhất.
> - Tải mã nguồn NhanHoaCaptcha vào thư mục `/opt/vinacaptcha`.
> - Tạo cơ sở dữ liệu PostgreSQL 16 & Redis In-Memory.
> - Build và khởi chạy toàn bộ 3 phân hệ (Backend Fastify, Admin Dashboard, Nginx Gateway).

---

### 🔒 Kích Hoạt Chứng Chỉ SSL / HTTPS Tự Động:

Sau khi trỏ tên miền (VD: `captcha.domaincuaban.com`) về IP VPS, chạy script kích hoạt SSL:

```bash
sudo /opt/vinacaptcha/ssl.sh captcha.domaincuaban.com your-email@domain.com
```

*Script sẽ tự động cấp chứng chỉ Let's Encrypt SSL, chuyển hướng toàn bộ HTTP sang HTTPS 443 và tạo Cronjob tự động gia hạn chứng chỉ vào 3:00 AM hàng ngày.*

---

## 🐳 3. Cài Đặt Thủ Công Bằng Docker Compose

Nếu bạn muốn tự quản lý mã nguồn hoặc deploy trên hạ tầng riêng:

### Bước 1: Clone Repository
```bash
git clone https://github.com/vincentdang92/vinacaptcha.git /opt/vinacaptcha
cd /opt/vinacaptcha
```

### Bước 2: Tạo File Cấu Hình Môi Trường `.env`
```bash
cp .env.example .env
nano .env # Điều chỉnh các tham số bảo mật nếu cần
```

### Bước 3: Khởi Chạy Hệ Thống
```bash
docker compose up -d --build
```

Kiểm tra trạng thái các container đang chạy:
```bash
docker compose ps
```
Hệ thống gồm 5 container:
- `captcha_gateway`: Nginx Reverse Proxy (Port 80/443).
- `captcha_backend`: API NestJS + Fastify Core.
- `captcha_dashboard`: Admin Dashboard React 19 + Refine.
- `captcha_postgres`: PostgreSQL Database.
- `captcha_redis`: Redis Cache & One-Time Token Store.

---

## 🧙‍♂️ 4. Khởi Tạo Hệ Thống (Setup Wizard)

1. Mở trình duyệt và truy cập: **`https://captcha.domaincuaban.com/setup`** (hoặc `http://<IP-VPS>/setup`).
2. Nhập thông tin quản trị:
   - **Họ và tên Admin**
   - **Email quản trị**
   - **Mật khẩu quản trị**
   - **Tên miền website đầu tiên**
3. Bấm **Hoàn tất Khởi tạo**. Hệ thống sẽ tự động tạo tài khoản Super Admin, cấu hình Site đầu tiên và đưa bạn vào giao diện quản trị Admin Dashboard!

---

## 🔑 5. Mô Hình 2 Khóa Bảo Mật

Hệ thống tuân thủ chuẩn bảo mật phân tách 2 khóa độc lập:

| Khóa | Tên gọi | Định dạng | Nơi sử dụng | Mục đích bảo mật |
| :--- | :--- | :--- | :--- | :--- |
| 🟢 **Public Site Key** | Khóa Website Công Khai | UUID: `0119c349-a104-4dd2-...` | **Client (HTML / JS / App)** | Khởi tạo Widget trên trình duyệt. An toàn ở client vì được bảo vệ bằng **Domain Whitelist** (chỉ domain được cấu hình mới gọi được API). |
| 🔴 **Private Secret Key** | Khóa API Bí Mật Server | `cap_live_90ee9772f1e3...` | **Server Backend (.env)** | Lưu trên máy chủ backend của bạn để gọi `POST /v1/siteverify`. **Tuyệt đối KHÔNG để lộ ra client.** |

---

## 🚀 6. Hướng Dẫn Tích Hợp Đa Nền Tảng

### **Bước 1: Phía Frontend / Client (Dùng Public Site Key)**

Nhúng đoạn mã sau vào form HTML của website:

```html
<!-- 1. Container captcha đặt bên trong thẻ <form> -->
<div id="vina-captcha-container"></div>

<!-- 2. Nhúng Script Widget (< 6.5KB gzip) -->
<script src="https://captcha.domaincuaban.com/widget/vina-captcha.js" defer></script>
<script>
  document.addEventListener("DOMContentLoaded", function() {
    new NhanHoaCaptcha("vina-captcha-container", {
      siteKey: "YOUR_PUBLIC_SITE_KEY_UUID", // Site Key UUID lấy từ Dashboard
      onSuccess: function(token, score) {
        console.log("Xác thực hoàn tất! Token:", token);
      }
    });
  });
</script>
```

---

### **Bước 2: Phía Server Backend (Dùng Secret Key `cap_live_...`)**

Khi form gửi về Server của bạn, Backend lấy trường `vina_captcha_token` và gửi request xác minh server-to-server:

#### 🟢 **Node.js / Express**:
```javascript
app.post('/api/login', async (req, res) => {
  const token = req.body.vina_captcha_token;
  
  const verifyRes = await fetch("https://captcha.domaincuaban.com/v1/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: process.env.CAPTCHA_SECRET_KEY, // cap_live_...
      verify_token: token                     // Token một lần nhận từ form
    })
  });

  const result = await verifyRes.json();
  if (!result.success) {
    return res.status(400).json({ error: "Xác thực Captcha thất bại" });
  }

  // ✅ Tiếp tục xử lý đăng nhập...
});
```

#### 🚀 **PHP / Laravel**:
```php
public function handleLogin(Request $request)
{
    $response = Http::asJson()->post('https://captcha.domaincuaban.com/v1/siteverify', [
        'secret'       => config('services.captcha.secret'), // cap_live_...
        'verify_token' => $request->input('vina_captcha_token'),
    ]);

    if (!$response->successful() || !($response->json('success') ?? false)) {
        return back()->withErrors(['captcha' => 'Xác thực Captcha không hợp lệ hoặc đã hết hạn']);
    }

    // ✅ Tiếp tục xử lý đăng nhập...
}
```

#### 🌐 **WordPress (`functions.php`)**:
```php
// Nhúng script vào Form Login
add_action('login_form', function() {
    echo '<div id="vina-captcha-container" style="margin-bottom:15px;"></div>';
    echo '<script src="https://captcha.domaincuaban.com/widget/vina-captcha.js"></script>';
    echo '<script>document.addEventListener("DOMContentLoaded", () => new NhanHoaCaptcha("vina-captcha-container", "YOUR_SITE_KEY_UUID"));</script>';
});

// Xác thực khi submit form
add_filter('authenticate', function($user, $username, $password) {
    if (empty($username) || empty($password)) return $user;
    
    $token = $_POST['vina_captcha_token'] ?? '';
    $res = wp_remote_post('https://captcha.domaincuaban.com/v1/siteverify', [
        'headers' => ['Content-Type' => 'application/json'],
        'body' => json_encode(['secret' => 'cap_live_YOUR_SECRET_KEY', 'verify_token' => $token])
    ]);
    
    $body = json_decode(wp_remote_retrieve_body($res), true);
    if (empty($body['success'])) {
        return new WP_Error('captcha_failed', 'Xác thực Captcha không hợp lệ.');
    }
    return $user;
}, 30, 3);
```

#### 🐍 **Python (FastAPI / Flask / Django)**:
```python
import requests

def verify_captcha(token: str) -> bool:
    resp = requests.post(
        "https://captcha.domaincuaban.com/v1/siteverify",
        json={
            "secret": "cap_live_YOUR_SECRET_KEY",
            "verify_token": token
        },
        timeout=5
    )
    return resp.json().get("success") is True
```

---

## 🛠️ 7. Các Lệnh Quản Trị & Bảo Trì

Các lệnh thực thi trong thư mục `/opt/vinacaptcha` trên VPS:

| Tác vụ | Lệnh thực thi |
| :--- | :--- |
| **Xem logs thời gian thực** | `docker compose logs -f backend` hoặc `docker compose logs -f gateway` |
| **Cập nhật phiên bản mới nhất** | `git pull origin main && docker compose build && docker compose up -d` |
| **Khởi động lại dịch vụ** | `docker compose restart` |
| **Dừng hệ thống** | `docker compose down` |
| **Kiểm tra trạng thái containers** | `docker compose ps` |
| **Gia hạn SSL thủ công** | `certbot renew && docker compose restart gateway` |

---

## ❓ 8. Xử Lý Sự Cố Thường Gặp

### 1. Lỗi CORS (`blocked by CORS policy`)
- **Nguyên nhân**: Tên miền của trang web gọi Captcha chưa được thêm vào danh sách cho phép.
- **Cách khắc phục**: Vào Dashboard → **Quản lý Sites** → Bấm sửa website tương ứng → Thêm tên miền vào mục **Primary Domain** hoặc **Allowed Domains**.

### 2. Lỗi `502 Bad Gateway`
- **Nguyên nhân**: Container backend chưa hoàn tất khởi động hoặc chưa kết nối được Postgres/Redis.
- **Cách khắc phục**: Chạy `docker compose logs backend` để kiểm tra lỗi và chạy `docker compose restart backend`.

### 3. Lỗi Cấp SSL Certbot Thất Bại
- **Nguyên nhân**: Bản ghi DNS (A Record) của tên miền chưa trỏ đúng về địa chỉ IP của VPS.
- **Cách khắc phục**: Dùng `ping yourdomain.com` trên máy tính để kiểm tra IP đã nhận diện đúng IP VPS chưa, sau đó chạy lại lệnh `sudo /opt/vinacaptcha/ssl.sh <domain> <email>`.

---

## 📄 Bản Quyền & Giấy Phép

Phát triển bởi đội ngũ kỹ thuật NhanHoaCaptcha. Phát hành dưới giấy phép mã nguồn mở **MIT License**.
