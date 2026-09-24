# KNOWN_ISSUES.md — Lỗi đã biết & hướng xử lý

> Cập nhật: 2026-09-24 · Audit trên commit `f13ae50`; đã sửa thêm C1–C3 ở `e85db7b` và C4 ở `986d8fc` (nhánh `fix/critical-captcha-bypass`).
> Mọi mục bên dưới đã được đối chiếu với code thật (file:dòng tại thời điểm audit).
> Khi sửa xong một mục: chuyển nó sang phần **Đã sửa**, ghi commit hash.

Mức độ:
- **Critical** — bị khai thác từ xa, không cần tài khoản, phá vỡ chức năng chính (chống bot).
- **High** — chiếm quyền / lộ dữ liệu / làm hỏng triển khai.
- **Medium** — cần điều kiện đi kèm, hoặc gây lỗi vận hành.
- **Low** — chất lượng code, vi phạm quy ước, rủi ro nhỏ.

---

## Đã sửa

### ✅ Link kích hoạt tài khoản sai host + host header poisoning — `f13ae50`
- **Lỗi cũ:** link trong email dựng từ header `Host`/`X-Forwarded-Host` của request API → ở dev redirect về `localhost:3068/login` (404); gateway chạy cổng khác 80 thì link mất cổng; token sai hiện JSON lỗi thô; kẻ tấn công gửi `X-Forwarded-Host: evil.com` khi gọi forgot-password là email thật chứa link tới domain của chúng → lộ token reset → chiếm tài khoản.
- **Đã sửa:** `backend/src/mail/dashboard-url.ts` (ưu tiên `DASHBOARD_URL`/`APP_URL`, bỏ `X-Forwarded-Host`), trang Dashboard `/activate` + `POST /admin/v1/auth/activate`, escape tên người dùng trong email, `ssl.sh` tự ghi `APP_URL`.
- **Việc còn lại khi deploy:** đặt `APP_URL=https://<domain>` trong `.env` (xem DEPLOYMENT.md). Nếu không đặt, hệ thống cài bằng IP vẫn phải dựa vào `Host` của request (nginx `server_name _` nhận mọi Host).

---

### ✅ C1. Vượt captcha hoàn toàn bằng `force_challenge` — `e85db7b`
- **Lỗi cũ:** `POST /v1/issue` nhận `force_challenge` là chuỗi bất kỳ và ghi đè cả `challenge_mode` của site lẫn risk engine; verify coi mọi loại khác `pow`/`slider` là pass → gửi `{"force_challenge":"none"}` là có `verify_token` mà không phải giải gì.
- **Đã sửa:** DTO chỉ nhận `auto | none | slider | pow`; mức hiệu lực = max(mức site/risk engine, mức client yêu cầu) theo thứ tự `none < slider < pow` — client chỉ nâng được, không hạ được. Verify: loại lạ → fail (`unknown_challenge_type`). Test: `issue.service.spec.ts`, `verify.service.spec.ts`.

### ✅ C2. `/v1/siteverify` trả `success: true` khi có lỗi nội bộ — `e85db7b`
- **Lỗi cũ:** mọi exception (DB/Redis quá tải) → `success: true, fallback: true`, kể cả với secret sai và token bịa; kẻ tấn công chủ động làm quá tải được.
- **Đã sửa:** trả HTTP 503 `{ "error": { "code": "service_unavailable", ... } }`; log JSON chỉ gồm `code`/`message`. API_CONTRACT 1.3 và trang API Docs đã cập nhật.
- **Ảnh hưởng tới khách hàng:** backend của site khách giờ nhận 503 thay vì 200 khi hệ thống captcha gặp sự cố. Code tích hợp theo mẫu trong README/API Docs (timeout 5s, 5xx → tự quyết cho qua) vẫn hoạt động; code chỉ đọc `success` sẽ chặn (fail-closed) — nên thông báo cho khách trước khi deploy.

### ✅ C3. Giả mạo IP qua `X-Forwarded-For` — `e85db7b`
- **Lỗi cũ:** nginx nối thêm vào header client gửi, backend lấy phần tử đầu tiên = giá trị client tự điền → vượt rate-limit/ban, gài ban IP người khác.
- **Đã sửa:** Fastify `trustProxy` chỉ tin hop loopback/link-local/private (`backend/src/common/client-ip.ts`), controller dùng `request.ip`; IP sai định dạng → `0.0.0.0`; `client_reported_ip` chỉ dùng ở dev. nginx (`vina-captcha.conf` + template `ssl.sh`) ghi đè `X-Forwarded-For $remote_addr`. Test tích hợp qua Fastify thật: `client-ip.spec.ts`.
- **Việc còn lại khi deploy:** server đã bật SSL vẫn giữ `nginx/conf.d/ssl.conf` cũ (nối header) — backend mới đã tự bỏ qua phần client gửi nên vẫn an toàn; muốn đồng bộ thì chạy lại `./ssl.sh <domain> <email>` (gateway gián đoạn vài giây). Nếu đặt CDN (Cloudflare…) trước gateway: cần cấu hình `set_real_ip_from` + `real_ip_header` trong nginx, nếu không mọi người dùng sẽ mang IP của CDN.

### ✅ C4. Vượt captcha qua code mẫu tích hợp: siteverify trả 400 cho token thiếu — `986d8fc`
- **Lỗi cũ:** `/v1/siteverify` dùng class-validator nên `verify_token` thiếu / rỗng / sai kiểu trả **HTTP 400**. Code mẫu Node (fetch, axios), Laravel và PHP thuần trong README / API Docs lại cho qua với mọi mã khác 2xx (`if (!res.ok)`, `!$response->successful()`, axios ném lỗi → `next()`, `file_get_contents` trả `false`) → bot gửi form **không kèm `vina_captcha_token`** là vượt captcha trên site khách. Phát hiện từ log production: 201 / 2.017 lượt siteverify trả 400 trong 4 ngày (20–24/09/2026).
- **Đã sửa:** siteverify tự kiểm tra input, luôn trả 200 `{ "success": false, "reason": "missing_secret" | "missing_verify_token" }` cho input xấu (không 4xx), field thừa không còn gây 400; lỗi nội bộ vẫn 503. Code mẫu chỉ fail-open khi 5xx/timeout và từ chối ngay khi form không có token. API_CONTRACT 1.3 bổ sung bảng `reason`.
- **Ảnh hưởng tới khách hàng:** khách đang dùng code mẫu lỗi được bảo vệ ngay khi server deploy, không cần sửa code. Đổi lại, người dùng thật có widget gặp lỗi (đóng slider, mất mạng — xem M9) sẽ bị từ chối thay vì lọt qua như trước, và phải thử lại. Vẫn nên khuyên khách cập nhật code theo mẫu mới.

---

## Critical

Hiện không còn lỗi Critical đã biết.

---

## High

### H1. JWT secret có giá trị dự phòng hardcode → giả mạo token admin
- **Vị trí:** `backend/src/admin/guards/jwt-auth.guard.ts:16`, `backend/src/admin/admin.service.ts:843,1060`, `docker-compose.yml` (`JWT_SECRET: ${JWT_SECRET}`)
- **Lỗi:** thiếu `JWT_SECRET` thì dùng chuỗi `vina-captcha-jwt-secret-key-3068` công khai trong repo; `role` được lấy thẳng từ payload.
- **Khai thác:** tự ký HS256 `{"sub":"x","role":"admin","exp":9999999999}` là có toàn quyền admin.
- **Cách fix:** compose dùng `${JWT_SECRET:?JWT_SECRET is required}`; backend từ chối khởi động nếu secret rỗng, < 32 ký tự hoặc trùng giá trị trong `.env.example`; bỏ fallback; so chữ ký bằng `crypto.timingSafeEqual`.
- **Giảm thiểu ngay:** kiểm tra `.env` trên server có `JWT_SECRET` ngẫu nhiên (deploy.sh tự sinh khi tạo `.env` lần đầu) — xem DEPLOYMENT.md mục 3.

### H2. Slider trả luôn đáp án cho client
- **Vị trí:** `backend/src/issue/issue.service.ts:241-246,270`, `backend/src/verify/verify.service.ts:67-77`
- **Lỗi:** response `/v1/issue` chứa `slider_data.x` (vị trí đích). Verify chỉ so `|final_position - x| ≤ tolerance`; `drag_duration_ms` là optional, `trajectory` không được kiểm tra.
- **Khai thác:** bot đọc `x`, gửi `final_position = x`, không gửi `drag_duration_ms` → pass.
- **Cách fix:** server render ảnh puzzle (hoặc offset mã hóa) để không lộ `x`; bắt buộc `drag_duration_ms` và kiểm tra `trajectory` (số điểm, độ biến thiên tốc độ).

### H3. Captcha đăng nhập Dashboard dùng site key/secret hardcode
- **Vị trí:** `dashboard/src/utils/captcha.ts:14`, `backend/src/issue/issue.service.ts:44-55`, `backend/src/verify/verify.service.ts:132`, `backend/src/admin/admin.service.ts:883`, `dashboard/Dockerfile`, `docker-compose.yml`
- **Lỗi:** site key `5ae2b566-…` và secret `cap_live_6f1a…` nằm trong code; nếu không có trong DB thì backend tự tạo metadata "ảo" chỉ cho phép domain `nhanhoagroup.cloud` + `localhost`. Compose không truyền `VITE_CAPTCHA_SITE_KEY` (build arg), `AUTH_CAPTCHA_SECRET`, `AUTH_CAPTCHA_DISABLED`; `verify.service.ts:132` lại so cứng với đúng chuỗi secret đó nên đổi `AUTH_CAPTCHA_SECRET` cũng không có tác dụng.
- **Ảnh hưởng:**
  - Deploy lên domain khác `nhanhoagroup.cloud` → login/register/forgot-password báo `domain_not_allowed`. Token tự đăng nhập của Setup Wizard hết hạn sau 7 ngày thì admin bị khóa ngoài.
  - Cặp key này ai cũng dùng miễn phí được như một captcha không tính quota.
- **Cách fix:** Setup Wizard tạo sẵn 1 site + API key dành cho xác thực Dashboard (allowed_domains = domain Dashboard); Dockerfile dashboard khai báo `ARG VITE_CAPTCHA_SITE_KEY`; compose truyền `VITE_CAPTCHA_SITE_KEY`, `AUTH_CAPTCHA_SECRET`, `AUTH_CAPTCHA_DISABLED`; xóa toàn bộ giá trị hardcode, chưa cấu hình thì fail-closed.

### H4. Danh sách IP reputation toàn hệ thống lộ cho mọi tài khoản
- **Vị trí:** `backend/src/admin/admin.controller.ts:228-236`, `dashboard/src/App.tsx` (route admin)
- **Lỗi:** `GET ip-reputation` và `GET ip-reputation/stats` chỉ có `JwtAuthGuard`, không có `RolesGuard`. Dashboard chỉ ẩn menu, route không bọc `<CanAccess>`.
- **Khai thác:** ai cũng tự đăng ký được → đăng nhập → mở `/ip-reputation` là xem IP khách truy cập của mọi site (lộ dữ liệu chéo khách hàng).
- **Cách fix:** thêm `RolesGuard` cho 2 endpoint GET (hoặc lọc theo site của account); bọc route admin-only bằng `<CanAccess>`.

### H5. Setup Wizard công khai — ai gọi trước sẽ thành Super Admin
- **Vị trí:** `backend/src/admin/admin.controller.ts` (`POST setup`), `backend/src/admin/admin.service.ts:748-758`
- **Lỗi:** `POST /admin/v1/setup` không cần token; chỉ chặn khi đã có admin. Sau `./deploy.sh`, hệ thống mở trên `http://IP:80` trước khi người cài mở wizard. Ngoài ra kiểm tra "đã có admin" không atomic (2 request đồng thời đều qua).
- **Cách fix:** `deploy.sh` sinh `SETUP_TOKEN` dùng 1 lần, in ra console, wizard bắt buộc nhập; bọc kiểm tra + tạo admin trong transaction/advisory lock.
- **Giảm thiểu ngay:** chạy Setup Wizard ngay sau khi deploy xong (xem DEPLOYMENT.md mục 5).

### H6. Từ 01/01/2027 mất toàn bộ log xác thực
- **Vị trí:** `docker/init-db.sql:103-129`, `backend/src/verify/verify.service.ts:87-97`, `backend/src/issue/issue.service.ts:139,171`
- **Lỗi:** `verification_logs` partition theo tháng nhưng chỉ tạo sẵn 2026-09 → 2026-12, không có partition DEFAULT và không có job nào tạo partition mới. Lỗi INSERT bị `catch` và chỉ `console.error`.
- **Ảnh hưởng:** captcha vẫn chạy, nhưng từ 2027-01-01 mọi lượt issue/verify không được ghi log → Dashboard thống kê, log, top risk trigger trống; không có cảnh báo nào ngoài log container.
- **Cách fix:** thêm job trong `backend/src/jobs/` chạy hằng tháng, tạo trước partition cho 3 tháng kế tiếp (`CREATE TABLE IF NOT EXISTS ... PARTITION OF ...`) và cảnh báo khi INSERT log lỗi. Nếu thêm partition `DEFAULT` làm lưới an toàn thì job phải chuyển dữ liệu ra khỏi DEFAULT trước khi tạo partition trùng khoảng thời gian (Postgres báo lỗi nếu DEFAULT đang chứa dòng thuộc khoảng đó).
- **Giảm thiểu ngay:** chạy SQL tạo partition năm 2027 trong DEPLOYMENT.md mục 8.

---

## Medium

### M1. Băm mật khẩu yếu; salt thực tế là `JWT_SECRET`
- **Vị trí:** `backend/src/admin/admin.service.ts:39-41`, `deploy.sh:114-122`
- **Lỗi:** SHA-256 một vòng, salt dùng chung toàn hệ thống (`APP_SALT` → `JWT_SECRET` → chuỗi hardcode), so sánh bằng `!==`. `deploy.sh` sinh `RAND_SALT` nhưng **không ghi** vào `.env`, nên salt = `JWT_SECRET`.
- **Ảnh hưởng:** đổi `JWT_SECRET` (VD khi nghi bị lộ) → **mọi mật khẩu, kể cả admin, không còn khớp**. Hash bị lộ thì bẻ nhanh.
- **Cách fix:** chuyển sang argon2id/scrypt với salt riêng từng user, `timingSafeEqual`; migrate dần (khi user đăng nhập thành công bằng hash cũ thì băm lại bằng thuật toán mới). `deploy.sh` ghi `APP_SALT` cho cài đặt mới.
- **Lưu ý cho server đang chạy:** hash hiện tại dùng `JWT_SECRET` làm salt. Chỉ được thêm `APP_SALT` với giá trị **đúng bằng `JWT_SECRET` hiện tại** (không đổi hành vi, và tách salt khỏi JWT secret để sau này đổi `JWT_SECRET` an toàn). Thêm `APP_SALT` giá trị khác, hoặc đổi `JWT_SECRET` khi chưa có `APP_SALT` → toàn bộ user bị khóa.

### M2. `password_hash` và `activation_token` bị trả ra qua API
- **Vị trí:** `backend/src/admin/entities/account.entity.ts:14,29`, `admin.service.ts:1096` (`getAccountById` cho `/auth/me`), các chỗ load `relations: { account: true }` của sites, `GET /accounts`
- **Cách fix:** `@Column({ select: false })` cho `password_hash`, `activation_token` (chỉ `addSelect` khi login/activate), hoặc map sang DTO trước khi trả.

### M3. Mass assignment ở `PATCH /admin/v1/sites/:id`
- **Vị trí:** `backend/src/admin/admin.service.ts:1206-1208`
- **Lỗi:** body `any` đưa thẳng vào `sitesRepo.update(id, dto)`.
- **Khai thác:** user thường tự đặt `status: "active"` để mở lại site admin đã khóa, thêm `allowed_domains` vượt `max_domains` của gói, đổi `account_id`.
- **Cách fix:** DTO whitelist (`name`, `allowed_domains`, `challenge_mode`), kiểm tra hạn mức gói khi update; `status` chỉ admin được đổi.

### M4. `siteverify` chấp nhận `key_prefix` thay cho secret
- **Vị trí:** `backend/src/verify/verify.service.ts:122-150`
- **Lỗi:** điều kiện `key_hash = $1 OR key_prefix = $2 OR key_prefix = $3` → chỉ cần 13 ký tự đầu (`cap_live_` + 4 hex, đang hiển thị trên Dashboard) là qua. Token bị tiêu **trước** khi so site.
- **Cách fix:** chỉ so `key_hash = sha256(secret)` (có unique index); kiểm tra site khớp trước rồi mới consume token.

### M5. Quota bị trừ trước khi kiểm tra domain/ban/rate-limit; domain lấy từ body
- **Vị trí:** `backend/src/issue/issue.service.ts:79-125`
- **Lỗi:** tăng quota trước mọi kiểm tra; `domain` do client gửi trong body, `''`/`localhost` luôn được chấp nhận.
- **Khai thác:** chỉ cần site key công khai (nằm sẵn trong HTML) là đốt được quota tháng của khách; kiểm tra domain vô nghĩa với bot.
- **Cách fix:** đưa bước tăng quota xuống sau cùng; kiểm tra domain theo header `Origin` (web) thay vì body; cache kết quả âm cho key không hợp lệ.

### M6. Khóa tài khoản / hạ quyền không có hiệu lực ngay
- **Vị trí:** `backend/src/admin/guards/jwt-auth.guard.ts`
- **Lỗi:** guard chỉ tin `role`/`status` trong JWT (sống 24h; token từ Setup Wizard sống 7 ngày), không có thu hồi; `auth/refresh` là stub.
- **Cách fix:** guard load account (cache ngắn trên Redis) để kiểm tra `status`/`role`; rút ngắn TTL; lưu refresh token thật.

### M7. Tự động gia hạn SSL sẽ thất bại
- **Vị trí:** `ssl.sh:77` (`certbot certonly --standalone`), `ssl.sh:213` (cron `certbot renew` không có pre/post hook)
- **Lỗi:** chứng chỉ cấp bằng `--standalone` cần cổng 80, nhưng lúc cron chạy thì gateway đang giữ cổng 80 → renew lỗi → sau 90 ngày chứng chỉ hết hạn, widget trên mọi site khách hỏng.
- **Cách fix:** dùng `--webroot -w /var/www/certbot` (thư mục đã được mount vào gateway), hoặc thêm `--pre-hook`/`--post-hook` dừng/bật gateway.
- **Giảm thiểu ngay:** sửa crontab theo DEPLOYMENT.md mục 7.

### M8. Dashboard đăng xuất người dùng khi gặp 403
- **Vị trí:** `dashboard/src/authProvider.ts:85-93`
- **Lỗi:** `onError` coi 403 (không đủ quyền) giống 401 (hết phiên) → xóa token, đăng xuất.
- **Cách fix:** chỉ logout khi 401; 403 trả `{ error }` và hiển thị thông báo không có quyền.

### M9. Widget tự submit form khi lỗi hoặc khi người dùng đóng slider
- **Vị trí:** `widget/src/main.ts:857-860,974,985-995`
- **Lỗi:** mọi exception (kể cả bấm ✕ đóng slider, token hết TTL 60s) → sau 1,5s gọi `form.submit()` không kèm token. `form.submit()` bỏ qua handler submit khác, mất name/value của nút submit.
- **Ảnh hưởng:** site tích hợp coi "thiếu token = captcha đang lỗi" thì bị bypass; người dùng hủy nhưng form vẫn gửi.
- **Cách fix:** không submit khi người dùng hủy; fail-open chỉ khi site bật cấu hình; dùng `form.requestSubmit()`.

### M10. Honeypot không có tác dụng; widget gọi `api.ipify.org` mỗi lần submit
- **Vị trí:** `widget/src/main.ts:317` (closed Shadow DOM), `:886`, `:1019`
- **Lỗi:** honeypot nằm trong closed Shadow DOM, không thuộc form → bot điền form theo DOM không thấy nó; `honeypot_filled` lại do client tự báo. Mỗi lần submit gọi api.ipify.org (timeout 3s) trong khi backend chỉ dùng kết quả khi chạy localhost.
- **Ảnh hưởng:** ở Trung Quốc (đúng thị trường hệ thống nhắm tới) submit có thể chậm tới 3s; IP người dùng bị gửi cho bên thứ ba.
- **Cách fix:** honeypot đặt ở light DOM trong form (ẩn bằng CSS, `aria-hidden`, `tabindex=-1`), kiểm tra phía server; bỏ ipify hoặc chỉ bật ở chế độ dev.

### M11. Biến môi trường không khớp giữa `docker-compose.yml` và code
- **Vị trí:** `docker-compose.yml` (backend env), `backend/src/threat-intel/providers/abuseipdb.provider.ts:24`
- **Lỗi:** compose truyền `ABUSEIPDB_KEY`, code đọc `BACKEND_ABUSEIPDB_KEY` → nguồn AbuseIPDB không bao giờ có key khi chạy Docker. `DASHBOARD_URL`, `AUTH_CAPTCHA_*` cũng không được truyền vào container.
- **Cách fix:** thống nhất tên (theo quy ước AGENTS.md: `BACKEND_ABUSEIPDB_KEY`), bổ sung các biến còn thiếu vào compose và `.env.example`.

### M12. `ssl.sh` chạy sai khi gọi từ thư mục khác
- **Vị trí:** `ssl.sh` (dùng đường dẫn tương đối `./nginx/conf.d/ssl.conf`, `.env`, `docker compose`)
- **Lỗi:** script không `cd` về thư mục chứa nó. Gọi từ thư mục khác (README trước đây hướng dẫn `sudo /opt/vinacaptcha/ssl.sh ...` — đã sửa README): `docker compose stop gateway` không tìm thấy compose file (lỗi bị nuốt bởi `|| true`) → gateway vẫn giữ cổng 80 → certbot `--standalone` thất bại; nếu qua được thì ghi `ssl.conf`/`.env` sai chỗ.
- **Cách fix:** thêm `cd "$(dirname "$(readlink -f "$0")")"` ở đầu `ssl.sh` và `deploy.sh`.
- **Giảm thiểu ngay:** luôn `cd /opt/vinacaptcha` trước khi chạy `./ssl.sh` (như DEPLOYMENT.md).

---

## Low

| ID | Vị trí | Lỗi | Cách fix |
|---|---|---|---|
| L1 | `backend/src/main.ts` | Không có global exception filter → lỗi trả `{statusCode, message, error}` thay vì `{ "error": { "code", "message" } }` theo API_CONTRACT mục 3; header `X-RateLimit-*` chưa được set | Thêm `ExceptionFilter` toàn cục map về đúng format |
| L2 | Nhiều nơi trong backend (riêng `siteVerify` đã sửa ở `e85db7b`) | `console.error(err)` có thể in `QueryFailedError.parameters` chứa dữ liệu nhạy cảm (vi phạm AGENTS.md 3.4); log chuỗi tự do | Chỉ log `err.code`/`err.message` + `key_prefix`; dùng logger JSON |
| L3 | `jobs/quota-sync.job.ts:34`, `redis/redis.service.ts:131` | Dùng lệnh `KEYS` (O(N), block Redis đang phục vụ issue/verify) | Dùng `SCAN` hoặc set index riêng |
| L4 | `backend/src/jobs/*` | Cron chạy trên **mọi** instance → trùng job sync threat-intel, email cảnh báo quota gửi trùng khi scale | Distributed lock trên Redis (`SET NX PX`) trước khi chạy job |
| L5 | ~9 file dashboard (`pages/dashboard`, `sites/list.tsx`, `ip-reputation`, `threat-intel`, `smtp-settings`, `accounts/list.tsx`, `components/header`…) | Gọi `axios` trực tiếp, ngoài Refine data provider (vi phạm AGENTS.md); KPI trang Sites tính trên dữ liệu 1 trang | Chuyển sang `useList`/`useTable`/`useCustom`, lọc phía server |
| L6 | Dashboard | ~160 mã màu hex và ~200 `fontSize` inline, vi phạm UI_GUIDELINES; `getStatusTagProps` gần như không được dùng | Dọn dần theo từng page khi chạm vào |
| L7 | `dashboard/fix.cjs`, `dashboard/fix2.cjs`, `dashboard/public/widget/vina-captcha.js`, `widget/src/counter.ts` | File thừa; bản widget cũ trong `public/` khiến dev chạy widget lỗi thời | Xóa; dev lấy widget từ `widget/dist` |
| L8 | `API_CONTRACT.md`, trang API Docs, script k6 | Có chuỗi `cap_live_…` trông như key thật | Đối chiếu DB; nếu là key thật thì revoke |
| L9 | `nginx/conf.d/vina-captcha.conf:35` | `/widget/` đặt `no-store` → mỗi lượt xem trang khách tải lại 26KB, ETag vô dụng | Dùng `Cache-Control: no-cache` (vẫn revalidate bằng ETag) |

---

## Thứ tự xử lý đề xuất

1. ~~**C1, C2, C3, C4**~~ — đã sửa (`e85db7b`, `986d8fc`).
2. **H6** — có hạn chót (01/01/2027); tạm thời chạy SQL trong DEPLOYMENT.md, sau đó viết job.
3. **H1, H5** — cứng hóa cấu hình khởi động (`JWT_SECRET` bắt buộc, `SETUP_TOKEN`).
4. **H3, M11** — sửa `docker-compose.yml`/Dockerfile để deploy được trên domain bất kỳ.
5. **H2, H4, M3, M4, M5** — logic backend.
6. **M1** — cần kế hoạch migrate hash, làm riêng.
7. **M7** — ngay khi server đầu tiên bật SSL (hoặc áp dụng giảm thiểu trong DEPLOYMENT.md).
8. Phần còn lại theo thời gian.

## Phần đã kiểm tra, không thấy lỗi

- One-time token trên Redis dùng MULTI GET+DEL (atomic) → không replay; session và `verify_token` có TTL 60s, gắn `siteId`.
- PoW kiểm tra đúng `sha256(session_id:nonce)` và số bit 0 đầu.
- JWT luôn dùng HMAC-SHA256 (bỏ qua `alg` trong header), có kiểm tra `exp`.
- Phân quyền sites / api-keys / verification-logs / dashboard stats đúng theo chủ sở hữu; các endpoint admin thay đổi dữ liệu đều có `RolesGuard`.
- Raw SQL đều dùng tham số `$n`.
- Dashboard không có `dangerouslySetInnerHTML`/`eval`; widget chỉ dùng `innerHTML` với chuỗi tĩnh.
- Widget 8,5KB gzip (< 15KB mục tiêu), không có dependency runtime.
- Postgres/Redis chỉ bind `127.0.0.1`; backend/dashboard không publish cổng, chỉ đi qua gateway.
- Backend dùng `platform-fastify` đúng quy định; cron nằm trong `backend/src/jobs/`.
