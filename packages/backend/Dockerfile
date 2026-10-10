FROM node:20-alpine AS base

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
RUN corepack enable pnpm && pnpm install --frozen-lockfile
RUN pnpm --filter @crypto-gaming/backend run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/packages/backend/dist ./dist
COPY --from=builder /app/packages/backend/node_modules ./node_modules
COPY --from=builder /app/packages/backend/package.json ./package.json
COPY --from=builder /app/packages/backend/prisma ./prisma

EXPOSE 3001

CMD ["node", "dist/index.js"]