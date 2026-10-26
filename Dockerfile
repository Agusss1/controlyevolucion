# CYO — imagen única: compila el cliente y ejecuta el servidor (que también sirve el cliente)
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY simulation/package.json simulation/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 CLIENT_DIST=/app/client/dist
COPY --from=build /app /app
EXPOSE 3000
CMD ["npx", "tsx", "server/src/main.ts"]
