import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import type { Response, Request as ExpressRequest } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { NaverAuthGuard } from './guards/naver-auth.guard';
import { ConfigService } from '@nestjs/config';

interface RequestWithUser extends ExpressRequest {
  user: {
    userId: string;
    email: string;
  };
}

interface RequestWithRefreshToken extends ExpressRequest {
  user: {
    userId: string;
    email: string;
    refreshToken: string;
  };
}

@ApiTags('인증')
@Controller('auth')
export class AuthController {
  private readonly accessTokenName: string;
  private readonly refreshTokenName: string;
  private readonly allowedOrigins: string[];

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.accessTokenName =
      this.configService.get<string>('COOKIE_ACCESS_TOKEN_NAME') ||
      'owt_access_token';
    this.refreshTokenName =
      this.configService.get<string>('COOKIE_REFRESH_TOKEN_NAME') ||
      'owt_refresh_token';
    this.allowedOrigins =
      this.configService.get<string>('CORS_ORIGINS')?.split(',') ||
      ['http://localhost:5173'];
  }

  private setAuthCookies(res: Response, tokens: { accessToken: string; refreshToken: string }) {
    res.cookie(this.accessTokenName, tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15분
    });

    res.cookie(this.refreshTokenName, tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
    });
  }

  private getRedirectUrl(req: any): string {
    const referer = req.headers.referer || req.headers.origin;

    console.log('=== getRedirectUrl Debug ===');
    console.log('referer:', referer);
    console.log('origin:', req.headers.origin);
    console.log('allowedOrigins:', this.allowedOrigins);
    console.log('all headers:', req.headers);

    if (referer) {
      const matchedOrigin = this.allowedOrigins.find(origin =>
        referer.startsWith(origin)
      );
      console.log('matchedOrigin:', matchedOrigin);
      if (matchedOrigin) {
        return matchedOrigin;
      }
    }

    console.log('No match, returning default:', this.allowedOrigins[0]);
    return this.allowedOrigins[0];
  }

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
  @ApiResponse({
    status: 401,
    description: '이메일 또는 비밀번호가 올바르지 않음',
  })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.login(loginDto);
    this.setAuthCookies(res, tokens);
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
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Access Token 재발급' })
  @ApiResponse({ status: 200, description: '토큰 재발급 성공' })
  @ApiResponse({ status: 401, description: 'Refresh Token이 유효하지 않음' })
  async refresh(
    @Request() req: RequestWithRefreshToken,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.refreshTokensFromCookie(
      req.user.userId,
      req.user.refreshToken,
    );
    this.setAuthCookies(res, tokens);
    return tokens;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '로그아웃' })
  @ApiResponse({ status: 200, description: '로그아웃 성공' })
  async logout(
    @Request() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.clearCookie(this.accessTokenName);
    res.clearCookie(this.refreshTokenName);
    return this.authService.logout(req.user.userId);
  }

  @Get('naver')
  @UseGuards(NaverAuthGuard)
  @ApiOperation({ summary: '네이버 로그인' })
  @ApiResponse({
    status: 302,
    description: '네이버 로그인 페이지로 리다이렉트',
  })
  async naverLogin() {
    // Guard가 네이버 OAuth 페이지로 리다이렉트
  }

  @Get('naver/callback')
  @UseGuards(NaverAuthGuard)
  @ApiOperation({ summary: '네이버 로그인 콜백' })
  @ApiResponse({ status: 302, description: '프론트엔드로 리다이렉트' })
  async naverLoginCallback(
    @Request() req: any,
    @Res() res: Response,
  ) {
    const tokens = await this.authService.loginWithOAuth(req.user);
    this.setAuthCookies(res, tokens);

    const redirectUrl = this.getRedirectUrl(req);
    res.redirect(redirectUrl);
  }
}
