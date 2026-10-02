FROM node:20-bookworm-slim AS web
WORKDIR /app
COPY frontend/package*.json frontend/
RUN npm --prefix frontend ci
COPY frontend frontend
RUN npm --prefix frontend run build

FROM node:20-bookworm-slim
ENV NODE_ENV=production PORT=3000 TRUST_PROXY=true
RUN apt-get update && apt-get install -y --no-install-recommends mpv ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY backend backend
COPY --from=web /app/frontend/dist frontend/dist
RUN mkdir -p database musicas backups && chown -R node:node /app
USER node
VOLUME ["/app/database", "/app/musicas", "/app/backups"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/server.js"]
