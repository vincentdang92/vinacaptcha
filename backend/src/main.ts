import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { RedisService } from './redis/redis.service.js';
import { DataSource } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }) // Cần thiết để đọc X-Forwarded-For từ reverse proxy
  );
  
  // Enable validation pipe globally
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));

  const redisService = app.get(RedisService);
  const dataSource = app.get(DataSource);

  app.enableCors({
    origin: (origin, callback) => {
      // 1. Cho phép request không có Origin header (Server-to-server như /v1/siteverify, mobile app native, cURL)
      if (!origin) {
        return callback(null, true);
      }

      (async () => {
        try {
          let hostname: string;
          try {
            const parsed = new URL(origin);
            hostname = parsed.hostname.toLowerCase();
          } catch {
            hostname = origin.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].toLowerCase();
          }

          // 2. Luôn cho phép localhost / 127.0.0.1 (môi trường dev / test)
          if (['localhost', '127.0.0.1', '::1'].includes(hostname)) {
            return callback(null, true);
          }

          // 3. Cho phép domain của chính captcha server / dashboard nếu có trong env
          const appUrl = process.env.APP_URL || process.env.DASHBOARD_URL;
          if (appUrl) {
            try {
              const appHostname = new URL(appUrl).hostname.toLowerCase();
              if (hostname === appHostname) return callback(null, true);
            } catch {}
          }

          // 4. Kiểm tra domain có nằm trong danh sách các Site đang hoạt động trên hệ thống không
          const isAllowed = await redisService.isDomainAllowed(hostname, dataSource);
          if (isAllowed) {
            return callback(null, true);
          }

          // Từ chối CORS nếu domain chưa được đăng ký trong hệ thống
          return callback(null, false);
        } catch (err) {
          return callback(null, false);
        }
      })();
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'PUT'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Api-Key',
      'x-api-key',
      'X-Site-Key',
      'x-site-key',
      'X-Requested-With',
      'x-requested-with',
      'Accept',
      'Origin',
      'Cache-Control',
      'Pragma',
      '*',
    ],
    exposedHeaders: ['X-Total-Count', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    credentials: false,
  });

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
await bootstrap();
