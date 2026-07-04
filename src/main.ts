import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';

import { AppLogger, errorLogger } from './common/logger';

function assertProductionEnvironment(): void {
  const required = ['DATABASE_URL', 'JWT_SECRET', 'BREVO_API_KEY'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Eksik ortam degiskenleri: ${missing.join(', ')}`);
  }

  if ((process.env.JWT_SECRET?.length ?? 0) < 32) {
    throw new Error('JWT_SECRET en az 32 karakter olmalidir.');
  }
}

async function bootstrap() {
  assertProductionEnvironment();
  const app = await NestFactory.create(AppModule, {
    logger: new AppLogger(),
  });
  const logger = new Logger('Bootstrap');
  const httpAdapter = app.getHttpAdapter().getInstance();

  httpAdapter.disable('x-powered-by');
  httpAdapter.set('trust proxy', 1);
  app.use((_request: any, response: any, next: () => void) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS origin reddedildi'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
    maxAge: 86400,
  });

  // DTO validation desteği
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`Backend sunucusu baslatildi. Port: ${port}`);
}
bootstrap().catch((error) => {
  const msg = error instanceof Error ? error.stack : String(error);
  Logger.error('Backend baslatilamadi', msg);
  errorLogger.error(`Backend baslatilamadi: ${msg}`);
  process.exit(1);
});

