# REEKLO 구조 학습 과제: 방 채팅 저장과 최근 기록 조회

## 1. 과제 목적

REEKLO의 전체 요청 흐름을 직접 수정하면서 이해하는 것이 목적이다.

```text
RoomView
  → socketStore
  → Socket.IO
  → GameGateway
  → ChatService
  → Prisma
  → PostgreSQL
  → Socket.IO broadcast
  → 다른 사용자의 RoomView
```

이번 과제에서는 모든 채팅을 한 번에 변경하지 않는다. 먼저 `ROOM` 채팅만 DB에 저장하고,
사용자가 방에 들어올 때 최근 메시지 30개를 불러오는 기능을 구현한다.

## 2. 시작 전 확인

Server 기준 작업 브랜치:

```text
codex/fix-plaza-presence-docs
```

Web 기준 작업 브랜치:

```text
codex/add-development-guide
```

작업 전 두 저장소에서 확인한다.

```bash
git fetch --all --prune
git status --short --branch
git branch -vv
git log --oneline --decorate -n 10
```

예상하지 않은 변경이 있으면 덮어쓰지 않는다. 운영 및 브랜치 기준은
`docs/OPERATIONS_HANDOFF.md`를 먼저 읽는다.

## 3. 반드시 지킬 데이터 정책

- 업무 데이터는 `use_yn`으로 활성 상태를 관리한다.
- `use_yn = 'Y'`: 정상 사용
- `use_yn = 'N'`: 논리 삭제 또는 비활성
- Prisma `delete`, `deleteMany`, SQL `DELETE`로 업무 데이터를 물리 삭제하지 않는다.
- 일반 메시지 조회에는 반드시 `use_yn = 'Y'` 조건을 넣는다.
- 위치, 방향, Presence, 이모트, WebRTC signaling은 채팅 메시지가 아니므로 저장하지 않는다.

세부 내용은 `docs/DATA_LIFECYCLE_POLICY.md`를 따른다.

## 4. 현재 준비된 것

다음 파일에 `chat_messages` 설계가 준비되어 있다.

```text
prisma/schema.prisma
prisma/sql/2026-07-27-chat-messages.sql
```

현재 준비된 주요 컬럼:

| 컬럼 | 역할 |
|---|---|
| `id` | 내부 숫자 PK |
| `message_id` | 외부 전달 및 신고 연결용 UUID |
| `sender_id` | 발신 사용자 |
| `recipient_id` | 귓속말 수신자 |
| `sender_nickname` | 작성 당시 닉네임 스냅샷 |
| `channel_type` | `ROOM`, `PLAZA`, `GUILD` 등의 채널 종류 |
| `channel_id` | 방·광장·길드 ID |
| `content` | 메시지 본문 |
| `metadata` | 추후 확장용 JSON |
| `moderation_status` | 운영 처리 상태 |
| `use_yn` | 논리 삭제 여부 |
| `created_at` | 작성 시각 |
| `edited_at` | 수정 시각 |
| `deleted_at` | 논리 삭제 시각 |

주의:

- SQL 파일이 Git에 있다고 실제 DB에 테이블이 자동 생성되는 것은 아니다.
- 운영 DB 적용은 별도 승인·백업·검증 후 진행한다.
- 로컬 실습에서는 별도 개발 DB를 사용한다.

## 5. 구현할 최종 흐름

### 메시지 전송

```text
사용자가 방 채팅 입력
  → 프런트가 room:chat 전송
  → Gateway가 인증된 userId 확인
  → ChatService가 내용 검증
  → chat_messages에 저장
  → 저장된 messageId와 createdAt 확보
  → 같은 Socket.IO Room에 broadcast
```

### 방 입장

```text
RoomView 진입
  → 최근 메시지 REST API 요청
  → use_yn = Y인 ROOM 메시지 최근 30개 조회
  → 오래된 메시지부터 화면에 표시
  → 이후 새 메시지는 Socket.IO로 실시간 수신
```

## 6. 1단계: Chat Module 구성

Server에 다음 구조를 만든다.

```text
src/chat/
├─ chat.module.ts
├─ chat.controller.ts
├─ chat.service.ts
└─ chat.dto.ts
```

그리고 `src/app.module.ts`에 `ChatModule`을 등록한다.

이 단계에서 확인할 개념:

- NestJS Module
- Controller
- Service Provider
- 의존성 주입
- 다른 Module에 Service export

완료 조건:

- Server build가 성공한다.
- `ChatService`를 `GameGateway`에서 주입할 수 있다.

## 7. 2단계: 방 메시지 저장

`ChatService`에 아래 책임을 가진 메서드를 직접 작성한다.

```ts
saveRoomMessage({
  senderId,
  senderNickname,
  roomId,
  content
})
```

저장 규칙:

```text
sender_id      = 인증된 사용자 ID
sender_nickname = DB에서 확인한 닉네임
channel_type   = ROOM
channel_id     = 방 ID
content        = 검증된 메시지
use_yn         = Y
```

검증 조건:

- 앞뒤 공백을 제거한다.
- 빈 문자열을 거부한다.
- 최대 500자로 제한한다.
- 존재하지 않는 사용자 또는 방을 처리한다.
- Prisma에 전달할 ID는 필요한 경우 `BigInt`로 변환한다.
- 저장 실패 시 메시지를 broadcast하지 않는다.

직접 고민할 질문:

1. 메시지 길이 검증은 DTO와 Service 중 어디까지 담당해야 하는가?
2. `senderNickname`을 클라이언트 값으로 믿으면 어떤 문제가 생기는가?
3. DB 저장 실패를 발신자에게 어떤 Socket.IO 이벤트로 알려줄 것인가?
4. `BigInt`가 JSON 직렬화될 때 어떤 문제가 생길 수 있는가?

## 8. 3단계: Gateway에 저장 과정 연결

현재 수정 대상:

```text
src/gateway/game.gateway.ts
```

현재 `room:chat` 처리 방식:

```text
메시지 수신 → 바로 broadcast
```

목표:

```text
메시지 수신
  → ChatService 호출
  → DB 저장 성공
  → 저장 결과를 payload로 변환
  → room:id에 broadcast
```

역할을 구분한다.

### Gateway 책임

- Socket 이벤트 수신
- `socket.data.userId` 확인
- Room 범위 결정
- 성공 결과 broadcast
- 실패 이벤트 전달

### ChatService 책임

- 입력값 검증
- 사용자 및 방 확인
- DB 저장
- 메시지 조회
- 논리 삭제

Gateway에서 Prisma를 직접 호출하지 않는 것을 목표로 한다.

## 9. 클라이언트 입력을 신뢰하지 않기

기존 프런트는 사용자 ID와 닉네임을 함께 보낼 수 있다.

```js
{
  message,
  userId,
  nickname
}
```

그러나 사용자는 브라우저 개발자 도구에서 이 값을 변경할 수 있다.

서버의 사용자 ID 기준:

```ts
socket.data.userId
```

닉네임 기준:

```text
users 테이블에서 인증된 userId로 조회
```

최종적으로 프런트는 메시지 본문만 보내도 처리할 수 있는 구조가 바람직하다.

## 10. 4단계: 최근 방 메시지 조회 API

권장 API:

```http
GET /api/chat/rooms/:roomId/messages?limit=30
```

조회 조건:

```text
channel_type = ROOM
channel_id = roomId
use_yn = Y
```

정렬:

```text
DB에서는 created_at DESC로 최근 30개 조회
응답할 때는 오래된 메시지부터 보이도록 순서 변환
```

필수 검증:

- `roomId`가 숫자로 변환 가능한가?
- `limit`의 최소·최대 범위는 무엇인가?
- 요청자가 해당 방의 메시지를 볼 권한이 있는가?
- 삭제된 메시지가 제외되는가?

초기 실습에서는 `limit` 최대값을 100 이하로 제한한다.

## 11. 권장 응답 DTO

프런트에는 Prisma row 전체를 그대로 보내지 않는다.

권장 형태:

```json
{
  "messageId": "UUID",
  "channelType": "ROOM",
  "channelId": "10",
  "senderId": "3",
  "senderNickname": "재우",
  "content": "안녕하세요",
  "createdAt": "2026-07-27T00:00:00.000Z"
}
```

다음 값은 일반 채팅 응답에 노출할 필요가 있는지 검토한다.

```text
내부 PK id
metadata 전체
moderation_status 내부값
deleted_at
DB relation 객체
```

## 12. 5단계: RoomView에서 최근 기록 표시

Web 수정 대상:

```text
src/views/RoomView.vue
```

방 입장 시:

1. 최근 메시지 REST API를 호출한다.
2. 반환된 메시지를 오래된 순서대로 표시한다.
3. 이후 Socket.IO 메시지를 같은 배열에 추가한다.
4. `messageId`를 기준으로 중복을 제거한다.

REST 조회와 Socket.IO 수신이 동시에 일어날 수 있다.

```text
REST 요청 시작
  → 새 Socket 메시지 수신
  → REST 응답 도착
```

단순히 배열을 교체하면 새 메시지가 사라질 수 있다. `messageId` 기반 merge를 구현한다.

확인할 개념:

- Vue lifecycle
- Pinia 또는 local state
- Axios REST 요청
- Socket.IO 실시간 수신
- 비동기 race condition
- 메시지 중복 제거

## 13. 6단계: 논리 삭제

후속 API 예시:

```http
DELETE /api/chat/messages/:messageId
```

HTTP `DELETE`는 API 의도를 표현할 뿐, DB에서 물리 삭제하라는 의미가 아니다.

DB 처리 목표:

```text
use_yn = N
deleted_at = 현재 시각
moderation_status = DELETED
```

금지:

```ts
prisma.chat_messages.delete(...)
prisma.chat_messages.deleteMany(...)
```

조회 API는 `use_yn = 'Y'`만 반환한다.

## 14. E2E 검증 시나리오

최소 두 사용자를 사용한다.

### 정상 전송

1. A와 B가 같은 방에 입장한다.
2. A가 메시지를 보낸다.
3. DB에 정확히 한 건 저장되는지 확인한다.
4. A와 B가 동일한 `messageId`를 받는지 확인한다.

### 최근 메시지

1. A가 여러 메시지를 작성한다.
2. B가 방을 나갔다가 다시 들어온다.
3. B가 최근 메시지를 시간순으로 받는지 확인한다.

### 검증 실패

- 빈 메시지
- 공백만 있는 메시지
- 500자 초과 메시지
- 존재하지 않는 방
- 조작된 `userId`

### 논리 삭제

1. 메시지를 비활성화한다.
2. row가 DB에 남아 있는지 확인한다.
3. `use_yn`이 `N`인지 확인한다.
4. 일반 조회 API에서 제외되는지 확인한다.

### 저장 실패

1. 테스트 DB 저장 실패 상황을 만든다.
2. 메시지가 다른 사용자에게 broadcast되지 않는지 확인한다.
3. 발신자가 오류 이벤트를 받는지 확인한다.

## 15. 완료 체크리스트

- [ ] `ChatModule`, `ChatController`, `ChatService`, DTO를 만들었다.
- [ ] `AppModule`과 `GatewayModule` 의존성을 올바르게 연결했다.
- [ ] 방 메시지가 DB에 한 번만 저장된다.
- [ ] `messageId` UUID가 응답과 Socket payload에 포함된다.
- [ ] 인증된 `socket.data.userId`를 사용한다.
- [ ] 닉네임을 클라이언트 값만으로 신뢰하지 않는다.
- [ ] 같은 방 사용자만 메시지를 받는다.
- [ ] 최근 메시지 30개를 불러온다.
- [ ] 최근 메시지를 오래된 순서대로 표시한다.
- [ ] REST와 Socket 메시지를 `messageId`로 중복 제거한다.
- [ ] 빈 메시지와 500자 초과 메시지를 차단한다.
- [ ] DB 저장 실패 시 broadcast하지 않는다.
- [ ] `use_yn = 'N'` 메시지를 일반 조회에서 제외한다.
- [ ] 물리 삭제 코드를 사용하지 않는다.
- [ ] Prisma validate/generate가 통과한다.
- [ ] Server build가 통과한다.
- [ ] Web build가 통과한다.
- [ ] 관련 E2E 테스트가 통과한다.

## 16. 권장 구현 순서

```text
1. 로컬 DB에 chat_messages migration 적용
2. ChatModule과 ChatService 작성
3. 방 메시지 저장 메서드 작성
4. Gateway room:chat에 저장 과정 연결
5. 최근 메시지 조회 API 작성
6. RoomView 최근 메시지 로딩
7. messageId 기반 중복 제거
8. 논리 삭제
9. E2E 테스트
10. 코드 리뷰 후 다른 채널로 확장
```

## 17. 다음 확장 과제

ROOM 채팅을 완성한 뒤 아래 순서로 확장한다.

1. 메시지 단위 신고와 `reports.message_id` 연결
2. 광장 채팅 저장
3. 길드 채팅 저장
4. 글로벌 및 친구 채팅 저장
5. 귓속말 저장과 접근 권한
6. cursor 기반 페이지네이션
7. 신고 증거 스냅샷
8. 메시지 보관 기간과 정리 정책
9. 관리자 신고 검토 화면

한 번에 모든 채널을 수정하지 않는다. ROOM 채팅의 저장·조회·삭제·검증 흐름을 완성하고
테스트한 뒤 같은 패턴을 다른 채널에 적용한다.
