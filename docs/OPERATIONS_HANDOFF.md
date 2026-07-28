# REEKLO 작업·브랜치·운영 배포 인수인계

> 기준일: 2026-07-27  
> 목적: 다른 PC나 다른 작업자가 오래된 브랜치 또는 잘못된 저장소에서 수정·배포하는 사고를 방지한다.

## 1. 현재 사용하는 저장소

| 구분 | GitHub | 로컬 기준 경로 | 역할 |
|---|---|---|---|
| Web | `seemit99/reeklo-web` | `C:\reeklo-web` | Vue 3, Phaser, Electron 프런트엔드 |
| Server | `seemit99/reeklo-server` | `C:\reeklo-server` | NestJS, Prisma, PostgreSQL, Socket.IO 백엔드 |

- `reeklo-api`는 현재 서비스 개발 및 운영 배포 대상이 아니다.
- `reeklo-wep`은 `reeklo-web`의 과거 오타 이름이다. 새 작업에서는 사용하지 않는다.
- 운영 VM에는 과거 디렉터리 `~/reeklo-wep`가 아직 남아 있다. 디렉터리 이름만 보고 오래된 저장소로 판단하지 말고 반드시 remote, branch, commit을 확인한다.

## 2. 가장 중요한 브랜치 현황

### Web

- GitHub 기본 브랜치: `main`
- 현재 운영 및 최신 작업 브랜치: `codex/add-development-guide`
- 2026-07-27 운영 확인 커밋: `a5885c1`
- `main`의 확인 커밋: `d6ea6ea`
- 결론: 현재 `main`은 운영 브랜치보다 뒤처져 있다.
- 열린 PR: `codex/add-development-guide` → `main` (#1)

### Server

- GitHub 기본 브랜치: `master`
- 현재 운영 및 최신 작업 브랜치: `codex/fix-plaza-presence-docs`
- 2026-07-27 운영 확인 커밋: `14f9878`
- 현재 원격 작업 브랜치 끝: `f988cdf`
- `master`의 확인 커밋: `8e5f345`
- `main`은 초기 커밋만 있는 사용 금지 브랜치다.
- 결론: 현재 `master`도 운영 및 최신 작업보다 뒤처져 있다.
- 열린 PR: `codex/fix-plaza-presence-docs` → `master` (#1)

## 3. 현재의 임시 Source of Truth

브랜치 정리가 끝나기 전까지 다음을 기준으로 삼는다.

```text
Web    : origin/codex/add-development-guide
Server : origin/codex/fix-plaza-presence-docs
```

다음 브랜치에서 직접 운영 배포하지 않는다.

```text
Web    : origin/main
Server : origin/master
Server : origin/main (절대 사용 금지)
```

장기적으로는 열린 PR을 검증·병합한 후 아래 하나만 운영 기준으로 사용한다.

```text
Web    : main
Server : master
```

PR 병합과 운영 검증이 끝나기 전에는 이 문서의 “임시 Source of Truth”를 임의로 변경하지 않는다.

## 4. 작업 시작 전 필수 확인

다른 PC에서 작업을 시작할 때 저장소마다 아래 명령을 실행한다.

```bash
git remote -v
git fetch --all --prune
git status --short --branch
git branch -vv
git log --oneline --decorate -n 10
```

확인 기준:

1. remote가 정확한 GitHub 저장소인가?
2. 현재 branch가 위 Source of Truth와 일치하는가?
3. working tree에 다른 작업자의 변경이 남아 있지 않은가?
4. 로컬 HEAD가 원격 branch보다 뒤처지지 않았는가?
5. 배포할 커밋 SHA를 작업 기록에 남겼는가?

하나라도 불명확하면 수정하거나 배포하지 않는다.

## 5. 안전한 로컬 시작 절차

### Web

```bash
git clone https://github.com/seemit99/reeklo-web.git
cd reeklo-web
git fetch --all --prune
git switch codex/add-development-guide
git pull --ff-only origin codex/add-development-guide
npm install
npm run build
```

### Server

```bash
git clone https://github.com/seemit99/reeklo-server.git
cd reeklo-server
git fetch --all --prune
git switch codex/fix-plaza-presence-docs
git pull --ff-only origin codex/fix-plaza-presence-docs
npm install
npx prisma generate
npm run build
```

`.env`, DB 비밀번호, JWT 비밀값, SMTP/TURN 자격증명은 Git에 커밋하지 않는다.

## 6. 운영 환경

| 항목 | 현재 값 |
|---|---|
| GCP 프로젝트 | `reeklo` |
| VM | `instance-20260226-080759` |
| Zone | `asia-northeast3-b` |
| 서비스 도메인 | `https://reeklo.com` |
| Web 배포 경로 | `/var/www/reeklo` |
| Server 작업 경로 | `/home/jwpark429/reeklo-server` |
| Server systemd | `reeklo-node.service` |
| Server 실행 파일 | `/home/jwpark429/reeklo-server/dist/main.js` |
| API/Socket 포트 | `8081` |
| Socket.IO path | `/ws` |

운영 VM의 Web Git 디렉터리는 아직 `/home/jwpark429/reeklo-wep`이다. 실제 GitHub 저장소는 `reeklo-web`이므로 향후 경로를 정리해야 한다.

## 7. 배포 전 중단 조건

아래 중 하나라도 해당하면 배포를 중단한다.

- `git status --short`에 예상하지 않은 파일이 표시된다.
- 현재 branch가 Source of Truth와 다르다.
- `git rev-parse HEAD`와 배포 승인 커밋이 다르다.
- 로컬 또는 운영 VM에만 존재하는 커밋이 있다.
- Web `npm run build` 또는 Server `npm run build`가 실패한다.
- Prisma schema와 실제 DB migration 적용 순서가 불명확하다.
- 운영 DB 백업 없이 파괴적 DDL을 실행하려 한다.
- 운영 VM의 `uploads` 경로를 삭제하거나 초기화하려 한다.

## 8. Web 운영 배포 절차

배포 전 현재 운영 버전과 새 버전을 기록한다.

```bash
cd ~/reeklo-wep
git status --short --branch
git rev-parse HEAD
git fetch origin
git switch codex/add-development-guide
git pull --ff-only origin codex/add-development-guide
git rev-parse HEAD
npm install
npm run build
```

빌드가 성공한 뒤에만 `dist`를 `/var/www/reeklo`에 반영한다. 기존 배포본을 시간 또는 커밋 SHA가 포함된 백업 디렉터리로 보존하고, 새 파일을 준비한 뒤 디렉터리를 교체한다. 빌드 중인 `dist`를 운영 경로에 직접 덮어쓰지 않는다.

배포 후:

```bash
curl -I https://reeklo.com
```

로그인, 로비, 광장 입장, 채팅, 이동과 Socket.IO 연결을 직접 확인한다.

## 9. Server 운영 배포 절차

```bash
cd ~/reeklo-server
git status --short --branch
git rev-parse HEAD
git fetch origin
git switch codex/fix-plaza-presence-docs
git pull --ff-only origin codex/fix-plaza-presence-docs
git rev-parse HEAD
npm install
npx prisma generate
npm run build
```

빌드 성공 후:

```bash
sudo systemctl restart reeklo-node
sudo systemctl is-active reeklo-node
sudo journalctl -u reeklo-node -n 100 --no-pager
```

`active` 확인만으로 끝내지 말고 로그인, REST API, `/ws` 연결과 핵심 실시간 기능을 확인한다.

## 10. DB 변경 절차

현재 migration은 `prisma/sql`의 수동 SQL도 포함한다.

1. 변경 SQL과 `schema.prisma`를 같은 커밋에 준비한다.
2. Prisma format/validate/generate와 Server build를 통과시킨다.
3. 운영 DB를 백업한다.
4. 적용할 SQL 파일과 적용 순서를 기록한다.
5. SQL을 적용한다.
6. DB 구조를 확인한다.
7. 그 구조를 사용하는 Server 커밋을 배포한다.
8. 실패 시 코드뿐 아니라 DB rollback 가능 여부도 확인한다.

현재 데이터 정책:

- 모든 업무 데이터는 `use_yn`으로 활성/비활성 상태를 관리한다.
- `use_yn = 'Y'`: 사용 중
- `use_yn = 'N'`: 논리 삭제 또는 비활성
- 물리 삭제는 금지한다.
- 기존 물리 삭제 코드는 별도 정책 작업에서 전환한다.
- 세부 정책은 Server 저장소의 `docs/DATA_LIFECYCLE_POLICY.md`를 따른다.

2026-07-27 추가된 `prisma/sql/2026-07-27-chat-messages.sql`은 코드에 준비된 migration이며,
아직 운영 DB에 적용하거나 채팅 저장 Gateway를 운영 배포한 상태가 아니다. SQL 적용과 Server
배포를 하나의 승인된 작업으로 진행하기 전까지 운영에 테이블이 존재한다고 가정하지 않는다.

## 11. 절대 하지 말 것

- 서버 저장소의 `origin/main`에서 작업 또는 배포
- GitHub 기본 브랜치라는 이유만으로 최신 코드라고 판단
- branch와 commit SHA 확인 없이 `git pull` 후 즉시 배포
- 운영 VM에서 직접 코드를 수정한 뒤 Git에 반영하지 않는 작업
- 빌드 실패 상태에서 서비스 재시작
- 운영 Web 디렉터리에 빌드 결과를 부분적으로 덮어쓰기
- 운영 `uploads`, `.env`, 인증서 또는 systemd 환경값 삭제
- Git remote URL에 토큰이나 비밀번호를 포함
- Prisma schema만 변경하고 실제 DB migration 없이 배포
- `use_yn` 정책을 무시한 물리 삭제

## 12. 현재 발견된 정리 필요 사항

1. Web PR #1을 검증 후 `main`에 병합한다.
2. Server PR #1을 검증 후 `master`에 병합한다.
3. 병합 및 운영 재배포가 완료되면 Source of Truth를 기본 브랜치로 단일화한다.
4. Server의 사용하지 않는 `main` 브랜치를 정리한다.
5. 운영 Web 디렉터리명을 `reeklo-wep`에서 `reeklo-web`으로 변경한다.
6. 운영 Web remote에서 URL 내 인증정보를 제거하고 해당 자격증명을 교체한다.
7. 운영 배포를 수동 `git pull` 대신 승인된 commit SHA 또는 release artifact 기반으로 자동화한다.
8. 운영 배포 기록에 이전 SHA, 새 SHA, 작업자, 시간, DB migration을 남긴다.

## 13. 작업 종료 시 인수인계 기록

작업을 마칠 때 최소한 다음 정보를 남긴다.

```text
Repository:
Branch:
Before SHA:
After SHA:
Changed files:
Migration:
Build/test result:
Deployed: yes/no
Production verification:
Rollback SHA/artifact:
Remaining work:
```

이 기록이 없으면 다음 작업자는 운영 배포를 진행하지 않는다.

## 14. 2026-07-29 최신 운영 기준

- Web 운영 기준은 `main`의 `1299b3c`이다.
- Server 운영 기준은 `master`의 `359008c`이다.
- 운영 배포와 DB 변경 상세는 `docs/RELEASE_2026-07-28.md`를 확인한다.
- 운영 관리자는 별도 계정이 아니라 기존 `jwpark429@naver.com` 계정에 `ADMIN` 역할을 부여해 사용한다.
- 운영 DB 변경 전 Cloud SQL 온디맨드 백업 `before-admin-recovery-deploy-20260728`을 생성했다.
- Web 롤백 기준은 `5209ccc`, Server 롤백 기준은 `134b691`이다.
