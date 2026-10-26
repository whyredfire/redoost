FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
ARG VERSION=dev
RUN VITE_VERSION=$VERSION bun run build

# The Nginx config, including /config.json, comes from the deployment
FROM nginxinc/nginx-unprivileged:1.31.7-alpine-slim@sha256:a8cb0f33d51fa107c96fd2bd3a71aaf564ec131e9d2bdf8700944f0ed8b170d7

COPY --from=build /app/dist /usr/share/nginx/html
