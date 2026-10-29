# ---------- build ----------
FROM node:24-bookworm-slim AS build
WORKDIR /app
# package-lock.json è facoltativo: se manca, npm lo crea qui (e lo usa anche lo stadio finale).
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
COPY . .
RUN npm test && npm run build

# ---------- runtime ----------
FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    PORT=8080 \
    DB_FILE=/data/maiolica.db \
    CLIENT_DIST=/app/client
WORKDIR /app
COPY package.json ./
COPY --from=build /app/package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci --omit=dev --workspace=@maiolica/server --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/packages/server/dist ./server
COPY --from=build /app/packages/client/dist ./client
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
