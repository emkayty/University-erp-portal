# syntax=docker/dockerfile:1
# UniPortal API and worker image. Select the process role with the final CMD
# override: scripts/start-api.sh (HTTP API) or scripts/start-worker.sh (worker).
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @uniportal/config run build \
 && pnpm --filter @uniportal/types run build \
 && pnpm --filter @uniportal/utils run build \
 && pnpm --filter @uniportal/api run prisma:generate \
 && pnpm --filter @uniportal/api run build

# A slim runtime still retains the workspace dependency store because pnpm links
# the API to local packages. Only compiled application/package outputs are copied.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV API_PORT=3001
ENV PROCESS_ROLE=api
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 uniportal \
 && useradd --system --uid 1001 --gid uniportal --home-dir /app uniportal

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/packages/config/package.json ./packages/config/package.json
COPY --from=build /app/packages/config/dist ./packages/config/dist
COPY --from=build /app/packages/types/package.json ./packages/types/package.json
COPY --from=build /app/packages/types/dist ./packages/types/dist
COPY --from=build /app/packages/utils/package.json ./packages/utils/package.json
COPY --from=build /app/packages/utils/dist ./packages/utils/dist
COPY --from=build /app/scripts ./scripts

RUN chmod +x /app/scripts/start-api.sh /app/scripts/start-worker.sh /app/scripts/db/deploy-schema.sh \
 /app/scripts/db/apply-post-schema-hardening.sh /app/scripts/db/bootstrap-production-roles.sh \
 /app/scripts/db/resolve-runtime-database-urls.sh /app/scripts/db/derive-runtime-database-urls.cjs \
 && chown -R uniportal:uniportal /app
USER uniportal
EXPOSE 3001
CMD ["/app/scripts/start-api.sh"]
