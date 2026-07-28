-- Persist user-authored chat messages for history and moderation evidence.
-- Real-time movement, presence, emotes, and WebRTC signaling are intentionally excluded.

CREATE TABLE IF NOT EXISTS chat_messages (
    id                BIGSERIAL   PRIMARY KEY,
    message_id        UUID        NOT NULL DEFAULT gen_random_uuid(),
    sender_id         BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    recipient_id      BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    sender_nickname   VARCHAR(50) NOT NULL,
    channel_type      VARCHAR(20) NOT NULL,
    channel_id        BIGINT,
    content           TEXT        NOT NULL,
    metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    moderation_status VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    use_yn            CHAR(1)     NOT NULL DEFAULT 'Y',
    created_at        TIMESTAMP   NOT NULL DEFAULT NOW(),
    edited_at         TIMESTAMP,
    deleted_at        TIMESTAMP,

    CONSTRAINT uq_chat_messages_message_id UNIQUE (message_id),
    CONSTRAINT ck_chat_messages_channel_type
        CHECK (channel_type IN ('GLOBAL', 'PLAZA', 'ROOM', 'FRIENDS', 'GUILD', 'WHISPER', 'SYSTEM')),
    CONSTRAINT ck_chat_messages_moderation_status
        CHECK (moderation_status IN ('NORMAL', 'REPORTED', 'HIDDEN', 'DELETED')),
    CONSTRAINT ck_chat_messages_use_yn
        CHECK (use_yn IN ('Y', 'N')),
    CONSTRAINT ck_chat_messages_content_not_blank
        CHECK (length(btrim(content)) > 0),
    CONSTRAINT ck_chat_messages_whisper_recipient
        CHECK (channel_type <> 'WHISPER' OR recipient_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_channel
    ON chat_messages(channel_type, channel_id, use_yn, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_sender
    ON chat_messages(sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_recipient
    ON chat_messages(recipient_id, created_at DESC)
    WHERE recipient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_moderation
    ON chat_messages(moderation_status, created_at DESC);
