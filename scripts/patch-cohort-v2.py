#!/usr/bin/env python3
"""Patch cohort endpoint to add cohortHistorico and cohortPorBarbeiro."""
import re

with open("/home/ubuntu/vip-suite/server/routers/raioX.ts", "r") as f:
    content = f.read()

# 1) Add barbeiro_id to novosRows query
old_novos_select = """        SELECT sub.cliente as cliente_id, sub.primeiraVisita, DATE_FORMAT(sub.primeiraVisita, '%Y-%m') as mes,
          sub.ticketPrimeira
        FROM (
          SELECT v.cliente, MIN(DATE(v.data_criacao)) as primeiraVisita,
            (SELECT v2.total FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
             WHERE ${unitIn2} AND v2.cliente = v.cliente AND v2.comanda_temp=0
               AND v2.cancelado_motivo IS NULL AND v2.status!=0
             ORDER BY v2.data_criacao ASC LIMIT 1) as ticketPrimeira
          FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
          WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
            AND v.cliente IS NOT NULL AND v.cliente!=2
          GROUP BY v.cliente
          HAVING primeiraVisita >= '${dataIniStr}' AND primeiraVisita <= '${dataFimStr}'
        ) sub"""

new_novos_select = """        SELECT sub.cliente as cliente_id, sub.primeiraVisita, DATE_FORMAT(sub.primeiraVisita, '%Y-%m') as mes,
          sub.ticketPrimeira, sub.barbeiro_id, sub.barbeiro_nome
        FROM (
          SELECT v.cliente, MIN(DATE(v.data_criacao)) as primeiraVisita,
            (SELECT v2.total FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
             WHERE ${unitIn2} AND v2.cliente = v.cliente AND v2.comanda_temp=0
               AND v2.cancelado_motivo IS NULL AND v2.status!=0
             ORDER BY v2.data_criacao ASC LIMIT 1) as ticketPrimeira,
            (SELECT v3.usuario FROM vendas v3 WHERE v3.cliente = v.cliente AND v3.comanda_temp=0
               AND v3.cancelado_motivo IS NULL AND v3.status!=0
             ORDER BY v3.data_criacao ASC LIMIT 1) as barbeiro_id,
            (SELECT uu3.nome FROM vendas v3 JOIN usuarios uu3 ON v3.usuario = uu3.id
             WHERE v3.cliente = v.cliente AND v3.comanda_temp=0
               AND v3.cancelado_motivo IS NULL AND v3.status!=0
             ORDER BY v3.data_criacao ASC LIMIT 1) as barbeiro_nome
          FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
          WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
            AND v.cliente IS NOT NULL AND v.cliente!=2
          GROUP BY v.cliente
          HAVING primeiraVisita >= '${dataIniStr}' AND primeiraVisita <= '${dataFimStr}'
        ) sub"""

content = content.replace(old_novos_select, new_novos_select, 1)

# 2) Update novosRows type to include barbeiro_id and barbeiro_nome
old_type = """      const novosRows = await queryExternal<{
        cliente_id: number;
        primeiraVisita: string | Date;
        mes: string;
        ticketPrimeira: number;
      }>(`"""

new_type = """      const novosRows = await queryExternal<{
        cliente_id: number;
        primeiraVisita: string | Date;
        mes: string;
        ticketPrimeira: number;
        barbeiro_id: number | null;
        barbeiro_nome: string | null;
      }>(`"""

content = content.replace(old_type, new_type, 1)

# 3) Update early return to include new fields
old_early = "        return { cohortMensal: [], analiseNovos: null, distribuicao: null };\n      }\n      const clienteIds"
new_early = "        return { cohortMensal: [], analiseNovos: null, distribuicao: null, cohortHistorico: [], cohortPorBarbeiro: [] };\n      }\n      const clienteIds"
content = content.replace(old_early, new_early, 1)

# 4) Also fix the first early return (extIds.length === 0)
old_first_early = "        return { cohortMensal: [], analiseNovos: null, distribuicao: null };\n      }\n      const unitIn"
new_first_early = "        return { cohortMensal: [], analiseNovos: null, distribuicao: null, cohortHistorico: [], cohortPorBarbeiro: [] };\n      }\n      const unitIn"
content = content.replace(old_first_early, new_first_early, 1)

# 5) Add barbeiro_id to clientesMes map and clientesMes type
old_clientesMes_type = """      const clientesMes = new Map<string, Array<{
        clienteId: number; primeiraVisita: string; ticket: number;
        ret30: boolean; ret60: boolean; ret90: boolean;
        diasAte2a: number | null; totalVisitas: number;
      }>>();"""

new_clientesMes_type = """      const clientesMes = new Map<string, Array<{
        clienteId: number; primeiraVisita: string; ticket: number;
        ret30: boolean; ret60: boolean; ret90: boolean;
        diasAte2a: number | null; totalVisitas: number;
        barbeiroId: number | null; barbeiroNome: string | null;
      }>>();"""

content = content.replace(old_clientesMes_type, new_clientesMes_type, 1)

# 6) Add barbeiro fields when pushing to clientesMes
old_push = """          ret30, ret60, ret90, diasAte2a, totalVisitas,
        });"""

new_push = """          ret30, ret60, ret90, diasAte2a, totalVisitas,
          barbeiroId: n.barbeiro_id ?? null,
          barbeiroNome: n.barbeiro_nome ?? null,
        });"""

content = content.replace(old_push, new_push, 1)

# 7) Add cohortHistorico and cohortPorBarbeiro calculation before final return
old_return = "      return { cohortMensal, analiseNovos, distribuicao };\n    }),"

new_return = """      // ── 7) Cohort Histórico (grade M+1..M+6 por mês-calendário) ──
      // Para cada cohort (mês de 1ª visita), calcular % que voltou em M+1, M+2...M+6
      const cohortHistorico = Array.from(clientesMes.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, clientes]) => {
          const [ano, mesNum] = mes.split("-").map(Number);
          const novos = clientes.length;
          const colunas: Record<string, number | null> = {};
          for (let m = 1; m <= 6; m++) {
            // Mês-calendário M+m
            const targetAno = mesNum + m > 12 ? ano + Math.floor((mesNum + m - 1) / 12) : ano;
            const targetMes = ((mesNum + m - 1) % 12) + 1;
            const targetStr = `${targetAno}-${String(targetMes).padStart(2, "0")}`;
            // Verificar se esse mês já passou (comparar com dataFimStr)
            if (targetStr > dataFimStr.slice(0, 7)) {
              colunas[`m${m}`] = null; // ainda não disponível
            } else {
              const voltaram = clientes.filter(c => {
                const visitas = visitasMap.get(c.clienteId) || [];
                return visitas.some(v => {
                  if (v.data <= c.primeiraVisita) return false;
                  const vMes = v.data.slice(0, 7);
                  return vMes === targetStr;
                });
              }).length;
              colunas[`m${m}`] = novos > 0 ? Math.round(voltaram / novos * 1000) / 10 : 0;
            }
          }
          return { mes, novos, ...colunas };
        });

      // ── 8) Cohort Por Barbeiro ──
      const barbeiroMapCohort = new Map<number, {
        nome: string; novos: number;
        ret30: number; ret60: number; ret90: number;
        diasAte2aList: number[];
      }>();
      for (const c of Array.from(clientesMes.values()).flat()) {
        const bid = c.barbeiroId ?? -1;
        const bnome = c.barbeiroNome ?? "Sem barbeiro";
        if (!barbeiroMapCohort.has(bid)) {
          barbeiroMapCohort.set(bid, { nome: bnome, novos: 0, ret30: 0, ret60: 0, ret90: 0, diasAte2aList: [] });
        }
        const entry = barbeiroMapCohort.get(bid)!;
        entry.novos++;
        if (c.ret30) entry.ret30++;
        if (c.ret60) entry.ret60++;
        if (c.ret90) entry.ret90++;
        if (c.diasAte2a !== null) entry.diasAte2aList.push(c.diasAte2a);
      }
      const cohortPorBarbeiro = Array.from(barbeiroMapCohort.entries())
        .filter(([id]) => id !== -1)
        .map(([id, b]) => {
          const sorted = b.diasAte2aList.sort((a, z) => a - z);
          const mediana = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : null;
          return {
            barbeiroId: id,
            barbeiroNome: b.nome,
            novos: b.novos,
            ret30: b.ret30,
            pctRet30: b.novos > 0 ? Math.round(b.ret30 / b.novos * 1000) / 10 : 0,
            ret60: b.ret60,
            pctRet60: b.novos > 0 ? Math.round(b.ret60 / b.novos * 1000) / 10 : 0,
            ret90: b.ret90,
            pctRet90: b.novos > 0 ? Math.round(b.ret90 / b.novos * 1000) / 10 : 0,
            mediana2aVisita: mediana,
          };
        })
        .sort((a, b) => b.novos - a.novos);

      return { cohortMensal, analiseNovos, distribuicao, cohortHistorico, cohortPorBarbeiro };
    }),"""

content = content.replace(old_return, new_return, 1)

with open("/home/ubuntu/vip-suite/server/routers/raioX.ts", "w") as f:
    f.write(content)

print("Patch aplicado com sucesso!")
