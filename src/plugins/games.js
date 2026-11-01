const choices = ['rock', 'paper', 'scissors'];
const questions = [
  { q: 'Which planet is known as the Red Planet?', a: ['Venus', 'Mars', 'Jupiter'], correct: 1, explanation: 'Mars appears reddish because of iron oxide on its surface.' },
  { q: 'What does CPU stand for?', a: ['Central Processing Unit', 'Computer Power Utility', 'Core Program Upload'], correct: 0, explanation: 'CPU means Central Processing Unit.' },
  { q: 'Which language is primarily used to style web pages?', a: ['HTML', 'CSS', 'SQL'], correct: 1, explanation: 'CSS controls the presentation and layout of web pages.' },
  { q: 'How many bits are in one byte?', a: ['4', '8', '16'], correct: 1, explanation: 'One byte contains eight bits.' }
];

export default [
  {
    name: 'roll', category: 'Games', description: 'Roll dice, e.g. .roll 2d20',
    handler: async ctx => {
      const spec = (ctx.args[0] || '1d6').match(/^(\d{1,2})d(\d{1,4})$/i);
      if (!spec) return ctx.reply(`Usage: ${ctx.prefix}roll 2d20 (maximum 10 dice, 1000 sides)`);
      const count = Number(spec[1]); const sides = Number(spec[2]);
      if (count < 1 || count > 10 || sides < 2 || sides > 1000) return ctx.reply('Allowed range: 1–10 dice, 2–1000 sides.');
      const results = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
      await ctx.reply(`🎲 ${results.join(' + ')} = *${results.reduce((a, b) => a + b, 0)}*`);
    }
  },
  {
    name: 'rps', category: 'Games', description: 'Play rock, paper, scissors',
    handler: async ctx => {
      const user = (ctx.args[0] || '').toLowerCase();
      if (!choices.includes(user)) return ctx.reply(`Usage: ${ctx.prefix}rps rock|paper|scissors`);
      const bot = choices[Math.floor(Math.random() * choices.length)];
      const result = user === bot ? 'Draw.' : (user === 'rock' && bot === 'scissors') || (user === 'paper' && bot === 'rock') || (user === 'scissors' && bot === 'paper') ? 'You win!' : 'Bot wins.';
      await ctx.reply(`You: ${user}\nBot: ${bot}\n*${result}*`);
    }
  },
  {
    name: 'quiz', category: 'Games', description: 'Get a short general knowledge question',
    handler: async ctx => {
      const item = questions[Math.floor(Math.random() * questions.length)];
      const options = item.a.map((a, i) => `${i + 1}. ${a}`).join('\n');
      const sent = await ctx.reply(`*Quick quiz*\n${item.q}\n\n${options}\n\nReply with 1, 2 or 3.`);
      // Keep quizzes lightweight: the answer is available immediately through the matching quizanswer command.
      const { setSetting } = await import('../db.js');
      setSetting(ctx.jid, `quiz:${ctx.sender}`, { answer: item.correct + 1, explanation: item.explanation, messageId: sent?.key?.id || null, expiresAt: Date.now() + 120_000 });
    }
  },
  {
    name: 'quizanswer', aliases: ['qa'], category: 'Games', description: 'Answer the current quiz with 1, 2 or 3',
    handler: async ctx => {
      const { getSetting, setSetting } = await import('../db.js');
      const state = getSetting(ctx.jid, `quiz:${ctx.sender}`, null);
      if (!state || state.expiresAt < Date.now()) return ctx.reply(`Start a new question with ${ctx.prefix}quiz.`);
      const answer = Number(ctx.args[0]);
      if (![1, 2, 3].includes(answer)) return ctx.reply(`Answer using ${ctx.prefix}quizanswer 1|2|3`);
      setSetting(ctx.jid, `quiz:${ctx.sender}`, null);
      await ctx.reply(`${answer === state.answer ? 'Correct!' : 'Not quite.'} ${state.explanation}`);
    }
  }
];
