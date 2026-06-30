#!/bin/bash

# VIP Suite - Deploy Script para VPS
# Uso: ./deploy.sh [staging|production] [action: deploy|rollback|status]

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configurações
ENVIRONMENT=${1:-staging}
ACTION=${2:-deploy}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VPS_IP="201.22.86.97"
VPS_USER="bvip"
VPS_HOME="/home/bvip/vip-suite"
DEPLOY_LOG="/tmp/vip-suite-deploy.log"

# Funções
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$DEPLOY_LOG"
}

success() {
    echo -e "${GREEN}✓ $1${NC}" | tee -a "$DEPLOY_LOG"
}

error() {
    echo -e "${RED}✗ $1${NC}" | tee -a "$DEPLOY_LOG"
    exit 1
}

warning() {
    echo -e "${YELLOW}⚠ $1${NC}" | tee -a "$DEPLOY_LOG"
}

# Validar argumentos
if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
    error "Ambiente inválido: $ENVIRONMENT. Use 'staging' ou 'production'"
fi

if [[ ! "$ACTION" =~ ^(deploy|rollback|status|logs|restart)$ ]]; then
    error "Ação inválida: $ACTION. Use 'deploy', 'rollback', 'status', 'logs' ou 'restart'"
fi

# Carregar configurações
if [ -f "$SCRIPT_DIR/vps-config.env" ]; then
    source "$SCRIPT_DIR/vps-config.env"
    success "Configurações carregadas de vps-config.env"
else
    error "Arquivo vps-config.env não encontrado em $SCRIPT_DIR"
fi

# Função: Deploy
deploy() {
    log "Iniciando deploy para $ENVIRONMENT..."
    
    # 1. Validar conectividade SSH
    log "Validando conectividade SSH..."
    if ! ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" "echo 'SSH OK'" > /dev/null 2>&1; then
        error "Não foi possível conectar ao VPS via SSH"
    fi
    success "Conectividade SSH validada"
    
    # 2. Criar diretórios no VPS
    log "Criando estrutura de diretórios no VPS..."
    ssh "$VPS_USER@$VPS_IP" "mkdir -p $VPS_HOME/{nginx/conf.d,nginx/certbot/{conf,www},logs,data,deployment}" || error "Falha ao criar diretórios"
    success "Diretórios criados"
    
    # 3. Copiar arquivos para VPS
    log "Copiando arquivos para VPS..."
    scp -r "$PROJECT_DIR/." "$VPS_USER@$VPS_IP:$VPS_HOME/" || error "Falha ao copiar arquivos"
    success "Arquivos copiados"
    
    # 4. Criar arquivo .env no VPS
    log "Gerando arquivo .env no VPS..."
    ssh "$VPS_USER@$VPS_IP" "cat > $VPS_HOME/.env << 'EOF'
NODE_ENV=$ENVIRONMENT
PORT=3000
DATABASE_URL=mysql://suite:D5mj476Bf07n@@127.0.0.1:3306/suite
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
VITE_APP_PUBLIC_URL=https://suite.franquiabv.xyz
LOG_LEVEL=info
EOF" || error "Falha ao criar .env"
    success "Arquivo .env criado"
    
    # 5. Build e start com Docker Compose
    log "Construindo imagem Docker..."
    ssh "$VPS_USER@$VPS_IP" "cd $VPS_HOME && docker-compose build --no-cache" || error "Falha no build Docker"
    success "Imagem Docker construída"
    
    log "Iniciando containers..."
    ssh "$VPS_USER@$VPS_IP" "cd $VPS_HOME && docker-compose up -d" || error "Falha ao iniciar containers"
    success "Containers iniciados"
    
    # 6. Aguardar aplicação ficar pronta
    log "Aguardando aplicação ficar pronta..."
    for i in {1..30}; do
        if ssh "$VPS_USER@$VPS_IP" "curl -s http://127.0.0.1:3000/health > /dev/null" 2>/dev/null; then
            success "Aplicação está pronta"
            break
        fi
        if [ $i -eq 30 ]; then
            error "Timeout aguardando aplicação ficar pronta"
        fi
        echo -n "."
        sleep 2
    done
    
    # 7. Configurar SSL com Certbot
    log "Configurando SSL com Let's Encrypt..."
    ssh "$VPS_USER@$VPS_IP" "cd $VPS_HOME && docker-compose exec -T certbot certbot certonly --webroot -w /var/www/certbot -d suite.franquiabv.xyz --email $SSL_EMAIL --agree-tos --non-interactive" || warning "SSL pode já estar configurado"
    
    # 8. Reload Nginx
    log "Recarregando Nginx..."
    ssh "$VPS_USER@$VPS_IP" "docker-compose exec -T nginx nginx -s reload" || warning "Falha ao recarregar Nginx"
    success "Nginx recarregado"
    
    # 9. Salvar snapshot para rollback
    log "Salvando snapshot para rollback..."
    SNAPSHOT_DATE=$(date +%Y%m%d_%H%M%S)
    ssh "$VPS_USER@$VPS_IP" "cd $VPS_HOME && tar -czf deployment/snapshot_$SNAPSHOT_DATE.tar.gz docker-compose.yml .env" || warning "Falha ao salvar snapshot"
    success "Snapshot salvo: snapshot_$SNAPSHOT_DATE.tar.gz"
    
    log "Deploy concluído com sucesso!"
    success "Aplicação disponível em: https://suite.franquiabv.xyz"
}

# Função: Rollback
rollback() {
    log "Iniciando rollback..."
    
    # Listar snapshots disponíveis
    log "Snapshots disponíveis:"
    ssh "$VPS_USER@$VPS_IP" "ls -lh $VPS_HOME/deployment/snapshot_*.tar.gz" || error "Nenhum snapshot encontrado"
    
    read -p "Digite o nome do snapshot para rollback: " SNAPSHOT
    
    log "Restaurando snapshot $SNAPSHOT..."
    ssh "$VPS_USER@$VPS_IP" "cd $VPS_HOME && tar -xzf deployment/$SNAPSHOT && docker-compose down && docker-compose up -d" || error "Falha ao restaurar snapshot"
    
    success "Rollback concluído"
}

# Função: Status
status() {
    log "Status dos containers no VPS:"
    ssh "$VPS_USER@$VPS_IP" "cd $VPS_HOME && docker-compose ps"
    
    log "Logs recentes:"
    ssh "$VPS_USER@$VPS_IP" "cd $VPS_HOME && docker-compose logs --tail=20"
}

# Função: Logs
logs() {
    log "Exibindo logs em tempo real..."
    ssh "$VPS_USER@$VPS_IP" "cd $VPS_HOME && docker-compose logs -f"
}

# Função: Restart
restart() {
    log "Reiniciando containers..."
    ssh "$VPS_USER@$VPS_IP" "cd $VPS_HOME && docker-compose restart" || error "Falha ao reiniciar"
    success "Containers reiniciados"
}

# Executar ação
case "$ACTION" in
    deploy)
        deploy
        ;;
    rollback)
        rollback
        ;;
    status)
        status
        ;;
    logs)
        logs
        ;;
    restart)
        restart
        ;;
    *)
        error "Ação desconhecida: $ACTION"
        ;;
esac
