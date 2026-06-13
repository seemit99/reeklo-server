-- 2026-06-13 신고 기능 + 프로필 보조 컬럼
-- 멱등 (IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS reports (
    id               BIGSERIAL    PRIMARY KEY,
    reporter_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_user_id BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason           VARCHAR(30)  NOT NULL,           -- ABUSE / SPAM / INAPPROPRIATE / HARASSMENT / ETC
    detail           VARCHAR(500),
    context          VARCHAR(50),                     -- 'plaza' | 'room' | 'whisper' 등
    status           VARCHAR(20)  NOT NULL DEFAULT 'OPEN',  -- OPEN / REVIEWED / DISMISSED
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- 프로필 카드용 자기소개 + 주력 게임
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS main_game VARCHAR(50);
