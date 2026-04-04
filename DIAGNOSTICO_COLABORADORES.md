# Diagnóstico Colaboradores - Joinville Março 2026

## Campos da tabela `vendas`
id, usuario, cliente, caixa, convenio, debito, valor_total, valor_recebido, valor_troco,
desconto_motivo, desconto_total, cancelado_motivo, venda_credito, data_criacao, data_alteracao,
comanda_temp, nps_notificacao, nps_respondido, msg_rel_sem_retorno, nps, status

**IMPORTANTE:** NÃO tem coluna `unidade` nem `colaborador`!
Filtro de unidade é feito via JOIN com `usuarios` (que tem `unidade`)

## Campos da tabela `usuarios`
id, unidade, grupo, nome, telefone, ..., status, data_criacao, data_alteracao
**TEM coluna `unidade`** ✓

## hasColaborador: false
A tabela `vendas` NÃO tem campo `colaborador` separado.
O campo `usuario` é o único identificador do barbeiro.

## Usuários da unidade 29 (Joinville) - 36 usuários
- id:2163 Afonso_Rodrigues
- id:2299 Allan_Ferreira
- id:1954 Andrade_Moraes
- id:849 Ariana
- id:657 Barbearia Vip Joinville (conta da unidade)
- id:669 Colaborador Caixa
- id:778 Daniel_Marcelino
- id:656 Danilo Bonin
- id:2399 Douglas_Cavalcante
- id:1552 Eduardo Mateus de Oliveira
- id:1850 Ferreira_Daniel
- id:921 Gabriela Maiochi
- id:2157 Gonzalo_Sosa
- id:1652 Gustavo_Lapo
- id:1450 Jhonatan Lemes
- id:2445 João_Flavio
- id:1262 Jonatas_Adiel
- id:1054 Juliana Pezzini
- id:1617 Kelvin_Talbot
- id:655 Leandro_Delucca
- id:1095 Leandro_Moura
- id:1687 Lester_Monteiro
- id:623 Lucas
- id:1475 Lucas_Aranha
- id:1094 Marcos Brito
- id:2113 Marcos_Ferreira
- id:699 Mariana Pieri
- id:2255 Mateo Alvarez
- id:1952 Pablo Enrico Vaz de Brito Xavier
- id:1098 Pascual Longardi
- id:1307 Rogerio_Vaz
- id:678 Suzy
- id:2254 Teste
- id:1152 Vagner Soares
- id:654 Weslley Maklouber
- id:900 Wuesley_Bileski

## porUsuario (vendas por usuario em março)
- Gabriela Maiochi (921): 569 vendas
- Pablo Enrico (1952): 381 vendas
- Colaborador Caixa (669): 24 vendas
- Lucas (623): 1 venda

**PROBLEMA IDENTIFICADO:** Apenas 4 usuários aparecem com vendas!
Wuesley_Bileski (id:900) tem 231 atendimentos na referência mas NÃO aparece no porUsuario!

## Referência Wuesley_Bileski (id:900)
- Faturamento: R$ 19.796,00
- Atendimentos: 231
- Ticket Médio: R$ 85,70
- Faturamento/dia: R$ 791,84
- Serviços: 348
- Extras (qtd): 44
- Extras (R$): R$ 1.494,00
- Clientes: 182
- Novos Clientes: 18
- Dias trabalhados: 25

## HIPÓTESE
As vendas do Wuesley podem estar registradas com `usuario` de outra unidade/conta.
Ou o campo `usuario` nas vendas não é o barbeiro que atendeu, mas sim quem registrou.
A Gabriela (921) tem 569 vendas mas a referência mostra ~231 para Wuesley e ~218 para Rogerio.
Isso sugere que a Gabriela pode ser a recepcionista/caixa que registra todas as vendas.

## SOLUÇÃO PROVÁVEL
Verificar a tabela `vendas_produtos` - ela pode ter um campo `usuario` ou `colaborador`
que identifica o barbeiro que realizou cada serviço, diferente do `usuario` da venda.
