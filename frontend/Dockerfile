FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
ARG VERSION=dev
RUN VITE_VERSION=$VERSION bun run build

# The Nginx config, including /config.json, comes from the deployment
FROM nginxinc/nginx-unprivileged:1.31.6-alpine-slim@sha256:1517d8c358e2e093957ebee087afa9eb19a32f5d7ecb711b7429e369cb998224

COPY --from=build /app/dist /usr/share/nginx/html
