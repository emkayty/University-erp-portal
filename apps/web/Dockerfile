# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY . .
# The repository currently has no apps/web/public directory; create an empty one
# so the standalone runtime copy remains deterministic on Docker/Render.
RUN mkdir -p apps/web/public
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @uniportal/config run build \
 && pnpm --filter @uniportal/types run build \
 && pnpm --filter @uniportal/utils run build \
 && pnpm --filter @uniportal/web run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nextjs \
 && useradd --system --uid 1001 --gid nextjs --home-dir /app nextjs

# Next standalone preserves the monorepo route at apps/web/server.js.
COPY --from=build --chown=nextjs:nextjs /app/apps/web/public ./apps/web/public
COPY --from=build --chown=nextjs:nextjs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/apps/web/.next/static ./apps/web/.next/static
# Next.js standalone retains pnpm's symlink to this runtime helper package.
# Copy the target package so the symlink resolves inside the slim runtime image.
COPY --from=build --chown=nextjs:nextjs /app/node_modules/.pnpm/@swc+helpers@0.5.23 /app/node_modules/.pnpm/@swc+helpers@0.5.23

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
