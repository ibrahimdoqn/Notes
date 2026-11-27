# Cam Notlar — tek Dockerfile, iki hedef:
#   docker build --target api   → API + worker imajı
#   docker build --target web   → Caddy + derlenmiş web uygulaması

FROM node:22-alpine AS deps
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts=false

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api
COPY apps/web apps/web
RUN npm run build -w @camnotlar/api && npm run build -w @camnotlar/web

FROM node:22-alpine AS prod-deps
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev -w @camnotlar/api --include-workspace-root=false

FROM node:22-alpine AS api
# pg_dump sunucu sürümüyle (17) aynı olmalı.
RUN apk add --no-cache postgresql17-client tini
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=prod-deps /src/node_modules ./node_modules
COPY --from=build /src/apps/api/dist ./dist
COPY apps/api/package.json ./package.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]

FROM caddy:2-alpine AS web
COPY --from=build /src/apps/web/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
