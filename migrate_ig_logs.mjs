import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL não encontrada. Execute com as env vars do projeto.');
  process.exit(1);
}

(async () => {
  const conn = await mysql.createConnection(DATABASE_URL);

  // Buscar todos os comment_reply dos logs
  const [logs] = await conn.execute(
    "SELECT id, unitId, message, metadata, createdAt FROM ig_activity_logs WHERE type='comment_reply' ORDER BY createdAt ASC"
  );

  console.log(`Encontrados ${logs.length} registros de comment_reply nos logs`);

  let inserted = 0;
  let skipped = 0;

  for (const log of logs) {
    const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;

    // Extrair authorName do message: 'Respondido @username: ...'
    const authorMatch = log.message?.match(/Respondido @([^:]+):/);
    const authorName = authorMatch ? authorMatch[1] : 'desconhecido';

    // Extrair commentText do message: 'Respondido @x: "texto..."'
    const textMatch = log.message?.match(/: "([^"]+)/);
    const commentText = textMatch ? textMatch[1] : log.message;

    const commentId = meta?.commentId ?? null;
    const postId = meta?.postId ?? null;
    const reply = meta?.reply ?? null;

    // Verificar se já existe na ig_approval_queue pelo commentId
    if (commentId) {
      const [existing] = await conn.execute(
        'SELECT id FROM ig_approval_queue WHERE commentId = ? LIMIT 1',
        [commentId]
      );
      if (existing.length > 0) {
        console.log(`  Pulando commentId ${commentId} (já existe)`);
        skipped++;
        continue;
      }
    }

    // Inserir na ig_approval_queue como auto_approved
    await conn.execute(
      `INSERT INTO ig_approval_queue (unitId, type, commentId, postId, authorName, commentText, suggestedReply, status, reviewedAt, createdAt)
       VALUES (?, 'comment', ?, ?, ?, ?, ?, 'auto_approved', ?, ?)`,
      [
        log.unitId,
        commentId,
        postId,
        authorName,
        commentText,
        reply,
        log.createdAt,
        log.createdAt,
      ]
    );
    console.log(`  ✓ Migrado: @${authorName} — "${(commentText || '').substring(0, 40)}..."`);
    inserted++;
  }

  console.log(`\nMigração concluída: ${inserted} inseridos, ${skipped} pulados (duplicatas)`);
  await conn.end();
})().catch(err => {
  console.error('Erro na migração:', err.message);
  process.exit(1);
});
