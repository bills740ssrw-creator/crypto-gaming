# CryptoGaming

A full-stack crypto gaming platform: a provably-fair casino (Tic-Tac-Toe, Rock-Paper-Scissors, Path Elimination) with a crypto wallet, deposits/withdrawals, and a Stake/Rainbet-style dark UI.

## Structure

pnpm/npm workspaces monorepo:

- `packages/shared` — shared types, game engines, provably-fair helpers
- `packages/backend` — Express + Prisma + Socket.IO API (port 3001)
- `packages/frontend` — Next.js app (port 3000)

## Getting started

```bash
npm install
npm run db:generate && npm run db:push
npm run dev
```

Frontend: http://localhost:3000 — Backend API: http://localhost:3001

### Environment

Each package ships a sanitized `.env.example`. Copy it to `.env` and fill in real values. **Real `.env` files are gitignored — never commit secrets.**

> **Security note:** the dev wallet keys / mnemonics that once lived in a local `.env` must be treated as compromised and regenerated before any real deployment.

## Deploying

The frontend is configured for a single host deployment (backend on `:3001`, frontend on `:3000`). Set `NEXT_PUBLIC_API_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, and `CORS_ORIGIN` for your domain.

## License

Private.
