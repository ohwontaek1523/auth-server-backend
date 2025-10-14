import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class NaverAuthGuard extends AuthGuard('naver') {
  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const referer = request.headers.referer || request.headers.origin;
    const redirectUrl = referer || 'https://owt-app.duckdns.org/service1';

    console.log('=== NaverAuthGuard Debug ===');
    console.log('referer:', referer);
    console.log('origin:', request.headers.origin);
    console.log('redirectUrl to save:', redirectUrl);

    // 쿠키에 리다이렉트 URL 저장 (파드간 공유 가능)
    response.cookie('oauth_redirect_url', redirectUrl, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 5 * 60 * 1000, // 5분
      sameSite: 'lax', // OAuth 리다이렉트를 위해 lax 사용
    });

    return {
      state: Math.random().toString(36).substring(7), // CSRF 방지용 랜덤 state
    };
  }
}
