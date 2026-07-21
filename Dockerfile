# DocForge + Forge — production image for the Slack Agent delivery.
#
# Ships:
#  - Node 22
#  - Typst 0.14.2 (pinned, matches TYPST_VERSION_PIN)
#  - dist/ build artifacts (incl. dist/index.js — the MCP server the Slack bot
#    spawns as a stdio child; the bot drives DocForge over MCP)
#  - vendor/typst-packages — offline @preview/* store (no network at compile)
#  - templates / brand_kits / packages / marketplace runtime assets
#
# Runs the Slack app in HTTP mode (GET /health, POST /slack/events).

# ---- build stage ---------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime stage -------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Pinned Typst (same version/asset as CI).
ARG TYPST_VERSION=0.14.2
ARG TYPST_SHA256=a6044cbad2a954deb921167e257e120ac0a16b20339ec01121194ff9d394996d
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl xz-utils ca-certificates \
 && curl -fsSL -o /tmp/typst.tar.xz "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz" \
 && echo "${TYPST_SHA256}  /tmp/typst.tar.xz" | sha256sum -c - \
 && tar -xJf /tmp/typst.tar.xz -C /tmp \
 && mv /tmp/typst-x86_64-unknown-linux-musl/typst /usr/local/bin/typst \
 && chmod +x /usr/local/bin/typst \
 && apt-get purge -y curl xz-utils && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* /tmp/typst-* /tmp/typst.tar.xz \
 && typst --version

# Production dependencies only.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Build output + runtime assets.
COPY --from=build /app/dist ./dist
COPY templates ./templates
COPY brand_kits ./brand_kits
COPY packages ./packages
COPY marketplace ./marketplace
COPY vendor ./vendor
COPY scripts ./scripts

# Fail the build if Typst is below pin or a vendored package is missing.
RUN node scripts/check-typst-version.mjs \
 && node scripts/check-vendored-packages.mjs

# Persisted document workspaces (share this with nothing else; the MCP child
# and the bot both read it via DOCFORGE_DATA_ROOT).
ENV DOCFORGE_DATA_ROOT=/data/documents
RUN mkdir -p /data/documents
VOLUME ["/data"]

# HTTP mode for the unattended review window.
ENV SLACK_SOCKET_MODE=false
ENV PORT=3000
EXPOSE 3000

# Container-level health check hits the Express receiver's /health route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/slack/app.js"]
