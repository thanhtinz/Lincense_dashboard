FROM node:20-alpine AS builder
WORKDIR /app

# NEXT_PUBLIC_* must be present at BUILD time — Next.js inlines them into the
# client bundle. On Railway, add these as service variables (they are available
# at build too). API_URL is also baked via next.config.mjs `env`.
ARG NEXT_PUBLIC_API_URL
ARG API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV API_URL=${API_URL}

COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Next standalone server reads PORT/HOSTNAME — bind to all interfaces for Railway.
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
