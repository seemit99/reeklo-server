import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'
import { GlobalExceptionFilter } from './common/global-exception.filter'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.enableCors({ origin: true, credentials: true })
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // Spring GlobalExceptionHandler와 동일: 필드 에러 메시지를 ", "로 합쳐 400
      exceptionFactory: (errors) =>
        new BadRequestException(
          errors.flatMap((e) => Object.values(e.constraints ?? {})).join(', '),
        ),
    }),
  )
  app.useGlobalFilters(new GlobalExceptionFilter())
  await app.listen(process.env.PORT ?? 3000)
  console.log(`reeklo-server listening on :${process.env.PORT ?? 3000}`)
}
bootstrap()
