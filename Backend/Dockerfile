# syntax=docker/dockerfile:1

# --- deps stage --------------------------------------------------------
# node:20-slim (Debian/glibc), not alpine: bcrypt, sharp, and
# onnxruntime-node (used by antiSpoof.service.js) ship prebuilt native
# binaries for glibc, not musl. build-essential/python3 are a fallback in
# case npm has to compile bcrypt from source for this Node ABI.
FROM node:20-slim AS deps
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- runtime stage -------------------------------------------------------
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN groupadd --system nodeapp && useradd --system --gid nodeapp --create-home nodeapp

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# Cloud Run injects PORT (defaults to 8080); src/server.js already reads
# process.env.PORT || 5000. .env is not copied into the image — configure
# real env vars / secrets (DB_*, JWT_*, GCS_CREDENTIALS_JSON, SMTP_*,
# REDIS_URL, etc.) via `gcloud run deploy --set-env-vars` / Secret Manager.
ENV PORT=8080
EXPOSE 8080

USER nodeapp

CMD ["node", "src/server.js"]
