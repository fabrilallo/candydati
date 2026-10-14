# syntax=docker/dockerfile:1
# One Dockerfile with three final targets: api, worker, web.
#   docker build --target api -t tt-api .
# No secret in the image: all configuration comes from the environment at runtime.

# Base images are pinned by digest (the tag only says what it is); Dependabot (docker ecosystem) bumps tag and digest together.
ARG NODE_VERSION=24

# ---------- base: Node + pnpm (version from the packageManager field) ----------
FROM node:${NODE_VERSION}-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS base
ENV PNPM_HOME=/pnpm CI=true
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# ---------- fetch: download packages from the lockfile only (cacheable layer) ----------
FROM base AS fetch
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch

# ---------- build: install offline, build everything ----------
FROM fetch AS build
# Default language of the frontend: resolved at build time by nuxt.config.ts.
ARG NUXT_PUBLIC_PLATFORM_DEFAULT_LOCALE=it
ENV NUXT_PUBLIC_PLATFORM_DEFAULT_LOCALE=$NUXT_PUBLIC_PLATFORM_DEFAULT_LOCALE
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --offline
RUN pnpm exec turbo run build --filter=@tt/api --filter=@tt/worker --filter=@tt/web
# Production dependencies of each service only.
RUN pnpm --filter @tt/api deploy --prod --legacy /out/api \
 && pnpm --filter @tt/worker deploy --prod --legacy /out/worker \
 && rm -rf /out/api/src /out/api/eval /out/worker/src

# ---------- shared runtime ----------
FROM node:${NODE_VERSION}-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS runtime
ENV NODE_ENV=production
WORKDIR /app

FROM runtime AS api
COPY --from=build --chown=node:node /out/api /app
USER node
ENV API_PORT=4000 API_HOST=0.0.0.0
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/index.js"]

FROM runtime AS worker
COPY --from=build --chown=node:node /out/worker /app
USER node
# The worker opens no port: health is the process being alive; it restarts with restart: unless-stopped.
CMD ["node", "dist/index.js"]

FROM runtime AS web
COPY --from=build --chown=node:node /repo/apps/web/.output /app
USER node
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
