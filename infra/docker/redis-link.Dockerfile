FROM node:22.22.0-bookworm-slim
WORKDIR /app
COPY infra/redis-link/server.mjs server.mjs
CMD ["node", "server.mjs"]
