import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class NaverAuthGuard extends AuthGuard('naver') {
  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const referer = request.headers.referer || request.headers.origin;

    // referer를 state로 전달
    return {
      state: referer || 'https://owt-app.duckdns.org/service1',
    };
  }
}
