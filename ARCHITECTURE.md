# ARCHITECTURE.md — Nội bộ Captcha System

## 1. Tổng quan kiến trúc

```
┌─────────────┐      embed script      ┌──────────────────┐
│  Site khách  │ ─────────────────────▶ │  Widget (vanilla) │
└─────────────┘                        └─────────┬─────────┘
                                                  │ issue-token / verify-token
                                                  ▼
                                        ┌──────────────────┐
                                        │  Backend API      │
                                        │  NestJS+Fastify   │
                                        │  (stateless, N    │
                                        │   instances)       │
                                        └────┬────────┬─────┘
                                             │        │
                                        ┌────▼───┐ ┌──▼──────────┐
                                        │ Redis  │ │ PostgreSQL   │
                                        │ (token,│ │ (accounts,   │
                                        │  rate  │ │  sites, keys,│
                                        │  limit)│ │  logs)       │
                                        └────────┘ └──────────────┘
                                             ▲
                                             │ REST/GraphQL
                                        ┌────┴──────────────┐
                                        │  Admin Dashboard   │
                                        │  Refine + React 19 │
                                        │  + Vite            │
                                        └────────────────────┘
```

3 thành phần độc lập, deploy riêng, scale riêng.

## 2. Widget (site khách nhúng)

- Build bằng Vite ở library mode → xuất 1 file JS duy nhất, mục tiêu < 15KB gzip.
- Cô lập DOM/CSS bằng iframe hoặc Shadow DOM để tránh xung đột style với site khách.
- Luồng mặc định: **invisible check** (honeypot field ẩn + behavioral signal: mouse movement, thời gian điền form) → gửi kèm risk data khi gọi `/verify`.
- Chỉ hiển thị **visible challenge** (slider puzzle hoặc PoW) khi backend trả về `risk: high` từ lần gọi issue-token.
- Token JWT nhận về từ `/issue` gắn vào hidden input trong form site khách, submit kèm form thật.

## 3. Backend API

### 3.1 Endpoints chính
- `POST /issue` — nhận site API key + risk signal (IP, UA, honeypot flag) → trả về challenge type (none/slider/pow) + short-lived session id.
- `POST /verify` — nhận token + kết quả challenge → verify chữ ký, one-time-use check (Redis), trả pass/fail.

### 3.2 Token
- Ký bằng HMAC hoặc JWT với private key riêng cho từng site (key rotation hỗ trợ sau).
- Expiry ngắn: 30–60 giây.
- **One-time-use**: lưu token id vào Redis với TTL = expiry; verify xong thì xoá/đánh dấu used — chống replay.
- Session binding: hash(IP + User-Agent) gắn vào token, so sánh khi verify (constant-time compare, tránh timing attack).

### 3.3 Risk Engine (risk-based, giống reCAPTCHA v3)
- Input: tốc độ request từ IP, honeypot bị điền hay không, User-Agent bất thường, thời gian điền form quá nhanh.
- Output: score → quyết định `none` (qua luôn) / `slider` / `pow` (tăng độ khó PoW thích ứng theo tải hệ thống).
- Fail-mode: mặc định **fail-closed** khi backend quá tải (an toàn hơn), nhưng có config để đổi sang fail-open nếu ảnh hưởng UX quá nhiều — quyết định này cần xác nhận trước khi launch.

### 3.4 Hạ tầng
- **Framework: NestJS với `platform-fastify` adapter** (chốt, không dùng Express adapter) — lý do: endpoint `/issue`, `/verify` là hot path cần xử lý concurrent cao (theo kế hoạch load test mục 5, tới 5,000 concurrent), Fastify cho throughput cao hơn Express đáng kể ở tầng routing/JSON serialization, trong khi vẫn giữ được cấu trúc module/DI của Nest cho risk engine, cron job, và tách route `/v1/*` public khỏi `/admin/v1/*` admin.
- Module hoá theo domain: `IssueModule`, `VerifyModule`, `RiskEngineModule`, `ReputationModule` (đọc/ghi `ip_reputation`, `fingerprint_reputation`), `ThreatIntelModule` (sync cron), `AdminModule` (auth/sites/api-keys/logs/stats), `JobsModule` (`@nestjs/schedule` cho decay + batch reputation + sync threat-intel).
- Validation request body bằng `class-validator`/`class-transformer` — DTO khớp đúng schema JSON đã định nghĩa ở API_CONTRACT.md, reject sớm trước khi chạm business logic.
- Stateless, chạy nhiều instance sau load balancer.
- Đặt sau reverse proxy có rate-limit layer 7 (Nginx/Traefik), lý tưởng thêm CDN/WAF phía trước cho phần network-layer DDoS.
- Redis: connection pool riêng, theo dõi memory/eviction policy dưới tải cao.

### 3.5 Tích lũy dữ liệu Reputation (thay thế cho "big data" của Google)

Vì không có traffic quy mô toàn cầu như Google/Cloudflare, hệ thống bù lại bằng cách tích lũy tín hiệu từ 3 nguồn, ghép vào risk score ở mục 3.3:

**a) Reputation nội bộ dùng chung nhiều site (nguồn quan trọng nhất)**
- Bảng `ip_reputation` và `fingerprint_reputation` dùng CHUNG cho mọi site đang tích hợp captcha này (customer portal, market.nhanhoa.com, các site khác) — không tách riêng theo site.
- Mỗi lần `/verify` fail hoặc bị flag ở site A, ghi nhận vào bảng chung → áp dụng ngay cho site B lần sau, kể cả site B chưa từng thấy IP/fingerprint đó.
- Trường lưu tối thiểu: `ip` (hoặc CIDR), `fingerprint_hash`, `fail_count`, `last_seen_at`, `first_seen_at`, `site_count_seen` (số site khác nhau từng thấy entry này — càng nhiều site thấy 1 IP hoạt động bất thường thì độ tin cậy signal càng cao).
- Decay theo thời gian: entry không bị flag lại sau N ngày thì giảm dần fail_count (tránh giữ oan 1 IP dùng chung — NAT văn phòng, 4G — vĩnh viễn).
- Batch job định kỳ (VD: mỗi giờ) tổng hợp log verify mới nhất → cập nhật reputation, tách khỏi luồng verify realtime để không làm chậm response.

**b) Nguồn threat-intel mở/miễn phí, đồng bộ định kỳ** (danh sách chi tiết + URL cụ thể ở THREAT_INTEL_SOURCES.md)
- Danh sách IP range của cloud provider lớn (AWS/GCP/Azure/DigitalOcean) — IP thuộc range này hiếm khi là traffic người dùng thật, tín hiệu bot mạnh và dễ lấy (các provider công khai range này, cập nhật qua cron job tải lại theo tuần).
- Tor exit node list (public, cập nhật theo ngày).
- Spamhaus DROP/EDROP — danh sách network đã biết bị dùng cho spam/abuse.
- Lưu các nguồn này vào bảng riêng `threat_intel_ranges` (nguồn, CIDR, loại, cập nhật lúc nào), tra cứu bằng IP range match khi tính risk score — KHÔNG merge chung với bảng reputation tự tích lũy ở mục (a) vì khác vòng đời cập nhật.

**c) Fingerprint/behavior phía client (không cần data lớn vẫn phát hiện tốt)**
- `navigator.webdriver === true` → gần như chắc chắn headless browser.
- Thiếu/bất thường ở `plugins`, `mimeTypes`, canvas fingerprint không render đúng.
- Timing bất thường: submit form dưới 1 giây từ lúc trang load xong.
- Các tín hiệu này tính ngay tại thời điểm request, không cần tra cứu DB, cộng thẳng vào risk score cùng lúc với tra cứu (a) và (b).

### 3.6 Kiến trúc mở — sẵn sàng nhận thêm nguồn data mới

Danh sách nguồn ở mục 3.5.b (chi tiết THREAT_INTEL_SOURCES.md) sẽ không phải danh sách cố định — cần thiết kế `ThreatIntelModule` theo **connector pattern** ngay từ đầu để thêm nguồn mới (API trả phí, feed đối tác chia sẻ, dữ liệu nội bộ team khác) không phải sửa core logic.

**a) Interface chuẩn cho mọi nguồn (pull-based)**
```ts
interface ThreatIntelSourceProvider {
  sourceKey: string;          // 'firehol_level1', 'partner_x', ...
  fetch(): Promise<{ cidr: string; category: string }[]>;
}
```
- Mỗi nguồn = 1 file provider trong `backend/src/threat-intel/providers/`, implement đúng interface này.
- `ThreatIntelModule` chỉ biết gọi `.fetch()` qua danh sách provider đã đăng ký — không hardcode logic riêng cho từng nguồn trong service chính.
- Thêm nguồn mới = thêm 1 file provider + đăng ký vào registry, KHÔNG sửa `ThreatIntelService`.

**b) Bảng config để bật/tắt nguồn không cần redeploy**
- Bảng `threat_intel_source_configs` (xem SCHEMA.md) lưu: `source_key`, `enabled`, `sync_interval_minutes`, `ingest_type` (`pull` | `push`), `auth_config` (jsonb, để trống nếu không cần auth).
- Cron job đọc bảng này để biết nguồn nào đang bật và tần suất sync — bật/tắt hoặc đổi tần suất 1 nguồn chỉ cần sửa DB qua dashboard admin, không cần deploy lại code.

**c) Cổng nhận data kiểu push (đối tác/team khác chủ động gửi, không phải cron kéo)**
- Endpoint riêng `POST /admin/v1/threat-intel/ingest` (auth bằng service token nội bộ, KHÔNG dùng chung auth với site API key hay account JWT) — nhận payload `{ source_key, entries: [{ cidr, category }] }`.
- Dùng cho trường hợp: đối tác/team bảo mật nội bộ Nhanhoa có sẵn danh sách IP xấu tự thu thập, hoặc sau này tích hợp thêm 1 hệ thống nội bộ khác (VD SOC/monitoring) muốn đẩy data sang thẳng.
- Ghi log toàn bộ lần ingest (nguồn, số lượng entry, thời điểm) vào `verification_logs`-style audit riêng — không trust mù dữ liệu push từ ngoài, validate CIDR hợp lệ trước khi insert.

**d) Nguyên tắc cho agent khi thêm nguồn mới**
- Không được sửa trực tiếp `ThreatIntelService` để "if/else theo tên nguồn" — luôn implement provider mới theo interface ở mục (a).
- Nguồn mới phải khai báo trong `threat_intel_source_configs` trước khi cron nhặt vào chạy — không tự ý thêm nguồn "ẩn" chạy ngoài luồng config.

**Kỳ vọng thực tế**: đây là lớp phòng thủ thay thế tạm thời khi Google/hCaptcha bị chặn, không kỳ vọng chống được bot tinh vi target riêng hệ thống này như cách Google làm được nhờ quy mô toàn cầu.

## 4. Admin Dashboard

- Stack: **Refine.dev + React 19 + Vite**.
- Auth: Refine authProvider, tài khoản site owner đăng nhập quản lý site/domain/API key.
- Data provider: REST (hoặc GraphQL nếu backend hỗ trợ) trỏ vào Backend API's admin endpoints (tách route khỏi `/issue`, `/verify` public).
- Chức năng chính: CRUD site & domain whitelist, xem log verify (pass/fail, risk score theo thời gian), quản lý API key (tạo/rotate/revoke).
- Không SSR, không cần SEO — dashboard chỉ dùng nội bộ sau đăng nhập.

## 5. Kế hoạch Load Test

- Công cụ: **k6** (JS, dễ tích hợp CI).
- Baseline: xác định RPS tối đa 1 instance backend xử lý được, đo CPU/RAM (đặc biệt khi PoW tính ở server).
- Ramp-up theo bậc: 10 → 100 → 1,000 → 5,000 concurrent, theo dõi p95/p99 latency.
- Test riêng `/issue` vs `/verify` (tải khác nhau).
- Test Redis dưới tải cao song song (connection pool, memory, eviction).
- Môi trường: chỉ chạy nhắm vào staging nội bộ, không bao giờ nhắm production hoặc hệ thống bên thứ ba.

## 6. Kế hoạch Test Resilience (Application-layer)

- DDoS network-layer/volumetric → để CDN/upstream xử lý, không tự build ở tầng này.
- Test application-layer:
  - Rate-limit theo IP/token bucket — xác nhận reject đúng khi vượt ngưỡng.
  - Graceful degradation: xác nhận fail-closed hoạt động đúng khi backend quá tải.
  - PoW adaptive difficulty: xác nhận độ khó tăng theo tải hệ thống thực tế.

## 7. Kế hoạch Test Bypass/Logic Attack

- Tự động hoá thử chính captcha của mình (OCR nếu có text, pixel-matching cho slider) để đánh giá độ khó thực tế.
- Replay attack: verify token cũ hai lần → lần 2 phải reject.
- Token forgery: sửa payload rồi verify chữ ký → phải fail.
- Timing attack trên `/verify`: đảm bảo dùng constant-time compare, không lộ thông tin qua response time.

## 8. Trạng thái tài liệu

- [x] SCHEMA.md — DDL accounts/sites/api_keys/verification_logs/ip_reputation/fingerprint_reputation/threat_intel_ranges
- [x] API_CONTRACT.md — contract chi tiết `/issue`, `/verify`, `/siteverify`, dashboard REST
- [x] AGENTS.md — quy tắc agent (đã có)
- [x] ARCHITECTURE.md — file này
