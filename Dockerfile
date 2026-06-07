FROM node:22-alpine AS base
WORKDIR /app

# Install all dependencies, including dev dependencies needed for build and migrations.
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# Lightweight image for database migrations, without building Next.js.
FROM base AS migrator
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src/db ./src/db
COPY src/lib ./src/lib
COPY tools ./tools

# Build Next.js in CI.
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Minimal production image based on Next.js standalone output.
FROM base AS runner
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
