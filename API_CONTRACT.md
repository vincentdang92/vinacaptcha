# API_CONTRACT.md — Nội bộ Captcha System

Contract cho 2 nhóm API tách biệt hoàn toàn về route/auth (đúng theo ARCHITECTURE.md mục 4):
- **Public API** (`/v1/*`): widget gọi trực tiếp, auth bằng site API key.
- **Admin API** (`/admin/*`): dashboard Refine gọi, auth bằng session/JWT của account đăng nhập.

Không được gộp 2 nhóm này chung middleware auth.

---

## 1. Public API — widget & backend siteverify

### 1.1 `POST /v1/issue`

Gọi khi widget load hoặc user submit form để đánh giá rủi ro và cấp session thử thách.

**Headers**
```http
X-Site-Key: 0119c349-a104-4dd2-b4c5-214c6656a481   (hoặc X-Api-Key)
Content-Type: application/json
```
*(Hỗ trợ cả Public Site Key UUID hoặc API Key Prefix. Request được kiểm tra đối soát với Domain Whitelist).*

**Request body**
```json
{
  "domain": "shop.example.com",
  "honeypot_filled": false,
  "client_signals": {
    "webdriver": false,
    "canvas_fingerprint": "a1b2c3...",
    "time_on_page_ms": 4200,
    "mouse_moves": 34,
    "mouse_clicks": 2,
    "key_strokes": 18
  },
  "client_reported_ip": "14.185.x.x"
}
```

**Response 200**
```json
{
  "session_id": "8f2a1c3e-...",
  "challenge_type": "none",
  "pow_difficulty": null,
  "slider_data": null,
  "expires_in": 60
}
```
- `challenge_type`: `none` | `slider` | `pow`. 
- Nếu `slider`: trả kèm `slider_data: { y: number, seed: number, puzzle_size: number }`.
- Nếu `pow`: trả kèm `pow_difficulty` (số leading zero bits yêu cầu, vd: 12).
- `expires_in`: giây, khớp với TTL token ở Redis (60s theo ARCHITECTURE.md 3.2).

**Response lỗi**
| Code | Error Code | Khi nào |
|---|---|---|
| 401 | `missing_site_key` / `invalid_site_key` | Thiếu header hoặc Site Key sai/revoked/bị khóa |
| 403 | `ip_banned` | Địa chỉ IP nằm trong danh sách cấm / lịch sử vi phạm cao (`failCount > 10`) |
| 403 | `rate_limit_exceeded` | Tần suất gửi yêu cầu quá cao (> 6 lần/5 phút hoặc spam dồn dập). Tự động khóa 5 phút. |
| 403 | `domain_not_allowed` | `domain` không nằm trong `allowed_domains` của site |
| 429 | `quota_exceeded` | Vượt hạn mức gói cước tháng của tài khoản |

```json
{ "error": { "code": "ip_banned", "message": "Địa chỉ IP của bạn tạm thời bị khóa do có quá nhiều hành vi bất thường. Vui lòng liên hệ quản trị viên." } }
```

### 1.2 `POST /v1/verify`

Gọi sau khi user hoàn thành challenge (hoặc ngay lập tức nếu `challenge_type: none`).

**Request body**
```json
// Với challenge_type = "slider":
{
  "session_id": "8f2a1c3e-...",
  "challenge_response": {
    "type": "slider",
    "final_position": 187,
    "drag_duration_ms": 850,
    "trajectory": [{"x": 0, "y": 50, "t": 0}, {"x": 187, "y": 50, "t": 850}]
  }
}

// Với challenge_type = "pow":
{
  "session_id": "8f2a1c3e-...",
  "challenge_response": {
    "type": "pow",
    "nonce": "128492"
  }
}

// Với challenge_type = "none":
{
  "session_id": "8f2a1c3e-..."
}
```

**Response 200 — pass**
```json
{
  "result": "pass",
  "verify_token": "vt_9f8e7d82b4c1..."
}
```
`verify_token` là token 1 lần (TTL 60s), backend của site khách dùng để xác nhận lại server-to-server (mục 1.3).

**Response — fail/expired**
```json
{ "result": "fail", "reason": "slider_position_incorrect" }
```
```json
{ "result": "expired", "reason": "session_expired" }
```

### 1.3 `POST /v1/siteverify` (Server-to-Server)

Máy chủ backend của khách hàng gọi sang NhanHoaCaptcha để đối soát tính hợp lệ của token.

**Request body**
```json
{
  "secret": "cap_live_90ee9772f1e376bd801a2f1c",
  "verify_token": "vt_9f8e7d82b4c1..."
}
```

**Response 200 — Thành công**
```json
{
  "success": true,
  "score": 15,
  "risk_level": "low",
  "hostname": "shop.example.com",
  "timestamp": "2026-09-11T11:00:00.000Z"
}
```
- `score`: Điểm rủi ro từ 0 (cực kỳ an toàn) đến 100 (nguy cơ cao là bot).
- `risk_level`: `"low"` (0–29) | `"medium"` (30–69) | `"high"` (70–100).
- `verify_token` chỉ dùng được duy nhất 1 lần (One-Time Token trong Redis) — gọi lần 2 sẽ trả về `success: false, reason: "already_used"`.

**Response 503 — Hệ thống captcha gặp sự cố nội bộ (DB/Redis quá tải, mất kết nối)**
```json
{
  "error": {
    "code": "service_unavailable",
    "message": "Hệ thống xác thực tạm thời không khả dụng, vui lòng thử lại sau."
  }
}
```
- Server **không bao giờ** trả `success: true` khi không kiểm tra được token (fail-closed). Trước đây server trả 200 `success: true, fallback: true` — kẻ tấn công có thể chủ động làm quá tải để mọi token bịa đều qua. Việc cho qua hay chặn khi gặp 5xx/timeout do backend của khách quyết định (xem khuyến nghị bên dưới).

**Response — Thất bại**
```json
{
  "success": false,
  "reason": "invalid_secret"
}
```
hoặc
```json
{
  "success": false,
  "reason": "already_used"
}
```

> **🛡️ Khuyến nghị tích hợp phía Client Backend (Fail-Open Fallback)**:
> - Cài đặt **Timeout tối đa 5000ms (5 giây)** cho request gọi `/v1/siteverify`.
> - Trong giai đoạn thử nghiệm (Testing/Trial Phase), nếu request bị quá hạn 5s hoặc server captcha trả mã lỗi 5xx, backend khách nên **ưu tiên cho pass (`success: true`)** để không làm gián đoạn trải nghiệm hoặc chặn khách hàng thật.

---

## 2. Admin API — dashboard (Refine data provider)

Base path `/admin/v1`. Auth: JWT trong header `Authorization: Bearer <access_token>`, lấy từ endpoint login.

### 2.1 Auth

**`POST /admin/v1/auth/login`**
```json
// request
{ "email": "vincent@vna.com", "password": "..." }
// response 200
{ "access_token": "...", "refresh_token": "...", "expires_in": 3600 }
```

**`POST /admin/v1/auth/refresh`**
```json
{ "refresh_token": "..." }
```

**`POST /admin/v1/auth/activate`** — kích hoạt tài khoản sau đăng ký (public, không cần JWT)

Email kích hoạt chứa link tới trang Dashboard `<DASHBOARD_URL|APP_URL>/activate?token=<64 hex>`; trang này gọi endpoint dưới đây rồi chuyển về `/login?activated=true`. Link dạng cũ `GET /admin/v1/auth/activate?token=...` chỉ còn chuyển hướng (302) sang trang `/activate`, không tự kích hoạt.
```json
// request
{ "token": "<64 ký tự hex>" }
// response 201
{ "success": true, "message": "Tài khoản đã được kích hoạt thành công." }
// response 400: token sai định dạng, không tồn tại hoặc đã dùng
```

### 2.2 Sites — CRUD

| Method | Path | Ghi chú |
|---|---|---|
| GET | `/admin/v1/sites` | list, hỗ trợ `?page=&limit=` theo convention Refine (`_start`, `_end` hoặc `page`/`pageSize` tùy dataProvider chọn) |
| POST | `/admin/v1/sites` | tạo site mới |
| GET | `/admin/v1/sites/:id` | chi tiết 1 site |
| PATCH | `/admin/v1/sites/:id` | sửa `name`, `allowed_domains`, `status` |
| DELETE | `/admin/v1/sites/:id` | xoá (soft delete khuyến nghị, không hard delete vì còn `verification_logs` tham chiếu) |

**POST request body**
```json
{
  "name": "Shop ABC",
  "primary_domain": "shop.example.com",
  "allowed_domains": ["shop.example.com", "m.shop.example.com"]
}
```

### 2.3 API Keys

| Method | Path | Ghi chú |
|---|---|---|
| GET | `/admin/v1/sites/:siteId/api-keys` | list, chỉ trả `key_prefix`, KHÔNG bao giờ trả lại key gốc |
| POST | `/admin/v1/sites/:siteId/api-keys` | tạo mới — response DUY NHẤT lần này trả `key` plaintext, sau đó không lấy lại được |
| DELETE | `/admin/v1/sites/:siteId/api-keys/:keyId` | revoke (set `revoked_at`), không hard delete |

**POST response (chỉ lần tạo)**
```json
{
  "id": "...",
  "key": "cap_live_8f2a9d7e6c5b4a3f",
  "key_prefix": "cap_live_8f2a",
  "label": "production",
  "created_at": "2026-09-07T10:00:00Z"
}
```

### 2.4 Verification Logs (đọc, dùng cho bảng thống kê dashboard)

**`GET /admin/v1/sites/:siteId/verification-logs`**

Query params: `from`, `to` (ISO date), `result` (`pass`|`fail`|`expired`), `page`, `limit`.

```json
{
  "data": [
    {
      "id": 10234,
      "ip": "203.0.113.10",
      "risk_score": 62.5,
      "challenge_type": "slider",
      "result": "pass",
      "created_at": "2026-09-07T09:58:12Z"
    }
  ],
  "total": 15234
}
```

### 2.5 Stats (biểu đồ risk score theo thời gian, dùng cho dashboard chart)

**`GET /admin/v1/sites/:siteId/stats?granularity=hour&from=&to=`**
```json
{
  "data": [
    { "bucket": "2026-09-07T09:00:00Z", "pass": 1200, "fail": 45, "expired": 12, "avg_risk_score": 18.4 }
  ]
}
```

---

### 2.6 Threat Intel — quản lý nguồn + cổng nhận data push (mục 3.6 trong ARCHITECTURE.md)

**`GET /admin/v1/threat-intel/sources`** — list nguồn đang cấu hình, kèm `last_synced_at` để phát hiện cron chết.

**`PATCH /admin/v1/threat-intel/sources/:sourceKey`** — bật/tắt nguồn hoặc đổi `sync_interval_minutes`, không cần redeploy.
```json
{ "enabled": false }
```

**`POST /admin/v1/threat-intel/ingest`** — cổng push, dùng cho đối tác/team nội bộ khác chủ động đẩy IP list sang (KHÔNG dùng chung auth với site API key hay account JWT — auth bằng service token nội bộ riêng, header `X-Internal-Service-Token`).
```json
// request
{
  "source_key": "partner_x",
  "entries": [
    { "cidr": "203.0.113.0/24", "category": "spam" }
  ]
}
// response 200
{ "accepted": 1, "rejected": 0 }
```
- Entry có `cidr` không hợp lệ bị reject riêng lẻ, không fail nguyên batch — response trả kèm chi tiết `rejected_entries` nếu có.
- Mọi lần gọi endpoint này được ghi audit log riêng (nguồn, số lượng, thời điểm, IP caller) — không trust mù dữ liệu từ ngoài.

## 3. Quy ước chung


- Mọi timestamp: ISO 8601 UTC.
- Mọi lỗi theo format thống nhất: `{ "error": { "code": "...", "message": "..." } }`.
- Rate limit headers trên mọi response public API: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- Versioning: prefix `/v1/` — thay đổi breaking phải lên `/v2/`, không sửa contract cũ.
- Không bao giờ log/trả plaintext `api_key` hoặc `password` trong bất kỳ response hay log nào ngoài lần tạo key duy nhất (mục 2.3).

## 4. Trạng thái tài liệu

- [x] AGENTS.md
- [x] ARCHITECTURE.md
- [x] SCHEMA.md
- [x] API_CONTRACT.md — file này
