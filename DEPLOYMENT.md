# DEPLOYMENT.md — Hướng dẫn triển khai production với `deploy.sh`

Tài liệu này hướng dẫn triển khai **NhanHoaCaptcha** lên VPS bằng `deploy.sh` + `ssl.sh`, cập nhật phiên bản, sao lưu và dự phòng.

> ⚠️ Hệ thống còn một số lỗi đã biết ảnh hưởng tới production — xem [KNOWN_ISSUES.md](KNOWN_ISSUES.md). Các bước giảm thiểu được ghi ngay trong hướng dẫn này (đánh dấu mã lỗi, VD **[H5]**).
>
> Các lệnh `docker compose`, `./deploy.sh`, `./ssl.sh` chạy trong thư mục cài đặt `/opt/vinacaptcha`. Thay `captcha.example.com`, `admin@example.com` bằng giá trị thật. Nếu `.env` đổi `POSTGRES_USER`/`POSTGRES_DB`, thay `captcha_user`/`captcha_db` tương ứng.

---

## 0. Checklist nhanh

**Cài mới**
- [ ] VPS đạt yêu cầu (mục 1), đã cài Docker, domain đã trỏ A record về IP VPS
- [ ] Clone mã nguồn, tạo `.env` với secret ngẫu nhiên + `APP_SALT` (mục 3)
- [ ] `./deploy.sh` (mục 4)
- [ ] Chạy Setup Wizard **ngay lập tức** (mục 5) **[H5]**
- [ ] `./ssl.sh <domain> <email>` (mục 6) — tự ghi `APP_URL`
- [ ] Sửa cron gia hạn SSL (mục 6.2) **[M7]**
- [ ] Cấu hình SMTP, thử đăng ký → nhận email → bấm link kích hoạt (mục 7)
- [ ] Tạo partition log năm 2027 trước 31/12/2026 (mục 8) **[H6]**
- [ ] Bật sao lưu DB + cất giữ `.env` (mục 10)

**Cập nhật phiên bản:** mục 9.

---

## 1. Yêu cầu máy chủ

| Hạng mục | Tối thiểu | Khuyến nghị |
|---|---|---|
| OS | Ubuntu 20.04/22.04/24.04, Debian 11/12 (Linux bất kỳ có Docker) | Ubuntu 24.04 LTS |
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB (+ 2 GB swap) | 3 GB+ |
| Đĩa trống | 3 GB | 10 GB SSD |
| Cổng mở | 80, 443 (và 22 cho SSH) | |

`deploy.sh` tự kiểm tra Docker, CPU, RAM, đĩa trước khi chạy. Nếu chưa có Docker:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # đăng xuất/đăng nhập lại để có hiệu lực
```

> `install.sh` là bản "trọn gói" cho VPS trắng: cài Docker, tạo swap 2 GB, mở firewall, clone về `/opt/vinacaptcha` rồi gọi `deploy.sh`. Nếu dùng `install.sh`, vẫn cần làm mục 3 (APP_SALT) **trước** khi mở Setup Wizard, và các mục 5 → 10.

---

## 2. `deploy.sh` làm gì — và KHÔNG làm gì

| Bước | Hành động |
|---|---|
| 1 | Kiểm tra Docker/Compose V2, CPU, RAM, swap, đĩa |
| 2 | **Chỉ khi chưa có `.env`**: copy `.env.example` → `.env`, sinh ngẫu nhiên `POSTGRES_PASSWORD`, `JWT_SECRET` |
| 3 | Build widget (`widget/dist/vina-captcha.js`) bằng npm trên host, hoặc bằng container `node:20-alpine` nếu host không có npm |
| 4 | Nếu đã có chứng chỉ trong `/etc/letsencrypt/live/` mà chưa có `nginx/conf.d/ssl.conf` → tự chạy `ssl.sh` để bật lại HTTPS |
| 5 | `docker compose build --parallel` |
| 6 | `docker compose up -d --remove-orphans`, in trạng thái container và URL truy cập |

**Không làm** (phải tự làm):
- Không `git pull` — cập nhật mã nguồn trước khi chạy (mục 9).
- Không sửa `.env` đã tồn tại — biến mới thêm vào `.env.example` phải tự chép sang.
- Không ghi `APP_SALT` dù có sinh ngẫu nhiên **[M1]** — tự thêm khi cài mới (mục 3).
- Không migrate schema DB — `docker/init-db.sql` chỉ chạy **một lần** khi volume Postgres còn trống; backend chạy với `synchronize: false`.
- Không sao lưu dữ liệu.

---

## 3. Lần đầu: lấy mã nguồn và tạo `.env`

```bash
sudo mkdir -p /opt/vinacaptcha && sudo chown "$USER": /opt/vinacaptcha
git clone https://github.com/vincentdang92/vinacaptcha.git /opt/vinacaptcha
cd /opt/vinacaptcha
chmod +x deploy.sh ssl.sh

cp .env.example .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 16)/" .env
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env
echo "APP_SALT=$(openssl rand -hex 16)" >> .env
nano .env   # điền SMTP_* (có thể để sau, cấu hình trong Dashboard cũng được)
```

Tự tạo `.env` thay vì để `deploy.sh` tạo vì `deploy.sh` không ghi `APP_SALT`. Thiếu `APP_SALT` thì mật khẩu được băm bằng `JWT_SECRET`, sau này đổi `JWT_SECRET` là **toàn bộ tài khoản không đăng nhập được** **[M1]**.

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `POSTGRES_PASSWORD` | ✔ | Ngẫu nhiên. **Không đổi sau lần deploy đầu** — Postgres đã khởi tạo volume với mật khẩu cũ, đổi trong `.env` sẽ làm backend mất kết nối DB. |
| `JWT_SECRET` | ✔ | ≥ 32 ký tự ngẫu nhiên. Tuyệt đối không để giá trị mẫu trong `.env.example` — backend không kiểm tra, ai biết giá trị mẫu là ký được token admin **[H1]**. Đổi giá trị = mọi phiên đăng nhập hết hiệu lực. |
| `APP_SALT` | ✔ (cài mới) | Cài mới: đặt **trước khi tạo tài khoản đầu tiên**. Server đang chạy mà chưa có `APP_SALT`: chỉ được thêm với giá trị **đúng bằng `JWT_SECRET` hiện tại** (mật khẩu cũ vẫn khớp, và từ đó đổi `JWT_SECRET` không còn khóa user) — giá trị khác sẽ làm mọi mật khẩu cũ sai. Lệnh: `grep -q '^APP_SALT=' .env \|\| echo "APP_SALT=$(grep '^JWT_SECRET=' .env \| cut -d= -f2-)" >> .env` |
| `APP_URL` | Nên có | URL công khai, dùng cho link kích hoạt tài khoản / đặt lại mật khẩu trong email. `ssl.sh` tự ghi `https://<domain>`. Chạy bằng IP không SSL: `http://<IP>` (thêm `:PORT_HTTP` nếu khác 80). Để trống thì backend tự nhận diện theo request — kém an toàn hơn. |
| `PORT_HTTP` | | Mặc định 80. `PORT_HTTPS` mặc định 443 (không có trong `.env.example`, thêm nếu cần). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Để gửi email | Có thể cấu hình ở Dashboard → Cài đặt SMTP (lưu trong DB, ưu tiên hơn `.env`). Không có SMTP thì người dùng tự đăng ký sẽ **không nhận được link kích hoạt**. |
| `ABUSEIPDB_KEY` | | Hiện **chưa có tác dụng** — code đọc tên khác **[M11]**. |

Kiểm tra lại, bảo đảm không còn giá trị mẫu:

```bash
grep -E '^(POSTGRES_PASSWORD|JWT_SECRET|APP_SALT|APP_URL)=' .env
```

---

## 4. Chạy `deploy.sh`

```bash
cd /opt/vinacaptcha
./deploy.sh
```

Lần đầu mất vài phút để build image. Kiểm tra:

```bash
docker compose ps                                  # 5 container Up; postgres, redis: healthy
curl -s http://localhost/admin/v1/setup/status     # {"is_setup":false,...} ở lần đầu
curl -sI http://localhost/widget/vina-captcha.js   # HTTP/1.1 200
```

(Nếu `PORT_HTTP` khác 80 thì thêm `:<PORT_HTTP>` sau `localhost`.)

---

## 5. Setup Wizard — làm ngay sau khi deploy **[H5]**

Endpoint `/admin/v1/setup` không cần xác thực: **ai mở Setup Wizard trước sẽ thành Super Admin**. Mở ngay `http://<IP-VPS>` (hoặc domain) → tự chuyển tới `/setup`:

1. **Thông tin hệ thống**: tên hệ thống, domain chính của website đầu tiên cần bảo vệ.
2. **Super Admin**: họ tên, email, mật khẩu.
3. **Hoàn tất**: hệ thống tạo tài khoản admin, gói Enterprise, site đầu tiên và 1 API key `cap_live_…` — **API key chỉ hiện 1 lần, lưu lại ngay**. Wizard tự đăng nhập (phiên 7 ngày).

Xác nhận: `curl -s http://localhost/admin/v1/setup/status` trả `"is_setup":true`. Nếu không phải bạn tạo admin → xóa volume và cài lại (mục 12).

### 5.1. Chỉ khi domain Dashboard KHÁC `nhanhoagroup.cloud` **[H3]**

Captcha của trang đăng nhập/đăng ký dùng site key hardcode chỉ cho phép `nhanhoagroup.cloud` và `localhost`. Trên domain khác, đăng nhập sẽ báo `domain_not_allowed` — khi phiên 7 ngày của Setup Wizard hết hạn, admin bị khóa ngoài.

Cách tạm cho tới khi sửa H3 — tạo site trong DB với đúng ID của site key hardcode để backend lấy danh sách domain từ DB thay vì giá trị cứng. Chạy **sau** mục 5 (cần đã có tài khoản admin). SQL đã chạy thử trên Postgres khởi tạo từ `docker/init-db.sql`; sau khi chạy, kiểm tra bằng cách đăng xuất rồi đăng nhập lại:

```bash
docker exec -i captcha_postgres psql -U captcha_user -d captcha_db <<'SQL'
INSERT INTO sites (id, account_id, name, platform, primary_domain, allowed_domains, challenge_mode, status)
SELECT '5ae2b566-de1b-4ce2-947a-6f9645eb1004', id, 'Dashboard Login Captcha', 'web',
       'captcha.example.com', ARRAY['captcha.example.com'], 'slider', 'active'
FROM accounts WHERE role = 'admin' ORDER BY created_at LIMIT 1
ON CONFLICT (id) DO NOTHING;
SQL
docker exec captcha_redis redis-cli DEL meta:apikey:5ae2b566-de1b-4ce2-947a-6f9645eb1004
```

Site "Dashboard Login Captcha" sẽ xuất hiện trong danh sách site của admin — **không xóa site này**.

---

## 6. Bật HTTPS với `ssl.sh`

Điều kiện: A record của domain đã trỏ về IP VPS (kiểm tra `dig +short captcha.example.com`), cổng 80 mở từ Internet.

```bash
cd /opt/vinacaptcha
./ssl.sh captcha.example.com admin@example.com
```

`ssl.sh` sẽ:
1. Cài certbot nếu chưa có.
2. Dừng gateway, xin chứng chỉ Let's Encrypt (`--standalone`, cần cổng 80).
3. Sinh `nginx/conf.d/ssl.conf` (HTTP → HTTPS 301, TLS 1.2/1.3, HSTS).
4. Ghi `APP_URL=https://captcha.example.com` vào `.env`.
5. `docker compose up -d backend gateway` để nạp cấu hình mới.
6. Thêm cron `certbot renew` lúc 3:00 hằng ngày (nếu chưa có).

Kiểm tra:

```bash
grep '^APP_URL=' .env                                          # APP_URL=https://captcha.example.com
curl -sI https://captcha.example.com/widget/vina-captcha.js    # HTTP/2 200
curl -s https://captcha.example.com/admin/v1/setup/status
```

### 6.1. Server đã bật SSL từ trước bản sửa link kích hoạt

`ssl.sh` phiên bản cũ không ghi `APP_URL`. Thêm tay rồi tạo lại container backend:

```bash
grep -q '^APP_URL=' .env && sed -i 's|^APP_URL=.*|APP_URL=https://captcha.example.com|' .env \
  || echo 'APP_URL=https://captcha.example.com' >> .env
docker compose up -d backend
```

### 6.2. Sửa cron gia hạn SSL **[M7]**

Cron do `ssl.sh` tạo gọi `certbot renew` trong khi gateway đang giữ cổng 80 → chứng chỉ cấp bằng `--standalone` sẽ **không gia hạn được**, sau 90 ngày HTTPS hỏng (widget trên mọi site khách lỗi theo). Chuyển sang xác thực qua webroot (gateway đã phục vụ sẵn `/.well-known/acme-challenge/` từ `/var/www/certbot`):

```bash
sudo mkdir -p /var/www/certbot
sudo certbot renew --dry-run --webroot -w /var/www/certbot
```

Nếu dry-run báo thành công, sửa crontab của root:

```bash
sudo crontab -e
```

Thay dòng `certbot renew ...` cũ bằng:

```
0 3 * * * certbot renew --quiet --webroot -w /var/www/certbot --deploy-hook 'docker compose -f /opt/vinacaptcha/docker-compose.yml restart gateway'
```

Nếu dry-run webroot thất bại, dùng cách dừng gateway (mất kết nối ~10–20 giây mỗi lần gia hạn, 60 ngày/lần):

```
0 3 * * * certbot renew --quiet --pre-hook 'docker compose -f /opt/vinacaptcha/docker-compose.yml stop gateway' --post-hook 'docker compose -f /opt/vinacaptcha/docker-compose.yml start gateway'
```

`ssl.sh` chỉ thêm cron khi chưa có dòng `certbot renew`, nên chạy lại `ssl.sh` không ghi đè dòng đã sửa.

---

## 7. Kiểm tra sau triển khai

1. **SMTP**: Dashboard → Cài đặt SMTP → *Gửi email thử*.
2. **Luồng đăng ký**: mở `https://captcha.example.com/register` ở cửa sổ ẩn danh, đăng ký bằng email thật →
   - email kích hoạt có link dạng `https://captcha.example.com/activate?token=…` (không phải `localhost`, không phải `/admin/v1/...`, không sai cổng);
   - bấm link → chuyển về trang đăng nhập với thông báo "Kích hoạt tài khoản thành công!".
3. **Quên mật khẩu**: link dạng `https://captcha.example.com/reset-password?token=…`.
4. **Captcha trên site thật**: nhúng widget theo trang API Docs trong Dashboard, gửi form thử, kiểm tra log trong Dashboard → Nhật ký xác thực.
5. **Log backend không có lỗi**: `docker compose logs --tail=200 backend | grep -iE "error|fail"`.

---

## 8. Việc phải làm trước 31/12/2026: partition log năm 2027 **[H6]**

Bảng `verification_logs` chỉ có partition tới hết 12/2026. Từ 01/01/2027 mọi log issue/verify sẽ bị mất (captcha vẫn chạy nhưng thống kê, nhật ký trống). Tạo trước partition 2027–2028:

```bash
docker exec -i captcha_postgres psql -U captcha_user -d captcha_db <<'SQL'
DO $$
DECLARE m date;
BEGIN
  FOR i IN 0..23 LOOP
    m := (date '2027-01-01' + make_interval(months => i))::date;
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS verification_logs_%s PARTITION OF verification_logs FOR VALUES FROM (%L) TO (%L)',
      to_char(m, 'YYYY_MM'), m, (m + interval '1 month')::date
    );
  END LOOP;
END $$;
SQL
```

Kiểm tra: `docker exec captcha_postgres psql -U captcha_user -d captcha_db -c '\d+ verification_logs'` phải liệt kê partition tới `verification_logs_2028_12`. Lệnh an toàn khi chạy lại nhiều lần. Đặt lịch nhắc làm lại trước 31/12/2028 nếu H6 chưa được sửa.

---

## 9. Cập nhật phiên bản mới

```bash
cd /opt/vinacaptcha

# 1. Sao lưu trước khi cập nhật
docker exec captcha_postgres pg_dump -U captcha_user captcha_db | gzip > ~/backup_$(date +%F_%H%M).sql.gz

# 2. Xem có gì mới
git fetch origin
git log --oneline HEAD..origin/main
git diff --stat HEAD origin/main -- docker/init-db.sql .env.example docker-compose.yml

# 3. Lấy mã mới và deploy
git pull origin main
./deploy.sh
```

Sau khi cập nhật:
- **`.env.example` có biến mới?** `deploy.sh` không sửa `.env` có sẵn — chép tay các biến mới. So nhanh:
  ```bash
  diff <(grep -oE '^[A-Z_]+=' .env.example | sort) <(grep -oE '^[A-Z_]+=' .env | sort)
  ```
- **`docker/init-db.sql` thay đổi?** Không tự áp dụng vào DB đang chạy — viết và chạy SQL tương ứng bằng `psql` (sau khi đã sao lưu).
- **Sửa `.env` xong** phải chạy `docker compose up -d` (tạo lại container). `docker compose restart` **không** nạp lại biến môi trường.
- Bản sửa link kích hoạt (`fix/activation-link`): nếu server đã bật SSL từ trước, làm thêm mục 6.1.

### Rollback

```bash
cd /opt/vinacaptcha
git log --oneline -10          # chọn commit đang chạy ổn trước đó
git checkout <commit>
./deploy.sh
# Khi đã ổn định lại: git checkout main
```

Chỉ khôi phục DB khi bản mới đã thay đổi dữ liệu/schema (mục 10).

---

## 10. Sao lưu & khôi phục

**Sao lưu DB hằng ngày** (giữ 14 ngày) — thêm vào `sudo crontab -e`:

```
0 2 * * * mkdir -p /var/backups/vinacaptcha && docker exec captcha_postgres pg_dump -U captcha_user captcha_db | gzip > /var/backups/vinacaptcha/db_$(date +\%F).sql.gz && find /var/backups/vinacaptcha -name 'db_*.sql.gz' -mtime +14 -delete
```

Nên đồng bộ thư mục backup sang máy/kho lưu trữ khác.

**Cất giữ `.env` ở nơi an toàn** (trình quản lý mật khẩu / vault). Mất `.env` = mất `JWT_SECRET` và `APP_SALT` → **không ai đăng nhập được** dù DB còn nguyên.

**Khôi phục DB:**

```bash
docker compose stop backend
gunzip < /var/backups/vinacaptcha/db_2026-09-24.sql.gz | docker exec -i captcha_postgres psql -U captcha_user -d captcha_db
docker compose start backend
```

`pg_dump` mặc định không có lệnh `DROP` — khôi phục vào DB trống (cài mới, mục 12) để tránh xung đột dữ liệu. Cache metadata site/key trên Redis tự hết hạn sau 5 phút; không cần `FLUSHDB` (lệnh này xóa cả bộ đếm quota tháng).

---

## 11. Dự phòng khẩn cấp (failover)

Khi VPS chính gặp sự cố (DDoS tầng mạng, nghẽn ISP quốc tế, DC bảo trì):

**Chuẩn bị VPS dự phòng (hot standby):**
1. Dựng VPS B ở DC/nhà cung cấp khác.
2. **Chép `.env` từ VPS A sang B trước khi deploy** — `JWT_SECRET` và `APP_SALT` phải giống nhau, nếu không mật khẩu trong DB sao lưu sẽ không khớp.
3. Làm mục 3–4 trên B (dùng `.env` đã chép, **không** chạy Setup Wizard).
4. Đồng bộ DB định kỳ từ A sang B:
   ```bash
   # trên A
   docker exec captcha_postgres pg_dump -U captcha_user captcha_db | gzip > sync.sql.gz
   # trên B (DB trống lần đầu)
   gunzip < sync.sql.gz | docker exec -i captcha_postgres psql -U captcha_user -d captcha_db
   ```
5. Chép chứng chỉ SSL: `/etc/letsencrypt` từ A sang B (giữ nguyên quyền), sau đó trên B chạy `./deploy.sh` — bước 4 của `deploy.sh` tự bật HTTPS từ chứng chỉ có sẵn.

**Chuyển vùng:**
1. Trỏ A record của domain sang IP VPS B (đặt TTL thấp, VD 60s, từ trước).
2. Kiểm tra theo mục 7.
3. Khi A hoạt động lại: đồng bộ DB ngược từ B về A trước khi trỏ DNS trở lại.

---

## 12. Xử lý sự cố thường gặp

| Triệu chứng | Nguyên nhân / cách xử lý |
|---|---|
| Link kích hoạt / đặt lại mật khẩu trỏ sai domain, `http` thay vì `https`, hoặc sai cổng | Kiểm tra `APP_URL` trong `.env` (mục 6.1), rồi `docker compose up -d backend`. |
| Không nhận được email kích hoạt | Chưa cấu hình SMTP: `docker compose logs backend \| grep MailService`. Kích hoạt tay: `docker exec captcha_postgres psql -U captcha_user -d captcha_db -c "UPDATE accounts SET is_verified = true, activation_token = NULL WHERE email = 'user@example.com';"` |
| Đăng nhập Dashboard báo `domain_not_allowed` | Domain khác `nhanhoagroup.cloud` — mục 5.1 **[H3]**. |
| Mọi người dùng bỗng không đăng nhập được | Có ai đổi `JWT_SECRET` hoặc thêm/đổi `APP_SALT` **[M1]** — khôi phục giá trị cũ từ bản lưu `.env`. |
| Backend không kết nối được DB sau khi sửa `.env` | Đã đổi `POSTGRES_PASSWORD` sau khi volume khởi tạo — trả lại giá trị cũ. |
| 502 Bad Gateway | Backend chết/đang khởi động: `docker compose ps`, `docker compose logs --tail=200 backend`. |
| Sửa `.env` nhưng không có tác dụng | Dùng `docker compose up -d`, không dùng `restart`. |
| HTTPS hết hạn | Cron gia hạn chưa sửa — mục 6.2; gia hạn ngay: `docker compose stop gateway && sudo certbot renew && docker compose start gateway`. |
| Thống kê/nhật ký trống từ đầu tháng | Thiếu partition log — mục 8 **[H6]**. |
| Cài lại từ đầu (**xóa toàn bộ dữ liệu**) | `docker compose down -v` rồi `./deploy.sh`. Không dùng `-v` nếu muốn giữ dữ liệu. |

---

## 13. Lệnh quản trị hữu ích

| Thao tác | Lệnh |
|---|---|
| Trạng thái container | `docker compose ps` |
| Log realtime toàn hệ thống | `docker compose logs -f` |
| Log backend | `docker compose logs -f backend` |
| Tạo lại container sau khi sửa `.env` | `docker compose up -d` |
| Khởi động lại (không nạp lại `.env`) | `docker compose restart` |
| RAM/CPU từng container | `docker stats` |
| Redis CLI | `docker exec -it captcha_redis redis-cli` |
| PostgreSQL CLI | `docker exec -it captcha_postgres psql -U captcha_user -d captcha_db` |
| Commit đang chạy | `git -C /opt/vinacaptcha log --oneline -1` |
