# Reeklo Server 개발 안내서

이 서버가 현재 WEP의 기준 백엔드다. NestJS 11, TypeScript, Prisma/PostgreSQL, JWT, Socket.IO로 구성되어 있으며 WEP의 친구·길드·출석·설정·이메일·TURN 기능까지 포함한다.

## 1. 실행

Node.js 20 이상과 PostgreSQL이 필요하다.

```powershell
cd C:\reeklo-server
npm install
$env:DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/mystic?schema=public'
$env:JWT_SECRET='충분히 긴 임의 문자열'
npx prisma generate
npm run start:dev
```

기본 포트는 3000이다. WEP의 Vite proxy는 8080을 바라보므로 다음 중 하나로 통일한다.

```powershell
# 쉬운 방법: 서버를 8080에서 실행
$env:PORT='8080'
npm run start:dev
```

빌드/운영 실행:

```powershell
npm run build
npm start
```

주요 환경 변수:

| 변수 | 역할 |
|---|---|
| `DATABASE_URL` | Prisma PostgreSQL 연결 문자열 |
| `JWT_SECRET` | JWT 서명 키, 필수 |
| `JWT_EXPIRATION` | 만료 시간 ms, 기본 86400000 |
| `PORT` | HTTP/Socket.IO 포트, 기본 3000 |
| `UPLOAD_DIR` | 업로드 폴더, 기본 `./uploads` |
| `SMTP_HOST/PORT/SECURE/USER/PASS` | 실제 이메일 발송 |
| `MAIL_FROM` | 발신 주소 |
| `TURN_URL`, `TURN_SECRET` | WebRTC TURN 임시 credential |

## 2. 요청 흐름

```text
WEP Axios → Controller → Service → PrismaService → PostgreSQL
WEP Socket.IO → GameGateway → Roster/Presence 또는 Prisma → 대상 socket/room
```

`JwtAuthGuard`는 REST Bearer token을 검증하고, `GameGateway`는 Socket.IO handshake의 token을 검증한다. `BigIntInterceptor`는 Prisma의 BigInt를 JSON number/string으로 변환하며, `GlobalExceptionFilter`가 공통 오류 본문을 만든다.

## 3. 모듈 지도

- `AuthModule`: 가입, 로그인, 이메일 코드, 비밀번호 초기화/변경, JWT.
- `UsersModule`: 내 정보, 프로필, 설정, 출석, 공개 프로필.
- `PlazasModule`: 광장 목록/상세/생성, 내 광장, 사용자 광장, 장식, 인원.
- `RoomsModule`: 광장 내 방 CRUD, 비밀번호와 인원.
- `CharacterModule`: 파츠와 캐릭터 프리셋.
- `ItemsModule`: 보유 파츠와 구매.
- `FriendsModule`: 친구 요청/수락/거절/삭제, 차단, 신고.
- `GuildsModule`: 길드 CRUD, 가입/탈퇴, 구성원 역할.
- `GatewayModule`: 광장/방/길드 채팅, 위치, 이모트, WebRTC, 귓속말, 초대, presence.
- `UploadsModule`: 이미지 파일 저장과 정적 제공.
- `TurnModule`: time-limited TURN credential.
- `MailModule`: SMTP 또는 개발 로그 방식 이메일.
- `PrismaModule`: DB client 공유.

## 4. REST API

### 인증과 사용자

- `POST /api/auth/register`, `POST /api/auth/login`
- `GET /api/auth/email/status`, `POST /api/auth/email/send-code`, `POST /api/auth/email/verify`
- `POST /api/auth/password/reset`, `POST /api/auth/password/change`
- `GET /api/users/me`, `PUT /api/users/me`, `PUT /api/users/me/profile`
- `GET/PUT /api/users/me/settings`
- `GET/POST /api/users/me/checkin`
- `GET /api/users/:id`, `GET /api/users/:id/profile`

### 광장·방·캐릭터·상점

- `GET/POST /api/plazas`, `GET /api/plazas/me`, `GET /api/plazas/user/:userId`
- `GET /api/plazas/:id`, `POST /api/plazas/:id/join|leave`, `PUT /api/plazas/:id/decorations`
- `GET/POST /api/rooms`, `GET/DELETE /api/rooms/:id`, `POST /api/rooms/:id/join|leave`
- `GET/POST /api/parts`, `DELETE /api/parts/:id`
- `GET/PUT /api/character/preset`
- `GET /api/users/me/items`, `POST /api/items/:id/purchase`
- `POST /api/uploads`, `GET /api/turn-credentials`

### 소셜·길드

- `GET /api/friends`, `GET/POST /api/friends/requests`
- `POST /api/friends/requests/:id/accept|reject`, `DELETE /api/friends/requests/:id`
- `DELETE /api/friends/:userId`
- `GET/POST /api/friends/blocks`, `DELETE /api/friends/blocks/:userId`
- `POST /api/friends/reports`
- `GET/POST /api/guilds`, `GET /api/guilds/me`, `GET /api/guilds/:id`
- `POST /api/guilds/:id/join`, `POST /api/guilds/leave`, `DELETE /api/guilds/me`
- `DELETE /api/guilds/members/:userId`, `PUT /api/guilds/members/:userId/role`

## 5. Socket.IO 이벤트

Socket.IO path는 `/ws`다. WEP `socketProtocol.js`가 기존 `/app`, `/topic` 주소를 아래 이벤트로 변환한다.

- 광장: `plaza:join`, `plaza:leave`, `plaza:position`, `plaza:positions`, `plaza:roster`, `plaza:users`, `plaza:chat`, `plaza:emote`
- 방: `room:join`, `room:leave`, `room:event`, `room:chat`
- WebRTC: `webrtc:offer`, `webrtc:answer`, `webrtc:ice`
- 소셜: `invite:send/sent/error`, `whisper:send/sent/error`, presence 및 친구 알림
- 길드: `guild:chat`

이벤트 payload를 변경할 때 `src/gateway/game.gateway.ts`, WEP의 `socketProtocol.js`, 해당 Store/View, `test/frontend-protocol-e2e.js`를 한 번에 수정한다.

## 6. 파일별 설명

### 루트/설정

- `package.json`: Nest 실행·빌드·Prisma 명령과 의존성.
- `package-lock.json`: npm 버전 잠금. 직접 편집하지 않는다.
- `nest-cli.json`: Nest CLI source/build 설정.
- `tsconfig.json`: TypeScript compiler 설정.
- `src/main.ts`: Nest bootstrap, validation, CORS, static uploads, global interceptor/filter, 포트.
- `src/app.module.ts`: 모든 기능 module을 조립하는 root module.

### 공통과 DB

- `src/common/api-response.ts`: 성공 응답 helper/type.
- `src/common/bigint.interceptor.ts`: JSON.stringify가 처리하지 못하는 Prisma BigInt 변환.
- `src/common/global-exception.filter.ts`: 예외를 일관된 HTTP JSON으로 변환.
- `src/prisma/prisma.module.ts`: 전역 Prisma module.
- `src/prisma/prisma.service.ts`: `PrismaClient` 생명주기와 DB 연결.
- `prisma/schema.prisma`: 실제 DB 모델과 관계의 기준. character parts/presets, parties, guilds/members/invitations, plazas, email codes, friendships, settings, reports, blocks, rooms, items, users를 정의한다.
- `prisma/sql/2026-06-13-social.sql`: 친구·차단·설정 등 소셜 기능 수동 migration.
- `prisma/sql/2026-06-13-reports.sql`: 신고 기능 migration.
- `prisma/sql/2026-06-14-attendance.sql`: 출석 기능 migration.
- `prisma/sql/2026-06-14-guilds.sql`: 길드 기능 migration.

현재 migration이 Prisma migrations 폴더가 아닌 수동 SQL로도 존재한다. 새 환경에서는 SQL 적용 순서를 확인해야 하며, 장기적으로 `prisma migrate`로 통합하는 편이 안전하다.

### 인증

- `src/auth/auth.module.ts`: JWT/Passport/Mail/Prisma 의존성 조립과 token 만료 설정.
- `src/auth/auth.controller.ts`: auth REST endpoint.
- `src/auth/auth.service.ts`: 가입/로그인, 인증 코드 생성·검증, 비밀번호 처리.
- `src/auth/dto.ts`: class-validator가 적용된 요청 DTO.
- `src/auth/jwt.strategy.ts`: Bearer JWT payload 검증과 request user 생성.
- `src/auth/jwt-auth.guard.ts`: 보호 controller에 붙이는 guard.
- `src/auth/current-user.decorator.ts`: controller parameter에서 인증 사용자 id/payload를 읽는 decorator.
- `src/auth/jwt-secret.ts`: `JWT_SECRET` 로드와 누락 검증.

### 사용자

- `src/users/users.module.ts`: 사용자 모듈 의존성.
- `src/users/users.controller.ts`: me/profile/settings/checkin/public profile endpoint.
- `src/users/users.service.ts`: 사용자 조회·수정, 설정 upsert, 일일 출석과 보상 규칙.

### 광장과 방

- `src/plazas/plazas.module.ts`: 광장 모듈.
- `src/plazas/plazas.controller.ts`: 광장 REST endpoint와 인증 경계.
- `src/plazas/plazas.service.ts`: 기본 광장, 개인 광장, 입퇴장, 장식 persistence.
- `src/rooms/rooms.module.ts`: 방 모듈.
- `src/rooms/rooms.controller.ts`: 방 REST endpoint.
- `src/rooms/rooms.service.ts`: 방 생성/조회, 비밀번호, 정원, owner 권한과 인원.

### 캐릭터, 아이템, 업로드, TURN

- `src/character/character.module.ts`: 캐릭터 모듈.
- `src/character/character.controller.ts`: 파츠/프리셋 endpoint.
- `src/character/character.service.ts`: 파츠 CRUD, 소유권, preset upsert.
- `src/items/items.module.ts`: 아이템 모듈.
- `src/items/items.controller.ts`: 내 아이템/구매 endpoint.
- `src/items/items.service.ts`: 잔액·중복 검사와 transaction 구매.
- `src/uploads/uploads.module.ts`: 업로드 모듈.
- `src/uploads/uploads.controller.ts`: Multer 이미지 업로드와 URL 반환.
- `src/turn/turn.module.ts`: TURN 모듈.
- `src/turn/turn.controller.ts`: shared secret로 만료형 username/password 생성.

### 친구와 길드

- `src/friends/friends.module.ts`: 친구 모듈.
- `src/friends/friends.controller.ts`: 친구/요청/차단/신고 endpoint.
- `src/friends/friends.service.ts`: 양방향 관계 상태, 차단 검증, 요청 lifecycle, 신고 저장.
- `src/guilds/guilds.module.ts`: 길드 모듈.
- `src/guilds/guilds.controller.ts`: 길드와 구성원 관리 endpoint.
- `src/guilds/guilds.service.ts`: 길드 생성/가입/탈퇴/해체, master/officer 권한과 역할 변경.

### 메일과 실시간

- `src/mail/mail.module.ts`: mail service 제공.
- `src/mail/mail.service.ts`: SMTP 설정이 있으면 전송하고, 개발 환경에서는 인증 코드를 로그로 확인할 수 있게 처리.
- `src/gateway/gateway.module.ts`: gateway, roster, presence와 관련 module 연결.
- `src/gateway/game.gateway.ts`: 모든 Socket.IO 인증·방 참여·이벤트 중계의 중심. 수정 시 E2E 테스트 필수.
- `src/gateway/plaza-roster.service.ts`: 광장별 현재 사용자·위치·캐릭터 정보를 메모리에 저장.
- `src/gateway/presence.service.ts`: user↔socket 연결과 online 상태, 여러 socket 연결을 추적.

### 테스트

- `test/frontend-protocol-e2e.js`: WEP의 destination 변환 규약과 서버 이벤트 호환을 검증.
- `test/gateway-e2e.js`: 광장/방/WebRTC 등 gateway 기본 흐름 E2E.
- `test/social-e2e.js`: 친구·귓속말·초대·차단 등 소셜 E2E.

테스트 파일은 실행 중 서버와 실제 DB를 기대하는 스크립트다. 별도 테스트 DB와 고유 계정을 사용하고 `BASE`로 서버 주소를 지정한다.

## 7. 기능을 추가하는 표준 순서

1. 데이터가 필요하면 `schema.prisma`와 migration을 작성한다.
2. `npx prisma generate`로 client를 갱신한다.
3. 해당 Service에 규칙과 transaction을 구현한다.
4. DTO validation과 Controller endpoint를 추가한다.
5. WEP Store/Service의 요청·응답 필드와 맞춘다.
6. 실시간 기능이면 Gateway와 protocol mapping을 같이 수정한다.
7. build와 관련 E2E를 실행한다.

## 8. 개발 시 주의점

- roster/presence는 메모리 기반이라 재시작 시 사라지고 다중 인스턴스에서 공유되지 않는다. 확장 시 Redis adapter가 필요하다.
- REST와 Socket.IO 양쪽에서 인증·차단·권한을 검사해야 한다.
- 코인 구매, 길드 역할, 친구 수락은 Prisma transaction과 unique constraint를 함께 사용한다.
- 업로드 파일명/크기/MIME 검증과 정적 URL 노출 범위를 확인한다.
- SMTP/TURN/JWT/DB 비밀값은 Git에 넣지 않는다.
- WEP과 서버의 포트 및 `/ws` path가 일치하는지 가장 먼저 확인한다.

