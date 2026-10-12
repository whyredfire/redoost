FROM oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
ARG VERSION=dev
RUN VITE_VERSION=$VERSION bun run build

# The Nginx config, including /config.json, comes from the deployment
FROM nginxinc/nginx-unprivileged:1.31.6-alpine-slim@sha256:1517d8c358e2e093957ebee087afa9eb19a32f5d7ecb711b7429e369cb998224

COPY --from=build /app/dist /usr/share/nginx/html
