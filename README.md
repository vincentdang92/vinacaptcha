# 🛡️ VinaCaptcha — Hệ Thống Xác Thực Chống Bot & Captcha Nội Bộ

[![Build & Tests](https://img.shields.io/badge/tests-30%2F30%20passing-brightgreen)](#)
[![Widget Bundle Size](https://img.shields.io/badge/widget%20size-%3C%206.5KB%20gzip-blue)](#)
[![Fastify + NestJS](https://img.shields.io/badge/backend-Fastify%20%2B%20NestJS-red)](#)
[![Refine Dashboard](https://img.shields.io/badge/dashboard-Refine%20%2B%20React%2019-purple)](#)
[![License](https://img.shields.io/badge/license-MIT-green)](#)

**VinaCaptcha** là giải pháp xác thực bảo mật và phòng chống bot tự động thế hệ mới, được thiết kế để tự host hoàn toàn (Self-Hosted), thay thế hoàn hảo cho Google reCAPTCHA, Cloudflare Turnstile, hoặc hCaptcha trong các trường hợp bị chặn quốc tế, ISP throttle hoặc có yêu cầu chủ quyền dữ liệu nội bộ.

---

## ⚡ 1. Cài Đặt 1 Lệnh Duy Nhất (Ubuntu 22.04 / 24.04 VPS)

Trên máy chủ VPS Ubuntu mới (yêu cầu quyền `root` hoặc `sudo`):

```bash
curl -fsSL https://raw.githubusercontent.com/vincentdang92/vinacaptcha/main/install.sh | bash
```

### 🔒 Kích hoạt Chứng chỉ SSL / HTTPS tự động:
Sau khi trỏ tên miền của bạn (VD: `captcha.yourdomain.com`) về địa chỉ IP của VPS:
```bash
sudo /opt/vinacaptcha/ssl.sh captcha.yourdomain.com your-email@domain.com
```
*Script sẽ tự động cài Certbot, sinh chứng chỉ Let's Encrypt SSL, cấu hình Nginx HTTPS 443 và tạo Cronjob tự động gia hạn chứng chỉ vào 3:00 AM hàng ngày.*

---

## 🔑 2. Mô Hình 2 Khóa Bảo Mật (2-Key Architecture)

Hệ thống tuân thủ chuẩn bảo mật phân tách 2 khóa:

| Khóa | Tên gọi | Định dạng ví dụ | Nơi lưu & Sử dụng | Mục đích bảo mật |
| :--- | :--- | :--- | :--- | :--- |
| 🟢 **Public Site Key** | Khóa Website Công Khai | UUID: `0119c349-a104-4dd2-b4c5-214c6656a481` | **Client (HTML / JS / App)** | Dùng để tải widget và yêu cầu cấp thử thách. An toàn vì được bảo vệ bằng **Domain Whitelist**. |
| 🔴 **Private Secret Key** | Khóa API Bí Mật Server | `cap_live_90ee9772f1e3...` | **Server Backend (.env)** | Dùng cho máy chủ backend của bạn gọi `POST /v1/siteverify`. **Tuyệt đối KHÔNG để lộ ở client.** |

---

## 🚀 3. Hướng Dẫn Tích Hợp 2 Bước

### **Bước 1: Phía Client / Frontend (Dùng Public Site Key)**

Nhúng đoạn mã sau vào form HTML của website:

```html
<!-- 1. VinaCaptcha Container bên trong <form> -->
<div id="vina-captcha-container"></div>

<!-- 2. Nhúng Script Widget (< 6.5KB gzip) -->
<script src="https://your-captcha-domain.com/widget/vina-captcha.js" defer></script>
<script>
  document.addEventListener("DOMContentLoaded", function() {
    new VinaCaptcha("vina-captcha-container", {
      siteKey: "YOUR_PUBLIC_SITE_KEY_UUID", // Site Key UUID lấy từ Dashboard
      onSuccess: function(token, score) {
        console.log("Xác thực hoàn tất! Token:", token);
      }
    });
  });
</script>
```
*Khi người dùng submit form, Widget tự động tạo trường ẩn `vina_captcha_token` kèm theo giá trị token xác thực ngắn hạn (TTL 60s).*

---

### **Bước 2: Phía Server Backend (Dùng Secret Key `cap_live_...`)**

Khi form gửi về Server của bạn, Backend lấy `vina_captcha_token` và gửi request đối soát sang VinaCaptcha Server:

#### 🟢 **Node.js / Express**:
```javascript
const response = await fetch("https://your-captcha-domain.com/v1/siteverify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    secret: process.env.VINACAPTCHA_SECRET_KEY, // cap_live_...
    verify_token: req.body.vina_captcha_token     // Token nhận từ client form
  })
});

const result = await response.json();
if (result.success) {
  // ✅ Xác thực thành công (Người dùng thật)
  console.log("Score:", result.score, "Risk level:", result.risk_level);
} else {
  // ❌ Thất bại
  console.error("Xác thực thất bại:", result.reason);
}
```

#### 🚀 **PHP / Laravel**:
```php
$response = Http::asJson()->post('https://your-captcha-domain.com/v1/siteverify', [
    'secret'       => config('services.vinacaptcha.secret_key'), // cap_live_...
    'verify_token' => $request->input('vina_captcha_token'),
]);

if (!$response->successful() || !($response->json('success') ?? false)) {
    return back()->withErrors(['captcha' => 'Xác thực Captcha không hợp lệ hoặc đã hết hạn']);
}
```

#### 🐍 **Python (FastAPI / Flask / Django)**:
```python
import requests

def verify_vina_captcha(token: str) -> bool:
    resp = requests.post(
        "https://your-captcha-domain.com/v1/siteverify",
        json={
            "secret": os.environ["VINACAPTCHA_SECRET_KEY"],
            "verify_token": token
        },
        timeout=5
    )
    return resp.json().get("success") is True
```

---

## 📡 4. Public API Reference

Base URL: `https://your-captcha-domain.com`

### 4.1 `POST /v1/issue`
Yêu cầu cấp phiên thử thách và đánh giá điểm rủi ro.
- **Header**: `X-Site-Key: <SITE_KEY_UUID>` (hoặc `X-Api-Key`)
- **Body**: `{ "domain": "example.com", "client_signals": { ... }, "honeypot_filled": false }`
- **Response**: `{ "session_id": "...", "challenge_type": "none"|"slider"|"pow", "expires_in": 60 }`

### 4.2 `POST /v1/verify`
Giải pháp thử thách từ widget gửi lên để đổi lấy `verify_token`.
- **Body**: `{ "session_id": "...", "challenge_response": { ... } }`
- **Response**: `{ "result": "pass", "verify_token": "vt_..." }`

### 4.3 `POST /v1/siteverify` (Server-to-Server)
Xác thực token một lần (One-Time Token).
- **Body**: `{ "secret": "cap_live_...", "verify_token": "vt_..." }`
- **Response 200**:
```json
{
  "success": true,
  "score": 15,
  "risk_level": "low",
  "hostname": "shop.example.com",
  "timestamp": "2026-09-11T11:00:00.000Z"
}
```

---

## 🛠️ 5. Kiến Trúc Kỹ Thuật

Hệ thống bao gồm 3 phân hệ độc lập:
1. **Widget (`widget/`)**: Vanilla TypeScript + Vite library mode, bundle `< 6.5KB gzip`, hỗ trợ Honeypot DOM ẩn, Fingerprinting Canvas, PoW Client Solver và Slider Puzzle tương tác.
2. **Backend API (`backend/`)**: NestJS với `platform-fastify` hiệu năng cao (> 50,000 req/s), Redis One-Time Token (Lua scripts, atomic quota check), Risk Engine đa tầng kết hợp Threat Intelligence & IP Reputation.
3. **Admin Dashboard (`dashboard/`)**: Refine.dev + React 19 + Ant Design + Vite. Cung cấp CMS Wizard khởi tạo Super Admin, quản lý Website/Domain Whitelist, cấp phát API Key Secrets, theo dõi Verification Logs thời gian thực và quản lý Blacklist IP.

---

## 📄 Bản Quyền & Giấy Phép

Phát triển bởi đội ngũ kỹ thuật VinaCaptcha. Giấy phép mã nguồn mở MIT License.
