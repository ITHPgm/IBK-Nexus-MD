import { getSetting, setSetting, audit } from '../db.js';
import { config } from '../config.js';
import { getMentionedJids, safeText } from '../utils.js';

const targetFromContext = (ctx) => getMentionedJids(ctx.message)[0] || ctx.message.message?.extendedTextMessage?.contextInfo?.participant || null;

export default [
  {
    name: 'groupinfo', aliases: ['ginfo'], category: 'Group', description: 'Show group name, description and member count', groupOnly: true,
    handler: async ctx => {
      const meta = await ctx.sock.groupMetadata(ctx.jid);
      const admins = meta.participants.filter(p => p.admin).length;
      await ctx.reply(`*${meta.subject}*\nID: ${ctx.jid}\nMembers: ${meta.participants.length}\nAdmins: ${admins}\nDescription: ${meta.desc || 'Not set'}`);
    }
  },
  {
    name: 'admins', category: 'Group', description: 'List group administrators', groupOnly: true,
    handler: async ctx => {
      const meta = await ctx.sock.groupMetadata(ctx.jid);
      const admins = meta.participants.filter(p => p.admin);
      await ctx.reply(`*Group administrators*\n${admins.map(p => `• @${p.id.split('@')[0]}`).join('\n') || 'None'}`, { mentions: admins.map(p => p.id) });
    }
  },
  {
    name: 'welcome', category: 'Group', description: 'Toggle welcome messages: on/off', groupOnly: true, adminOnly: true,
    handler: async ctx => {
      const value = (ctx.args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(value)) return ctx.reply(`Usage: ${ctx.prefix}welcome on|off`);
      setSetting(ctx.jid, 'welcome_enabled', value === 'on');
      audit(ctx.jid, ctx.sender, 'group.welcome', value);
      await ctx.reply(`Welcome messages ${value === 'on' ? 'enabled' : 'disabled'}.`);
    }
  },
  {
    name: 'setwelcome', category: 'Group', description: 'Set welcome template; tokens: $user and $group', groupOnly: true, adminOnly: true,
    handler: async ctx => {
      const value = safeText(ctx.args.join(' '), 1000);
      if (value.length < 5) return ctx.reply(`Usage: ${ctx.prefix}setwelcome Welcome $user to $group!`);
      setSetting(ctx.jid, 'welcome_template', value);
      await ctx.reply('Welcome template saved.');
      audit(ctx.jid, ctx.sender, 'group.welcome_template.updated');
    }
  },
  {
    name: 'goodbye', category: 'Group', description: 'Toggle goodbye messages: on/off', groupOnly: true, adminOnly: true,
    handler: async ctx => {
      const value = (ctx.args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(value)) return ctx.reply(`Usage: ${ctx.prefix}goodbye on|off`);
      setSetting(ctx.jid, 'goodbye_enabled', value === 'on');
      await ctx.reply(`Goodbye messages ${value === 'on' ? 'enabled' : 'disabled'}.`);
    }
  },
  {
    name: 'setgoodbye', category: 'Group', description: 'Set goodbye template; tokens: $user and $group', groupOnly: true, adminOnly: true,
    handler: async ctx => {
      const value = safeText(ctx.args.join(' '), 1000);
      if (value.length < 5) return ctx.reply(`Usage: ${ctx.prefix}setgoodbye $user has left $group.`);
      setSetting(ctx.jid, 'goodbye_template', value);
      await ctx.reply('Goodbye template saved.');
    }
  },
  {
    name: 'antilink', category: 'Protection', description: 'Enable or disable group link protection', groupOnly: true, adminOnly: true, botAdminOnly: true,
    handler: async ctx => {
      const value = (ctx.args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(value)) return ctx.reply(`Usage: ${ctx.prefix}antilink on|off`);
      setSetting(ctx.jid, 'antilink_enabled', value === 'on');
      audit(ctx.jid, ctx.sender, 'group.antilink', value);
      await ctx.reply(`Link protection ${value === 'on' ? 'enabled' : 'disabled'}. Group admins are exempt.`);
    }
  },
  {
    name: 'antiflood', category: 'Protection', description: 'Enable or disable anti-flood protection', groupOnly: true, adminOnly: true, botAdminOnly: true,
    handler: async ctx => {
      const value = (ctx.args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(value)) return ctx.reply(`Usage: ${ctx.prefix}antiflood on|off`);
      setSetting(ctx.jid, 'antiflood_enabled', value === 'on');
      await ctx.reply(`Anti-flood protection ${value === 'on' ? 'enabled' : 'disabled'}.`);
    }
  },
  {
    name: 'warn', category: 'Moderation', description: 'Issue a warning to a mentioned member',
    groupOnly: true, adminOnly: true,
    handler: async ctx => {
      const target = targetFromContext(ctx);
      if (!target) return ctx.reply(`Mention or reply to a member. Example: ${ctx.prefix}warn @member Please follow the rules.`);
      const { addWarning } = await import('../db.js');
      const count = addWarning(ctx.jid, target);
      const reason = safeText(ctx.args.filter(a => !a.startsWith('@')).join(' '), 300) || 'No reason supplied';
      audit(ctx.jid, ctx.sender, 'member.warned', `${target}: ${reason}`);
      await ctx.reply(`Warning issued to @${target.split('@')[0]} (${count}/${config.warnLimit}).\nReason: ${reason}${count >= config.warnLimit ? '\nThis member has reached the configured warning threshold. Please review the case.' : ''}`, { mentions: [target] });
    }
  },
  {
    name: 'warnings', category: 'Moderation', description: 'Check a member warning count', groupOnly: true, adminOnly: true,
    handler: async ctx => {
      const target = targetFromContext(ctx);
      if (!target) return ctx.reply(`Mention or reply to a member: ${ctx.prefix}warnings @member`);
      const { getWarnings } = await import('../db.js');
      await ctx.reply(`@${target.split('@')[0]} has ${getWarnings(ctx.jid, target)} warning(s).`, { mentions: [target] });
    }
  },
  {
    name: 'clearwarn', category: 'Moderation', description: 'Clear a member warning count', groupOnly: true, adminOnly: true,
    handler: async ctx => {
      const target = targetFromContext(ctx);
      if (!target) return ctx.reply(`Mention or reply to a member: ${ctx.prefix}clearwarn @member`);
      const { clearWarnings } = await import('../db.js');
      clearWarnings(ctx.jid, target);
      audit(ctx.jid, ctx.sender, 'member.warnings.cleared', target);
      await ctx.reply(`Warnings cleared for @${target.split('@')[0]}.`, { mentions: [target] });
    }
  },
  {
    name: 'mute', category: 'Moderation', description: 'Temporarily mute a member; default duration is 10 minutes', groupOnly: true, adminOnly: true, botAdminOnly: true,
    handler: async ctx => {
      const target = targetFromContext(ctx);
      if (!target) return ctx.reply(`Mention or reply to a member: ${ctx.prefix}mute @member 10m`);
      const { parseDuration } = await import('../utils.js');
      const duration = parseDuration(ctx.args.find(a => /^\d+[smhd]$/i.test(a)) || '10m') || 600_000;
      if (duration > 86_400_000) return ctx.reply('Maximum mute duration is 24 hours.');
      const { muteUser } = await import('../db.js');
      muteUser(ctx.jid, target, Date.now() + duration, 'Moderator action');
      audit(ctx.jid, ctx.sender, 'member.muted', target);
      await ctx.reply(`@${target.split('@')[0]} has been muted for ${Math.round(duration / 60000)} minute(s). Their messages will be removed while the mute is active.`, { mentions: [target] });
    }
  },
  {
    name: 'unmute', category: 'Moderation', description: 'Remove a member mute', groupOnly: true, adminOnly: true,
    handler: async ctx => {
      const target = targetFromContext(ctx);
      if (!target) return ctx.reply(`Mention or reply to a member: ${ctx.prefix}unmute @member`);
      const { unmuteUser } = await import('../db.js');
      const removed = unmuteUser(ctx.jid, target);
      await ctx.reply(removed ? `Mute removed for @${target.split('@')[0]}.` : 'That member is not currently muted.', { mentions: [target] });
      audit(ctx.jid, ctx.sender, 'member.unmuted', target);
    }
  },
  {
    name: 'kick', aliases: ['remove'], category: 'Moderation', description: 'Remove a member from the group', groupOnly: true, adminOnly: true, botAdminOnly: true,
    handler: async ctx => {
      const target = targetFromContext(ctx);
      if (!target) return ctx.reply(`Mention or reply to a member: ${ctx.prefix}kick @member`);
      if (target === ctx.sock.user.id || target === ctx.sender) return ctx.reply('That target cannot be removed.');
      await ctx.sock.groupParticipantsUpdate(ctx.jid, [target], 'remove');
      audit(ctx.jid, ctx.sender, 'member.removed', target);
      await ctx.reply(`Removal request sent for @${target.split('@')[0]}.`, { mentions: [target] });
    }
  },
  {
    name: 'promote', category: 'Moderation', description: 'Promote a member to group admin', groupOnly: true, adminOnly: true, botAdminOnly: true,
    handler: async ctx => {
      const target = targetFromContext(ctx);
      if (!target) return ctx.reply(`Mention or reply to a member: ${ctx.prefix}promote @member`);
      await ctx.sock.groupParticipantsUpdate(ctx.jid, [target], 'promote');
      audit(ctx.jid, ctx.sender, 'member.promoted', target);
      await ctx.reply(`Promotion request sent for @${target.split('@')[0]}.`, { mentions: [target] });
    }
  },
  {
    name: 'demote', category: 'Moderation', description: 'Remove group admin status from a member', groupOnly: true, adminOnly: true, botAdminOnly: true,
    handler: async ctx => {
      const target = targetFromContext(ctx);
      if (!target) return ctx.reply(`Mention or reply to a member: ${ctx.prefix}demote @member`);
      await ctx.sock.groupParticipantsUpdate(ctx.jid, [target], 'demote');
      audit(ctx.jid, ctx.sender, 'member.demoted', target);
      await ctx.reply(`Demotion request sent for @${target.split('@')[0]}.`, { mentions: [target] });
    }
  },
  {
    name: 'poll', category: 'Group', description: 'Create a poll: .poll Question | Option 1 | Option 2', groupOnly: true,
    handler: async ctx => {
      const parts = ctx.args.join(' ').split('|').map(v => safeText(v.trim(), 100));
      if (parts.length < 3 || parts.length > 13 || parts.some(v => !v)) return ctx.reply(`Usage: ${ctx.prefix}poll Best meeting day? | Monday | Tuesday | Wednesday`);
      await ctx.sock.sendMessage(ctx.jid, { poll: { name: parts[0], values: parts.slice(1), selectableCount: 1 } }, { quoted: ctx.message });
    }
  }
];

export async function handleGroupParticipants(sock, update) {
  const { id, participants, action } = update;
  if (!id || !Array.isArray(participants) || !['add', 'remove'].includes(action)) return;
  const enabledKey = action === 'add' ? 'welcome_enabled' : 'goodbye_enabled';
  if (!getSetting(id, enabledKey, false)) return;
  let groupName = 'this group';
  try { groupName = (await sock.groupMetadata(id)).subject || groupName; } catch { /* use fallback */ }
  const templateKey = action === 'add' ? 'welcome_template' : 'goodbye_template';
  const template = getSetting(id, templateKey, action === 'add' ? 'Welcome $user to $group. Please read the group rules.' : '$user has left $group.');
  for (const participant of participants) {
    const user = `@${participant.split('@')[0]}`;
    const text = template.replaceAll('$user', user).replaceAll('$group', groupName);
    await sock.sendMessage(id, { text, mentions: [participant] });
  }
}
