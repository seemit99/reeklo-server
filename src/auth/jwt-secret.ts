// JWT 시크릿은 반드시 환경변수로 주입 — 리포가 public이므로 코드에 기본값을 두지 않는다
const secret = process.env.JWT_SECRET
if (!secret || secret.length < 32) {
  throw new Error('JWT_SECRET 환경변수가 필요합니다 (32자 이상). .env를 확인하세요.')
}
export const JWT_SECRET: string = secret
