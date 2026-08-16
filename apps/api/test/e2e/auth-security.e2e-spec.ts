import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('API security E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PROCESS_ROLE = 'api';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => { await app?.close(); });

  it('serves the public liveness endpoint', async () => {
    await request(app.getHttpServer()).get('/api/health/live').expect(200).expect(({ body }) => {
      expect(body.status).toBe('ok');
    });
  });

  it('rejects protected endpoints without credentials', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('rejects invalid credentials without exposing authentication internals', async () => {
    const email = process.env.E2E_TEST_EMAIL ?? 'nonexistent@uniportal.test';
    const password = process.env.E2E_TEST_PASSWORD ?? 'DefinitelyWrongPassword!123';
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password }).expect(401);
    expect(response.body.error?.message ?? '').not.toMatch(/password|hash|stack|prisma/i);
  });

  it('enforces DTO whitelisting on login', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'test@example.com', password: 'x', privilegeEscalation: true,
    }).expect(400);
  });
});
