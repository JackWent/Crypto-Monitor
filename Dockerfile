# ---- deps stage: build native modules (better-sqlite3) with full toolchain ----
FROM node:24-alpine AS deps

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --omit=dev

# ---- runtime stage: no build toolchain, no npm CLI, no shell, minimal surface ----
FROM node:24-alpine

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Last RUN, as it removes the shell that RUN needs. In order:
# - apk upgrade brings the base's Alpine packages up to date (e.g. ca-certificates 20261020,
#   which distrusts eMudhra's compromised emSign ECC G3 root); bump APK_REFRESH to force a
#   fresh one, since Docker otherwise reuses the cached layer.
# - remove the bundled npm CLI (and its own vendored deps like tar/glob/minimatch), which is
#   only needed at build time.
# - create the data directory for historical data storage.
# - remove apk, BusyBox (the shell, wget, ssl_client) and the system OpenSSL/zlib. Node and
#   better-sqlite3 only link musl, libstdc++ and libgcc, so nothing at runtime uses them, and
#   they carry the image's OS CVEs that have no fixed version. alpine-baselayout has to go too,
#   or apk keeps busybox for its /bin/sh.
ARG APK_REFRESH=2026-10-24
RUN echo "apk refresh $APK_REFRESH" && apk upgrade --no-cache \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn* /opt/yarn* \
 && mkdir -p /data && chown -R node:node /data \
 && apk del --no-cache --force-broken-world \
      apk-tools libapk ssl_client libssl3 libcrypto3 zlib busybox-binsh busybox alpine-baselayout

# Set defaults (can be overridden by docker-compose/.env)
ENV TZ=Europe/London \
    PORT=7050

# Switch to non-root user for better security
USER node

# Expose port
EXPOSE 7050

# The base image's docker-entrypoint.sh needs a shell, so run node directly
ENTRYPOINT ["node"]
CMD ["server.js"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 CMD ["node", "healthcheck.mjs"]
