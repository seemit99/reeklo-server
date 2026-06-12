/**
 * 소셜 기능 E2E: 친구 요청/수락 → 온라인 알림 → 귓속말 → WebRTC 시그널링 릴레이
 * 사용: BASE=http://localhost:3000 node test/social-e2e.js
 * 계정 두 개를 자동 생성(이미 있으면 로그인)해서 검증한다.
 */
const { io } = require('socket.io-client')

const BASE = process.env.BASE || 'http://localhost:3000'
const A = { username: 'sociala', email: 'sociala@test.local', password: 'test1234!', nickname: '소셜A' }
const B = { username: 'socialb', email: 'socialb@test.local', password: 'test1234!', nickname: '소셜B' }

let pass = 0, fail = 0
function check(name, cond) {
  cond ? pass++ : fail++
  console.log(`${cond ? '✅' : '❌'} ${name}`)
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

async function loginOrRegister(acc) {
  let r = await api('/api/auth/login', { method: 'POST', body: acc })
  if (r.status !== 201 && r.status !== 200) {
    r = await api('/api/auth/register', { method: 'POST', body: acc })
  }
  const token = r.json?.data?.accessToken
  if (!token) throw new Error(`로그인 실패: ${JSON.stringify(r.json)}`)
  const me = await api('/api/users/me', { token })
  return { token, id: Number(me.json.data.id) }
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { path: '/ws', auth: { token }, transports: ['websocket'] })
    s.once('connect', () => resolve(s))
    s.once('connect_error', reject)
  })
}

function waitFor(socket, event, ms = 3000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms)
    socket.once(event, (data) => { clearTimeout(t); resolve(data) })
  })
}

async function main() {
  const a = await loginOrRegister(A)
  const b = await loginOrRegister(B)
  console.log(`A=${a.id}, B=${b.id}`)

  // 기존 관계 초기화 (멱등 실행)
  await api(`/api/friends/${b.id}`, { method: 'DELETE', token: a.token }).catch(() => {})
  const reqs0 = await api('/api/friends/requests', { token: b.token })
  for (const r of reqs0.json?.data?.incoming ?? []) {
    await api(`/api/friends/requests/${r.requestId}/reject`, { method: 'POST', token: b.token })
  }

  // ── 1. 친구 요청/수락 + 실시간 알림 ──
  const sockB = await connect(b.token)
  const reqNotify = waitFor(sockB, 'friend:request')
  const sent = await api('/api/friends/requests', {
    method: 'POST', token: a.token, body: { targetUserId: b.id },
  })
  check('친구 요청 전송', sent.json?.success === true)
  const notif = await reqNotify
  check('수신자 실시간 friend:request 알림', notif?.nickname === A.nickname)

  const reqs = await api('/api/friends/requests', { token: b.token })
  const incoming = reqs.json?.data?.incoming?.find((r) => r.userId === a.id)
  check('받은 요청 목록 조회', !!incoming)

  const sockA = await connect(a.token)
  const acceptNotify = waitFor(sockA, 'friend:accepted')
  await api(`/api/friends/requests/${incoming.requestId}/accept`, { method: 'POST', token: b.token })
  check('요청자 실시간 friend:accepted 알림', (await acceptNotify) !== null)

  const friendsA = await api('/api/friends', { token: a.token })
  const friendB = friendsA.json?.data?.find((f) => f.userId === b.id)
  check('친구 목록에 추가 + 온라인 표시', friendB?.online === true)

  // ── 2. 온라인/오프라인 알림 ──
  const offNotify = waitFor(sockA, 'friend:offline')
  sockB.disconnect()
  check('friend:offline 알림', (await offNotify)?.userId === String(b.id))
  const onNotify = waitFor(sockA, 'friend:online')
  const sockB2 = await connect(b.token)
  check('friend:online 알림', (await onNotify)?.userId === String(b.id))

  // ── 3. 귓속말 ──
  const whisperRecv = waitFor(sockB2, 'whisper:receive')
  const whisperEcho = waitFor(sockA, 'whisper:sent')
  sockA.emit('whisper:send', { targetUserId: b.id, message: '귓속말 테스트!' })
  const recv = await whisperRecv
  check('귓속말 수신', recv?.message === '귓속말 테스트!' && recv?.fromNickname === A.nickname)
  check('귓속말 발신 에코', (await whisperEcho)?.message === '귓속말 테스트!')

  // 수신자 설정 whisper=none이면 거부
  await api('/api/users/me/settings', { method: 'PUT', token: b.token, body: { whisper: 'none' } })
  const whisperErr = waitFor(sockA, 'whisper:error')
  sockA.emit('whisper:send', { targetUserId: b.id, message: '차단 테스트' })
  check('whisper=none 설정 시 거부', (await whisperErr)?.reason?.includes('받지 않는'))
  await api('/api/users/me/settings', { method: 'PUT', token: b.token, body: { whisper: 'all' } })

  // ── 4. WebRTC 시그널링 릴레이 (음성 기능의 서버 구간) ──
  const signal = waitFor(sockB2, 'webrtc:signal')
  sockA.emit('webrtc:offer', { targetUserId: b.id, sdp: 'dummy-sdp-offer' })
  const sig = await signal
  check('webrtc:offer → webrtc:signal 릴레이', sig?.type === 'offer' && sig?.sdp === 'dummy-sdp-offer' && sig?.fromUserId === String(a.id))

  const iceSig = waitFor(sockA, 'webrtc:signal')
  sockB2.emit('webrtc:ice', { targetUserId: a.id, candidate: { c: 1 } })
  check('webrtc:ice 역방향 릴레이', (await iceSig)?.type === 'ice')

  // ── 5. 차단 ──
  await api('/api/friends/blocks', { method: 'POST', token: b.token, body: { targetUserId: a.id } })
  const friendsA2 = await api('/api/friends', { token: a.token })
  check('차단 시 친구 관계 해제', !friendsA2.json?.data?.find((f) => f.userId === b.id))
  const reBlocked = await api('/api/friends/requests', {
    method: 'POST', token: a.token, body: { targetUserId: b.id },
  })
  check('차단 상태에서 친구 요청 거부', reBlocked.status === 400)
  await api(`/api/friends/blocks/${a.id}`, { method: 'DELETE', token: b.token })

  sockA.disconnect()
  sockB2.disconnect()
  console.log(`\n결과: ${pass} 통과 / ${fail} 실패`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => { console.error('❌ 실행 오류:', e.message); process.exit(1) })
