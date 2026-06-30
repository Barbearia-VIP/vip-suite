#!/bin/bash

# VIP Suite - VPS Initialization Script
# Prepara o VPS para receber o deployment
# Uso: ssh bvip@201.22.86.97 'bash -s' < init-vps.sh

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✓ $1${NC}"
}

error() {
    echo -e "${RED}✗ $1${NC}"
    exit 1
}

warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Verificar se é root ou sudoer
if [ "$EUID" -ne 0 ] && ! sudo -n true 2>/dev/null; then
    error "Este script precisa de privilégios sudo"
fi

log "Iniciando inicialização do VPS..."

# 1. Atualizar sistema
log "Atualizando sistema..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq > /dev/null 2>&1 || warning "Falha ao atualizar sistema"
success "Sistema atualizado"

# 2. Instalar dependências
log "Instalando dependências..."
sudo apt-get install -y -qq \
    curl \
    wget \
    git \
    htop \
    net-tools \
    ca-certificates \
    gnupg \
    lsb-release \
    mysql-client \
    redis-tools \
    > /dev/null 2>&1 || warning "Falha ao instalar algumas dependências"
success "Dependências instaladas"

# 3. Verificar Docker
log "Verificando Docker..."
if ! command -v docker &> /dev/null; then
    warning "Docker não encontrado. Instalando..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    rm get-docker.sh
    success "Docker instalado"
else
    success "Docker já instalado: $(docker --version)"
fi

# 4. Verificar Docker Compose
log "Verificando Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    warning "Docker Compose não encontrado. Instalando..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    success "Docker Compose instalado"
else
    success "Docker Compose já instalado: $(docker-compose --version)"
fi

# 5. Adicionar usuário ao grupo docker
log "Configurando permissões Docker..."
if ! groups | grep -q docker; then
    sudo usermod -aG docker $USER
    success "Usuário adicionado ao grupo docker"
else
    success "Usuário já está no grupo docker"
fi

# 6. Verificar MySQL
log "Verificando MySQL..."
if command -v mysql &> /dev/null; then
    MYSQL_VERSION=$(mysql --version)
    success "MySQL já instalado: $MYSQL_VERSION"
    
    # Verificar banco 'suite'
    if mysql -u suite -pD5mj476Bf07n@ -e "SELECT 1" > /dev/null 2>&1; then
        success "Banco 'suite' acessível"
    else
        warning "Não foi possível acessar banco 'suite'. Verifique credenciais."
    fi
else
    warning "MySQL client não instalado. Instale manualmente: sudo apt-get install mysql-server"
fi

# 7. Verificar Redis
log "Verificando Redis..."
if command -v redis-cli &> /dev/null; then
    REDIS_VERSION=$(redis-cli --version)
    success "Redis já instalado: $REDIS_VERSION"
    
    # Verificar conectividade
    if redis-cli ping > /dev/null 2>&1; then
        success "Redis está rodando"
    else
        warning "Redis não está respondendo. Inicie com: sudo systemctl start redis-server"
    fi
else
    warning "Redis client não instalado. Instale manualmente: sudo apt-get install redis-server"
fi

# 8. Criar estrutura de diretórios
log "Criando estrutura de diretórios..."
mkdir -p ~/vip-suite/{nginx/conf.d,nginx/certbot/{conf,www},logs,data,deployment,backups}
success "Diretórios criados em ~/vip-suite"

# 9. Configurar firewall (ufw)
log "Configurando firewall..."
if command -v ufw &> /dev/null; then
    sudo ufw --force enable > /dev/null 2>&1 || warning "Falha ao ativar firewall"
    sudo ufw allow 22/tcp > /dev/null 2>&1
    sudo ufw allow 80/tcp > /dev/null 2>&1
    sudo ufw allow 443/tcp > /dev/null 2>&1
    success "Firewall configurado"
else
    warning "UFW não instalado. Configure firewall manualmente."
fi

# 10. Criar arquivo de configuração
log "Criando arquivo de configuração..."
cat > ~/vip-suite/.env << 'EOF'
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
EOF
success "Arquivo .env criado"

# 11. Criar script de backup
log "Criando script de backup..."
cat > ~/vip-suite/deployment/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="$HOME/vip-suite/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Backup do banco
mysqldump -u suite -pD5mj476Bf07n@ suite > "$BACKUP_DIR/suite_$TIMESTAMP.sql"

# Backup dos dados
tar -czf "$BACKUP_DIR/data_$TIMESTAMP.tar.gz" ~/vip-suite/data/

# Backup da configuração
tar -czf "$BACKUP_DIR/config_$TIMESTAMP.tar.gz" ~/vip-suite/.env ~/vip-suite/nginx/

echo "Backup concluído: $BACKUP_DIR"
EOF
chmod +x ~/vip-suite/deployment/backup.sh
success "Script de backup criado"

# 12. Criar cron job para backup automático
log "Configurando backup automático..."
CRON_JOB="0 2 * * * $HOME/vip-suite/deployment/backup.sh"
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab - 2>/dev/null || warning "Falha ao configurar cron job"
success "Backup automático agendado (02:00 diariamente)"

# 13. Resumo
log "=========================================="
success "VPS inicializado com sucesso!"
log "=========================================="
echo ""
echo "Próximos passos:"
echo "1. Volte para sua máquina local"
echo "2. Execute: cd deployment && ./deploy.sh staging deploy"
echo ""
echo "Verificações:"
echo "- Docker: $(docker --version)"
echo "- Docker Compose: $(docker-compose --version)"
echo "- MySQL: $(mysql --version 2>/dev/null || echo 'Não encontrado')"
echo "- Redis: $(redis-cli --version 2>/dev/null || echo 'Não encontrado')"
echo ""
echo "Diretórios criados:"
echo "- ~/vip-suite (aplicação)"
echo "- ~/vip-suite/backups (backups automáticos)"
echo ""
echo "Firewall:"
echo "- SSH (22)"
echo "- HTTP (80)"
echo "- HTTPS (443)"
echo ""
