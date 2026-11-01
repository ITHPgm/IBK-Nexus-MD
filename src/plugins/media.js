import sharp from 'sharp';
import { downloadMediaMessage, getContentType } from '@whiskeysockets/baileys';
import { getQuotedPayload } from '../utils.js';

export default [
  {
    name: 'sticker', aliases: ['s', 'stiker'], category: 'Media', description: 'Convert a received or quoted image into a WhatsApp sticker', cooldown: 5000,
    handler: async ctx => {
      const quoted = getQuotedPayload(ctx.message);
      const target = quoted || ctx.message;
      const contentType = getContentType(target.message || {});
      if (!['imageMessage'].includes(contentType)) return ctx.reply(`Send an image with ${ctx.prefix}sticker or reply to an image with ${ctx.prefix}sticker. Animated video stickers are not enabled in this build.`);
      const input = await downloadMediaMessage(target, 'buffer', {}, { logger: ctx.logger, reuploadRequest: ctx.sock.updateMediaMessage });
      const output = await sharp(input, { limitInputPixels: 25_000_000 })
        .rotate()
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 82, effort: 4 })
        .toBuffer();
      if (output.length > 1024 * 1024) return ctx.reply('The generated sticker is larger than 1 MB. Try a smaller image.');
      await ctx.sock.sendMessage(ctx.jid, { sticker: output }, { quoted: ctx.message });
    }
  }
];
