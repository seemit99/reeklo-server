// Spring의 ApiResponse<T> {success, data, message} 포맷 복제
export interface ApiResponse<T> {
  success: boolean
  data: T | null
  message: string | null
}

export function ok<T>(data: T, message: string | null = null): ApiResponse<T> {
  return { success: true, data, message }
}
