FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm install tsx

# Copy source
COPY . .

RUN addgroup --system app && adduser --system --ingroup app app
RUN mkdir -p /app/.uho && chown app:app /app/.uho
USER app

EXPOSE 3010 3012

CMD ["npx", "tsx", "src/cli/index.ts", "platform", "start"]
