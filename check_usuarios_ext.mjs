import { Client as SshClient } from 'ssh2';
import mysql from 'mysql2/promise';
import net from 'net';
import { config } from 'dotenv';
config({ path: '/home/ubuntu/vip-suite/.env' });

const SSH_HOST = process.env.SSH_TUNNEL_HOST;
const SSH_PORT = parseInt(process.env.SSH_TUNNEL_PORT || '22');
const SSH_USER = process.env.SSH_TUNNEL_USER;
const SSH_PASS = process.env.SSH_TUNNEL_PASS;
const DB_USER = process.env.DB_EXT_USER;
const DB_PASS = process.env.DB_EXT_PASS;
const DB_NAME = process.env.DB_EXT_NAME;
const LOCAL_PORT = 13401;

const ssh = new SshClient();
ssh.on('error', (e) => console.error('SSH error:', e.message));
ssh.on('ready', () => {
  const server = net.createServer((sock) => {
    ssh.forwardOut('127.0.0.1', LOCAL_PORT, '127.0.0.1', 3306, (err, stream) => {
      if (err) { sock.destroy(); return; }
      sock.pipe(stream).pipe(sock);
    });
  });
  server.listen(LOCAL_PORT, '127.0.0.1', async () => {
    try {
      const conn = await mysql.createConnection({
        host: '127.0.0.1', port: LOCAL_PORT,
        user: DB_USER, password: DB_PASS, database: DB_NAME,
      });
      
      // Ver todos os campos da tabela usuarios
      const [cols] = await conn.query('DESCRIBE usuarios');
      console.log('=== Campos da tabela usuarios ===');
      cols.forEach(c => console.log(' ', c.Field, '-', c.Type));
      
      // Ver um exemplo de barbeiro com todos os campos
      const [rows] = await conn.query('SELECT * FROM usuarios WHERE visivel_agenda != "nenhuma" LIMIT 2');
      console.log('\n=== Exemplo de barbeiros (todos os campos) ===');
      console.log(JSON.stringify(rows, null, 2));
      
      await conn.end();
    } catch(e) {
      console.error('DB error:', e.message);
    }
    server.close();
    ssh.end();
  });
}).connect({ host: SSH_HOST, port: SSH_PORT, username: SSH_USER, password: SSH_PASS });
