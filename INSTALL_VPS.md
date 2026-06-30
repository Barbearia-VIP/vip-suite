# VIP Suite - Guia de Instalação no VPS

## 📋 Pré-requisitos

- VPS com Ubuntu 22.04 LTS
- Acesso SSH com privilégios de root
- Domínio apontado para o IP do VPS
- Banco de dados MySQL já existente no servidor

## 🚀 Instalação Rápida (5 minutos)

### 1. Conectar ao VPS

```bash
ssh root@201.22.86.97
# ou
ssh bvip@201.22.86.97
sudo su -
```

### 2. Clonar o Repositório

```bash
cd /opt
git clone <seu-repositorio> vip-suite
cd vip-suite
```

### 3. Executar Script de Instalação

```bash
sudo bash deployment/install-vps.sh
```

Este script irá:
- ✅ Atualizar o sistema
- ✅ Instalar Docker e Docker Compose
- ✅ Instalar Node.js e pnpm
- ✅ Criar estrutura de diretórios
- ✅ Configurar firewall
- ✅ Criar scripts de backup e monitoramento
- ✅ Configurar cron job para backups automáticos

### 4. Configurar Variáveis de Ambiente

```bash
nano /opt/vip-suite/.env
```

Editar os seguintes valores:

```env
# Manus OAuth
VITE_APP_ID=seu_app_id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://login.manus.im

# Owner Info
OWNER_OPEN_ID=seu_owner_id
OWNER_NAME=Barbearia VIP

# Manus APIs
BUILT_IN_FORGE_API_KEY=sua_chave_api
VITE_FRONTEND_FORGE_API_KEY=sua_chave_frontend

# App
VITE_APP_TITLE=VIP Suite
VITE_APP_PUBLIC_URL=https://suite.franquiabv.xyz
```

### 5. Iniciar a Aplicação

```bash
cd /opt/vip-suite
docker-compose -f docker-compose.prod.yml up -d
```

### 6. Verificar Status

```bash
bash deployment/manage.sh status
```

## 📊 Gerenciamento da Aplicação

### Iniciar

```bash
bash /opt/vip-suite/deployment/manage.sh start
```

### Parar

```bash
bash /opt/vip-suite/deployment/manage.sh stop
```

### Reiniciar

```bash
bash /opt/vip-suite/deployment/manage.sh restart
```

### Ver Logs

```bash
bash /opt/vip-suite/deployment/manage.sh logs
```

### Ver Status

```bash
bash /opt/vip-suite/deployment/manage.sh status
```

### Fazer Backup

```bash
bash /opt/vip-suite/deployment/manage.sh backup
```

### Restaurar Backup

```bash
bash /opt/vip-suite/deployment/manage.sh restore /opt/vip-suite/backups/suite_20260630_104500.sql.gz
```

## 🔒 Configurar SSL com Let's Encrypt

```bash
# Parar nginx temporariamente
docker-compose -f docker-compose.prod.yml stop nginx

# Gerar certificado
certbot certonly --standalone -d suite.franquiabv.xyz -m contato@barbeariabv.com.br

# Copiar certificados
cp /etc/letsencrypt/live/suite.franquiabv.xyz/fullchain.pem /opt/vip-suite/nginx/ssl/
cp /etc/letsencrypt/live/suite.franquiabv.xyz/privkey.pem /opt/vip-suite/nginx/ssl/

# Iniciar nginx novamente
docker-compose -f docker-compose.prod.yml up -d nginx

# Renovação automática (cron)
certbot renew --quiet
```

## 📁 Estrutura de Diretórios

```
/opt/vip-suite/
├── docker-compose.prod.yml    # Configuração Docker
├── Dockerfile                 # Build da aplicação
├── .env                        # Variáveis de ambiente
├── nginx/
│   ├── nginx.conf             # Configuração Nginx
│   ├── conf.d/                # Virtual hosts
│   └── ssl/                   # Certificados SSL
├── deployment/
│   ├── install-vps.sh         # Script de instalação
│   ├── manage.sh              # Script de gerenciamento
│   ├── backup.sh              # Script de backup
│   └── monitor.sh             # Script de monitoramento
├── logs/                      # Logs da aplicação
├── backups/                   # Backups do banco
└── mysql-init/                # Scripts de inicialização MySQL
```

## 🔧 Troubleshooting

### Aplicação não inicia

```bash
# Ver logs
docker logs vip-suite-app

# Verificar se porta está em uso
netstat -tulpn | grep 3098

# Reiniciar containers
docker-compose -f docker-compose.prod.yml restart
```

### Banco de dados não conecta

```bash
# Verificar status do MySQL
docker exec vip-suite-mysql mysqladmin ping -h localhost -u suite -pD5mj476Bf07n@

# Ver logs do MySQL
docker logs vip-suite-mysql
```

### Redis não responde

```bash
# Verificar status do Redis
docker exec vip-suite-redis redis-cli ping

# Ver logs do Redis
docker logs vip-suite-redis
```

### Liberar espaço em disco

```bash
# Remover containers parados
docker container prune -f

# Remover imagens não utilizadas
docker image prune -f

# Remover volumes não utilizados
docker volume prune -f
```

## 📈 Monitoramento

### Ver uso de recursos

```bash
docker stats vip-suite-app vip-suite-mysql vip-suite-redis
```

### Acessar página de status

Abra no navegador: `https://suite.franquiabv.xyz/status`

### Ver backups

```bash
ls -lh /opt/vip-suite/backups/
```

## 🔄 Atualizações

### Atualizar código

```bash
cd /opt/vip-suite
git pull origin main
docker-compose -f docker-compose.prod.yml up -d --build
```

### Atualizar dependências

```bash
cd /opt/vip-suite
pnpm install
docker-compose -f docker-compose.prod.yml up -d --build
```

## 📝 Backups Automáticos

Backups são executados automaticamente todos os dias às 2h da manhã.

Localização: `/opt/vip-suite/backups/`

Retenção: Últimos 7 dias

Para alterar horário, editar crontab:

```bash
crontab -e
```

## 🚨 Alertas Importantes

1. **Alterar senhas padrão** no arquivo `.env`
2. **Fazer backup antes de atualizações** importantes
3. **Monitorar uso de disco** regularmente
4. **Revisar logs** periodicamente
5. **Testar restauração de backups** regularmente

## 📞 Suporte

Para problemas ou dúvidas:
- Verificar logs: `bash /opt/vip-suite/deployment/manage.sh logs`
- Acessar página de status: `https://suite.franquiabv.xyz/status`
- Consultar documentação: `/opt/vip-suite/DEPLOYMENT.md`

---

**Última atualização:** Junho 2026
**Versão:** 1.0
