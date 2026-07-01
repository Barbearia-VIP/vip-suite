# Instalação VIP Suite no VPS (com Nginx Nativo)

## 📋 Pré-requisitos

- VPS com Ubuntu 22.04 LTS
- Nginx já instalado e rodando
- MySQL rodando localmente (porta 3306)
- Redis rodando localmente (porta 6379)
- Docker e Docker Compose instalados
- Acesso SSH como root ou com sudo

## 🚀 Instalação Rápida

### 1. Clonar Repositório

```bash
cd /opt
git clone <seu-repositorio> vip-suite
cd vip-suite
```

### 2. Criar Estrutura de Diretórios

```bash
mkdir -p /home/bvip/vip-suite/{logs,data,nginx}
mkdir -p /var/log/vip-suite
chmod 755 /var/log/vip-suite
```

### 3. Configurar Variáveis de Ambiente

```bash
cd /home/bvip/vip-suite
cp /opt/vip-suite/.env.example .env 2>/dev/null || cat > .env << 'EOF'
NODE_ENV=production
PORT=3000

# Database (localhost)
DATABASE_URL=mysql://suite:D5mj476Bf07n@@127.0.0.1:3306/suite
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=suite
DB_USER=suite
DB_PASSWORD=D5mj476Bf07n@

# Redis (localhost)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# OAuth Manus (deixar em branco para staging)
VITE_APP_ID=
OAUTH_SERVER_URL=
VITE_OAUTH_PORTAL_URL=
JWT_SECRET=

# Manus APIs
BUILT_IN_FORGE_API_URL=
BUILT_IN_FORGE_API_KEY=
VITE_FRONTEND_FORGE_API_URL=
VITE_FRONTEND_FORGE_API_KEY=

# Owner
OWNER_NAME=
OWNER_OPEN_ID=

# App
VITE_APP_TITLE=VIP Suite
VITE_APP_PUBLIC_URL=https://suite.franquiabv.xyz
EOF
```

### 4. Copiar docker-compose.yml

```bash
cp /opt/vip-suite/docker-compose.yml /home/bvip/vip-suite/
```

### 5. Construir e Iniciar Container

```bash
cd /home/bvip/vip-suite
docker-compose build
docker-compose up -d
```

Verificar se está rodando:
```bash
docker-compose ps
docker-compose logs -f app
```

### 6. Configurar Nginx (Virtual Host)

#### a) Copiar configuração

```bash
sudo cp /opt/vip-suite/nginx/vip-suite.conf /etc/nginx/sites-available/vip-suite
```

#### b) Ativar site

```bash
sudo ln -s /etc/nginx/sites-available/vip-suite /etc/nginx/sites-enabled/vip-suite
```

#### c) Verificar sintaxe

```bash
sudo nginx -t
```

#### d) Recarregar Nginx

```bash
sudo systemctl reload nginx
```

### 7. Configurar SSL com Let's Encrypt

Se ainda não tem certificado:

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  -d suite.franquiabv.xyz \
  -m contato@barbeariavip.com.br \
  --agree-tos --non-interactive
```

Se já tem certificado, apenas verifique:

```bash
ls -la /etc/letsencrypt/live/suite.franquiabv.xyz/
```

### 8. Testar Acesso

```bash
# Verificar se app está rodando
curl -I http://127.0.0.1:3098/health

# Verificar se Nginx está redirecionando
curl -I https://suite.franquiabv.xyz
```

## 🔄 Gerenciamento

### Ver logs da aplicação

```bash
cd /home/bvip/vip-suite
docker-compose logs -f app
```

### Parar aplicação

```bash
cd /home/bvip/vip-suite
docker-compose down
```

### Reiniciar aplicação

```bash
cd /home/bvip/vip-suite
docker-compose restart app
```

### Reconstruir imagem (após atualizações)

```bash
cd /home/bvip/vip-suite
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Ver status dos containers

```bash
cd /home/bvip/vip-suite
docker-compose ps
```

## 📊 Monitoramento

### CPU e Memória

```bash
docker stats vip-suite-app
```

### Logs do Nginx

```bash
# Access logs
sudo tail -f /var/log/nginx/vip-suite-access.log

# Error logs
sudo tail -f /var/log/nginx/vip-suite-error.log
```

### Verificar porta 3098

```bash
sudo lsof -i :3098
```

## 🔐 Segurança

### Firewall (UFW)

```bash
# Permitir SSH
sudo ufw allow 22/tcp

# Permitir HTTP
sudo ufw allow 80/tcp

# Permitir HTTPS
sudo ufw allow 443/tcp

# Ativar firewall
sudo ufw enable
```

### Backup Automático

```bash
# Criar script de backup
sudo cat > /usr/local/bin/backup-vip-suite.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups/vip-suite"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup do banco de dados
mysqldump -u suite -pD5mj476Bf07n@ suite > $BACKUP_DIR/suite_$DATE.sql

# Manter últimos 7 dias
find $BACKUP_DIR -name "suite_*.sql" -mtime +7 -delete

echo "Backup realizado: $BACKUP_DIR/suite_$DATE.sql"
EOF

sudo chmod +x /usr/local/bin/backup-vip-suite.sh

# Agendar backup diário às 2h da manhã
sudo crontab -e
# Adicionar: 0 2 * * * /usr/local/bin/backup-vip-suite.sh
```

## 🐛 Troubleshooting

### Porta 3098 já está em uso

```bash
sudo lsof -i :3098
sudo kill -9 <PID>
```

### Erro de conexão com banco de dados

```bash
# Verificar se MySQL está rodando
sudo systemctl status mysql

# Testar conexão
mysql -u suite -pD5mj476Bf07n@ -h 127.0.0.1 -e "use suite; select 1;"
```

### Erro de conexão com Redis

```bash
# Verificar se Redis está rodando
sudo systemctl status redis-server

# Testar conexão
redis-cli ping
```

### Nginx não está redirecionando

```bash
# Verificar sintaxe
sudo nginx -t

# Recarregar
sudo systemctl reload nginx

# Ver logs
sudo tail -f /var/log/nginx/error.log
```

### Container não inicia

```bash
cd /home/bvip/vip-suite
docker-compose logs app
```

## 📝 Notas

- Aplicação roda na porta **3098** (localhost)
- Nginx redireciona **suite.franquiabv.xyz** → **127.0.0.1:3098**
- SSL automático com Let's Encrypt
- Logs em `/var/log/vip-suite/` e `/var/log/nginx/`
- Banco de dados: localhost (acesso local apenas)
- Redis: localhost (sem autenticação)

## ✅ Checklist Pós-Instalação

- [ ] Docker Compose rodando sem erros
- [ ] Aplicação acessível em http://127.0.0.1:3098
- [ ] Nginx redirecionando HTTPS corretamente
- [ ] SSL válido em https://suite.franquiabv.xyz
- [ ] Banco de dados conectando
- [ ] Redis conectando
- [ ] Logs sendo gerados
- [ ] Backup automático configurado
- [ ] Firewall configurado
