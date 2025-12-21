FROM node:20 AS builder
WORKDIR /build
COPY . .
RUN npm install -g corepack && corepack enable
RUN pnpm install && pnpm build

FROM gcr.io/distroless/nodejs20-debian12
COPY --from=builder /build/dist /app
COPY --from=builder /build/package.json /app/package.json
COPY --from=builder /build/node_modules /app/node_modules
WORKDIR /app
CMD ["index.js"]
