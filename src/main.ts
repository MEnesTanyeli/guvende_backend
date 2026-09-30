import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

import { AppLogger, errorLogger } from './common/logger';
import { configureApp } from './common/configure-app';

function assertProductionEnvironment(): void {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'BREVO_API_KEY',
    'OFFLINE_SOS_MASTER_KEY',
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Eksik ortam degiskenleri: ${missing.join(', ')}`);
  }

  if ((process.env.JWT_SECRET?.length ?? 0) < 32) {
    throw new Error('JWT_SECRET en az 32 karakter olmalidir.');
  }
  let offlineSosMasterKey = Buffer.alloc(0);
  try {
    offlineSosMasterKey = Buffer.from(
      process.env.OFFLINE_SOS_MASTER_KEY || '',
      'base64url',
    );
  } catch {}
  if (offlineSosMasterKey.length !== 32) {
    throw new Error('OFFLINE_SOS_MASTER_KEY 32 byte base64url olmalidir.');
  }
}

async function bootstrap() {
  assertProductionEnvironment();
  const app = await NestFactory.create(AppModule, {
    logger: new AppLogger(),
  });
  const logger = new Logger('Bootstrap');
  configureApp(app);

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
