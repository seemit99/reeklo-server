ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'USER',
    ADD COLUMN IF NOT EXISTS use_yn CHAR(1) NOT NULL DEFAULT 'Y';

ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_role;
ALTER TABLE users ADD CONSTRAINT ck_users_role CHECK (role IN ('USER', 'ADMIN'));
ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_use_yn;
ALTER TABLE users ADD CONSTRAINT ck_users_use_yn CHECK (use_yn IN ('Y', 'N'));

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action VARCHAR(50) NOT NULL,
    target_type VARCHAR(50),
    target_id VARCHAR(100),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    use_yn CHAR(1) NOT NULL DEFAULT 'Y',
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_admin_audit_logs_use_yn CHECK (use_yn IN ('Y', 'N'))
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor_created
    ON admin_audit_logs(actor_user_id, created_at DESC);
