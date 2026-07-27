-- Record mandatory privacy collection/use consent for new registrations.
-- Existing users remain N until a separate consent policy is applied.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS privacy_consent_yn CHAR(1) NOT NULL DEFAULT 'N',
    ADD COLUMN IF NOT EXISTS privacy_consent_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS privacy_policy_version VARCHAR(20);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_users_privacy_consent_yn'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT ck_users_privacy_consent_yn
            CHECK (privacy_consent_yn IN ('Y', 'N'));
    END IF;
END $$;
