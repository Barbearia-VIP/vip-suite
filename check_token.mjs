import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/vip-suite/.env' });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Verificar igConfig
const [rows] = await conn.execute('SELECT unitId, LEFT(accessToken, 30) as tokenStart, LENGTH(accessToken) as tokenLen, instagramUserId FROM ig_config LIMIT 10');
console.log('igConfig:', JSON.stringify(rows, null, 2));

// Verificar module_configs para auto_instagram
const [rows2] = await conn.execute("SELECT unitId, module, JSON_EXTRACT(config, '$.instagramToken') as token_start, LENGTH(JSON_EXTRACT(config, '$.instagramToken')) as token_len FROM module_configs WHERE module = 'auto_instagram' LIMIT 10");
console.log('module_configs:', JSON.stringify(rows2, null, 2));

await conn.end();
