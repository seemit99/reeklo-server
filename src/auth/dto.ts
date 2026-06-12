import { IsEmail, IsNotEmpty, Length, MaxLength, MinLength } from 'class-validator'

// Spring AuthDto와 동일한 필드/검증 메시지
export class RegisterRequest {
  @Length(3, 50, { message: '아이디는 3~50자여야 합니다.' })
  @IsNotEmpty({ message: '아이디를 입력해주세요.' })
  username!: string

  @IsEmail({}, { message: '이메일 형식이 올바르지 않습니다.' })
  @IsNotEmpty({ message: '이메일을 입력해주세요.' })
  email!: string

  @MinLength(6, { message: '비밀번호는 6자 이상이어야 합니다.' })
  @IsNotEmpty({ message: '비밀번호를 입력해주세요.' })
  password!: string

  @MaxLength(50, { message: '닉네임은 50자 이하여야 합니다.' })
  @IsNotEmpty({ message: '닉네임을 입력해주세요.' })
  nickname!: string
}

export class LoginRequest {
  @IsNotEmpty({ message: '이메일을 입력해주세요.' })
  email!: string

  @IsNotEmpty({ message: '비밀번호를 입력해주세요.' })
  password!: string
}

export interface TokenResponse {
  accessToken: string
  tokenType: 'Bearer'
}
