import 'reflect-metadata';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request } from 'express';
import { validateEnv } from '@uniportal/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

interface RawBodyRequest extends Request { rawBody?: Buffer }

async function bootstrap(): Promise<void> {
  const env    = validateEnv();
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: env.NODE_ENV === 'production'
      ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug'],
    bufferLogs: true,
    // Disable Nest's default body parser — configured manually below so
    // webhook routes (Paystack HMAC) can access the exact raw bytes via
    // req.rawBody. Re-serializing parsed JSON (JSON.stringify(req.body))
    // can reorder keys/whitespace and silently break signature verification.
    bodyParser: false,
  });

  // H4: Graceful shutdown — NestJS lifecycle hooks + SIGTERM/SIGINT
  app.enableShutdownHooks();

  // H7 FIX: Remove 'unsafe-inline' from CSP.
  // Use a nonce-based CSP for inline scripts instead.
  // TailwindCSS purges unused styles at build time so 'unsafe-inline'
  // for styles is NOT needed in production.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc:    ["'self'"],
          scriptSrc:     ["'self'"],           // No unsafe-inline
          styleSrc:      ["'self'"],           // No unsafe-inline (Tailwind build-time purge)
          imgSrc:        ["'self'", 'data:', 'https://*.cloudfront.net'],
          connectSrc:    ["'self'", 'https://api.remita.net', 'https://api.paystack.co'],
          frameSrc:      ["'none'"],
          objectSrc:     ["'none'"],
          upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginEmbedderPolicy: false, // Allow CDN resources
    }),
  );

  app.use(compression());
  app.use(cookieParser());

  // Manual body parser with raw-body capture (bodyParser:false above).
  // req.rawBody is consumed by PaymentsController webhook handlers for
  // HMAC verification (Paystack: HMAC-SHA512 of raw bytes).
  app.use(json({
    limit: '5mb',
    verify: (req: RawBodyRequest, _res, buf) => { req.rawBody = buf; },
  }));
  app.use(urlencoded({ extended: true, limit: '5mb' }));

  // P3: only trust forwarded headers when explicitly enabled by the deployment.
  // This prevents arbitrary clients from spoofing source IPs behind an unexpected proxy.
  if (env.TRUST_PROXY) {
    app.getHttpAdapter().getInstance().set('trust proxy', env.TRUST_PROXY_HOPS);
  }

  const frontendOrigins = env.FRONTEND_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
  app.enableCors({
    origin:         frontendOrigins.length === 1 ? frontendOrigins[0] : frontendOrigins,
    credentials:    true,
    methods:        ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Idempotency-Key', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID', 'Deprecation-Warning'],
  });

  app.enableVersioning({ type: VersioningType.URI });
  const configuredPrefix = env.API_PREFIX.replace(/^\/+|\/+$/g, '');
  // URI versioning supplies `/v1`; accept both legacy `api/v1` and the
  // canonical base-prefix form `api` without ever producing `/api/v1/v1`.
  const apiPrefix = configuredPrefix.replace(/\/v\d+$/i, '') || 'api';
  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, forbidNonWhitelisted: true,
    transform: true, transformOptions: { enableImplicitConversion: true },
  }));

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  if (env.NODE_ENV !== 'production') {
    const { DocumentBuilder, SwaggerModule } = await import('@nestjs/swagger');
    const swaggerConfig = new DocumentBuilder()
      .setTitle('UniPortal ERP API')
      .setDescription('Production-grade University ERP — Nigerian Edition')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addCookieAuth('refresh_token', { type: 'apiKey', in: 'cookie' })
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log('Swagger UI → http://localhost:' + env.API_PORT + '/api/docs');
  }

  const port = env.API_PORT;
  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 UniPortal API → http://localhost:${port}/api [${env.NODE_ENV}]`);
}

bootstrap().catch((err: unknown) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
