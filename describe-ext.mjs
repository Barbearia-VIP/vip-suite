// Usa o mesmo mecanismo do servidor para descrever as tabelas
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
dotenv.config({ path: '/home/ubuntu/vip-suite/.env' });

const { Client: SshClient } = require('ssh2');
const mysql = require('mysql2/promise');
const net = require('net');

const SSH_HOST = process.env.SSH_TUNNEL_HOST;
const SSH_PORT = parseInt(process.env.SSH_TUNNEL_PORT || '22');
const SSH_USER = process.env.SSH_TUNNEL_USER;
const SSH_PASS = process.env.SSH_TUNNEL_PASS;
const DB_USER = process.env.DB_EXT_USER;
const DB_PASS = process.env.DB_EXT_PASS;
const DB_NAME = process.env.DB_EXT_NAME;
const LOCAL_PORT = 13308;

const ssh = new SshClient();
ssh.on('ready', () => {
  const server = net.createServer(sock => {
    ssh.forwardOut('127.0.0.1', sock.localPort, '127.0.0.1', 3306, (err, stream) => {
      if (err) { sock.destroy(); return; }
      sock.pipe(stream); stream.pipe(sock);
    });
  });
  server.listen(LOCAL_PORT, '127.0.0.1', async () => {
    const conn = await mysql.createConnection({
      host: '127.0.0.1', port: LOCAL_PORT,
      user: DB_USER, password: DB_PASS, database: DB_NAME,
      ssl: { rejectUnauthorized: false }
    });
    for (const t of ['vendas','vendas_produtos','vendas_pagamentos','clientes','usuarios','produtos']) {
      const [rows] = await conn.execute('DESCRIBE ' + t);
      console.log('\n=== ' + t + ' ===');
      for (const r of rows) {
        console.log(`  ${String(r.Field).padEnd(30)} ${String(r.Type).padEnd(30)} NULL:${r.Null} KEY:${r.Key}`);
      }
    }
    await conn.end();
    server.close();
    ssh.end();
    process.exit(0);
  });
});
ssh.connect({ host: SSH_HOST, port: SSH_PORT, username: SSH_USER, password: SSH_PASS });
