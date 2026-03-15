import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { AppModule } from './app.module';
import { DatabaseService } from './services/database.service';

dotenv.config();

async function bootstrap() {
  await DatabaseService.getInstance().initialize();

  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  console.log(`🚀 Coze Backend Server running on port ${port}`);
}

bootstrap();
