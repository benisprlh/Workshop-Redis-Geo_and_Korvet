FROM node:22.22.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --no-audit --no-fund
COPY apps/api apps/api
COPY apps/web apps/web
COPY packages/contracts packages/contracts
COPY workshop workshop
COPY scripts scripts
COPY tests tests
COPY docs docs
COPY README.md README.md
EXPOSE 3001
CMD ["npm", "run", "dev", "-w", "apps/api"]
