FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY pixel/package.json pixel/package-lock.json ./pixel/
RUN npm ci && npm --prefix pixel ci
COPY . .
RUN npm run data:check \
    && npm --prefix pixel run typecheck \
    && npm --prefix pixel test \
    && npm --prefix pixel run build \
    && npm run data:check

FROM nginxinc/nginx-unprivileged:1.30-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03
COPY pixel/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/pixel /srv/pixel-atlas
COPY --from=builder /app/public/licenses /srv/pixel-atlas/licenses
EXPOSE 8080
