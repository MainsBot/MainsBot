FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .

RUN mkdir -p /app/config /app/data /app/run && chown -R node:node /app

USER node

CMD ["node", "main.js"]
