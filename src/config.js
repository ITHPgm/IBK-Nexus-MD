import 'dotenv/config';
import path from 'node:path';

const numberList = (value = '') => value.split(',').map(v => v.trim()).filter(Boolean);
const int = (value, fallback, min = 1, max = 1_000_000) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export const config = Object.freeze({
  botName: process.env.BOT_NAME?.trim() || 'IBK Nexus MD',
  prefix: process.env.PREFIX?.trim() || '.',
  owners: numberList(process.env.OWNER_NUMBERS),
  pairingNumber: (process.env.PAIRING_NUMBER || '').replace(/\D/g, ''),
  authDir: path.resolve(process.env.AUTH_DIR || './auth'),
  databasePath: path.resolve(process.env.DATABASE_PATH || './data/nexus.sqlite'),
  port: int(process.env.PORT, 3000, 1, 65535),
  logLevel: process.env.LOG_LEVEL || 'info',
  autoRead: process.env.AUTO_READ === 'true',
  floodLimit: int(process.env.FLOOD_LIMIT, 6, 3, 30),
  floodWindowMs: int(process.env.FLOOD_WINDOW_SECONDS, 8, 3, 60) * 1000,
  commandCooldownMs: int(process.env.COMMAND_COOLDOWN_SECONDS, 2, 0, 60) * 1000,
  warnLimit: int(process.env.WARN_LIMIT, 3, 2, 10),
  maxReminderMs: int(process.env.MAX_REMINDER_HOURS, 168, 1, 720) * 60 * 60 * 1000,
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  openaiBaseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  aiMaxTokens: int(process.env.AI_MAX_TOKENS, 700, 64, 4000),
  aiMemoryTurns: int(process.env.AI_MEMORY_TURNS, 8, 0, 20),
  healthToken: process.env.HEALTH_TOKEN || ''
});
