-- ==========================================================
-- NhanHoaCaptcha Database Initialization Script (PostgreSQL)
-- Tự động chạy khi khởi tạo container postgres trên bất cứ VPS nào
-- ==========================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE account_status AS ENUM ('active', 'suspended');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE site_status AS ENUM ('active', 'suspended');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE challenge_type AS ENUM ('none', 'slider', 'pow');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE verification_result AS ENUM ('pass', 'fail', 'expired');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. PLANS
CREATE TABLE IF NOT EXISTS plans (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code          VARCHAR(50) UNIQUE NOT NULL,
    name          VARCHAR(100) NOT NULL,
    max_domains   INT NOT NULL DEFAULT 2,
    max_requests  INT NOT NULL DEFAULT 10000,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default plans
INSERT INTO plans (code, name, max_domains, max_requests) VALUES
    ('default', 'Gói Trải Nghiệm', 2, 10000),
    ('pro', 'Gói Nâng Cao (Pro)', 10, 500000),
    ('enterprise', 'Gói Doanh Nghiệp (Enterprise)', 100, 5000000)
ON CONFLICT (code) DO NOTHING;

-- 3. ACCOUNTS
CREATE TABLE IF NOT EXISTS accounts (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email             TEXT NOT NULL UNIQUE,
    password_hash     TEXT NOT NULL,
    name              TEXT NOT NULL,
    status            account_status NOT NULL DEFAULT 'active',
    role              VARCHAR(20) DEFAULT 'user',
    is_verified       BOOLEAN DEFAULT true,
    activation_token  TEXT,
    plan_id           UUID REFERENCES plans(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Note: Admin account is initialized via the CMS Setup Wizard (/setup) on first run.
-- If you wish to seed an admin directly via SQL, uncomment the lines below:
-- INSERT INTO accounts (email, password_hash, name, role, status, is_verified, plan_id)
-- SELECT 
--     'admin@vina-captcha.com',
--     '33924376c66cfdfaee0a6ef2f1e29e92ff246c050a4980590807b539a67e891b',
--     'System Admin',
--     'admin',
--     'active',
--     true,
--     (SELECT id FROM plans WHERE code = 'enterprise' LIMIT 1)
-- WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE email = 'admin@vina-captcha.com');

-- 4. SITES
CREATE TABLE IF NOT EXISTS sites (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    platform        TEXT NOT NULL DEFAULT 'web',
    primary_domain  TEXT NOT NULL,
    allowed_domains TEXT[] NOT NULL DEFAULT '{}',
    challenge_mode  VARCHAR(20) NOT NULL DEFAULT 'auto',
    status          site_status NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sites_account_id ON sites(account_id);

-- 5. API KEYS
CREATE TABLE IF NOT EXISTS api_keys (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    key_hash    TEXT NOT NULL,
    key_prefix  TEXT NOT NULL,
    label       TEXT,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_site_id ON api_keys(site_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);

-- 6. VERIFICATION LOGS (Partitioned by Range)
CREATE TABLE IF NOT EXISTS verification_logs (
    id               BIGSERIAL,
    site_id          UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    session_id       UUID NOT NULL,
    ip               INET NOT NULL,
    fingerprint_hash TEXT,
    risk_score       NUMERIC(5,2),
    risk_breakdown   JSONB,
    challenge_type   challenge_type NOT NULL,
    result           verification_result NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Tạo sẵn các partition cho các tháng năm 2026
CREATE TABLE IF NOT EXISTS verification_logs_2026_09 PARTITION OF verification_logs
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE IF NOT EXISTS verification_logs_2026_10 PARTITION OF verification_logs
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE IF NOT EXISTS verification_logs_2026_11 PARTITION OF verification_logs
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE IF NOT EXISTS verification_logs_2026_12 PARTITION OF verification_logs
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE INDEX IF NOT EXISTS idx_verification_logs_site_created ON verification_logs(site_id, created_at);
CREATE INDEX IF NOT EXISTS idx_verification_logs_ip ON verification_logs(ip);

-- 7. IP REPUTATION
CREATE TABLE IF NOT EXISTS ip_reputation (
    ip_cidr         CIDR PRIMARY KEY,
    fail_count      INT NOT NULL DEFAULT 0,
    site_count_seen INT NOT NULL DEFAULT 1,
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ip_reputation_gist ON ip_reputation USING GIST (ip_cidr inet_ops);
CREATE INDEX IF NOT EXISTS idx_ip_reputation_fail_count ON ip_reputation(fail_count DESC);

CREATE TABLE IF NOT EXISTS ip_reputation_sightings (
    ip_cidr      CIDR NOT NULL REFERENCES ip_reputation(ip_cidr) ON DELETE CASCADE,
    site_id      UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (ip_cidr, site_id)
);

-- 8. FINGERPRINT REPUTATION
CREATE TABLE IF NOT EXISTS fingerprint_reputation (
    fingerprint_hash TEXT PRIMARY KEY,
    fail_count       INT NOT NULL DEFAULT 0,
    site_count_seen  INT NOT NULL DEFAULT 1,
    first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fingerprint_reputation_fail_count ON fingerprint_reputation(fail_count DESC);

-- 9. THREAT INTEL RANGES
CREATE TABLE IF NOT EXISTS threat_intel_ranges (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source      TEXT NOT NULL,
    category    TEXT NOT NULL,
    cidr        CIDR NOT NULL,
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source, cidr)
);

CREATE INDEX IF NOT EXISTS idx_threat_intel_gist ON threat_intel_ranges USING GIST (cidr inet_ops);

-- 10. THREAT INTEL SOURCE CONFIGS
CREATE TABLE IF NOT EXISTS threat_intel_source_configs (
    source_key            TEXT PRIMARY KEY,
    enabled               BOOLEAN NOT NULL DEFAULT true,
    sync_interval_minutes INT NOT NULL DEFAULT 1440,
    ingest_type           TEXT NOT NULL DEFAULT 'pull',
    auth_config           JSONB,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO threat_intel_source_configs (source_key, enabled, sync_interval_minutes, ingest_type) VALUES
    ('aws', true, 10080, 'pull'),
    ('gcp', true, 10080, 'pull'),
    ('azure', true, 10080, 'pull'),
    ('tor_exit', true, 1440, 'pull'),
    ('firehol_level1', true, 1440, 'pull'),
    ('firehol_level2', true, 1440, 'pull')
ON CONFLICT (source_key) DO NOTHING;

-- 11. SYSTEM SETTINGS (Cấu hình hệ thống động như SMTP, Global Flags...)
CREATE TABLE IF NOT EXISTS system_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

