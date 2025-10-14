import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-oauth2';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NaverStrategy extends PassportStrategy(Strategy, 'naver') {
  constructor(private readonly configService: ConfigService) {
    const clientID = configService.get<string>('NAVER_CLIENT_ID');
    const clientSecret = configService.get<string>('NAVER_CLIENT_SECRET');
    const callbackURL = configService.get<string>('NAVER_CALLBACK_URL');

    if (!clientID || !clientSecret || !callbackURL) {
      throw new Error('Naver OAuth environment variables are not defined');
    }

    super({
      authorizationURL: 'https://nid.naver.com/oauth2.0/authorize',
      tokenURL: 'https://nid.naver.com/oauth2.0/token',
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'profile'],
      passReqToCallback: true, // req를 validate에 전달
    });
  }

  async validate(
    req: any,
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: any,
  ) {
    try {
      // 네이버 사용자 정보 API 호출
      const response = await fetch('https://openapi.naver.com/v1/nid/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();

      if (data.resultcode !== '00') {
        return done(new Error('Failed to fetch user info from Naver'), null);
      }

      const user = data.response;

      console.log('=== NaverStrategy validate Debug ===');
      console.log('req.cookies:', req.cookies);
      console.log('redirectUrl from cookie:', req.cookies?.oauth_redirect_url);

      const payload = {
        email: user.email,
        nickname: user.nickname || user.name,
        profileImageUrl: user.profile_image,
        provider: 'naver',
        providerId: user.id,
        redirectUrl: req.cookies?.oauth_redirect_url, // 쿠키에서 원본 URL 복원
      };

      console.log('payload.redirectUrl:', payload.redirectUrl);

      done(null, payload);
    } catch (error) {
      done(error, null);
    }
  }
}
