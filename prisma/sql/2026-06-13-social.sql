-- 2026-06-13 소셜/인증 기능: 이메일 인증코드, 친구, 유저 설정, 차단, 개인 광장
-- 멱등(IF NOT EXISTS) — 로컬(레거시 friendships 존재)과 프로드(없음) 모두 적용 가능

-- 이메일 인증 코드 (SIGNUP=회원가입 / RESET=비밀번호 재설정 공용)
CREATE TABLE IF NOT EXISTS email_codes (
    id         BIGSERIAL    PRIMARY KEY,
    email      VARCHAR(100) NOT NULL,
    code       VARCHAR(10)  NOT NULL,
    purpose    VARCHAR(20)  NOT NULL,
    expires_at TIMESTAMP    NOT NULL,
    verified   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_codes_lookup ON email_codes(email, purpose);

-- 친구 (Spring 레거시 schema.sql과 동일 구조 — 로컬에 이미 있으면 그대로 재사용)
CREATE TABLE IF NOT EXISTS friendships (
    id           BIGSERIAL    PRIMARY KEY,
    requester_id BIGINT       REFERENCES users(id) ON DELETE CASCADE,
    addressee_id BIGINT       REFERENCES users(id) ON DELETE CASCADE,
    status       VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    UNIQUE (requester_id, addressee_id)
);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);

-- 유저 설정 (JSONB 단일 컬럼 — 항목 추가에 유연)
CREATE TABLE IF NOT EXISTS user_settings (
    user_id    BIGINT    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings   JSONB     NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 유저 차단 (채팅 무시 / 귓속말 차단 / 친구요청 차단)
CREATE TABLE IF NOT EXISTS user_blocks (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_user_id BIGINT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, blocked_user_id)
);

-- 초기 Spring 스키마(blocker_id/blocked_id)에서 Node/Prisma 컬럼명으로 안전하게 전환
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_blocks' AND column_name = 'blocker_id')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_blocks' AND column_name = 'user_id') THEN
        ALTER TABLE user_blocks RENAME COLUMN blocker_id TO user_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_blocks' AND column_name = 'blocked_id')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_blocks' AND column_name = 'blocked_user_id') THEN
        ALTER TABLE user_blocks RENAME COLUMN blocked_id TO blocked_user_id;
    END IF;
END $$;

-- 개인 광장 (마이페이지): plazas에 소유자/타입 추가, 기존 행은 PUBLIC 유지
ALTER TABLE plazas ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE plazas ADD COLUMN IF NOT EXISTS plaza_type VARCHAR(20) NOT NULL DEFAULT 'PUBLIC';
CREATE INDEX IF NOT EXISTS idx_plazas_owner ON plazas(owner_id);
