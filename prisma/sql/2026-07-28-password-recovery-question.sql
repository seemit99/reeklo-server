CREATE TABLE IF NOT EXISTS password_recovery_questions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    question VARCHAR(100) NOT NULL,
    answer_hash VARCHAR(255) NOT NULL,
    failed_count INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMP(6),
    use_yn CHAR(1) NOT NULL DEFAULT 'Y',
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_password_recovery_questions_use_yn CHECK (use_yn IN ('Y', 'N'))
);

CREATE INDEX IF NOT EXISTS idx_password_recovery_questions_user
    ON password_recovery_questions(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_password_recovery_questions_active_user
    ON password_recovery_questions(user_id)
    WHERE use_yn = 'Y';
