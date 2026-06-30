# Multi-stage build para vip-suite
# Stage 1: Build
FROM node:22-slim AS builder

WORKDIR /app

# Instalar dependências de build necessárias para módulos nativos
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copiar package files
COPY package.json pnpm-lock.yaml ./
COPY .npmrc ./
COPY patches ./patches

# Instalar dependências (com scripts nativos habilitados)
RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile

# Copiar código fonte
COPY . .

# Build da aplicação
RUN pnpm run build

# Stage 2: Runtime
FROM node:22-slim

WORKDIR /app

# Instalar apenas dependências de runtime necessárias
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Instalar pnpm
RUN npm install -g pnpm

# Copiar package files
COPY package.json pnpm-lock.yaml ./
COPY .npmrc ./
COPY patches ./patches

# Instalar todas as dependências (incluindo dev para runtime)
RUN pnpm install --frozen-lockfile

# Copiar build do stage anterior
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle

# Criar diretórios para logs
RUN mkdir -p /var/log/vip-suite && \
    chmod 755 /var/log/vip-suite

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Expor porta
EXPOSE 3000

# User não-root
RUN groupadd -g 1001 -r nodejs && \
    useradd -r -u 1001 -g nodejs nodejs
USER nodejs

# Start application
CMD ["node", "dist/index.js"]
