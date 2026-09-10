# API_CONTRACT.md — Nội bộ Captcha System

Contract cho 2 nhóm API tách biệt hoàn toàn về route/auth (đúng theo ARCHITECTURE.md mục 4):
- **Public API** (`/v1/*`): widget gọi trực tiếp, auth bằng site API key.
- **Admin API** (`/admin/*`): dashboard Refine gọi, auth bằng session/JWT của account đăng nhập.

Không được gộp 2 nhóm này chung middleware auth.

---

## 1. Public API — widget

### 1.1 `POST /v1/issue`

Gọi khi widget load, trước khi user submit form.

**Headers**
```
X-Api-Key: cap_live_xxxxxxxxxxxx
Content-Type: application/json
```

**Request body**
```json
{
  "domain": "shop.example.com",
  "honeypot_filled": false,
  "client_signals": {
    "webdriver": false,
    "canvas_fingerprint": "a1b2c3...",
    "time_on_page_ms": 4200
  }
}
```

**Response 200**
```json
{
  "session_id": "8f2a1c3e-...",
  "challenge_type": "none",
  "pow_difficulty": null,
  "expires_in": 45
}
```
- `challenge_type`: `none` | `slider` | `pow`. Nếu `pow`, kèm thêm `pow_difficulty` (số leading zero bits yêu cầu).
- `expires_in`: giây, khớp với TTL token ở Redis (30–60s theo ARCHITECTURE.md 3.2).

**Response lỗi**
| Code | Khi nào |
|---|---|
| 401 | API key sai/revoked |
| 403 | `domain` không nằm trong `allowed_domains` của site |
| 429 | Vượt rate limit theo site/IP |

```json
{ "error": { "code": "domain_not_allowed", "message": "Domain không nằm trong whitelist của site" } }
```

### 1.2 `POST /v1/verify`

Gọi sau khi user hoàn thành challenge (hoặc ngay lập tức nếu `challenge_type: none`).

**Request body**
```json
{
  "session_id": "8f2a1c3e-...",
  "challenge_response": {
    "type": "slider",
    "final_position": 187
  }
}
```
- Nếu `challenge_type` là `pow`: `challenge_response` chứa `{ "type": "pow", "nonce": "..." }`.
- Nếu `none`: có thể bỏ trống `challenge_response`.

**Response 200 — pass**
```json
{
  "result": "pass",
  "verify_token": "vt_9f8e7d..."
}
```
`verify_token` là token 1 lần, backend của site khách dùng để xác nhận lại server-to-server (mục 1.3) — KHÔNG tự tin vào response này từ phía client, giống cơ chế reCAPTCHA siteverify.

**Response — fail/expired**
```json
{ "result": "fail", "reason": "challenge_incorrect" }
```
```json
{ "result": "expired", "reason": "session_expired" }
```

### 1.3 `POST /v1/siteverify` (server-to-server, site khách gọi từ backend của họ)

**Request body**
```json
{
  "secret": "site_secret_key",
  "verify_token": "vt_9f8e7d..."
}
```

**Response**
```json
{
  "success": true,
  "timestamp": "2026-09-07T10:22:31Z",
  "hostname": "shop.example.com"
}
```
- `verify_token` chỉ dùng được 1 lần — gọi lần 2 trả `success: false, reason: "already_used"`.

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
