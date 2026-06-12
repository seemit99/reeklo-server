// 프론트 socketProtocol.js의 변환을 실제 게이트웨이에 대고 검증.
// PlazaView/RoomView/webrtc.js가 쓰는 destination 문자열을 그대로 사용한다.
// 실행: node test/frontend-protocol-e2e.js (서버 :3000 필요)
const { pathToFileURL } = require('url')
const { io } = require('C:/Users/박재우/dev/reeklo-wep/node_modules/socket.io-client')

const BASE = 'http://localhost:3000'
let failed = 0
const okLog = (n) => console.log(`PASS ${n}`)
const fail = (n, d) => { failed++; console.error(`FAIL ${n}: ${d}`) }

async function login(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'test1234' }),
  })
  return (await r.json()).data.accessToken
}

// 프론트 socketStore와 동일한 래퍼 (subscribe/publish + {body} 콜백)
function makeStore(socket, proto) {
  return {
    subscribe(destination, callback) {
      const event = proto.toSubscribeEvent(destination)
      if (!event) throw new Error('unknown sub: ' + destination)
      const handler = (data) => callback({ body: JSON.stringify(data) })
      socket.on(event, handler)
      return { unsubscribe: () => socket.off(event, handler) }
    },
    publish(destination, body) {
      const mapped = proto.toEmit(destination, body)
      if (!mapped) throw new Error('unknown pub: ' + destination)
      socket.emit(mapped[0], mapped[1])
    },
  }
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { path: '/ws', auth: { token }, transports: ['websocket'] })
    s.on('connect', () => resolve(s))
    s.on('connect_error', reject)
    setTimeout(() => reject(new Error('connect timeout')), 5000)
  })
}

function waitFor(store, destination, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(destination + ' timeout')), timeoutMs)
    const sub = store.subscribe(destination, (msg) => {
      clearTimeout(t); sub.unsubscribe(); resolve(JSON.parse(msg.body))
    })
  })
}

async function main() {
  const proto = await import(pathToFileURL('C:/Users/박재우/dev/reeklo-wep/src/services/socketProtocol.js'))

  const [tokA, tokB] = await Promise.all([login('node39727@t.io'), login('spr39727@t.io')])
  const sockA = await connect(tokA)
  const sockB = await connect(tokB)
  const A = makeStore(sockA, proto)
  const B = makeStore(sockB, proto)
  okLog('connect both')

  // PlazaView.subscribeAll과 동일한 순서: roster 구독 → join 발행
  const rosterA = waitFor(A, '/user/queue/plaza/1/roster')
  A.publish('/app/plaza/1/join', { userId: '7', nickname: '에이', parts: [{ type: 'HEAD', url: '/u.png', pivotX: null, pivotY: null }], layerOrder: ['BODY'], rigPivots: 'HEAD:1:2' })
  await rosterA
  okLog('A roster received')

  A.publish('/app/plaza/1/position', { x: 50, y: 60, direction: 'left' })
  await new Promise((r) => setTimeout(r, 150))

  const joinSeen = waitFor(A, '/topic/plaza/1/users')
  const rosterB = waitFor(B, '/user/queue/plaza/1/roster')
  B.publish('/app/plaza/1/join', { userId: '8', nickname: '비', parts: [], layerOrder: [], rigPivots: null })
  const rb = await rosterB
  const memberA = rb.find((m) => m.nickname === '에이')
  memberA && memberA.position?.x === 50 ? okLog('B roster has A(+position)') : fail('roster', JSON.stringify(rb))
  const j = await joinSeen
  j.type === 'joined' && j.nickname === '비' ? okLog('A saw B joined') : fail('joined', JSON.stringify(j))

  // 위치/채팅 (PlazaView 발행 형식 그대로)
  const posSeen = waitFor(A, '/topic/plaza/1/positions')
  B.publish('/app/plaza/1/position', { x: 11, y: 22, direction: 'right' })
  const p = await posSeen
  p.userId && p.position.x === 11 ? okLog('positions') : fail('positions', JSON.stringify(p))

  const chatSeen = waitFor(A, '/topic/plaza/1/chat')
  B.publish('/app/plaza/1/chat', { message: '프로토콜테스트', type: 'global' })
  const c = await chatSeen
  c.message === '프로토콜테스트' && c.userId ? okLog('plaza chat') : fail('chat', JSON.stringify(c))

  // webrtc (webrtc.js 발행 형식 그대로)
  const sigSeen = waitFor(B, '/user/queue/webrtc')
  A.publish('/app/webrtc/offer', { targetUserId: c.userId, sdp: '{"sdp":"x"}' })
  const sig = await sigSeen
  sig.type === 'offer' && sig.sdp ? okLog('webrtc signal') : fail('webrtc', JSON.stringify(sig))

  // room (RoomView 형식 그대로)
  const roomEvtA = waitFor(A, '/topic/room/55')
  A.publish('/app/room/55/join', {})
  const re = await roomEvtA
  re.type === 'user:joined' ? okLog('room join event') : fail('room join', JSON.stringify(re))
  B.publish('/app/room/55/join', {})
  await new Promise((r) => setTimeout(r, 150))
  const roomChatA = waitFor(A, '/topic/room/55/chat')
  B.publish('/app/room/55/chat', { message: '방테스트', userId: '8', nickname: '비' })
  const rc = await roomChatA
  rc.message === '방테스트' && rc.nickname === '비' ? okLog('room chat') : fail('room chat', JSON.stringify(rc))

  // leave (PlazaView onUnmounted 형식)
  const leftSeen = waitFor(A, '/topic/plaza/1/users')
  B.publish('/app/plaza/1/leave', { userId: '8', nickname: '비' })
  const l = await leftSeen
  l.type === 'left' ? okLog('leave broadcast') : fail('leave', JSON.stringify(l))

  A.publish('/app/plaza/1/leave', { userId: '7', nickname: '에이' })
  sockA.disconnect(); sockB.disconnect()
  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1) })
