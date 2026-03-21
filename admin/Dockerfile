FROM node:20-alpine

# better-sqlite3 needs build tools to compile native addon on ARM
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY . .

# Don't run as root
RUN addgroup -S app && adduser -S app -G app
RUN mkdir -p /app/data && chown -R app:app /app/data
USER app

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["node", "server.js"]
