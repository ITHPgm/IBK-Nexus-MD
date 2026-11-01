import makeWASocket, { DisconnectReason, useMultiFileAuthState, Browsers } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import fs from 'node:fs';
import { config } from './config.js';
import { logger } from './logger.js';
import { handleIncomingMessage } from './handler.js';
import { handleGroupParticipants } from './plugins/group.js';

let socket = null;
let connectionState = 'starting';
let reconnectTimer = null;
let retryCount = 0;
let stopped = false;

export const getSocket = () => socket;
export const getConnectionState = () => connectionState;

export async function connectWhatsApp() {
  stopped = false;
  fs.mkdirSync(config.authDir, { recursive: true, mode: 0o700 });
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  const currentSocket = makeWASocket({
    auth: state,
    logger: logger.child({ component: 'baileys' }),
    browser: Browsers.ubuntu(config.botName),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    keepAliveIntervalMs: 25_000
  });

  socket = currentSocket;
  currentSocket.ev.on('creds.update', saveCreds);
  currentSocket.ev.on('connection.update', async update => {
    const { connection, lastDisconnect, qr } = update;
    if (qr && !config.pairingNumber) {
      logger.info('Scan this QR with WhatsApp > Linked devices > Link a device:');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'connecting') {
      connectionState = 'connecting';
      logger.info('Connecting to WhatsApp…');
    }
    if (connection === 'open') {
      connectionState = 'open';
      retryCount = 0;
      logger.info({ user: currentSocket.user?.id }, `${config.botName} connected`);
    }
    if (connection === 'close') {
      connectionState = 'close';
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      logger.warn({ statusCode, loggedOut }, 'WhatsApp connection closed');
      if (socket === currentSocket) socket = null;
      if (loggedOut) {
        logger.error('WhatsApp session logged out. Remove the auth directory and pair again when you are ready.');
        connectionState = 'logged_out';
        return;
      }
      scheduleReconnect();
    }
  });

  currentSocket.ev.on('messages.upsert', async event => {
    if (event.type !== 'notify') return;
    for (const message of event.messages) {
      try { await handleIncomingMessage(currentSocket, message); }
      catch (error) { logger.error({ err: error }, 'Incoming message handler failed'); }
    }
  });

  currentSocket.ev.on('group-participants.update', async update => {
    try { await handleGroupParticipants(currentSocket, update); }
    catch (error) { logger.error({ err: error }, 'Group participant event handler failed'); }
  });

  if (config.pairingNumber && !state.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await currentSocket.requestPairingCode(config.pairingNumber);
        logger.info(`WhatsApp pairing code: ${code}`);
        logger.info('Enter this code in WhatsApp > Linked devices > Link with phone number instead.');
      } catch (error) {
        logger.error({ err: error }, 'Could not generate pairing code');
      }
    }, 3000).unref();
  }
  return currentSocket;
}

function scheduleReconnect() {
  if (stopped || reconnectTimer) return;
  retryCount += 1;
  const delay = Math.min(60_000, 2_000 * (2 ** Math.min(retryCount - 1, 5)));
  logger.info({ retryCount, delay }, 'Scheduling WhatsApp reconnect');
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (stopped) return;
    try { await connectWhatsApp(); }
    catch (error) { logger.error({ err: error }, 'Reconnect attempt failed'); scheduleReconnect(); }
  }, delay);
  reconnectTimer.unref();
}

export function stopWhatsApp() {
  stopped = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  try { socket?.end(undefined); } catch { /* already closed */ }
  socket = null;
  connectionState = 'stopped';
}
