import { getSetting, isMuted, muteUser, audit } from '../db.js';
import { config } from '../config.js';

const linkPattern = /(?:https?:\/\/|www\.)\S+|\b(?:chat\.whatsapp\.com|wa\.me)\/\S+/i;
const floodBuckets = new Map();

export async function runModeration(sock, message, sender, jid, isAdmin) {
  if (!jid.endsWith('@g.us')) return false;
  if (isMuted(jid, sender) && !isAdmin) {
    try { await sock.sendMessage(jid, { delete: message.key }); } catch { /* bot may lack admin rights */ }
    return true;
  }

  if (getSetting(jid, 'antilink_enabled', false) && !isAdmin) {
    const body = message.message || {};
    const text = body.conversation || body.extendedTextMessage?.text || body.imageMessage?.caption || body.videoMessage?.caption || '';
    if (linkPattern.test(text)) {
      try { await sock.sendMessage(jid, { delete: message.key }); } catch { /* best effort */ }
      await sock.sendMessage(jid, { text: `@${sender.split('@')[0]}, links are restricted in this group.`, mentions: [sender] });
      audit(jid, sender, 'protection.link_removed');
      return true;
    }
  }

  if (getSetting(jid, 'antiflood_enabled', false) && !isAdmin) {
    const now = Date.now();
    const bucketKey = `${jid}:${sender}`;
    const previous = (floodBuckets.get(bucketKey) || []).filter(t => now - t < config.floodWindowMs);
    previous.push(now);
    floodBuckets.set(bucketKey, previous);
    if (previous.length > config.floodLimit) {
      floodBuckets.delete(bucketKey);
      muteUser(jid, sender, now + 30_000, 'Anti-flood cooldown');
      try { await sock.sendMessage(jid, { delete: message.key }); } catch { /* best effort */ }
      await sock.sendMessage(jid, { text: `@${sender.split('@')[0]} slow down. A 30-second anti-flood cooldown has been applied.`, mentions: [sender] });
      audit(jid, sender, 'protection.flood_cooldown');
      return true;
    }
  }
  return false;
}
