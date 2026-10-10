FROM node:20-alpine AS base

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend
RUN corepack enable pnpm && pnpm install --frozen-lockfile
RUN pnpm --filter @crypto-gaming/frontend run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/packages/frontend/.next/standalone ./
COPY --from=builder /app/packages/frontend/.next/static ./.next/static
COPY --from=builder /app/packages/frontend/public ./public

EXPOSE 3000

CMD ["node", "server.js"]