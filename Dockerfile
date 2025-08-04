FROM node:22.12.0-alpine AS base
WORKDIR /app

COPY package*.json ./

FROM base AS builder
RUN npm ci

COPY prisma ./prisma
COPY . .

RUN npx prisma generate
RUN npm run build
RUN npm prune --production


FROM base AS final
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
RUN rm -rf /app/node_modules/playwright
RUN rm -rf /app/node_modules/playwright-core
RUN rm -rf app/node_modules/.cache/
RUN rm -rf app/node_modules/@prisma/engines/
RUN rm -rf app/node_modules/.prisma/client/query_engine-windows.dll.node
RUN rm -rf app/node_modules/prisma/

EXPOSE 3000
CMD ["node", "dist/index.js"]
