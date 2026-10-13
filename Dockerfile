# syntax=docker/dockerfile:1
# Una sola Dockerfile con tre target finali: api, worker, web.
#   docker build --target api -t tt-api .
# Nessun segreto nell'immagine: tutta la configurazione arriva dall'ambiente a runtime.

ARG NODE_VERSION=24

# ---------- base: Node + pnpm (versione dal campo packageManager) ----------
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm CI=true
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# ---------- fetch: scarica i pacchetti dal solo lockfile (layer cacheabile) ----------
FROM base AS fetch
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch

# ---------- build: installa offline, compila tutto ----------
FROM fetch AS build
# Lingua di default del frontend: e' risolta a build time da nuxt.config.ts.
ARG NUXT_PUBLIC_PLATFORM_DEFAULT_LOCALE=it
ENV NUXT_PUBLIC_PLATFORM_DEFAULT_LOCALE=$NUXT_PUBLIC_PLATFORM_DEFAULT_LOCALE
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --offline
RUN pnpm exec turbo run build --filter=@tt/api --filter=@tt/worker --filter=@tt/web
# Solo le dipendenze di produzione di ciascun servizio.
RUN pnpm --filter @tt/api deploy --prod --legacy /out/api \
 && pnpm --filter @tt/worker deploy --prod --legacy /out/worker \
 && rm -rf /out/api/src /out/api/eval /out/worker/src

# ---------- runtime comune ----------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
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
# Il worker non apre porte: la salute e' il processo in vita; riavvio con restart: unless-stopped.
CMD ["node", "dist/index.js"]

FROM runtime AS web
COPY --from=build --chown=node:node /repo/apps/web/.output /app
USER node
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
