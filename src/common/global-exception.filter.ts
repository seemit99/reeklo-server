import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common'
import { Response } from 'express'

// Spring의 ErrorResponse {status, message, timestamp} 포맷 복제
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()
    let status = 500
    let message = '서버 오류가 발생했습니다.'

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const body = exception.getResponse()
      message = typeof body === 'string' ? body : ((body as any).message ?? message)
      if (Array.isArray(message)) message = (message as string[]).join(', ')
    } else {
      console.error(exception)
    }

    res.status(status).json({ status, message, timestamp: new Date().toISOString() })
  }
}
