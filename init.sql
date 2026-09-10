CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

CREATE TYPE account_status AS ENUM ('active', 'suspended');

CREATE TABLE accounts (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    status        account_status NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE site_status AS ENUM ('active', 'suspended');

CREATE TABLE sites (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    primary_domain  TEXT NOT NULL,
    allowed_domains TEXT[] NOT NULL DEFAULT '{}',
    challenge_mode  VARCHAR(20) NOT NULL DEFAULT 'auto',
    status          site_status NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sites_account_id ON sites(account_id);

CREATE TABLE api_keys (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    key_hash    TEXT NOT NULL,
    key_prefix  TEXT NOT NULL,
    label       TEXT,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_site_id ON api_keys(site_id);
CREATE UNIQUE INDEX idx_api_keys_key_hash ON api_keys(key_hash);

CREATE TYPE challenge_type AS ENUM ('none', 'slider', 'pow');
CREATE TYPE verification_result AS ENUM ('pass', 'fail', 'expired');

CREATE TABLE verification_logs (
    id             BIGSERIAL,
    site_id        UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    session_id     UUID NOT NULL,
    ip             INET NOT NULL,
    fingerprint_hash TEXT,
    risk_score     NUMERIC(5,2),
    challenge_type challenge_type NOT NULL,
    result         verification_result NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE verification_logs_2026_09 PARTITION OF verification_logs
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE INDEX idx_verification_logs_site_created ON verification_logs(site_id, created_at);
CREATE INDEX idx_verification_logs_ip ON verification_logs(ip);

CREATE TABLE ip_reputation (
    ip_cidr        CIDR PRIMARY KEY,
    fail_count     INT NOT NULL DEFAULT 0,
    site_count_seen INT NOT NULL DEFAULT 1,
    first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ip_reputation_gist ON ip_reputation USING GIST (ip_cidr inet_ops);
CREATE INDEX idx_ip_reputation_fail_count ON ip_reputation(fail_count DESC);

CREATE TABLE ip_reputation_sightings (
    ip_cidr    CIDR NOT NULL REFERENCES ip_reputation(ip_cidr) ON DELETE CASCADE,
    site_id    UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (ip_cidr, site_id)
);

CREATE TABLE fingerprint_reputation (
    fingerprint_hash TEXT PRIMARY KEY,
    fail_count       INT NOT NULL DEFAULT 0,
    site_count_seen  INT NOT NULL DEFAULT 1,
    first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fingerprint_reputation_fail_count ON fingerprint_reputation(fail_count DESC);

CREATE TABLE threat_intel_ranges (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source      TEXT NOT NULL,
    category    TEXT NOT NULL,
    cidr        CIDR NOT NULL,
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source, cidr)
);

CREATE INDEX idx_threat_intel_gist ON threat_intel_ranges USING GIST (cidr inet_ops);
