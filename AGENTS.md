# AGENTS.md — Nội bộ Captcha System

Tài liệu này định hướng cho coding agent (Claude Code hoặc agent khác) trước khi implement bất kỳ phần nào của hệ thống. Đọc file này + ARCHITECTURE.md trước khi viết code.

## 1. Bối cảnh & mục tiêu

- Xây captcha nội bộ để thay thế Google reCAPTCHA/hCaptcha trong trường hợp bị chặn quốc tế (VD: chặn tại Trung Quốc, ISP throttle).
- Hệ thống có tạo **account** (site owner đăng ký để lấy API key, quản lý domain được phép nhúng captcha, xem thống kê/log).
- 3 thành phần tách biệt, không share codebase:
  1. **Widget** (script nhúng vào site khách) — vanilla JS/TS, KHÔNG dùng React/Next/Refine.
  2. **Backend API** (issue-token, verify-token, risk scoring) — **NestJS + Fastify adapter** (`platform-fastify`), stateless, nhiều instance sau load balancer.
  3. **Admin Dashboard** (quản lý account, site, xem log/thống kê) — Refine.dev + React 19 + Vite.

## 2. Nguyên tắc bắt buộc cho agent

- **Không đoán schema.** Trước khi viết query, phải đọc SCHEMA.md hoặc ping DB lấy DDL thật.
- **Sửa code bằng diff/patch**, không overwrite toàn file trừ khi file mới hoàn toàn.
- **Không tự ý đổi kiến trúc 3-tách-biệt** ở mục 1 — nếu thấy cần gộp, phải hỏi lại trước khi làm.
- Sau khi thêm tính năng: chạy build/lint/test tương ứng (`npm run build`, `npm run lint`) trước khi coi là xong; nếu lỗi, tự sửa và lặp lại.
- Với phần **widget**: mọi thay đổi phải kiểm tra bundle size (mục tiêu < 15KB gzip) — không được kéo thêm dependency nặng.
- Với phần **backend**: token issue/verify phải qua Redis one-time-use check — không bao giờ bỏ qua bước này dù là code test/demo.
- Backend BẮT BUỘC dùng **NestJS với `platform-fastify`** (không dùng `platform-express`) — quyết định chốt vì yêu cầu concurrent cao ở endpoint `/issue`, `/verify`. Không tự đổi sang Express adapter dù để "dễ debug" hay lý do tương tự.
- Với phần **dashboard**: dùng Refine's data provider pattern, không tự viết fetch logic rời rạc ngoài provider. Mọi UI/layout/typography/màu sắc PHẢI theo UI_GUIDELINES.md — không tự chọn màu, font-size, hay tự viết CSS riêng cho từng page.
- **Nguồn threat-intel phải theo connector pattern** (xem ARCHITECTURE.md mục 3.6) — thêm nguồn mới = thêm 1 provider file implement `ThreatIntelSourceProvider` + đăng ký vào `threat_intel_source_configs`, KHÔNG hardcode if/else theo tên nguồn trong `ThreatIntelService`.

## 3. Quy ước coding chuẩn

### 3.1 Naming
- Biến/hàm: `camelCase` (TS/JS), bảng/cột DB: `snake_case` (đã áp dụng trong SCHEMA.md — giữ nguyên, không tự đổi).
- Tên file: `kebab-case.ts` cho module thường, `PascalCase.tsx` cho React component (dashboard).
- Tên biến môi trường: `SCREAMING_SNAKE_CASE`, prefix theo service — VD `BACKEND_REDIS_URL`, `DASHBOARD_API_BASE_URL`.
- Không viết tắt tùy tiện (VD tránh `usrRep`, dùng `userReputation` hoặc giữ đúng tên cột `ip_reputation` khi map).

### 3.2 Cấu trúc thư mục (mỗi service riêng repo hoặc riêng thư mục gốc)
```
widget/        # vanilla TS, Vite library mode
backend/       # API issue/verify/siteverify + risk engine + cron jobs
dashboard/     # Refine + React 19 + Vite
```
- Mỗi service có `.env.example` riêng, KHÔNG file `.env` chung cho cả 3.
- Cron job (decay, sync threat-intel, batch reputation) đặt trong `backend/src/jobs/`, không lẫn vào route handler.

### 3.3 Git
- Nhánh: `feature/<mô-tả-ngắn>`, `fix/<mô-tả-ngắn>` — không commit thẳng vào `main`.
- Commit message: Conventional Commits — `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`. VD: `feat(backend): thêm one-time-use check cho verify token`.
- Mỗi commit nên chạy được build/lint (không commit code đang lỗi build).

### 3.4 Error handling & logging
- Response lỗi API theo đúng format đã chốt ở API_CONTRACT.md mục 3: `{ "error": { "code": "...", "message": "..." } }` — không tự bịa format khác.
- Không log plaintext `api_key`, `password`, `verify_token` ra console/log file — chỉ log `key_prefix` hoặc hash.
- Log theo JSON structured log (dễ ingest sau này), không `console.log` chuỗi tự do ở code production.

### 3.5 Testing
- Backend: unit test cho risk scoring logic + token issue/verify (mock Redis), integration test cho luồng issue → verify đầy đủ.
- Widget: test bundle size trong CI (fail build nếu vượt ngưỡng KB đã đặt ở mục 2).
- Dashboard: test CRUD flow chính (login, tạo site, tạo/revoke api key) bằng React Testing Library hoặc Playwright.
- Không tự ý bỏ qua test đang fail để "cho qua" — nếu test sai do đổi spec, phải sửa test kèm giải thích trong commit message.

### 3.6 Comment & tài liệu trong code
- Comment code bằng tiếng Việt hoặc tiếng Anh đều được, nhưng nhất quán trong cùng 1 file — không trộn lẫn 2 ngôn ngữ trong cùng file.
- Mọi hàm liên quan tới risk scoring/reputation phải có comment ngắn giải thích **vì sao** (business logic), không chỉ mô tả code làm gì.

## 4. Việc KHÔNG được làm

- Không tự triển khai captcha kiểu "gõ chữ méo" cổ điển (dễ bị OCR bypass).
- Không build hệ thống chống DDoS ở application layer — DDoS network-layer để CDN/upstream xử lý; agent chỉ lo application-layer resilience (rate-limit, honeypot, PoW).
- Không hardcode API key/secret trong code — dùng biến môi trường, tham chiếu `.env.example`.
- Không thêm captcha challenge hiển thị cho toàn bộ traffic — mặc định invisible/risk-based, chỉ escalate khi có tín hiệu đáng ngờ (xem ARCHITECTURE.md mục Risk Engine).

## 5. Thứ tự triển khai đề xuất

1. Backend: issue-token + verify-token + Redis one-time-use (core trước, chưa cần risk scoring)
2. Widget: honeypot field + basic invisible check + gọi API issue/verify
3. Dashboard: auth (account/login) + CRUD site/domain + API key management
4. Risk engine: behavioral signal + escalate lên slider/PoW challenge
5. Load test + bypass test (xem phần Testing trong ARCHITECTURE.md)

## 6. Tài liệu liên quan cần đọc thêm

- ARCHITECTURE.md — chi tiết kỹ thuật, sequence diagram issue/verify, risk engine, kế hoạch load test & security test
- SCHEMA.md — DDL cho accounts, sites, api_keys, verification_logs, ip_reputation, fingerprint_reputation, threat_intel_ranges
- API_CONTRACT.md — contract cho `/issue`, `/verify`, `/siteverify`, dashboard REST endpoints
- UI_GUIDELINES.md — quy ước UI/layout/typography/style cho admin dashboard, đọc bắt buộc trước khi viết bất kỳ page/component nào
