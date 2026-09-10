# SCHEMA.md — Nội bộ Captcha System

DDL cho PostgreSQL. Đọc file này trước khi viết bất kỳ query nào — không đoán tên cột.

## 0. Extension cần bật

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist"; -- cho GiST index trên cidr, dùng ở threat_intel_ranges
```

## 1. accounts — site owner đăng ký dùng dashboard

```sql
CREATE TYPE account_status AS ENUM ('active', 'suspended');

CREATE TABLE accounts (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    status        account_status NOT NULL DEFAULT 'active',
    role          VARCHAR(20) DEFAULT 'user', -- 'admin', 'user'
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## 2. sites — 1 account có thể có nhiều site nhúng captcha

```sql
CREATE TYPE site_status AS ENUM ('active', 'suspended');

CREATE TABLE sites (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    platform        TEXT NOT NULL DEFAULT 'web', -- 'web', 'ios', 'android'
    primary_domain  TEXT NOT NULL,
    allowed_domains TEXT[] NOT NULL DEFAULT '{}', -- whitelist domain phụ được nhúng widget
    status          site_status NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sites_account_id ON sites(account_id);
```

## 3. api_keys — key để widget gọi `/issue`, `/verify`

```sql
CREATE TABLE api_keys (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    key_hash    TEXT NOT NULL,           -- lưu hash (SHA-256), KHÔNG lưu plaintext
    key_prefix  TEXT NOT NULL,           -- VD "cap_live_8f2a" để hiển thị trên dashboard, không đủ để dùng lại
    label       TEXT,                    -- ghi chú của người tạo, VD "production", "staging"
    revoked_at  TIMESTAMPTZ,             -- null = còn hiệu lực
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_site_id ON api_keys(site_id);
CREATE UNIQUE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
```

## 4. verification_logs — log mỗi lần issue/verify

Bảng ghi nhiều nhất, cần partition theo tháng khi vào production.

```sql
CREATE TYPE challenge_type AS ENUM ('none', 'slider', 'pow');
CREATE TYPE verification_result AS ENUM ('pass', 'fail', 'expired');

CREATE TABLE verification_logs (
    id             BIGSERIAL,
    site_id        UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    session_id     UUID NOT NULL,        -- trả về từ /issue, dùng nối issue<->verify cùng 1 lượt
    ip             INET NOT NULL,
    fingerprint_hash TEXT,
    risk_score     NUMERIC(5,2),
    challenge_type challenge_type NOT NULL,
    result         verification_result NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- VD tạo partition tháng hiện tại, agent/cron cần tự động tạo partition tháng mới trước khi hết tháng
CREATE TABLE verification_logs_2026_09 PARTITION OF verification_logs
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE INDEX idx_verification_logs_site_created ON verification_logs(site_id, created_at);
CREATE INDEX idx_verification_logs_ip ON verification_logs(ip);
```

## 5. ip_reputation — dùng CHUNG cho mọi site (mục 3.5.a trong ARCHITECTURE.md)

```sql
CREATE TABLE ip_reputation (
    ip_cidr        CIDR PRIMARY KEY,     -- lưu /32 cho IP đơn lẻ, hoặc range rộng hơn nếu gom theo subnet
    fail_count     INT NOT NULL DEFAULT 0,
    site_count_seen INT NOT NULL DEFAULT 1, -- số site khác nhau từng thấy IP này bị flag
    first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ip_reputation_gist ON ip_reputation USING GIST (ip_cidr inet_ops);
CREATE INDEX idx_ip_reputation_fail_count ON ip_reputation(fail_count DESC);

-- Bảng phụ để đếm site_count_seen chính xác (tránh double-count khi 1 site query nhiều lần)
CREATE TABLE ip_reputation_sightings (
    ip_cidr    CIDR NOT NULL REFERENCES ip_reputation(ip_cidr) ON DELETE CASCADE,
    site_id    UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (ip_cidr, site_id)
);
```

## 6. fingerprint_reputation — dùng CHUNG cho mọi site

```sql
CREATE TABLE fingerprint_reputation (
    fingerprint_hash TEXT PRIMARY KEY,   -- hash của canvas/UA/plugin fingerprint client
    fail_count       INT NOT NULL DEFAULT 0,
    site_count_seen  INT NOT NULL DEFAULT 1,
    first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fingerprint_reputation_fail_count ON fingerprint_reputation(fail_count DESC);
```

## 7. threat_intel_ranges — nguồn mở đồng bộ định kỳ (mục 3.5.b)

```sql
CREATE TABLE threat_intel_ranges (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source      TEXT NOT NULL,   -- 'aws', 'gcp', 'azure', 'digitalocean', 'tor_exit', 'spamhaus_drop'
    category    TEXT NOT NULL,   -- 'datacenter', 'tor', 'spam'
    cidr        CIDR NOT NULL,
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source, cidr)
);

CREATE INDEX idx_threat_intel_gist ON threat_intel_ranges USING GIST (cidr inet_ops);
```

## 7b. threat_intel_source_configs — bật/tắt nguồn, cấu hình sync (mục 3.6.b trong ARCHITECTURE.md)

```sql
CREATE TYPE threat_intel_ingest_type AS ENUM ('pull', 'push');

CREATE TABLE threat_intel_source_configs (
    source_key           TEXT PRIMARY KEY,   -- khớp với `source` ở bảng threat_intel_ranges, VD 'firehol_level1', 'partner_x'
    enabled               BOOLEAN NOT NULL DEFAULT true,
    ingest_type           threat_intel_ingest_type NOT NULL DEFAULT 'pull',
    sync_interval_minutes INT,                -- null nếu ingest_type = 'push' (không cron kéo)
    auth_config           JSONB NOT NULL DEFAULT '{}', -- API key/token nếu nguồn yêu cầu, để trống nếu không cần
    last_synced_at        TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
- Cron job đọc bảng này để biết nguồn nào `enabled = true` và `ingest_type = 'pull'` cần chạy, theo `sync_interval_minutes`.
- Nguồn `ingest_type = 'push'` không bị cron đụng tới — chờ nhận qua `POST /admin/v1/threat-intel/ingest` (xem API_CONTRACT.md).
- `last_synced_at` dùng để dashboard admin hiển thị cảnh báo nếu 1 nguồn pull lâu không sync (cron có thể đã chết).

## 8. Ghi chú vận hành

- **Decay job** (cron hằng ngày): giảm `fail_count` cho entry trong `ip_reputation`/`fingerprint_reputation` không có `last_seen_at` mới trong N ngày (VD 30 ngày) — tránh giữ oan IP dùng chung (NAT văn phòng, 4G).
- **Sync threat_intel_ranges** (cron hằng tuần cho cloud range, hằng ngày cho Tor exit list): xoá + insert lại theo `source`, không update tại chỗ để tránh dữ liệu cũ lẫn dữ liệu mới.
- **Batch cập nhật reputation từ verification_logs** (cron hằng giờ, tách khỏi luồng verify realtime — xem ARCHITECTURE.md 3.5.a): quét log fail mới, upsert vào `ip_reputation`/`fingerprint_reputation`, upsert `ip_reputation_sightings` để tính đúng `site_count_seen`.
- **Tra cứu risk score lúc `/issue`**: query containment trên `ip_reputation` + `threat_intel_ranges` bằng toán tử `<<=` (IP nằm trong CIDR), tận dụng GiST index — không quét tuần tự toàn bảng.
- Token/session của widget (JWT, one-time-use) KHÔNG lưu ở PostgreSQL — lưu ở Redis theo ARCHITECTURE.md 3.2, TTL ngắn, không cần bảng riêng.

## 9. Trạng thái tài liệu

- [x] SCHEMA.md — file này
- [ ] API_CONTRACT.md — contract chi tiết `/issue`, `/verify`, dashboard REST (chưa viết)
