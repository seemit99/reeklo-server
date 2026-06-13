-- 2026-06-14 길드 시스템 테이블 (멱등). 로컬엔 이미 있으나 프로드 DB엔 없어 추가.

CREATE TABLE IF NOT EXISTS guilds (
    id              BIGSERIAL    PRIMARY KEY,
    name            VARCHAR(30)  UNIQUE NOT NULL,
    tag             VARCHAR(6)   UNIQUE NOT NULL,
    description     VARCHAR(200),
    leader_id       BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    game_type       VARCHAR(20)  NOT NULL DEFAULT 'ALL',
    max_members     INTEGER      NOT NULL DEFAULT 30,
    current_members INTEGER      NOT NULL DEFAULT 1,
    emblem_url      VARCHAR(500),
    is_public       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_guilds_game_type ON guilds(game_type);
CREATE INDEX IF NOT EXISTS idx_guilds_leader_id ON guilds(leader_id);

CREATE TABLE IF NOT EXISTS guild_members (
    id         BIGSERIAL   PRIMARY KEY,
    guild_id   BIGINT      REFERENCES guilds(id) ON DELETE CASCADE,
    user_id    BIGINT      REFERENCES users(id)  ON DELETE CASCADE,
    role       VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    joined_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
    UNIQUE (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_guild_members_guild_id ON guild_members(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_members_user_id ON guild_members(user_id);

CREATE TABLE IF NOT EXISTS guild_invitations (
    id         BIGSERIAL   PRIMARY KEY,
    guild_id   BIGINT      REFERENCES guilds(id) ON DELETE CASCADE,
    inviter_id BIGINT      REFERENCES users(id)  ON DELETE CASCADE,
    invitee_id BIGINT      REFERENCES users(id)  ON DELETE CASCADE,
    status     VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- 파티 보드용 (프로드에 컬럼이 없을 수 있음)
ALTER TABLE parties ADD COLUMN IF NOT EXISTS plaza_id BIGINT REFERENCES plazas(id) ON DELETE SET NULL;
