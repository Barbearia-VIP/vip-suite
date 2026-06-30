# VIP Suite - Deployment Guide (VPS)

Guia completo para implantar o VIP Suite em um VPS próprio com Docker, Nginx, SSL e Redis.

## 📋 Pré-requisitos

### VPS
- **IP:** 201.22.86.97
- **OS:** Ubuntu 22.04.5 LTS
- **Usuário:** bvip
- **Acesso SSH:** Configurado

### Software no VPS
- ✅ Docker (instalado)
- ✅ Docker Compose (instalado)
- ✅ MySQL 8.0+ (instalado, banco `suite` criado)
- ✅ Redis (instalado, localhost:6379)
- ✅ Nginx (será instalado via Docker)

### Domínio
- **Domínio:** suite.franquiabv.xyz
- **Email SSL:** contato@barbeariavip.com.br
- **Porta da aplicação:** 3098 (interno), 443 (HTTPS público)

## 🚀 Quick Start

### 1. Preparar Ambiente Local

```bash
# Clone o repositório (se ainda não tiver)
git clone <repo-url> vip-suite
cd vip-suite

# Instale dependências locais
pnpm install

# Build da aplicação
pnpm run build
```

### 2. Migrar Dados (TiDB → MySQL local no VPS)

```bash
# Execute o script de migração
cd deployment
./migrate-db.sh

# O script irá:
# - Exportar dados do TiDB Cloud
# - Criar backup do banco local
# - Importar dados para MySQL local
# - Validar integridade
```

### 3. Deploy para VPS

```bash
# Execute o script de deployment
./deploy.sh staging deploy

# O script irá:
# - Conectar ao VPS via SSH
# - Copiar arquivos
# - Construir imagem Docker
# - Iniciar containers
# - Configurar SSL com Let's Encrypt
# - Iniciar Nginx
```

### 4. Validar Deploy

```bash
# Verificar status dos containers
./deploy.sh staging status

# Ver logs em tempo real
./deploy.sh staging logs

# Testar aplicação
curl -I https://suite.franquiabv.xyz
```

## 📁 Estrutura de Deployment

```
deployment/
├── vps-config.env          # Configurações do VPS
├── deploy.sh               # Script principal de deployment
├── migrate-db.sh           # Script de migração de dados
└── README.md               # Este arquivo

Dockerfile                  # Build da aplicação
docker-compose.yml          # Orquestração de containers

nginx/
├── nginx.conf              # Configuração Nginx
├── conf.d/
│   └── vip-suite.conf      # Virtual host
└── certbot/                # Certificados SSL
    ├── conf/               # Let's Encrypt config
    └── www/                # ACME challenge
```

## 🐳 Docker Compose Services

### app
- **Imagem:** vip-suite (build local)
- **Porta:** 3000 (interno)
- **Variáveis:** Database, Redis, OAuth
- **Health Check:** /health endpoint
- **Restart:** unless-stopped

### nginx
- **Imagem:** nginx:alpine
- **Portas:** 80 (HTTP), 443 (HTTPS)
- **Função:** Reverse proxy, SSL termination
- **Config:** nginx/conf.d/vip-suite.conf

### certbot
- **Imagem:** certbot/certbot
- **Função:** Renovação automática de SSL
- **Agendamento:** A cada 12 horas

## 🔧 Configuração

### Variáveis de Ambiente

O arquivo `.env` é gerado automaticamente pelo `deploy.sh`:

```env
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=mysql://suite:D5mj476Bf07n@@127.0.0.1:3306/suite
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=suite
DB_USER=suite
DB_PASSWORD=D5mj476Bf07n@

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# App Config
VITE_APP_PUBLIC_URL=https://suite.franquiabv.xyz
LOG_LEVEL=info
```

### Nginx Configuration

O arquivo `nginx/conf.d/vip-suite.conf` configura:
- Redirect HTTP → HTTPS
- SSL com Let's Encrypt
- Reverse proxy para app:3000
- Cache de assets estáticos (30 dias)
- Rate limiting (10 req/s geral, 30 req/s API)
- Security headers (HSTS, X-Frame-Options, etc)

## 📊 Monitoramento

### Verificar Status

```bash
# Status dos containers
./deploy.sh staging status

# Logs da aplicação
./deploy.sh staging logs

# Logs Nginx
ssh bvip@201.22.86.97 "docker-compose logs nginx"

# Logs do banco
ssh bvip@201.22.86.97 "docker-compose logs app"
```

### Health Check

```bash
# Verificar saúde da aplicação
curl https://suite.franquiabv.xyz/health

# Verificar SSL
curl -I https://suite.franquiabv.xyz

# Verificar Nginx
ssh bvip@201.22.86.97 "docker-compose exec nginx nginx -t"
```

### Métricas

```bash
# Uso de CPU/Memória
ssh bvip@201.22.86.97 "docker stats"

# Espaço em disco
ssh bvip@201.22.86.97 "df -h"

# Conexões MySQL
ssh bvip@201.22.86.97 "mysql -u suite -pD5mj476Bf07n@ -e 'SHOW STATUS LIKE \"Threads%\";'"
```

## 🔄 Operações Comuns

### Reiniciar Aplicação

```bash
./deploy.sh staging restart
```

### Ver Logs em Tempo Real

```bash
./deploy.sh staging logs
```

### Rollback para Versão Anterior

```bash
# Listar snapshots disponíveis
./deploy.sh staging rollback

# Selecionar snapshot e restaurar
# O script irá restaurar e reiniciar containers
```

### Atualizar Aplicação

```bash
# 1. Fazer commit no Git
git add .
git commit -m "Update: ..."

# 2. Deploy
./deploy.sh staging deploy

# 3. Validar
./deploy.sh staging status
```

### Backup Manual

```bash
ssh bvip@201.22.86.97 << 'EOF'
cd /home/bvip/vip-suite
# Backup do banco
mysqldump -u suite -pD5mj476Bf07n@ suite > backups/suite_$(date +%Y%m%d_%H%M%S).sql

# Backup dos dados da aplicação
tar -czf backups/app_data_$(date +%Y%m%d_%H%M%S).tar.gz data/

# Backup da configuração
tar -czf backups/config_$(date +%Y%m%d_%H%M%S).tar.gz .env nginx/
EOF
```

## 🔐 Segurança

### SSL/TLS
- ✅ Certificado Let's Encrypt automático
- ✅ Renovação automática a cada 12 horas
- ✅ HSTS habilitado (31536000 segundos)
- ✅ TLS 1.2 e 1.3 apenas

### Headers de Segurança
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: no-referrer-when-downgrade
```

### Rate Limiting
- Geral: 10 req/s (burst 20)
- API: 30 req/s (burst 50)

### Firewall (Recomendado)

```bash
# Permitir SSH
sudo ufw allow 22/tcp

# Permitir HTTP
sudo ufw allow 80/tcp

# Permitir HTTPS
sudo ufw allow 443/tcp

# Bloquear tudo mais
sudo ufw default deny incoming
sudo ufw enable
```

## 🐛 Troubleshooting

### Aplicação não inicia

```bash
# Ver logs detalhados
./deploy.sh staging logs

# Verificar saúde
curl -v https://suite.franquiabv.xyz/health

# Reiniciar
./deploy.sh staging restart
```

### Erro de conexão com banco

```bash
# Verificar conectividade
ssh bvip@201.22.86.97 "mysql -u suite -pD5mj476Bf07n@ -e 'SELECT 1;'"

# Verificar pool de conexões
ssh bvip@201.22.86.97 "docker-compose logs app | grep -i 'connection\|pool'"
```

### SSL não funciona

```bash
# Verificar certificado
ssh bvip@201.22.86.97 "docker-compose exec certbot certbot certificates"

# Forçar renovação
ssh bvip@201.22.86.97 "docker-compose exec certbot certbot renew --force-renewal"

# Verificar Nginx
ssh bvip@201.22.86.97 "docker-compose exec nginx nginx -t"
```

### Nginx retorna 502 Bad Gateway

```bash
# Verificar se app está rodando
ssh bvip@201.22.86.97 "docker-compose ps"

# Ver logs do app
./deploy.sh staging logs

# Verificar porta
ssh bvip@201.22.86.97 "netstat -tlnp | grep 3000"
```

## 📈 Performance

### Cache em Memória
- Dashboard KPIs: 5 minutos
- Relatórios: 10 minutos
- Redis: Configurado para cache distribuído

### Otimizações Nginx
- ✅ Gzip compression (min 1KB)
- ✅ Cache de assets (30 dias)
- ✅ HTTP/2
- ✅ Connection pooling

### Otimizações MySQL
- ✅ Connection pool (min 2, max 10)
- ✅ Keep-alive habilitado
- ✅ Timeouts configurados (15s)

## 🔄 Migração Manus → VPS

Quando estiver pronto para substituir o deploy Manus:

1. **Validar staging por 1-2 semanas**
   - Testar todos os módulos
   - Validar performance
   - Coletar feedback

2. **Preparar cutover**
   ```bash
   # Fazer backup final do Manus
   # Sincronizar dados TiDB → MySQL
   ./migrate-db.sh
   
   # Deploy em produção
   ./deploy.sh production deploy
   ```

3. **Apontar domínio principal**
   - Atualizar DNS para suite.franquiabv.xyz
   - Manter Manus como fallback por 24h

4. **Monitorar**
   - Acompanhar logs
   - Validar métricas
   - Estar pronto para rollback

## 📞 Suporte

Para problemas ou dúvidas:

1. Verificar logs: `./deploy.sh staging logs`
2. Validar status: `./deploy.sh staging status`
3. Rollback se necessário: `./deploy.sh staging rollback`

## 📚 Referências

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Let's Encrypt](https://letsencrypt.org/)
- [MySQL Connection Pooling](https://dev.mysql.com/doc/)
- [Redis Documentation](https://redis.io/documentation)

---

**Última atualização:** 2026-06-30  
**Versão:** 1.0.0  
**Status:** Pronto para staging
