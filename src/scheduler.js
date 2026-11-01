import { getDueReminders, deleteReminder } from './db.js';
import { logger } from './logger.js';

export function startScheduler(getSocket) {
  const timer = setInterval(async () => {
    const sock = getSocket();
    if (!sock) return;
    let due = [];
    try { due = getDueReminders(); }
    catch (error) { logger.error({ err: error }, 'Reminder scheduler database error'); return; }
    for (const reminder of due) {
      try {
        await sock.sendMessage(reminder.chat_id, {
          text: `⏰ *Reminder*\n${reminder.text}\n\nRequested by: @${reminder.user_id.split('@')[0]}`,
          mentions: [reminder.user_id]
        });
        deleteReminder(reminder.id);
      } catch (error) {
        logger.error({ err: error, reminderId: reminder.id }, 'Could not send reminder');
      }
    }
  }, 15_000);
  timer.unref();
  return () => clearInterval(timer);
}
