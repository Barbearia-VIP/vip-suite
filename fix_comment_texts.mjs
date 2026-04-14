import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL não encontrada.');
  process.exit(1);
}

(async () => {
  const conn = await mysql.createConnection(DATABASE_URL);

  // Buscar token de acesso da unidade 1
  const [configs] = await conn.execute(
    'SELECT accessToken FROM ig_config WHERE unitId = 1 LIMIT 1'
  );
  if (!configs.length) {
    console.error('Configuração do Instagram não encontrada.');
    process.exit(1);
  }
  const accessToken = configs[0].accessToken;

  // Buscar todos os registros com texto truncado (terminam em "...")
  const [rows] = await conn.execute(
    "SELECT id, commentId, commentText FROM ig_approval_queue WHERE commentText LIKE '%...' AND commentId IS NOT NULL"
  );

  console.log(`Encontrados ${rows.length} registros com texto truncado`);

  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      // Buscar texto completo via Meta Graph API
      const url = `https://graph.facebook.com/v19.0/${row.commentId}?fields=text,username,timestamp&access_token=${accessToken}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        console.log(`  ✗ commentId ${row.commentId}: ${data.error.message}`);
        failed++;
        continue;
      }

      const fullText = data.text || row.commentText;
      const username = data.username || null;

      // Atualizar o registro com o texto completo
      await conn.execute(
        'UPDATE ig_approval_queue SET commentText = ?, authorName = COALESCE(?, authorName) WHERE id = ?',
        [fullText, username, row.id]
      );

      console.log(`  ✓ id=${row.id} @${username || '?'}: "${fullText.substring(0, 60)}${fullText.length > 60 ? '...' : ''}"`);
      updated++;

      // Pequeno delay para não sobrecarregar a API
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.log(`  ✗ id=${row.id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nConcluído: ${updated} atualizados, ${failed} falhas`);
  await conn.end();
})().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
