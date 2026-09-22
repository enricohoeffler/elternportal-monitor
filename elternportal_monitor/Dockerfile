FROM node:24-alpine

ARG BUILD_VERSION=dev
ARG BUILD_ARCH=amd64
LABEL io.hass.version="${BUILD_VERSION}" \
      io.hass.type="addon" \
      io.hass.arch="${BUILD_ARCH}"

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src

ENV MODE=daemon \
    STATE_FILE=/data/state.json

VOLUME ["/data"]
CMD ["node", "src/app-launcher.js"]
