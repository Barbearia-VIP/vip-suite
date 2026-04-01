/**
 * backfill-it-tarefas.mjs
 * Cria tarefas retroativas no Kanban para ITs existentes que não têm tarefa vinculada.
 */
import { createConnection } from "mysql2/promise";

const conn = await createConnection(process.env.DATABASE_URL);

// Buscar todas as ITs que não têm tarefa vinculada
const [instrucoes] = await conn.execute(`
  SELECT i.id, i.orgId, i.unitId, i.titulo, i.responsavelNome
  FROM gt_instrucoes i
  WHERE NOT EXISTS (
    SELECT 1 FROM gt_tarefas t WHERE t.instrucaoId = i.id
  )
`);

console.log(`Encontradas ${instrucoes.length} ITs sem tarefa vinculada.`);

let criadas = 0;
for (const it of instrucoes) {
  const titulo = `IT: ${it.titulo}`;
  const descricao = `Instrução de Trabalho gerada por IA.\n\nResponsável: ${it.responsavelNome ?? "A definir"}\n\nAcesse Instruções de Trabalho para ver o plano detalhado.`;

  await conn.execute(
    `INSERT INTO gt_tarefas (orgId, unitId, titulo, descricao, responsavel, prioridade, status, instrucaoId, ordem)
     VALUES (?, ?, ?, ?, ?, 'media', 'pendente', ?, 0)`,
    [it.orgId, it.unitId, titulo, descricao, it.responsavelNome, it.id]
  );
  console.log(`  ✓ Tarefa criada para IT #${it.id}: ${titulo}`);
  criadas++;
}

await conn.end();
console.log(`\nConcluído: ${criadas} tarefa(s) criada(s).`);
