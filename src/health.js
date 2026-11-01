import http from 'node:http';
import { config } from './config.js';
import { getDatabaseStats } from './db.js';
import { logger } from './logger.js';

export function startHealthServer(getConnectionState) {
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz' && req.method === 'GET') {
      const state = getConnectionState();
      const healthy = state === 'open';
      res.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(JSON.stringify({ status: healthy ? 'ok' : 'degraded', whatsapp: state, uptimeSeconds: Math.floor(process.uptime()) }));
    }
    if (req.url === '/metrics' && req.method === 'GET') {
      if (!config.healthToken || req.headers.authorization !== `Bearer ${config.healthToken}`) {
        res.writeHead(401, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
      }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(JSON.stringify({ whatsapp: getConnectionState(), uptimeSeconds: Math.floor(process.uptime()), memory: process.memoryUsage(), database: getDatabaseStats() }));
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });
  server.listen(config.port, '0.0.0.0', () => logger.info({ port: config.port }, 'Health server listening'));
  server.on('error', error => logger.error({ err: error }, 'Health server error'));
  return server;
}
