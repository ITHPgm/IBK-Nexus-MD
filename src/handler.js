import { getContentType, jidNormalizedUser } from '@whiskeysockets/baileys';
import { config } from './config.js';
import { commands, findCommand } from './registry.js';
import { getSetting, recordMessage, audit } from './db.js';
import { isOwnerJid, safeText } from './utils.js';
import { runModeration } from './plugins/moderation.js';
import { logger } from './logger.js';

const cooldowns = new Map();
const groupCache = new Map();
const seenMessages = new Map();

function getText(message) {
  const content = message.message || {};
  const type = getContentType(content);
  if (!type) return '';
  const value = content[type];
  if (typeof value === 'string') return value;
  return value?.text || value?.caption || content.conversation || content.extendedTextMessage?.text || '';
}

async function groupPermissions(sock, jid, sender) {
  const now = Date.now();
  let cached = groupCache.get(jid);
  if (!cached || now - cached.at > 15_000) {
    try {
      const metadata = await sock.groupMetadata(jid);
      const admins = new Set(metadata.participants.filter(p => p.admin).map(p => jidNormalizedUser(p.id)));
      const botId = jidNormalizedUser(sock.user?.id || '');
      cached = { at: now, admins, isBotAdmin: admins.has(botId), metadata };
      groupCache.set(jid, cached);
    } catch (error) {
      logger.warn({ err: error, jid }, 'Could not load group metadata');
      return { isAdmin: false, isBotAdmin: false, metadata: null };
    }
  }
  return { isAdmin: cached.admins.has(jidNormalizedUser(sender)), isBotAdmin: cached.isBotAdmin, metadata: cached.metadata };
}

export async function handleIncomingMessage(sock, message) {
  if (!message?.message || message.key?.fromMe) return;
  const jid = message.key.remoteJid;
  if (!jid || jid === 'status@broadcast' || jid.endsWith('@newsletter')) return;
  if (message.key?.id) {
    if (seenMessages.has(message.key.id)) return;
    seenMessages.set(message.key.id, Date.now());
    if (seenMessages.size > 1500) {
      const cutoff = Date.now() - 10 * 60_000;
      for (const [id, at] of seenMessages) if (at < cutoff) seenMessages.delete(id);
    }
  }

  const isGroup = jid.endsWith('@g.us');
  const sender = jidNormalizedUser(isGroup ? (message.key.participant || message.key.participantAlt || '') : jid);
  if (!sender) return;
  const isOwner = isOwnerJid(sender, config.owners);
  const text = safeText(getText(message), 7000).trim();
  if (config.autoRead) {
    try { await sock.readMessages([message.key]); } catch { /* read receipts are optional */ }
  }

  let permissions = { isAdmin: false, isBotAdmin: false, metadata: null };
  if (isGroup) permissions = await groupPermissions(sock, jid, sender);
  const { isAdmin, isBotAdmin, metadata } = permissions;

  if (isGroup) {
    try { if (await runModeration(sock, message, sender, jid, isAdmin)) return; }
    catch (error) { logger.error({ err: error }, 'Moderation pipeline failed'); }
  }
  recordMessage(jid, sender);
  if (!text) return;

  const prefix = isGroup ? getSetting(jid, 'prefix', config.prefix) : config.prefix;
  if (!text.startsWith(prefix)) return;
  const withoutPrefix = text.slice(prefix.length).trim();
  if (!withoutPrefix) return;
  const [name, ...args] = withoutPrefix.split(/\s+/);
  const command = findCommand(name);
  if (!command) return;
  if (command.hidden) return;
  if (command.groupOnly && !isGroup) return sock.sendMessage(jid, { text: 'This command can only be used in a group.' }, { quoted: message });
  if (command.ownerOnly && !isOwner) return sock.sendMessage(jid, { text: 'This command is reserved for the bot owner.' }, { quoted: message });
  if (command.adminOnly && !isOwner && (!isGroup || !isAdmin)) return sock.sendMessage(jid, { text: 'Only group administrators can use this command.' }, { quoted: message });
  if (command.botAdminOnly && !isBotAdmin) return sock.sendMessage(jid, { text: 'The bot needs group admin permission for this action.' }, { quoted: message });

  const cooldown = command.cooldown ?? config.commandCooldownMs;
  const cooldownKey = `${jid}:${sender}:${command.name}`;
  const last = cooldowns.get(cooldownKey) || 0;
  if (!isOwner && cooldown > 0 && Date.now() - last < cooldown) return;
  cooldowns.set(cooldownKey, Date.now());

  const ctx = {
    sock, message, jid, sender, text, args, prefix,
    isGroup, isOwner, isAdmin, isBotAdmin, metadata,
    command, commands, logger,
    reply: (replyText, options = {}) => sock.sendMessage(jid, { text: String(replyText), ...options }, { quoted: message })
  };

  try {
    logger.info({ command: command.name, jid, sender }, 'Command received');
    await command.handler(ctx);
    audit(jid, sender, 'command.executed', command.name);
  } catch (error) {
    logger.error({ err: error, command: command.name, jid }, 'Command failed');
    await sock.sendMessage(jid, { text: `The command failed: ${safeText(error.message || 'Unexpected error', 180)}. Check the bot logs for details.` }, { quoted: message }).catch(() => {});
  }
}
