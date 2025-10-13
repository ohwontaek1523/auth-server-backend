import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(private readonly configService: ConfigService) {
    const refreshSecret = configService.get<string>('JWT_REFRESH_SECRET');
    if (!refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET is not defined in environment variables');
    }

    const refreshTokenName = configService.get<string>('COOKIE_REFRESH_TOKEN_NAME') || 'owt_refresh_token';

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          return request?.cookies?.[refreshTokenName];
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: refreshSecret,
      passReqToCallback: true, // refresh token을 payload와 함께 전달받기 위해
    });
  }

  async validate(req: Request, payload: any) {
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException('Invalid refresh token payload');
    }

    const refreshTokenName = this.configService.get<string>('COOKIE_REFRESH_TOKEN_NAME') || 'owt_refresh_token';
    const refreshToken = req.cookies?.[refreshTokenName];

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      refreshToken, // 쿠키에서 가져온 실제 토큰 값
    };
  }
}
