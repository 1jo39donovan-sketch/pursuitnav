FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# Usage counts live here, on a Docker volume the node user can write.
RUN mkdir -p /data/usage && chown node:node /data/usage
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
