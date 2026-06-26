# syntax=docker/dockerfile:1

# ──────────────────────────────────────────────────────────────
# base — shared Node runtime
# ──────────────────────────────────────────────────────────────
FROM node:24-alpine AS base
WORKDIR /app
# libc6-compat helps some native deps on Alpine.
RUN apk add --no-cache libc6-compat

# ──────────────────────────────────────────────────────────────
# deps — install node_modules from the lockfile
# ──────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
# Use ci when a lockfile is present, fall back to install otherwise.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ──────────────────────────────────────────────────────────────
# dev — Compose development target (hot reload via next dev)
# node_modules is baked in so a fresh named volume seeds from it.
# ──────────────────────────────────────────────────────────────
FROM base AS dev
# NODE_ENV is intentionally NOT set here: Next.js assigns it per-command
# (development for `next dev`, production for `next build`/`next start`).
# Forcing it would make `next build` crash on a dev/prod React mismatch.
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ──────────────────────────────────────────────────────────────
# builder — produce the standalone production build
# ──────────────────────────────────────────────────────────────
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ──────────────────────────────────────────────────────────────
# runner — minimal production image (standalone server)
# ──────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
