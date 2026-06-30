#!/bin/bash

# VIP Suite - Database Migration Script
# Migra dados do TiDB Cloud para MySQL local no VPS
# Uso: ./migrate-db.sh

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

# Configurações
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Carregar variáveis de ambiente
if [ -f "$PROJECT_DIR/.env" ]; then
    source "$PROJECT_DIR/.env"
fi

# Credenciais TiDB (do Manus)
TIDB_HOST="${DB_EXT_HOST}"
TIDB_PORT="${DB_EXT_PORT:-4000}"
TIDB_USER="${DB_EXT_USER}"
TIDB_PASS="${DB_EXT_PASS}"
TIDB_DB="${DB_EXT_NAME}"

# Credenciais MySQL local (VPS)
MYSQL_HOST="127.0.0.1"
MYSQL_PORT="3306"
MYSQL_USER="suite"
MYSQL_PASS="D5mj476Bf07n@"
MYSQL_DB="suite"

# Validar credenciais
if [ -z "$TIDB_HOST" ] || [ -z "$TIDB_USER" ] || [ -z "$TIDB_PASS" ]; then
    error "Credenciais TiDB não configuradas. Verifique .env"
fi

log "Iniciando migração de dados..."
log "Origem: $TIDB_HOST:$TIDB_PORT/$TIDB_DB"
log "Destino: $MYSQL_HOST:$MYSQL_PORT/$MYSQL_DB"

# 1. Criar backup do banco local (segurança)
log "Criando backup do banco MySQL local..."
BACKUP_FILE="/tmp/suite_backup_$(date +%Y%m%d_%H%M%S).sql"
mysqldump -h "$MYSQL_HOST" -u "$MYSQL_USER" -p"$MYSQL_PASS" "$MYSQL_DB" > "$BACKUP_FILE" 2>/dev/null || warning "Falha ao criar backup"
success "Backup criado: $BACKUP_FILE"

# 2. Exportar dados do TiDB
log "Exportando dados do TiDB..."
TIDB_DUMP="/tmp/tidb_dump_$(date +%Y%m%d_%H%M%S).sql"
mysqldump -h "$TIDB_HOST" -P "$TIDB_PORT" -u "$TIDB_USER" -p"$TIDB_PASS" \
    --single-transaction \
    --no-tablespaces \
    --skip-lock-tables \
    "$TIDB_DB" > "$TIDB_DUMP" 2>/dev/null || error "Falha ao exportar dados do TiDB"
success "Dados exportados: $TIDB_DUMP"

# 3. Limpar banco local (opcional)
read -p "Deseja limpar o banco MySQL local antes de importar? (s/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Ss]$ ]]; then
    log "Limpando banco MySQL local..."
    mysql -h "$MYSQL_HOST" -u "$MYSQL_USER" -p"$MYSQL_PASS" -e "DROP DATABASE IF EXISTS $MYSQL_DB; CREATE DATABASE $MYSQL_DB;" || error "Falha ao limpar banco"
    success "Banco limpo"
fi

# 4. Importar dados para MySQL local
log "Importando dados para MySQL local..."
mysql -h "$MYSQL_HOST" -u "$MYSQL_USER" -p"$MYSQL_PASS" "$MYSQL_DB" < "$TIDB_DUMP" || error "Falha ao importar dados"
success "Dados importados com sucesso"

# 5. Validar integridade
log "Validando integridade dos dados..."
TIDB_TABLES=$(mysql -h "$TIDB_HOST" -P "$TIDB_PORT" -u "$TIDB_USER" -p"$TIDB_PASS" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$TIDB_DB';" 2>/dev/null | tail -1)
MYSQL_TABLES=$(mysql -h "$MYSQL_HOST" -u "$MYSQL_USER" -p"$MYSQL_PASS" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$MYSQL_DB';" 2>/dev/null | tail -1)

if [ "$TIDB_TABLES" -eq "$MYSQL_TABLES" ]; then
    success "Número de tabelas coincide: $MYSQL_TABLES"
else
    warning "Número de tabelas diferente. TiDB: $TIDB_TABLES, MySQL: $MYSQL_TABLES"
fi

# 6. Listar tabelas importadas
log "Tabelas importadas:"
mysql -h "$MYSQL_HOST" -u "$MYSQL_USER" -p"$MYSQL_PASS" -e "USE $MYSQL_DB; SHOW TABLES;" 2>/dev/null

# 7. Estatísticas
log "Estatísticas de migração:"
TOTAL_SIZE=$(du -sh "$TIDB_DUMP" | cut -f1)
echo "Tamanho do dump: $TOTAL_SIZE"

success "Migração concluída com sucesso!"
log "Backup local salvo em: $BACKUP_FILE"
log "Dump TiDB salvo em: $TIDB_DUMP"
log "Próximo passo: Execute ./deploy.sh staging deploy"
