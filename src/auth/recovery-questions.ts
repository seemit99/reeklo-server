export const RECOVERY_QUESTIONS = [
  '처음으로 즐겼던 게임의 제목은 무엇인가요?',
  '가장 기억에 남는 게임 캐릭터의 이름은 무엇인가요?',
  '어린 시절 사용했던 별명은 무엇인가요?',
  '처음 키웠던 반려동물의 이름은 무엇인가요?',
  '학창 시절 가장 좋아했던 장소는 어디인가요?',
] as const

export function normalizeRecoveryAnswer(answer: string): string {
  return answer.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR')
}
