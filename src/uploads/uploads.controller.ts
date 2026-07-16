import {
  BadRequestException, Controller, Post, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { randomUUID } from 'crypto'
import { diskStorage } from 'multer'
import { extname } from 'path'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'

// Spring UploadController와 동일: ./uploads/에 UUID 파일명으로 저장, {url} 반환
@Controller('api/uploads')
export class UploadsController {
  // CharacterView가 파츠 이미지 파일을 서버에 저장하고 접근 URL을 발급받을 때 호출한다.
  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => cb(null, randomUUID() + extname(file.originalname ?? '')),
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  upload(@UploadedFile() file?: { filename: string }) {
    if (!file) throw new BadRequestException('파일이 필요합니다.')
    return { url: `/uploads/${file.filename}` }
  }
}
