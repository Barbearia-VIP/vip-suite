#!/bin/bash

################################################################################
# VIP Suite - Script de Instalação Completo para VPS
# 
# Este script instala todas as dependências necessárias para rodar o vip-suite
# em um VPS Ubuntu 22.04 LTS com Docker Compose
#
# Uso: sudo bash install-vps.sh
################################################################################

set -e  # Parar em caso de erro

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configurações
VPS_IP="201.22.86.97"
VPS_USER="bvip"
APP_PORT="3098"
DOMAIN="suite.franquiabv.xyz"
EMAIL="contato@barbeariabv.com.br"
APP_DIR="/opt/vip-suite"
MYSQL_HOST="127.0.0.1"
MYSQL_PORT="3306"
MYSQL_DB="suite"
MYSQL_USER="suite"
MYSQL_PASS="D5mj476Bf07n@"
REDIS_HOST="127.0.0.1"
REDIS_PORT="6379"

# Funções auxiliares
print_header() {
    echo -e "\n${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Verificar se é root
if [[ $EUID -ne 0 ]]; then
    print_error "Este script deve ser executado com privilégios de root (use: sudo bash install-vps.sh)"
    exit 1
fi

# ============================================================================
# 1. ATUALIZAR SISTEMA
# ============================================================================
print_header "1. Atualizando Sistema Operacional"

apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
    curl \
    wget \
    git \
    vim \
    htop \
    net-tools \
    ufw \
    fail2ban \
    certbot \
    python3-certbot-nginx

print_success "Sistema atualizado"

# ============================================================================
# 2. INSTALAR DOCKER
# ============================================================================
print_header "2. Instalando Docker e Docker Compose"

# Verificar se Docker já está instalado
if command -v docker &> /dev/null; then
    print_warning "Docker já está instalado"
else
    # Instalar Docker
    curl -fsSL https://get.docker.com -o get-docker.sh
    bash get-docker.sh
    rm get-docker.sh
    
    # Adicionar usuário ao grupo docker
    usermod -aG docker $VPS_USER
    
    print_success "Docker instalado"
fi

# Verificar se Docker Compose já está instalado
if command -v docker-compose &> /dev/null; then
    print_warning "Docker Compose já está instalado"
else
    # Instalar Docker Compose
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    
    print_success "Docker Compose instalado"
fi

# Iniciar Docker
systemctl start docker
systemctl enable docker

print_success "Docker iniciado e habilitado"

# ============================================================================
# 3. INSTALAR NODE.JS E PNPM
# ============================================================================
print_header "3. Instalando Node.js e pnpm"

# Instalar Node.js 22 (LTS)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y -qq nodejs

# Instalar pnpm globalmente
npm install -g pnpm

print_success "Node.js $(node --version) instalado"
print_success "pnpm $(pnpm --version) instalado"

# ============================================================================
# 4. CRIAR DIRETÓRIO DA APLICAÇÃO
# ============================================================================
print_header "4. Preparando Diretório da Aplicação"

mkdir -p $APP_DIR
cd $APP_DIR

print_success "Diretório $APP_DIR criado"

# ============================================================================
# 5. CLONAR REPOSITÓRIO (se necessário)
# ============================================================================
print_header "5. Obtendo Código da Aplicação"

if [ -d "$APP_DIR/.git" ]; then
    print_warning "Repositório já existe, atualizando..."
    cd $APP_DIR
    git pull origin main
else
    print_info "Clone o repositório em $APP_DIR"
    print_info "Exemplo: git clone <seu-repo> $APP_DIR"
fi

print_success "Código da aplicação pronto"

# ============================================================================
# 6. CRIAR ARQUIVO .ENV
# ============================================================================
print_header "6. Configurando Variáveis de Ambiente"

cat > $APP_DIR/.env << EOF
# ============================================================================
# VIP Suite - Configuração de Produção
# ============================================================================

# Node Environment
NODE_ENV=production

# Servidor
PORT=3098
HOST=0.0.0.0

# Banco de Dados MySQL
DATABASE_URL=mysql://suite:D5mj476Bf07n@127.0.0.1:3306/suite

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0

# JWT Secret (gere um novo valor seguro)
JWT_SECRET=$(openssl rand -base64 32)

# Manus OAuth
VITE_APP_ID=your_app_id_here
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://login.manus.im

# Owner Info
OWNER_OPEN_ID=your_owner_id_here
OWNER_NAME=Barbearia VIP

# Manus APIs
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=your_api_key_here
VITE_FRONTEND_FORGE_API_URL=https://api.manus.im
VITE_FRONTEND_FORGE_API_KEY=your_frontend_key_here

# App Info
VITE_APP_TITLE=VIP Suite
VITE_APP_PUBLIC_URL=https://suite.franquiabv.xyz

# Analytics (opcional)
VITE_ANALYTICS_ENDPOINT=
VITE_ANALYTICS_WEBSITE_ID=

# SSH Tunnel (se necessário para acesso ao banco)
SSH_TUNNEL_HOST=
SSH_TUNNEL_PORT=22
SSH_TUNNEL_USER=
SSH_TUNNEL_PASS=

# Database External (se usar TiDB Cloud ou similar)
DB_EXT_HOST=
DB_EXT_PORT=4000
DB_EXT_USER=
DB_EXT_PASS=
DB_EXT_NAME=

# Google Business (opcional)
GOOGLE_BUSINESS_CLIENT_ID=
GOOGLE_BUSINESS_CLIENT_SECRET=
EOF

print_success "Arquivo .env criado em $APP_DIR/.env"
print_warning "IMPORTANTE: Edite $APP_DIR/.env com as credenciais reais!"

# ============================================================================
# 7. CRIAR ARQUIVO DOCKER-COMPOSE
# ============================================================================
print_header "7. Configurando Docker Compose"

cat > $APP_DIR/docker-compose.prod.yml << 'EOF'
version: '3.8'

services:
  # ========================================================================
  # Aplicação Node.js
  # ========================================================================
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: vip-suite-app
    restart: always
    ports:
      - "3098:3098"
    environment:
      NODE_ENV: production
      PORT: 3098
    env_file:
      - .env
    depends_on:
      - mysql
      - redis
    networks:
      - vip-suite-network
    volumes:
      - ./logs:/app/logs
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3098/api/trpc/system.health?input=%7B%22timestamp%22:1%7D"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # ========================================================================
  # MySQL Database
  # ========================================================================
  mysql:
    image: mysql:8.0
    container_name: vip-suite-mysql
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: root_password_change_me
      MYSQL_DATABASE: suite
      MYSQL_USER: suite
      MYSQL_PASSWORD: D5mj476Bf07n@
    ports:
      - "3306:3306"
    volumes:
      - mysql-data:/var/lib/mysql
      - ./mysql-init:/docker-entrypoint-initdb.d
    networks:
      - vip-suite-network
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ========================================================================
  # Redis Cache
  # ========================================================================
  redis:
    image: redis:7-alpine
    container_name: vip-suite-redis
    restart: always
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - vip-suite-network
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ========================================================================
  # Nginx Reverse Proxy com SSL
  # ========================================================================
  nginx:
    image: nginx:alpine
    container_name: vip-suite-nginx
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./nginx/certbot:/etc/letsencrypt:ro
      - nginx-cache:/var/cache/nginx
    depends_on:
      - app
    networks:
      - vip-suite-network
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  mysql-data:
    driver: local
  redis-data:
    driver: local
  nginx-cache:
    driver: local

networks:
  vip-suite-network:
    driver: bridge
EOF

print_success "Docker Compose configurado"

# ============================================================================
# 8. CRIAR DIRETÓRIOS NECESSÁRIOS
# ============================================================================
print_header "8. Criando Estrutura de Diretórios"

mkdir -p $APP_DIR/logs
mkdir -p $APP_DIR/nginx/conf.d
mkdir -p $APP_DIR/nginx/ssl
mkdir -p $APP_DIR/mysql-init

print_success "Diretórios criados"

# ============================================================================
# 9. CONFIGURAR FIREWALL
# ============================================================================
print_header "9. Configurando Firewall (UFW)"

ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp      # SSH
ufw allow 80/tcp      # HTTP
ufw allow 443/tcp     # HTTPS
ufw allow 3098/tcp    # App (opcional, já atrás do nginx)

print_success "Firewall configurado"

# ============================================================================
# 10. CRIAR SCRIPT DE BACKUP
# ============================================================================
print_header "10. Criando Script de Backup"

cat > $APP_DIR/deployment/backup.sh << 'EOF'
#!/bin/bash

# Script de backup automático do banco de dados

BACKUP_DIR="/opt/vip-suite/backups"
DATE=$(date +%Y%m%d_%H%M%S)
MYSQL_CONTAINER="vip-suite-mysql"

mkdir -p $BACKUP_DIR

# Backup do MySQL
docker exec $MYSQL_CONTAINER mysqldump -u suite -pD5mj476Bf07n@ suite > $BACKUP_DIR/suite_$DATE.sql

# Compactar
gzip $BACKUP_DIR/suite_$DATE.sql

# Manter apenas últimos 7 backups
find $BACKUP_DIR -name "suite_*.sql.gz" -mtime +7 -delete

echo "Backup realizado: $BACKUP_DIR/suite_$DATE.sql.gz"
EOF

chmod +x $APP_DIR/deployment/backup.sh

print_success "Script de backup criado"

# ============================================================================
# 11. CRIAR SCRIPT DE MONITORAMENTO
# ============================================================================
print_header "11. Criando Script de Monitoramento"

cat > $APP_DIR/deployment/monitor.sh << 'EOF'
#!/bin/bash

# Script para monitorar status dos containers

echo "=== Status dos Containers VIP Suite ==="
docker ps --filter "name=vip-suite" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo -e "\n=== Logs Recentes (últimas 50 linhas) ==="
docker logs --tail 50 vip-suite-app

echo -e "\n=== Uso de Recursos ==="
docker stats --no-stream vip-suite-app vip-suite-mysql vip-suite-redis
EOF

chmod +x $APP_DIR/deployment/monitor.sh

print_success "Script de monitoramento criado"

# ============================================================================
# 12. CRIAR CRON JOB PARA BACKUPS
# ============================================================================
print_header "12. Configurando Cron Job para Backups Automáticos"

# Adicionar cron job para backup diário às 2 da manhã
(crontab -l 2>/dev/null | grep -v "vip-suite"; echo "0 2 * * * $APP_DIR/deployment/backup.sh") | crontab -

print_success "Cron job configurado (backup diário às 2h)"

# ============================================================================
# 13. INSTRUÇÕES FINAIS
# ============================================================================
print_header "Instalação Concluída!"

echo -e "${GREEN}✓ Todas as dependências foram instaladas com sucesso!${NC}\n"

echo -e "${YELLOW}PRÓXIMOS PASSOS:${NC}\n"

echo "1. ${BLUE}Editar arquivo de configuração:${NC}"
echo "   nano $APP_DIR/.env"
echo "   - Adicionar credenciais do Manus OAuth"
echo "   - Configurar chaves de API"
echo ""

echo "2. ${BLUE}Clonar o repositório (se ainda não foi):${NC}"
echo "   cd $APP_DIR"
echo "   git clone <seu-repositório> ."
echo ""

echo "3. ${BLUE}Iniciar a aplicação:${NC}"
echo "   cd $APP_DIR"
echo "   docker-compose -f docker-compose.prod.yml up -d"
echo ""

echo "4. ${BLUE}Verificar status:${NC}"
echo "   bash $APP_DIR/deployment/monitor.sh"
echo ""

echo "5. ${BLUE}Configurar SSL com Let's Encrypt (opcional):${NC}"
echo "   certbot certonly --standalone -d $DOMAIN -m $EMAIL"
echo ""

echo "6. ${BLUE}Ver logs:${NC}"
echo "   docker logs -f vip-suite-app"
echo ""

echo -e "${YELLOW}INFORMAÇÕES IMPORTANTES:${NC}\n"
echo "- Domínio: $DOMAIN"
echo "- Porta da Aplicação: $APP_PORT"
echo "- Banco de Dados: $MYSQL_DB (localhost:$MYSQL_PORT)"
echo "- Redis: $REDIS_HOST:$REDIS_PORT"
echo "- Diretório: $APP_DIR"
echo "- Backups: $APP_DIR/backups (automático diariamente às 2h)"
echo ""

echo -e "${BLUE}Documentação completa em: $APP_DIR/DEPLOYMENT.md${NC}\n"

print_success "Script de instalação finalizado!"
