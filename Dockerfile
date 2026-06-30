# Multi-stage build para vip-suite
# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar package files
COPY package.json pnpm-lock.yaml ./
COPY .npmrc ./

# Instalar dependências (sem scripts nativos)
RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile --prod && \
    pnpm install --frozen-lockfile --dev

# Copiar código fonte
COPY . .

# Build da aplicação
RUN pnpm run build

# Stage 2: Runtime
FROM node:22-alpine

WORKDIR /app

# Instalar apenas dependências de runtime
RUN npm install -g pnpm

# Copiar package files
COPY package.json pnpm-lock.yaml ./
COPY .npmrc ./

# Instalar apenas dependências de produção
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copiar build do stage anterior
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/public ./public

# Criar diretórios para logs
RUN mkdir -p /var/log/vip-suite && \
    chmod 755 /var/log/vip-suite

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Expor porta
EXPOSE 3000

# User não-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

# Start application
CMD ["node", "dist/server/_core/index.js"]
