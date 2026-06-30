# VIP Suite - Quick Start Deployment

Guia rápido para fazer deploy do VIP Suite no VPS em 5 passos.

## 📋 Informações do VPS

```
IP: 201.22.86.97
Usuário: bvip
Domínio: suite.franquiabv.xyz
Porta: 3098
Banco: suite (MySQL local)
Redis: localhost:6379
```

## ⚡ 5 Passos para Deploy

### Passo 1: Inicializar VPS (primeira vez apenas)

```bash
# Execute no seu computador
ssh bvip@201.22.86.97 'bash -s' < deployment/init-vps.sh

# O script irá:
# ✓ Atualizar sistema
# ✓ Instalar Docker, Docker Compose
# ✓ Criar diretórios
# ✓ Configurar firewall
# ✓ Agendar backups automáticos
```

### Passo 2: Migrar Dados (TiDB → MySQL)

```bash
# Execute no seu computador
cd deployment
./migrate-db.sh

# O script irá:
# ✓ Exportar dados do TiDB Cloud
# ✓ Criar backup local
# ✓ Importar para MySQL do VPS
# ✓ Validar integridade
```

### Passo 3: Deploy da Aplicação

```bash
# Execute no seu computador
./deploy.sh staging deploy

# O script irá:
# ✓ Copiar arquivos para VPS
# ✓ Construir imagem Docker
# ✓ Iniciar containers
# ✓ Configurar SSL (Let's Encrypt)
# ✓ Iniciar Nginx
```

### Passo 4: Validar Deploy

```bash
# Verificar status
./deploy.sh staging status

# Ver logs
./deploy.sh staging logs

# Testar aplicação
curl -I https://suite.franquiabv.xyz
```

### Passo 5: Acessar Aplicação

```
https://suite.franquiabv.xyz
```

## 🔧 Comandos Úteis

```bash
# Status dos containers
./deploy.sh staging status

# Ver logs em tempo real
./deploy.sh staging logs

# Reiniciar aplicação
./deploy.sh staging restart

# Rollback para versão anterior
./deploy.sh staging rollback

# Fazer novo deploy
./deploy.sh staging deploy
```

## 📊 Monitoramento

```bash
# Verificar saúde
curl https://suite.franquiabv.xyz/health

# Verificar SSL
curl -I https://suite.franquiabv.xyz

# Ver logs do app
ssh bvip@201.22.86.97 "cd ~/vip-suite && docker-compose logs app"

# Ver logs do Nginx
ssh bvip@201.22.86.97 "cd ~/vip-suite && docker-compose logs nginx"
```

## 🐛 Troubleshooting

### Erro: "Connection refused"
```bash
# Reiniciar containers
./deploy.sh staging restart

# Verificar status
./deploy.sh staging status
```

### Erro: "502 Bad Gateway"
```bash
# Ver logs da aplicação
./deploy.sh staging logs

# Verificar se app está rodando
ssh bvip@201.22.86.97 "docker-compose ps"
```

### Erro: "SSL certificate not found"
```bash
# Forçar renovação
ssh bvip@201.22.86.97 "docker-compose exec certbot certbot renew --force-renewal"

# Recarregar Nginx
ssh bvip@201.22.86.97 "docker-compose exec nginx nginx -s reload"
```

## 📈 Performance

Após deploy, você terá:

- ✅ **Aplicação:** Node.js + Express + React
- ✅ **Banco:** MySQL local (master-slave replication)
- ✅ **Cache:** Redis + In-memory LRU
- ✅ **Web Server:** Nginx com SSL
- ✅ **SSL:** Let's Encrypt automático
- ✅ **Backups:** Automáticos diários às 02:00

## 🔄 Migração Manus → VPS

Quando estiver pronto para substituir o deploy Manus:

1. **Validar staging por 1-2 semanas**
2. **Fazer backup final**
3. **Deploy em produção:** `./deploy.sh production deploy`
4. **Apontar domínio principal para VPS**
5. **Manter Manus como fallback por 24h**

## 📞 Suporte Rápido

| Problema | Solução |
|----------|---------|
| App não inicia | `./deploy.sh staging logs` |
| Nginx erro 502 | `./deploy.sh staging restart` |
| SSL não funciona | `ssh bvip@201.22.86.97 "docker-compose exec certbot certbot renew"` |
| Banco sem acesso | `ssh bvip@201.22.86.97 "mysql -u suite -pD5mj476Bf07n@ -e 'SELECT 1;'"` |
| Precisa rollback | `./deploy.sh staging rollback` |

## 📚 Documentação Completa

Para mais detalhes, veja: [DEPLOYMENT.md](./DEPLOYMENT.md)

---

**Status:** ✅ Pronto para staging  
**Última atualização:** 2026-06-30
