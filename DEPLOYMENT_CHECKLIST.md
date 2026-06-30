# VIP Suite - Deployment Checklist

Checklist completo antes de fazer deploy em staging e produção.

## ✅ Pré-Deployment (Local)

- [ ] Código compilado sem erros: `pnpm run build`
- [ ] Testes passando: `pnpm test`
- [ ] Linting OK: `pnpm run lint`
- [ ] Variáveis de ambiente configuradas
- [ ] Arquivo `.env` não commitado
- [ ] Dependências atualizadas: `pnpm install`
- [ ] Git status limpo: `git status`
- [ ] Último commit com mensagem descritiva

## ✅ VPS Preparado

- [ ] SSH configurado sem senha (chave pública)
- [ ] Usuário `bvip` criado
- [ ] Docker instalado
- [ ] Docker Compose instalado
- [ ] MySQL 8.0+ instalado
- [ ] Banco `suite` criado
- [ ] Redis instalado e rodando
- [ ] Firewall configurado (22, 80, 443)
- [ ] Domínio `suite.franquiabv.xyz` apontando para VPS

## ✅ Staging Deployment

### Inicialização (primeira vez)

- [ ] Executar: `ssh bvip@201.22.86.97 'bash -s' < deployment/init-vps.sh`
- [ ] Validar saída do script
- [ ] Verificar diretórios criados

### Migração de Dados

- [ ] Executar: `./deployment/migrate-db.sh`
- [ ] Validar número de tabelas
- [ ] Verificar integridade dos dados
- [ ] Backup local criado

### Deploy

- [ ] Executar: `./deployment/deploy.sh staging deploy`
- [ ] Validar saída do script
- [ ] Verificar containers rodando: `./deployment/deploy.sh staging status`
- [ ] Verificar logs: `./deployment/deploy.sh staging logs`

### Validação

- [ ] Acessar: `https://suite.franquiabv.xyz`
- [ ] Health check: `curl https://suite.franquiabv.xyz/health`
- [ ] SSL válido: `curl -I https://suite.franquiabv.xyz`
- [ ] Login funciona
- [ ] Dashboard carrega
- [ ] Data VIP funciona
- [ ] Câmera IP funciona
- [ ] Capturas salvam
- [ ] Relatórios geram

## ✅ Testes em Staging (1-2 semanas)

### Funcionalidades

- [ ] Dashboard principal
- [ ] Data VIP com comparações
- [ ] Gestão Total
- [ ] VIP Cam com face detection
- [ ] Reputação
- [ ] Relatórios automáticos
- [ ] Notificações

### Performance

- [ ] Dashboard carrega em < 2s
- [ ] Relatórios em < 5s
- [ ] Câmera sem lag
- [ ] Cache funcionando (Redis)
- [ ] Conexão com banco estável

### Segurança

- [ ] SSL válido
- [ ] Headers de segurança presentes
- [ ] Rate limiting funciona
- [ ] Sem erros de CORS
- [ ] Sem dados sensíveis em logs

### Monitoramento

- [ ] Logs centralizados
- [ ] Health check respondendo
- [ ] Backup automático funcionando
- [ ] Métricas sendo coletadas

## ✅ Antes de Migração Manus → VPS

### Backup

- [ ] Backup completo do TiDB Cloud
- [ ] Backup completo do MySQL local
- [ ] Backup da configuração
- [ ] Backup dos dados da aplicação

### Comunicação

- [ ] Informar stakeholders
- [ ] Definir janela de manutenção
- [ ] Preparar rollback plan
- [ ] Ter suporte disponível

### Validação Final

- [ ] Todos os testes passando
- [ ] Performance validada
- [ ] Segurança auditada
- [ ] Documentação atualizada

## ✅ Production Deployment

### Pré-Deploy

- [ ] Fazer último backup Manus
- [ ] Sincronizar dados TiDB → MySQL
- [ ] Validar integridade
- [ ] Comunicar manutenção

### Deploy

- [ ] Executar: `./deployment/deploy.sh production deploy`
- [ ] Validar saída
- [ ] Verificar status
- [ ] Testar funcionalidades

### Pós-Deploy

- [ ] Apontar domínio principal para VPS
- [ ] Validar acesso via domínio principal
- [ ] Manter Manus como fallback por 24h
- [ ] Monitorar logs
- [ ] Coletar feedback

### Rollback (se necessário)

- [ ] Executar: `./deployment/deploy.sh production rollback`
- [ ] Apontar domínio de volta para Manus
- [ ] Validar funcionamento
- [ ] Investigar causa do problema

## ✅ Pós-Deployment

### Monitoramento Contínuo

- [ ] Verificar logs diariamente
- [ ] Monitorar performance
- [ ] Validar backups
- [ ] Atualizar patches de segurança

### Manutenção

- [ ] Revisar logs de erro
- [ ] Otimizar queries lentas
- [ ] Atualizar dependências
- [ ] Fazer testes de carga

### Documentação

- [ ] Atualizar runbooks
- [ ] Documentar problemas encontrados
- [ ] Criar guias de troubleshooting
- [ ] Treinar equipe

## 🔄 Checklist de Rollback

Se algo der errado:

- [ ] Executar: `./deployment/deploy.sh staging rollback`
- [ ] Selecionar snapshot anterior
- [ ] Validar restauração
- [ ] Testar funcionalidades
- [ ] Investigar causa do problema
- [ ] Corrigir código
- [ ] Fazer novo deploy

## 📞 Contatos de Emergência

| Função | Contato |
|--------|---------|
| DevOps | - |
| DBA | - |
| Suporte | - |

## 📝 Notas

```
[Espaço para anotações durante deployment]
```

---

**Versão:** 1.0.0  
**Última atualização:** 2026-06-30  
**Status:** Pronto para staging
