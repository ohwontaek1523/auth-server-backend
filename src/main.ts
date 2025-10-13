import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  //app.setGlobalPrefix('api'); //

  // 쿠키 파서 미들웨어!
  app.use(cookieParser());

  // 전역 파이프 설정
  // 1. 요청 데이터 검증: DTO 클래스의 데코레이터로 유효성 검사 - 잘못된 이메일 형식 → 400 에러 자동 반환
  // 2. 타입 변환: 문자열을 숫자로 자동 변환 - age: "25" → age: 25
  // 3. 불필요한 속성 제거: DTO에 정의되지 않은 필드 자동 삭제
  app.useGlobalPipes(new ValidationPipe());

  // CORS 설정
  const corsOrigins = process.env.CORS_ORIGINS?.split(',');
  app.enableCors({
    origin: corsOrigins,
    credentials: true, // 쿠키 포함 요청 허용
  });

  // Swagger 설정
  const config = new DocumentBuilder()
    .setTitle('Nest Backend API')
    .setVersion('0.1')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
