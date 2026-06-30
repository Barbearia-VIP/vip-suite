#!/bin/bash

################################################################################
# VIP Suite - Script de Gerenciamento
# 
# Uso:
#   bash manage.sh start    - Iniciar aplicação
#   bash manage.sh stop     - Parar aplicação
#   bash manage.sh restart  - Reiniciar aplicação
#   bash manage.sh logs     - Ver logs em tempo real
#   bash manage.sh status   - Ver status dos containers
#   bash manage.sh shell    - Acessar shell do container
#   bash manage.sh backup   - Fazer backup do banco
#   bash manage.sh restore  - Restaurar backup
################################################################################

set -e

APP_DIR="/opt/vip-suite"
COMPOSE_FILE="$APP_DIR/docker-compose.prod.yml"
BACKUP_DIR="$APP_DIR/backups"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Verificar se docker-compose está disponível
if ! command -v docker-compose &> /dev/null; then
    print_error "docker-compose não encontrado"
    exit 1
fi

# Função: Iniciar
start() {
    print_info "Iniciando VIP Suite..."
    cd $APP_DIR
    docker-compose -f docker-compose.prod.yml up -d
    sleep 3
    print_success "Aplicação iniciada"
    status
}

# Função: Parar
stop() {
    print_info "Parando VIP Suite..."
    cd $APP_DIR
    docker-compose -f docker-compose.prod.yml down
    print_success "Aplicação parada"
}

# Função: Reiniciar
restart() {
    print_info "Reiniciando VIP Suite..."
    stop
    sleep 2
    start
}

# Função: Ver logs
logs() {
    cd $APP_DIR
    docker-compose -f docker-compose.prod.yml logs -f app
}

# Função: Status
status() {
    print_info "Status dos containers:"
    docker ps --filter "name=vip-suite" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    
    echo ""
    print_info "Verificando health checks..."
    
    # MySQL
    if docker exec vip-suite-mysql mysqladmin ping -h localhost &> /dev/null; then
        print_success "MySQL: OK"
    else
        print_error "MySQL: FALHA"
    fi
    
    # Redis
    if docker exec vip-suite-redis redis-cli ping &> /dev/null; then
        print_success "Redis: OK"
    else
        print_error "Redis: FALHA"
    fi
    
    # App
    if curl -s http://localhost:3098/api/trpc/system.health?input=%7B%22timestamp%22:1%7D &> /dev/null; then
        print_success "Aplicação: OK"
    else
        print_error "Aplicação: FALHA"
    fi
}

# Função: Shell
shell() {
    print_info "Abrindo shell do container..."
    docker exec -it vip-suite-app /bin/sh
}

# Função: Backup
backup() {
    print_info "Fazendo backup do banco de dados..."
    mkdir -p $BACKUP_DIR
    
    DATE=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/suite_$DATE.sql"
    
    docker exec vip-suite-mysql mysqldump -u suite -pD5mj476Bf07n@ suite > $BACKUP_FILE
    gzip $BACKUP_FILE
    
    print_success "Backup criado: $BACKUP_FILE.gz"
    
    # Limpar backups antigos (manter últimos 7)
    find $BACKUP_DIR -name "suite_*.sql.gz" -mtime +7 -delete
    print_info "Backups antigos removidos (mantendo últimos 7)"
}

# Função: Restaurar
restore() {
    if [ -z "$1" ]; then
        print_error "Uso: manage.sh restore <arquivo_backup>"
        echo "Backups disponíveis:"
        ls -lh $BACKUP_DIR/*.sql.gz 2>/dev/null || echo "Nenhum backup encontrado"
        exit 1
    fi
    
    BACKUP_FILE="$1"
    
    if [ ! -f "$BACKUP_FILE" ]; then
        print_error "Arquivo não encontrado: $BACKUP_FILE"
        exit 1
    fi
    
    print_info "Restaurando backup: $BACKUP_FILE"
    
    # Descompactar se necessário
    if [[ $BACKUP_FILE == *.gz ]]; then
        TEMP_FILE="/tmp/restore_$$.sql"
        gunzip -c "$BACKUP_FILE" > "$TEMP_FILE"
        BACKUP_FILE="$TEMP_FILE"
    fi
    
    docker exec -i vip-suite-mysql mysql -u suite -pD5mj476Bf07n@ suite < "$BACKUP_FILE"
    
    print_success "Backup restaurado com sucesso"
}

# Função: Ajuda
help() {
    echo "VIP Suite - Script de Gerenciamento"
    echo ""
    echo "Uso: bash manage.sh <comando>"
    echo ""
    echo "Comandos:"
    echo "  start      - Iniciar aplicação"
    echo "  stop       - Parar aplicação"
    echo "  restart    - Reiniciar aplicação"
    echo "  logs       - Ver logs em tempo real"
    echo "  status     - Ver status dos containers"
    echo "  shell      - Acessar shell do container"
    echo "  backup     - Fazer backup do banco"
    echo "  restore    - Restaurar backup (uso: restore <arquivo>)"
    echo "  help       - Mostrar esta mensagem"
    echo ""
}

# Processar comando
case "${1:-help}" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    logs)
        logs
        ;;
    status)
        status
        ;;
    shell)
        shell
        ;;
    backup)
        backup
        ;;
    restore)
        restore "$2"
        ;;
    help)
        help
        ;;
    *)
        print_error "Comando desconhecido: $1"
        help
        exit 1
        ;;
esac
