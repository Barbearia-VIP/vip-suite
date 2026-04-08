import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load env
const dotenv = require('dotenv');
dotenv.config();

const mysql = require('mysql2/promise');

// SSH tunnel setup
const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function main() {
  await ssh.connect({
    host: process.env.SSH_TUNNEL_HOST,
    port: Number(process.env.SSH_TUNNEL_PORT) || 22,
    username: process.env.SSH_TUNNEL_USER,
    password: process.env.SSH_TUNNEL_PASS,
  });

  // Forward local port 3308 to remote MySQL
  await new Promise((resolve, reject) => {
    ssh.connection.forwardOut('127.0.0.1', 3308, '127.0.0.1', 3306, (err, stream) => {
      if (err) reject(err);
      else resolve(stream);
    });
  }).catch(() => {});

  // Use the server's existing tunnel helper approach
  const conn = await mysql.createConnection({
    host: process.env.DB_EXT_HOST || '127.0.0.1',
    port: Number(process.env.DB_EXT_PORT) || 3306,
    user: process.env.DB_EXT_USER,
    password: process.env.DB_EXT_PASS,
    database: process.env.DB_EXT_NAME,
    connectTimeout: 15000,
  });

  for (const t of ['vendas', 'vendas_produtos', 'vendas_pagamentos', 'clientes', 'usuarios', 'produtos']) {
    const [rows] = await conn.execute('DESCRIBE ' + t);
    console.log('\n=== ' + t + ' ===');
    for (const r of rows) {
      console.log(`  ${r.Field.padEnd(30)} ${r.Type.padEnd(25)} NULL:${r.Null} KEY:${r.Key} DEFAULT:${r.Default}`);
    }
  }

  await conn.end();
  ssh.dispose();
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
