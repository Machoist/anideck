FROM node:24-alpine
WORKDIR /app
COPY package.json ./package.json
COPY src/provider-auth.js ./src/provider-auth.js
COPY auth-bridge/server.js ./auth-bridge/server.js
ENV NODE_ENV=production
ENV PORT=8080
USER node
EXPOSE 8080
CMD ["node", "auth-bridge/server.js"]
