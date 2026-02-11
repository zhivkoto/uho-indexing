# Railway deploy v3 - explicit amd64 platform
FROM --platform=linux/amd64 node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM --platform=linux/amd64 node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM --platform=linux/amd64 node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system app && adduser --system --ingroup app app

COPY --from=builder /app/public ./public
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static

USER app
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
