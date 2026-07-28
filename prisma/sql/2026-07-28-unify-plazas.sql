-- 광장과 방을 하나의 사용자 생성 공간인 plazas로 통일한다.
ALTER TABLE plazas ADD COLUMN IF NOT EXISTS category_code VARCHAR(30) NOT NULL DEFAULT 'GENERAL';
ALTER TABLE plazas ADD COLUMN IF NOT EXISTS description VARCHAR(300);

CREATE TABLE IF NOT EXISTS plaza_tags (
    plaza_id   BIGINT NOT NULL REFERENCES plazas(id),
    tag_id     BIGINT NOT NULL REFERENCES tags(id),
    use_yn     CHAR(1) NOT NULL DEFAULT 'Y' CHECK (use_yn IN ('Y', 'N')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (plaza_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_plazas_search ON plazas(category_code, use_yn, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plaza_tags_search ON plaza_tags(tag_id, use_yn);

-- 예전에 게임 이름으로 고정 생성했던 광장은 목록에서 숨긴다.
UPDATE plazas
SET use_yn = 'N'
WHERE lower(name) IN (
    '리그 오브 레전드', '리그오브레전드', 'league of legends',
    '오버워치', 'overwatch',
    '발로란트', 'valorant',
    '배틀그라운드', 'pubg'
);
