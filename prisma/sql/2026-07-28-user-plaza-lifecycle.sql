-- 운영 광장과 개인 광장은 유지하고, 비어 있는 사용자 생성 공개 광장만 목록에서 숨긴다.
UPDATE plazas
SET use_yn = 'N'
WHERE plaza_type = 'PUBLIC'
  AND owner_id IS NOT NULL
  AND current_users = 0
  AND use_yn = 'Y';
