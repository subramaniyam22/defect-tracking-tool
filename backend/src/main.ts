import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // Debug: Log ALL environment variables related to database
  console.log('\n\n========== RAILWAY DEBUG ==========');
  console.log('Checking DATABASE_URL...');
  
  const dbUrl = process.env.DATABASE_URL;
  const allEnvKeys = Object.keys(process.env);
  const dbRelatedVars = allEnvKeys.filter(k => 
    k.includes('DATABASE') || k.includes('POSTGRES') || k.includes('PG') || k.includes('DB')
  );
  
  console.log('DATABASE_URL exists:', !!dbUrl);
  console.log('DATABASE_URL value:', dbUrl ? `${dbUrl.substring(0, 20)}...` : 'UNDEFINED/EMPTY');
  console.log('DATABASE_URL type:', typeof dbUrl);
  console.log('');
  console.log('All DB-related env vars found:', dbRelatedVars);
  
  // Print values of all DB-related vars (masked)
  dbRelatedVars.forEach(key => {
    const val = process.env[key];
    console.log(`  ${key}: ${val ? val.substring(0, 25) + '...' : 'EMPTY'}`);
  });
  
  console.log('');
  console.log('Total env vars count:', allEnvKeys.length);
  console.log('====================================\n\n');

  // Validate DATABASE_URL before proceeding
  if (!dbUrl || !dbUrl.startsWith('postgres')) {
    console.error('ERROR: DATABASE_URL is missing or invalid!');
    console.error('Please set DATABASE_URL in Railway Variables tab.');
    console.error('It should look like: postgresql://user:pass@host:port/dbname');
    process.exit(1);
  }

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

