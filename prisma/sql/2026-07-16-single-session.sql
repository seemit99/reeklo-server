-- 마지막 로그인 기기만 유효하도록 JWT 세션 버전을 저장한다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;

-- 구 Spring user_blocks 컬럼명을 현재 Prisma 모델과 일치시킨다.
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
