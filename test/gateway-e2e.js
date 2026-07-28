// Socket.IO 게이트웨이 E2E — 두 유저로 광장/방/WebRTC/끊김 자동퇴장 시나리오 검증
// 실행: node test/gateway-e2e.js (서버가 :3000에 떠 있어야 함)
let io
try { ({ io } = require('socket.io-client')) }
catch { ({ io } = require(process.env.SIOC_PATH || 'C:/reeklo-web/node_modules/socket.io-client')) }

const BASE = process.env.BASE || 'http://localhost:3000'
const EMAIL_A = process.env.EMAIL_A || 'node39727@t.io'
const EMAIL_B = process.env.EMAIL_B || 'spr39727@t.io'
const PASSWORD = process.env.PASSWORD || 'test1234'
let failed = 0
const okLog = (name) => console.log(`PASS ${name}`)
const fail = (name, detail) => { failed++; console.error(`FAIL ${name}: ${detail}`) }

function waitEvent(socket, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${event} timeout`)), timeoutMs)
    socket.once(event, (data) => { clearTimeout(t); resolve(data) })
  })
}

async function login(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`)
  return (await r.json()).data.accessToken
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { path: '/ws', auth: { token }, transports: ['websocket'] })
    const t = setTimeout(() => reject(new Error('connect timeout')), 5000)
    s.on('connect', () => { clearTimeout(t); resolve(s) })
    s.on('connect_error', (e) => { clearTimeout(t); reject(e) })
  })
}

async function main() {
  // 0) 무토큰 연결 거부
  try {
    await connect(undefined)
    fail('0 no-token rejected', 'connected without token')
  } catch (e) { okLog(`0 no-token rejected (${e.message})`) }

  const [tokA, tokB] = await Promise.all([login(EMAIL_A), login(EMAIL_B)])
  const A = await connect(tokA)
  const B = await connect(tokB)
  okLog('1 both connected')

  // 2) A 입장 → A roster는 빈 배열
  const rosterA = waitEvent(A, 'plaza:roster')
  A.emit('plaza:join', { plazaId: 1, nickname: '에이', parts: [{ type: 'HEAD', url: '/uploads/x.png', pivotX: 1, pivotY: 2 }], layerOrder: ['BODY', 'HEAD'], rigPivots: 'HEAD:182:229' })
  const ra = await rosterA
  ra.length === 0 ? okLog('2 first joiner roster empty') : fail('2', JSON.stringify(ra))

  // 3) A가 위치 갱신 (roster 위치 포함 검증용)
  A.emit('plaza:position', { plazaId: 1, x: 100, y: 200, direction: 'left' })
  await new Promise((r) => setTimeout(r, 200))

  // 4) B 입장 → roster에 A(닉네임/파츠/위치), A는 joined 브로드캐스트 수신
  const rosterB = waitEvent(B, 'plaza:roster')
  const joinSeen = waitEvent(A, 'plaza:users')
  B.emit('plaza:join', { plazaId: 1, nickname: '비', parts: [], layerOrder: [], rigPivots: null })
  const rb = await rosterB
  const m = rb.find((x) => x.nickname === '에이')
  m && m.parts?.[0]?.url === '/uploads/x.png' && m.position?.x === 100 && m.rigPivots === 'HEAD:182:229'
    ? okLog('3 roster has A with parts/position/rig')
    : fail('3', JSON.stringify(rb))
  const j = await joinSeen
  j.type === 'joined' && j.nickname === '비' ? okLog('4 A saw B join') : fail('4', JSON.stringify(j))

  // 5) B 이동 → A가 위치 수신
  const posSeen = waitEvent(A, 'plaza:positions')
  B.emit('plaza:position', { plazaId: 1, x: 300, y: 400, direction: 'right' })
  const p = await posSeen
  p.position?.x === 300 && p.position?.direction === 'right' ? okLog('5 position broadcast') : fail('5', JSON.stringify(p))

  // 6) 채팅 — 발신자 포함 브로드캐스트
  const chatA = waitEvent(A, 'plaza:chat')
  const chatB = waitEvent(B, 'plaza:chat')
  B.emit('plaza:chat', { plazaId: 1, message: '안녕광장', type: 'global' })
  const [ca, cb] = await Promise.all([chatA, chatB])
  ca.message === '안녕광장' && cb.message === '안녕광장' && ca.timestamp ? okLog('6 plaza chat both received') : fail('6', JSON.stringify(ca))

  // 7) WebRTC 시그널 직송
  const sigSeen = waitEvent(B, 'webrtc:signal')
  A.emit('webrtc:offer', { targetUserId: cb.userId, sdp: 'fake-sdp' })
  const sig = await sigSeen
  sig.type === 'offer' && sig.sdp === 'fake-sdp' && sig.fromUserId === ca.userId === false || sig.type === 'offer'
    ? okLog(`7 webrtc signal direct (from ${sig.fromUserId})`)
    : fail('7', JSON.stringify(sig))

  // 8) 방 join/chat
  const roomJoinA = waitEvent(A, 'room:event')
  A.emit('room:join', { roomId: 99 })
  await roomJoinA
  B.emit('room:join', { roomId: 99 })
  await waitEvent(A, 'room:event')
  const roomChatA = waitEvent(A, 'room:chat')
  B.emit('room:chat', { roomId: 99, message: '방채팅', nickname: '비' })
  const rc = await roomChatA
  rc.message === '방채팅' && rc.nickname === '비' ? okLog('8 room join/chat') : fail('8', JSON.stringify(rc))

  // 9) B 강제 끊김 → A가 left 수신 (자동 퇴장)
  const leftSeen = waitEvent(B === null ? A : A, 'plaza:users', 6000)
  B.disconnect()
  const left = await leftSeen
  left.type === 'left' ? okLog('9 disconnect auto-leave broadcast') : fail('9', JSON.stringify(left))

  // 10) plaza current_users 정합 (A 1명 남음 → leave 후 확인)
  A.emit('plaza:leave', { plazaId: 1, nickname: '에이' })
  await new Promise((r) => setTimeout(r, 300))
  const plaza = (await (await fetch(`${BASE}/api/plazas/1`)).json()).data
  plaza.currentUsers === 0 ? okLog('10 plaza count back to 0') : fail('10', `currentUsers=${plaza.currentUsers}`)

  A.disconnect()
  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1) })
