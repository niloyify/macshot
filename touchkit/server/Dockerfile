FROM node:22-alpine
WORKDIR /app
COPY server/server.js ./server/server.js
COPY web ./web
ENV PORT=8080 DATA_DIR=/data WEB_DIR=/app/web NODE_ENV=production
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8080
USER node
CMD ["node", "--no-warnings", "server/server.js"]
