# Built from the repository root: docker build -f frontend/Dockerfile .
# Not Alpine: the Solid compiler ships glibc binaries only
FROM oven/bun:1.4.5-slim@sha256:b780593f3e10918cbdaec3d5a08d52224b9198069a65eb47812085c2ec007643 AS build

WORKDIR /app

COPY package.json bun.lock ./
COPY shared/package.json shared/
COPY frontend/package.json frontend/
COPY cli/package.json cli/
# --ignore-scripts skips the prepare script, which installs git hooks and needs git
RUN bun install --frozen-lockfile --ignore-scripts --filter redoost-frontend

COPY shared shared
COPY frontend frontend
ARG VERSION=dev
RUN PUBLIC_VERSION=$VERSION bun run --cwd frontend build

# The Nginx config, including /config.json, comes from the deployment
FROM nginxinc/nginx-unprivileged:1.31.7-alpine-slim@sha256:a8cb0f33d51fa107c96fd2bd3a71aaf564ec131e9d2bdf8700944f0ed8b170d7

COPY --from=build /app/frontend/dist /usr/share/nginx/html
