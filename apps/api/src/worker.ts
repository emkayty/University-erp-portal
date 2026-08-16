import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createServer } from 'node:http';

/**
 * worker.ts — M12 FIX: BullMQ workers run in a SEPARATE process from the
 * HTTP API.
 *
 * WHY: All @Processor() classes (InvoiceGenerationProcessor,
 * PaymentReconciliationProcessor, AdmissionsOpsProcessor, future
 * PayrollComputeProcessor, ResultNotificationsProcessor, etc.) are
 * registered as providers in their feature modules, which are all imported
 * by AppModule. If the HTTP API process (main.ts) is the only process,
 * every BullMQ worker runs IN the same Node.js event loop that's serving
 * HTTP requests — a burst of 20,000 invoice-generation jobs would starve
 * the event loop and API responses would stall.
 *
 * THIS FILE bootstraps the SAME AppModule via createApplicationContext()
 * (no HTTP listener, no Express). BullMQ's @Processor decorators register
 * Worker instances on module init regardless of HTTP — so this process
 * picks up and processes jobs from Redis queues independently.
 *
 * DEPLOYMENT: PM2 runs this as a separate app ("uniportal-worker") in FORK
 * mode with 2 instances — see ecosystem.config.js. The API app
 * ("uniportal-api") runs in CLUSTER mode with `max` instances. Scale each
 * independently based on load (HTTP traffic vs queue depth).
 *
 * Start: pm2 start ecosystem.config.js --only uniportal-worker
 */
async function bootstrapWorker(): Promise<void> {
  // AppModule is loaded dynamically after declaring the role because module
  // provider arrays are evaluated during import.
  process.env['PROCESS_ROLE'] ??= 'worker';
  const { AppModule } = await import('./app.module');
  const logger = new Logger('Worker');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: process.env['NODE_ENV'] === 'production'
      ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug'],
  });

  app.enableShutdownHooks();

  logger.log('UniPortal Worker process started — processing BullMQ queues and schedules');
  logger.log(`PID: ${process.pid} | NODE_ENV: ${process.env['NODE_ENV']}`);

  // Cloud Run services require a bound HTTP port even for background work.
  // This listener is opt-in and provides only an unauthenticated liveness signal;
  // it never exposes Nest routes or administrative functionality.
  const healthPort = Number(process.env['WORKER_HEALTH_PORT'] ?? 0);
  if (Number.isInteger(healthPort) && healthPort > 0) {
    createServer((request, response) => {
      if (request.url !== '/health/live') {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ status: 'ok', role: 'worker' }));
    }).listen(healthPort, '0.0.0.0', () => {
      logger.log(`Worker liveness listener bound to port ${healthPort}`);
    });
  }

  // Keep the process alive — @Processor workers are already running via DI.
  // createApplicationContext() does not exit on its own once providers with
  // active resources (BullMQ Worker connections, Redis, Prisma) are
  // instantiated, but we guard explicitly for clarity and for SIGTERM logging.
  process.on('SIGTERM', () => logger.log('SIGTERM received — draining queues before shutdown'));
  process.on('SIGINT',  () => logger.log('SIGINT received — draining queues before shutdown'));
}

bootstrapWorker().catch((err: unknown) => {
  console.error('Fatal worker bootstrap error:', err);
  process.exit(1);
});
