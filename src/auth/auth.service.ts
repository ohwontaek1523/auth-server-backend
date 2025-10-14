import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async signup(signupDto: SignupDto) {
    const { email, password, nickname } = signupDto;

    // 이메일 중복 체크
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('이미 사용 중인 이메일입니다');
    }

    // 비밀번호 해시
    const hashedPassword = await bcrypt.hash(password, 10);

    // 사용자 생성
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        nickname,
      },
    });

    // JWT 토큰 생성
    const tokens = await this.generateTokens(user.userId, user.email);

    // Refresh Token DB에 저장
    await this.updateRefreshToken(user.userId, tokens.refreshToken);

    return {
      userId: user.userId,
      email: user.email,
      nickname: user.nickname,
      ...tokens,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // 사용자 조회
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다');
    }

    // 비밀번호 검증
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다');
    }

    // JWT 토큰 생성
    const tokens = await this.generateTokens(user.userId, user.email);

    // Refresh Token DB에 저장
    await this.updateRefreshToken(user.userId, tokens.refreshToken);

    return {
      userId: user.userId,
      email: user.email,
      nickname: user.nickname,
      ...tokens,
    };
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { userId },
      data: { refreshToken: null },
    });

    return { message: '로그아웃되었습니다' };
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
    });

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('접근이 거부되었습니다');
    }

    const refreshTokenMatches = await bcrypt.compare(refreshToken, user.refreshToken);

    if (!refreshTokenMatches) {
      throw new UnauthorizedException('접근이 거부되었습니다');
    }

    const tokens = await this.generateTokens(user.userId, user.email);
    await this.updateRefreshToken(user.userId, tokens.refreshToken);

    return tokens;
  }

  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  private async updateRefreshToken(userId: string, refreshToken: string) {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.update({
      where: { userId },
      data: { refreshToken: hashedRefreshToken },
    });
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        email: true,
        nickname: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('사용자를 찾을 수 없습니다');
    }

    return user;
  }

  async refreshTokensFromCookie(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
    });

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('접근이 거부되었습니다');
    }

    // DB에 저장된 해시와 쿠키의 Refresh Token 비교
    const refreshTokenMatches = await bcrypt.compare(refreshToken, user.refreshToken);

    if (!refreshTokenMatches) {
      throw new UnauthorizedException('접근이 거부되었습니다');
    }

    // 새 토큰 발급
    const tokens = await this.generateTokens(user.userId, user.email);
    await this.updateRefreshToken(user.userId, tokens.refreshToken);

    return tokens;
  }

  async loginWithOAuth(oauthUser: {
    email: string;
    nickname: string;
    profileImageUrl?: string;
    provider: string;
    providerId: string;
  }) {
    // 1. 소셜 계정 정보로 기존 회원 찾기
    const socialAccount = await this.prisma.userSocialAccount.findUnique({
      where: {
        provider_providerId: {
          provider: oauthUser.provider,
          providerId: oauthUser.providerId,
        },
      },
      include: { user: true },
    });

    let user;

    if (socialAccount) {
      // 2-1. 기존 회원
      user = socialAccount.user;
    } else {
      // 2-2. 신규 회원 → User + UserSocialAccount 동시 생성
      user = await this.prisma.user.create({
        data: {
          email: oauthUser.email,
          nickname: oauthUser.nickname,
          profileImageUrl: oauthUser.profileImageUrl,
          password: null, // 소셜 로그인은 비밀번호 없음
          userSocialAccount: {
            create: {
              provider: oauthUser.provider,
              providerId: oauthUser.providerId,
            },
          },
        },
      });
    }

    // 3. JWT 토큰 생성
    const tokens = await this.generateTokens(user.userId, user.email);

    // 4. Refresh Token DB에 저장
    await this.updateRefreshToken(user.userId, tokens.refreshToken);

    return {
      userId: user.userId,
      email: user.email,
      nickname: user.nickname,
      ...tokens,
    };
  }
}