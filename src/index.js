import { config } from './config.js';
import { logger } from './logger.js';
import { connectWhatsApp, stopWhatsApp, getSocket, getConnectionState } from './socket.js';
import { startScheduler } from './scheduler.js';
import { startHealthServer } from './health.js';

let stopScheduler;
let healthServer;

async function main() {
  logger.info({ botName: config.botName, prefix: config.prefix }, 'Starting IBK Nexus MD');
  healthServer = startHealthServer(getConnectionState);
  stopScheduler = startScheduler(getSocket);
  await connectWhatsApp();
}

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  stopScheduler?.();
  healthServer?.close();
  stopWhatsApp();
  setTimeout(() => process.exit(0), 500).unref();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', error => logger.error({ err: error }, 'Unhandled promise rejection'));
process.on('uncaughtException', error => {
  logger.fatal({ err: error }, 'Uncaught exception');
  shutdown('uncaughtException');
});

main().catch(error => {
  logger.fatal({ err: error }, 'Fatal startup error');
  process.exit(1);
});
