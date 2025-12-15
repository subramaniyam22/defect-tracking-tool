import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // Debug: Log environment variables (masked for security)
  const dbUrl = process.env.DATABASE_URL;
  console.log('=== Environment Debug ===');
  console.log('DATABASE_URL exists:', !!dbUrl);
  console.log('DATABASE_URL length:', dbUrl?.length || 0);
  console.log('DATABASE_URL starts with:', dbUrl?.substring(0, 15) || 'UNDEFINED');
  console.log('All env vars with DB:', Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('PG')));
  console.log('=========================');

  const app = await NestFactory.create(AppModule);
  
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  });
  
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();

