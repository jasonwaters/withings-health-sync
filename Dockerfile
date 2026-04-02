FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist/ ./dist/

RUN mkdir -p /app/data

ENV DATA_DIR=/app/data

CMD ["node", "dist/sync.js"]

LABEL org.opencontainers.image.title="Withings Health Sync"
LABEL org.opencontainers.image.description="Sync Withings health data (weight, body composition) for all family profiles to local JSON files"
LABEL org.opencontainers.image.authors="Jason Waters"
LABEL org.opencontainers.image.source="https://github.com/jasonwaters/withings-health-sync"
