import os from 'node:os';
import { config } from '../config.js';
import { getDatabaseStats, audit, getUserStats, setSetting } from '../db.js';
import { formatDuration, getQuotedPayload, getMentionedJids, safeText } from '../utils.js';

export default [
  {
    name: 'help', aliases: ['menu', 'commands'], category: 'General', description: 'Show the available command catalogue',
    handler: async ctx => {
      const groups = new Map();
      for (const command of ctx.commands) {
        if (command.hidden) continue;
        const category = command.category || 'Other';
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category).push(`${ctx.prefix}${command.name} — ${command.description}`);
      }
      const sections = [...groups].map(([category, commands]) => `╭─ *${category}*\n${commands.map(item => `│ ${item}`).join('\n')}\n╰────────────`);
      await ctx.reply(`╭━━━〔 *${config.botName}* 〕━━━╮\nPrefix: ${ctx.prefix}\nCommands: ${ctx.commands.filter(c => !c.hidden).length}\n\n${sections.join('\n\n')}\n\nUse ${ctx.prefix}help for this menu.\n╰━━━━━━━━━━━━━━━━━━━━╯`);
    }
  },
  {
    name: 'ping', aliases: ['latency'], category: 'General', description: 'Check bot response time',
    handler: async ctx => {
      const start = Date.now();
      const sent = await ctx.sock.sendMessage(ctx.jid, { text: 'Measuring response time…' }, { quoted: ctx.message });
      const elapsed = Date.now() - start;
      if (sent?.key) await ctx.sock.sendMessage(ctx.jid, { text: `Pong: *${elapsed} ms*`, edit: sent.key });
    }
  },
  {
    name: 'uptime', category: 'General', description: 'Show process uptime and host information',
    handler: async ctx => ctx.reply(`*${config.botName} status*\nUptime: ${formatDuration(process.uptime() * 1000)}\nNode: ${process.version}\nPlatform: ${os.platform()} ${os.arch()}\nMemory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`)
  },
  {
    name: 'botinfo', aliases: ['about'], category: 'General', description: 'Show bot identity and runtime statistics',
    handler: async ctx => {
      const stats = getDatabaseStats();
      await ctx.reply(`*${config.botName}*\nA modular WhatsApp assistant for group administration, utility workflows and personal productivity.\n\nActive chats: ${stats.chatsWithActivity}\nTracked users: ${stats.usersTracked}\nPending reminders: ${stats.remindersPending}\nAudit events: ${stats.auditEvents}\nVersion: 1.0.0`);
    }
  },
  {
    name: 'id', category: 'General', description: 'Show this chat, your sender ID and quoted sender ID',
    handler: async ctx => {
      const quoted = getQuotedPayload(ctx.message);
      const mentioned = getMentionedJids(ctx.message);
      await ctx.reply(`Chat ID: ${ctx.jid}\nYour ID: ${ctx.sender}\nQuoted sender: ${quoted?.key?.participant || 'Not quoted'}\nMentions: ${mentioned.join(', ') || 'None'}`);
    }
  },
  {
    name: 'setprefix', category: 'Configuration', description: 'Set the command prefix for this group',
    groupOnly: true, adminOnly: true,
    handler: async ctx => {
      const next = safeText(ctx.args[0] || '', 3);
      if (!next || next.length > 2 || /\s/.test(next)) return ctx.reply(`Usage: ${ctx.prefix}setprefix !`);
      setSetting(ctx.jid, 'prefix', next);
      audit(ctx.jid, ctx.sender, 'prefix.updated', next);
      await ctx.reply(`Prefix updated to *${next}* for this group.`);
    }
  },
  {
    name: 'react', aliases: ['r'], category: 'Messaging', description: 'React to a quoted message with an emoji',
    handler: async ctx => {
      const quoted = getQuotedPayload(ctx.message);
      const emoji = safeText(ctx.args.join(' '), 16);
      if (!quoted || !emoji) return ctx.reply(`Reply to a message with ${ctx.prefix}react ❤️`);
      await ctx.sock.sendMessage(ctx.jid, { react: { text: emoji, key: quoted.key } });
    }
  },
  {
    name: 'delete', aliases: ['del'], category: 'Messaging', description: 'Delete a quoted message (bot or group admin only)',
    groupOnly: true, adminOnly: true,
    handler: async ctx => {
      const quoted = getQuotedPayload(ctx.message);
      if (!quoted) return ctx.reply('Reply to the message you want to delete.');
      if (!ctx.isBotAdmin && !quoted.key.fromMe) return ctx.reply('The bot needs group admin permission to delete another member’s message.');
      await ctx.sock.sendMessage(ctx.jid, { delete: quoted.key });
      audit(ctx.jid, ctx.sender, 'message.deleted', quoted.key.id || 'unknown');
    }
  },
  {
    name: 'remind', category: 'Productivity', description: 'Set a reminder, e.g. .remind 25m take a break',
    handler: async ctx => {
      const { addReminder } = await import('../db.js');
      const { parseDuration } = await import('../utils.js');
      const delay = parseDuration(ctx.args[0]);
      const reminderText = safeText(ctx.args.slice(1).join(' '), 500);
      if (!delay || !reminderText) return ctx.reply(`Usage: ${ctx.prefix}remind 25m take a break\nSupported: 30s, 10m, 2h, 1d`);
      if (delay > config.maxReminderMs) return ctx.reply(`Reminder limit: ${Math.floor(config.maxReminderMs / 3_600_000)} hours.`);
      const { countUserReminders } = await import('../db.js');
      if (countUserReminders(ctx.jid, ctx.sender) >= 20) return ctx.reply('You already have 20 pending reminders in this chat. Complete or wait for some before adding more.');
      const id = addReminder(ctx.jid, ctx.sender, reminderText, Date.now() + delay);
      await ctx.reply(`Reminder #${id} set for ${formatDuration(delay)} from now.`);
      audit(ctx.jid, ctx.sender, 'reminder.created', String(id));
    }
  },
  {
    name: 'myactivity', category: 'Productivity', description: 'Show your message activity in this chat',
    handler: async ctx => {
      const stats = getUserStats(ctx.jid, ctx.sender);
      await ctx.reply(`*Your activity*\nMessages counted: ${stats.messages}\nLast seen: ${stats.last_seen ? new Date(stats.last_seen).toLocaleString() : 'Not available'}`);
    }
  },
  {
    name: 'rules', category: 'Group', description: 'Display the group rules', groupOnly: true,
    handler: async ctx => {
      const { getSetting } = await import('../db.js');
      const rules = getSetting(ctx.jid, 'rules', 'No group rules have been configured yet.');
      await ctx.reply(`*GROUP RULES*\n${rules}`);
    }
  },
  {
    name: 'setrules', category: 'Group', description: 'Set group rules', groupOnly: true, adminOnly: true,
    handler: async ctx => {
      const rules = safeText(ctx.args.join(' '), 2500);
      if (rules.length < 5) return ctx.reply(`Usage: ${ctx.prefix}setrules Be respectful. No unsolicited links.`);
      const { setSetting } = await import('../db.js');
      setSetting(ctx.jid, 'rules', rules);
      audit(ctx.jid, ctx.sender, 'group.rules.updated');
      await ctx.reply('Group rules have been updated.');
    }
  }
];
