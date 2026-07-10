# Multi-stage build for dnksubastas (Next.js 16) — Wave 1 internal test
FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

FROM base AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN npx prisma generate
RUN npm run build

FROM base AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=3005
ENV HOST=0.0.0.0
WORKDIR /app
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json
# /noticias markdown content — read at request time by src/lib/noticias.ts
# (module-scope cached). Must ship in the runtime image.
COPY --from=build /app/content ./content
EXPOSE 3005
CMD ["sh","-c","npx prisma migrate deploy && exec node node_modules/next/dist/bin/next start -p 3005 -H 0.0.0.0"]
