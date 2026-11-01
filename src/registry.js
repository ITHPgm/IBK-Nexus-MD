import core from './plugins/core.js';
import group from './plugins/group.js';
import ai from './plugins/ai.js';
import media from './plugins/media.js';
import games from './plugins/games.js';

export const commands = [...core, ...group, ...ai, ...media, ...games];
const commandMap = new Map();
for (const command of commands) {
  for (const alias of [command.name, ...(command.aliases || [])]) {
    const key = alias.toLowerCase();
    if (commandMap.has(key)) throw new Error(`Duplicate command or alias: ${key}`);
    commandMap.set(key, command);
  }
}
export const findCommand = name => commandMap.get(String(name || '').toLowerCase());
