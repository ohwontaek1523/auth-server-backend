import { Controller, Post, Body, HttpCode, HttpStatus, Get, UseGuards, Request, Res } from '@nestjs/common';
import type { Response, Request as ExpressRequest } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';

interface RequestWithUser extends ExpressRequest {
  user: {
    userId: string;
    email: string;
  };
}

@ApiTags('인증')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('signup')
  @ApiOperation({ summary: '회원가입' })
  @ApiResponse({ status: 201, description: '회원가입 성공' })
  @ApiResponse({ status: 409, description: '이미 사용 중인 이메일' })
  async signup(@Body() signupDto: SignupDto) {
    return this.authService.signup(signupDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '로그인' })
  @ApiResponse({ status: 200, description: '로그인 성공' })
  @ApiResponse({ status: 401, description: '이메일 또는 비밀번호가 올바르지 않음' })
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.login(loginDto);

    const accessTokenName = this.configService.get<string>('COOKIE_ACCESS_TOKEN_NAME') || 'owt_access_token';
    const refreshTokenName = this.configService.get<string>('COOKIE_REFRESH_TOKEN_NAME') || 'owt_refresh_token';

    // httpOnly 쿠키로 토큰 설정
    res.cookie(accessTokenName, tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15분
    });

    res.cookie(refreshTokenName, tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
    });

    return tokens;
  }

  @Get('validate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '토큰 유효성 검증' })
  @ApiResponse({ status: 200, description: '토큰 유효함' })
  @ApiResponse({ status: 401, description: '토큰 만료 또는 유효하지 않음' })
  async validate(@Request() req: RequestWithUser) {
    return this.authService.validateUser(req.user.userId);
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Access Token 재발급' })
  @ApiResponse({ status: 200, description: '토큰 재발급 성공' })
  @ApiResponse({ status: 401, description: 'Refresh Token이 유효하지 않음' })
  async refresh(@Request() req: RequestWithUser, @Body('refreshToken') refreshToken: string) {
    return this.authService.refreshTokens(req.user.userId, refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '로그아웃' })
  @ApiResponse({ status: 200, description: '로그아웃 성공' })
  async logout(@Request() req: RequestWithUser, @Res({ passthrough: true }) res: Response) {
    const accessTokenName = this.configService.get<string>('COOKIE_ACCESS_TOKEN_NAME') || 'owt_access_token';
    const refreshTokenName = this.configService.get<string>('COOKIE_REFRESH_TOKEN_NAME') || 'owt_refresh_token';

    // 쿠키 삭제
    res.clearCookie(accessTokenName);
    res.clearCookie(refreshTokenName);

    return this.authService.logout(req.user.userId);
  }
}