-- 2026-06-14 출석 체크 / 일일 코인 보상 (멱등)
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_check_in DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS attendance_streak INTEGER NOT NULL DEFAULT 0;
