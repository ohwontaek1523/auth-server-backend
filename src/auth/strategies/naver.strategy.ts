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
    });
  }

  async validate(
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

      const payload = {
        email: user.email,
        nickname: user.nickname || user.name,
        profileImageUrl: user.profile_image,
        provider: 'naver',
        providerId: user.id,
      };

      done(null, payload);
    } catch (error) {
      done(error, null);
    }
  }
}
