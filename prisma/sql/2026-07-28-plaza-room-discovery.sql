-- 운영 광장 자동 배정, 방 카테고리/태그 검색, use_yn 소프트 삭제 정책
ALTER TABLE plazas ADD COLUMN IF NOT EXISTS use_yn CHAR(1) NOT NULL DEFAULT 'Y';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS category_code VARCHAR(30) NOT NULL DEFAULT 'GENERAL';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS description VARCHAR(300);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS use_yn CHAR(1) NOT NULL DEFAULT 'Y';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_plaza_id BIGINT;

ALTER TABLE plazas DROP CONSTRAINT IF EXISTS ck_plazas_use_yn;
ALTER TABLE plazas ADD CONSTRAINT ck_plazas_use_yn CHECK (use_yn IN ('Y', 'N'));
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS ck_rooms_use_yn;
ALTER TABLE rooms ADD CONSTRAINT ck_rooms_use_yn CHECK (use_yn IN ('Y', 'N'));

CREATE TABLE IF NOT EXISTS room_categories (
    code          VARCHAR(30) PRIMARY KEY,
    name          VARCHAR(50) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    use_yn        CHAR(1) NOT NULL DEFAULT 'Y' CHECK (use_yn IN ('Y', 'N')),
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tags (
    id         BIGSERIAL PRIMARY KEY,
    name       VARCHAR(20) NOT NULL UNIQUE,
    use_yn     CHAR(1) NOT NULL DEFAULT 'Y' CHECK (use_yn IN ('Y', 'N')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_tags (
    room_id    BIGINT NOT NULL REFERENCES rooms(id),
    tag_id     BIGINT NOT NULL REFERENCES tags(id),
    use_yn     CHAR(1) NOT NULL DEFAULT 'Y' CHECK (use_yn IN ('Y', 'N')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (room_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_rooms_search
    ON rooms(plaza_id, category_code, use_yn, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_tags_search ON room_tags(tag_id, use_yn);

INSERT INTO room_categories(code, name, display_order) VALUES
    ('GENERAL', '자유 대화', 10),
    ('GAME', '게임', 20),
    ('STUDY', '공부·작업', 30),
    ('MUSIC', '음악', 40),
    ('COUNSEL', '고민 상담', 50),
    ('SOCIAL', '친목', 60),
    ('EVENT', '이벤트', 70),
    ('ETC', '기타', 80)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name, display_order = EXCLUDED.display_order, use_yn = 'Y';

-- 운영 광장은 사용자 생성 방과 분리해 미리 준비한다.
INSERT INTO plazas(name, game_type, max_users, current_users, plaza_type, use_yn)
SELECT seed.name, 'ALL', 50, 0, 'PUBLIC', 'Y'
FROM (VALUES ('리클로 광장 1'), ('리클로 광장 2'), ('리클로 광장 3')) AS seed(name)
WHERE NOT EXISTS (
    SELECT 1 FROM plazas p WHERE p.name = seed.name AND p.plaza_type = 'PUBLIC'
);
