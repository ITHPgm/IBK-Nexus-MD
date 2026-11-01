import { config } from '../config.js';
import { getAiHistory, saveAiTurn } from '../db.js';
import { safeText } from '../utils.js';

export default [
  {
    name: 'ai', aliases: ['ask', 'gpt'], category: 'AI', description: 'Chat with the configured AI model', cooldown: 5000,
    handler: async ctx => {
      if (!config.openaiApiKey) return ctx.reply('AI is not configured yet. Add OPENAI_API_KEY to your environment and restart the bot.');
      const prompt = safeText(ctx.args.join(' '), 6000);
      if (!prompt) return ctx.reply(`Usage: ${ctx.prefix}ai explain how DNS works`);
      const history = config.aiMemoryTurns ? getAiHistory(ctx.jid, ctx.sender) : [];
      const messages = [
        { role: 'system', content: `You are ${config.botName}, a concise and helpful WhatsApp assistant. Follow the user's request, be transparent about uncertainty, and do not claim to perform actions you cannot perform. Keep replies readable in chat.` },
        ...history,
        { role: 'user', content: prompt }
      ];
      const response = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.openaiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: config.openaiModel, messages, max_tokens: config.aiMaxTokens, temperature: 0.6 }),
        signal: AbortSignal.timeout(45_000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `AI provider returned HTTP ${response.status}`);
      const answer = safeText(data.choices?.[0]?.message?.content || 'The AI provider returned an empty response.', 5000);
      if (config.aiMemoryTurns) {
        saveAiTurn(ctx.jid, ctx.sender, 'user', prompt, config.aiMemoryTurns);
        saveAiTurn(ctx.jid, ctx.sender, 'assistant', answer, config.aiMemoryTurns);
      }
      await ctx.reply(answer);
    }
  },
  {
    name: 'forgetai', category: 'AI', description: 'Delete your stored AI conversation memory',
    handler: async ctx => {
      const { db } = await import('../db.js');
      db.prepare('DELETE FROM ai_memory WHERE chat_id=? AND user_id=?').run(ctx.jid, ctx.sender);
      await ctx.reply('Your saved AI conversation memory for this chat has been deleted.');
    }
  }
];
