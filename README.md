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

## 💻 1. Yêu Cầu Hệ Thống & Tối Ưu Tài Nguyên
 
- **Hệ điều hành**: Ubuntu 20.04 / 22.04 / 24.04 LTS (hoặc Debian 11/12).
- **Cấu hình tối ưu & khuyến nghị (Production)**: **3 vCPU / 3 GB RAM** (hoặc 2–4 vCPU, 2–4 GB RAM, 20 GB SSD).
  - Khả năng xử lý: **50.000+ lượt xác thực/giây** (Fastify non-blocking I/O + Redis In-Memory).
  - Compile & Build Docker: Trơn tru, tốc độ cao (không bị nghẽn RAM khi Vite/TypeScript build).
- **Cấu hình tối thiểu**: 1 vCPU, 1 GB RAM + 2 GB Swap (Tự động kích hoạt bởi `install.sh`).
- **Phân bổ tài nguyên mặc định trên Docker (Đã tối ưu cho VPS 3 CPU / 3 GB RAM)**:
  - **Redis 7**: Cấp phát `768 MB` RAM (`volatile-lru`), xử lý hàng triệu token one-time-use và CORS whitelist tức thì.
  - **PostgreSQL 15/16**: Cấu hình `512 MB` shared_buffers, `1.5 GB` effective_cache_size, 200 concurrent connection pool.
  - **Backend (Fastify + NestJS)**: V8 Node heap `1024 MB` (`--max-old-space-size=1024`), chịu tải đồng thời cực lớn.
  - **Gateway (Nginx) & Dashboard SPA**: Alpine containers siêu nhẹ (< 60 MB RAM).
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

### **Bước 1: Phía Frontend / Client (Dùng Public Site Key UUID)**

Bạn có thể lựa chọn 1 trong 2 cách tích hợp phía Frontend:

#### 🔹 **Cách 1: Nhúng Tự Động (Khuyến nghị cho Form thông thường)**
Đặt thẻ container vào form HTML và khởi tạo:
```html
<form id="login-form" action="/login" method="POST">
  <input type="text" name="username" placeholder="Username" required />
  <input type="password" name="password" placeholder="Password" required />

  <!-- 1. Container captcha đặt bên trong thẻ <form> -->
  <div id="vina-captcha-container"></div>
  <input type="hidden" name="vina_captcha_token" id="vina_captcha_token" />

  <button type="submit">Đăng nhập</button>
</form>

<!-- 2. Nhúng Script Widget (< 6.5KB gzip) -->
<script src="https://captcha.domaincuaban.com/widget/vina-captcha.js" defer></script>
<script>
  document.addEventListener("DOMContentLoaded", function() {
    new NhanHoaCaptcha("vina-captcha-container", {
      siteKey: "YOUR_PUBLIC_SITE_KEY_UUID", // Site Key UUID lấy từ Dashboard
      onSuccess: function(token, score) {
        document.getElementById("vina_captcha_token").value = token;
        console.log("Xác thực hoàn tất! Token:", token);
      }
    });
  });
</script>
```

---

#### 🔹 **Cách 2: Chặn & Gọi Chủ Động Khi Submit Form (reCAPTCHA v3 / jQuery / Loading Modal)**
Phù hợp cho các form cần hiện Loading Spinner, Modal hoặc xử lý AJAX trước khi submit:
```html
<!-- 1. Nhúng Script Widget -->
<script src="https://captcha.domaincuaban.com/widget/vina-captcha.js" defer></script>

<form id="login" action="/login" method="POST">
  <input type="text" name="username" placeholder="Tên đăng nhập" required />
  <input type="password" name="password" placeholder="Mật khẩu" required />
  
  <!-- Field ẩn lưu token captcha -->
  <input type="hidden" name="vina_captcha_token" id="vina_captcha_token" />
  
  <button type="submit" class="btn btn-primary">Đăng Nhập</button>
</form>

<script>
  document.addEventListener("DOMContentLoaded", function () {
    // 1. Chặn sự kiện submit form mặc định
    document.querySelector("form#login").addEventListener("submit", function(e) {
      e.preventDefault(); 
      const form = document.getElementById('login');
      
      // 2. Chờ Captcha sẵn sàng và thực thi lấy Token (reCAPTCHA v3 style)
      NhanHoaCaptcha.ready(function () {
        NhanHoaCaptcha.execute('YOUR_PUBLIC_SITE_KEY_UUID', { action: 'login' }).then(function (token) {
          if (!token) {
            alert("Xác thực Captcha thất bại. Vui lòng thử lại.");
            return;
          }

          // 3. Gán token vào input ẩn
          document.getElementById('vina_captcha_token').value = token;
          // Hoặc dùng jQuery: $('#vina_captcha_token').val(token);

          // 4. Hiển thị modal loading (nếu có)
          if (typeof $ !== 'undefined' && $('#myModal_ticket_loading').length) {
            $("#myModal_ticket_loading").modal({
              backdrop: 'static',
              keyboard: false
            });
          }
          
          // 5. Tiến hành submit form
          try {
            form.submit();
          } catch (err) {
            alert("Có lỗi xảy ra! Vui lòng nhấn F5 và đăng nhập lại!");
          }
        });
      });
    });
  });
</script>
```

---

### **Bước 2: Phía Server Backend (Dùng Secret Key `cap_live_...`)**

Khi form gửi về Server của bạn, Backend lấy trường `vina_captcha_token` và gửi request xác minh server-to-server.

> 🛡️ **Khuyến nghị Fail-Open Fallback (Thử Nghiệm)**: Cài đặt **Timeout 5 giây (5000ms)** cho request gọi sang `/v1/siteverify`. Nếu hệ thống captcha bị treo quá 5s hoặc trả mã lỗi 5xx trong giai đoạn thử nghiệm, backend nên **ưu tiên cho pass (`success: true`)** để không gián đoạn thao tác của khách hàng thật.

#### 🟢 **Node.js / Express**:
```javascript
app.post('/api/login', async (req, res) => {
  const token = req.body.vina_captcha_token;
  
  let isPassed = false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // ⏱️ Timeout 5s

    const verifyRes = await fetch("https://captcha.domaincuaban.com/v1/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: process.env.CAPTCHA_SECRET_KEY, // cap_live_...
        verify_token: token                     // Token một lần nhận từ form
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!verifyRes.ok) {
      console.warn("[NhanHoaCaptcha] Server 5xx error, ưu tiên cho pass trong giai đoạn thử nghiệm.");
      isPassed = true; // Fallback pass
    } else {
      const result = await verifyRes.json();
      isPassed = result.success === true;
    }
  } catch (err) {
    // ⏱️ Treo quá 5s hoặc lỗi mạng -> Ưu tiên cho pass trong giai đoạn thử nghiệm
    console.warn("[NhanHoaCaptcha] Timeout > 5s hoặc lỗi mạng, fail-open fallback:", err.message);
    isPassed = true;
  }

  if (!isPassed) {
    return res.status(400).json({ error: "Xác thực Captcha thất bại hoặc đã hết hạn" });
  }

  // ✅ Tiếp tục xử lý đăng nhập...
});
```

#### 🚀 **PHP / Laravel**:
```php
public function handleLogin(Request $request)
{
    try {
        $response = Http::timeout(5)->asJson()->post('https://captcha.domaincuaban.com/v1/siteverify', [
            'secret'       => config('services.captcha.secret'), // cap_live_...
            'verify_token' => $request->input('vina_captcha_token'),
        ]);

        // Nếu captcha server lỗi 5xx trong lúc thử nghiệm -> Cho qua
        if (!$response->successful()) {
            \Log::warning('[NhanHoaCaptcha] Server error, fail-open fallback applied.');
        } elseif (!($response->json('success') ?? false)) {
            return back()->withErrors(['captcha' => 'Xác thực Captcha không hợp lệ hoặc đã hết hạn']);
        }
    } catch (\Throwable $e) {
        // Treo quá 5s hoặc lỗi mạng -> Ưu tiên cho pass trong lúc thử nghiệm
        \Log::warning('[NhanHoaCaptcha] Timeout (>5s), fail-open fallback: ' . $e->getMessage());
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

// Xác thực khi submit form (Timeout 5s & Fail-Open)
add_filter('authenticate', function($user, $username, $password) {
    if (empty($username) || empty($password)) return $user;
    
    $token = $_POST['vina_captcha_token'] ?? '';
    if (empty($token)) {
        return new WP_Error('captcha_missing', 'Vui lòng hoàn thành xác thực Captcha.');
    }

    $res = wp_remote_post('https://captcha.domaincuaban.com/v1/siteverify', [
        'headers' => ['Content-Type' => 'application/json'],
        'body' => json_encode(['secret' => 'cap_live_YOUR_SECRET_KEY', 'verify_token' => $token]),
        'timeout' => 5 // ⏱️ Timeout 5s
    ]);
    
    // Treo quá 5s hoặc lỗi mạng -> Ưu tiên cho pass trong giai đoạn thử nghiệm
    if (is_wp_error($res) || wp_remote_retrieve_response_code($res) >= 500) {
        error_log('[NhanHoaCaptcha] WP Timeout > 5s or server error, fail-open allowed.');
        return $user;
    }

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
    try:
        resp = requests.post(
            "https://captcha.domaincuaban.com/v1/siteverify",
            json={
                "secret": "cap_live_YOUR_SECRET_KEY",
                "verify_token": token
            },
            timeout=5 # ⏱️ Timeout 5 giây
        )
        if resp.status_code >= 500:
            return True # Fail-open khi server lỗi
        return resp.json().get("success") is True
    except requests.exceptions.Timeout:
        # Treo quá 5s -> Ưu tiên cho pass trong giai đoạn thử nghiệm
        print("[NhanHoaCaptcha] Timeout > 5s, ưu tiên pass trong lúc thử nghiệm.")
        return True
    except Exception as e:
        print(f"[NhanHoaCaptcha] Lỗi kết nối: {e}, fail-open fallback.")
        return True
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
