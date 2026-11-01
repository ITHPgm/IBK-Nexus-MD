import { jidNormalizedUser } from '@whiskeysockets/baileys';

export function digitsFromJid(jid = '') {
  return String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
}

export function isOwnerJid(jid, owners = []) {
  const digits = digitsFromJid(jid);
  return owners.some(owner => digitsFromJid(owner) === digits);
}

export function getMentionedJids(message) {
  const ctx = message?.message?.extendedTextMessage?.contextInfo
    || message?.message?.imageMessage?.contextInfo
    || message?.message?.videoMessage?.contextInfo;
  return ctx?.mentionedJid || [];
}

export function getQuotedPayload(message) {
  const content = message?.message || {};
  const type = Object.keys(content).find(key => content[key]?.contextInfo?.quotedMessage);
  const context = type ? content[type].contextInfo : null;
  if (!context?.quotedMessage) return null;
  return {
    key: {
      remoteJid: message.key.remoteJid,
      id: context.stanzaId,
      participant: context.participant,
      fromMe: false
    },
    message: context.quotedMessage
  };
}

export function parseDuration(input = '') {
  const match = String(input).trim().match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const factor = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return amount > 0 ? amount * factor : null;
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : '', `${s}s`].filter(Boolean).join(' ');
}

export function safeText(value, max = 1000) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);
}
