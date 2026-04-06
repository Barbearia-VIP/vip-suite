#!/usr/bin/env python3
"""Corrige o endpoint cohort no raioX.ts adicionando filtro de colaboradorId."""
import re

with open("/home/ubuntu/vip-suite/server/routers/raioX.ts", "r") as f:
    content = f.read()

# 1) Corrigir o arquivo corrompido — restaurar a estrutura do endpoint cohort
# O problema: a edição anterior misturou os blocos. Vamos reconstruir do zero
# usando regex para encontrar e substituir a seção corrompida.

# Padrão para encontrar o início corrompido do endpoint cohort
old_cohort_start = r"""  // ── Cohort ───────────────────────────────────────────────────────────────────
  cohort: protectedProcedure
    \.input\(baseInput\.extend\(\{ colaboradorId: z\.number\(\)\.optional\(\) \}\)\)
    \.query\(async \(\{ ctx, input \}\) => \{
      const \{ extIds \} = await resolveExternalIds\(
        ctx\.user\.id, ctx\.user\.role, input\.orgId, input\.unitId
            // Filtro de colaborador em Node\.js \(sem query extra ao banco\)
      const novosRowsFiltrados = input\.colaboradorId
        \? novosRows\.filter\(r => r\.barbeiro_id === input\.colaboradorId\)
        : novosRows;
      if \(novosRowsFiltrados\.length === 0\) \{
        return \{ cohortMensal: \[\], analiseNovos: null, distribuicao: null, cohortHistorico: \[\], cohortPorBarbeiro: \[\] \};
      \}
      const clienteIds = novosRowsFiltrados\.map\(r => r\.cliente_id\);\{extIds\[0\]\}` : `uu\.unidade IN \(\$\{extIds\.join\(","\)\}\)`;
      const unitIn2 = extIds\.length === 1 \? `uu2\.unidade = \$\{extIds\[0\]\}` : `uu2\.unidade IN \(\$\{extIds\.join\(","\)\}\)`;"""

new_cohort_start = """  // ── Cohort ───────────────────────────────────────────────────────────────────
  cohort: protectedProcedure
    .input(baseInput.extend({ colaboradorId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );
      if (extIds.length === 0) {
        return { cohortMensal: [], analiseNovos: null, distribuicao: null, cohortHistorico: [], cohortPorBarbeiro: [] };
      }
      const unitIn = extIds.length === 1 ? `uu.unidade = ${extIds[0]}` : `uu.unidade IN (${extIds.join(",")})`;
      const unitIn2 = extIds.length === 1 ? `uu2.unidade = ${extIds[0]}` : `uu2.unidade IN (${extIds.join(",")})`;"""

result = re.sub(old_cohort_start, new_cohort_start, content, flags=re.DOTALL)

if result == content:
    print("WARN: regex não encontrou o padrão corrompido. Tentando abordagem por linha...")
    # Abordagem por linha: encontrar e reconstruir as linhas 1429-1443
    lines = content.split('\n')
    
    # Encontrar a linha do cohort
    cohort_start_idx = None
    for i, line in enumerate(lines):
        if '// ── Cohort ─' in line:
            cohort_start_idx = i
            break
    
    if cohort_start_idx is None:
        print("ERROR: não encontrou o início do cohort")
        exit(1)
    
    print(f"Encontrou cohort na linha {cohort_start_idx + 1}")
    print("Linhas ao redor:")
    for i in range(cohort_start_idx, min(cohort_start_idx + 20, len(lines))):
        print(f"  {i+1}: {lines[i]}")
    
    # Reconstruir as primeiras linhas do endpoint cohort
    new_lines = lines[:cohort_start_idx] + [
        "  // \u2500\u2500 Cohort \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
        "  cohort: protectedProcedure",
        "    .input(baseInput.extend({ colaboradorId: z.number().optional() }))",
        "    .query(async ({ ctx, input }) => {",
        "      const { extIds } = await resolveExternalIds(",
        "        ctx.user.id, ctx.user.role, input.orgId, input.unitId",
        "      );",
    ]
    
    # Encontrar onde o código continua após a parte corrompida
    # Procurar pela linha com "if (extIds.length === 0)" ou "const unitIn"
    resume_idx = None
    for i in range(cohort_start_idx + 1, min(cohort_start_idx + 25, len(lines))):
        if 'const unitIn =' in lines[i] or 'const unitIn=' in lines[i]:
            resume_idx = i
            break
    
    if resume_idx is None:
        print("ERROR: não encontrou onde retomar")
        exit(1)
    
    print(f"Retomando na linha {resume_idx + 1}: {lines[resume_idx]}")
    
    # Adicionar o bloco de retorno vazio e o unitIn
    new_lines += [
        "      if (extIds.length === 0) {",
        "        return { cohortMensal: [], analiseNovos: null, distribuicao: null, cohortHistorico: [], cohortPorBarbeiro: [] };",
        "      }",
    ] + lines[resume_idx:]
    
    result = '\n'.join(new_lines)
    print(f"Arquivo reconstruído: {len(lines)} → {len(new_lines)} linhas")
else:
    print("OK: regex encontrou e substituiu o padrão corrompido")

# 2) Agora adicionar o filtro de colaborador após novosRows (se não existir)
if 'novosRowsFiltrados' not in result:
    old_no_filter = "      if (novosRows.length === 0) {\n        return { cohortMensal: [], analiseNovos: null, distribuicao: null, cohortHistorico: [], cohortPorBarbeiro: [] };\n      }\n      const clienteIds = novosRows.map(r => r.cliente_id);"
    new_with_filter = """      // Filtro de colaborador em Node.js (sem query extra ao banco)
      const novosRowsFiltrados = input.colaboradorId
        ? novosRows.filter(r => r.barbeiro_id === input.colaboradorId)
        : novosRows;
      if (novosRowsFiltrados.length === 0) {
        return { cohortMensal: [], analiseNovos: null, distribuicao: null, cohortHistorico: [], cohortPorBarbeiro: [] };
      }
      const clienteIds = novosRowsFiltrados.map(r => r.cliente_id);"""
    
    if old_no_filter in result:
        result = result.replace(old_no_filter, new_with_filter, 1)
        print("OK: adicionou filtro de colaborador após novosRows")
    else:
        print("WARN: não encontrou o bloco novosRows para adicionar filtro")

# 3) Substituir referências a novosRows por novosRowsFiltrados (apenas no loop e cálculos)
if 'novosRowsFiltrados' in result:
    result = result.replace(
        "      for (const n of novosRows) {",
        "      for (const n of novosRowsFiltrados) {",
        1
    )
    result = result.replace(
        "      const todosNovos = novosRows.length;",
        "      const todosNovos = novosRowsFiltrados.length;",
        1
    )
    print("OK: substituiu referências novosRows → novosRowsFiltrados")

with open("/home/ubuntu/vip-suite/server/routers/raioX.ts", "w") as f:
    f.write(result)

print("Arquivo salvo com sucesso!")
