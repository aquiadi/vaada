# The web app as a static site: built with Vite, served by Caddy with single-page routing. Railway passes the
# service's VITE_* variables in as build arguments, since Vite bakes them into the bundle.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_API_URL
ARG VITE_SENTRY_DSN
RUN test -n "$VITE_API_URL" || (echo "Set VITE_API_URL to the API's public URL on this service." && exit 1)
RUN pnpm build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
