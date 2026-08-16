/**
 * P10 (register M4): "OpenAPI contract generation pipeline missing".
 *
 * @nestjs/swagger decorators (@ApiTags, @ApiOperation, ...) were already
 * present across controllers — what was missing was a way to turn them
 * into a static openapi.json WITHOUT booting the full HTTP listener (main.ts
 * only exposes Swagger UI when NODE_ENV !== 'production', and even then
 * only as a live server, not a CI-artifact-able file). This script creates
 * the Nest application context, builds the same document main.ts would
 * serve, and writes it to disk — CI's contract-tests job runs this, then
 * feeds the output into `pnpm --filter @uniportal/types run openapi:types`
 * (openapi-typescript) to regenerate packages/types/src/generated/, and
 * fails the build on any uncommitted diff (see .github/workflows/ci.yml).
 */
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';

import { AppModule } from './app.module';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('UniPortal ERP API')
    .setDescription('Generated OpenAPI spec — source of truth for packages/types (spec §4.4, §10.8)')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  writeFileSync('openapi.json', JSON.stringify(document, null, 2));

  // eslint-disable-next-line no-console
  console.log(`Wrote openapi.json (${Object.keys(document.paths).length} paths)`);
  await app.close();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('openapi:export failed:', err);
  process.exit(1);
});
