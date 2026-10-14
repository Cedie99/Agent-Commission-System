import 'dotenv/config';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('change-me')) {
    Logger.warn('JWT_SECRET is not set to a real secret — fine for local dev only', 'Bootstrap');
  }
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','), credentials: false, exposedHeaders: ['Content-Disposition'] });
  app.enableShutdownHooks();
  const port = Number.parseInt(process.env.API_PORT ?? '3000', 10);
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
