FROM node:20-bookworm-slim
ENV NODE_ENV=production PORT=4000 CENTRAL_DB=/dados/central.db
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY auth.js db.js painel.js server.js demo.js ./
COPY public public
RUN mkdir -p /dados && chown -R node:node /app /dados
USER node
VOLUME ["/dados"]
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
