// `.vv` — reply to a view-once photo, video or voice note and the bot
// re-sends it as a normal message in the same chat.

import pino from 'pino';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getContent, unwrap } from '../util.js';

const logger = pino({ level: 'silent' });
const MEDIA_TYPES = ['imageMessage', 'videoMessage', 'audioMessage'];

export const mediaCommands = {
  vv: {
    async run(ctx) {
      const { ctxInfo } = getContent(ctx.msg);
      const quoted = ctxInfo.quotedMessage;
      if (!quoted) return ctx.reply(`Reply to a view-once photo, video or voice note with ${ctx.prefix}vv`);

      const inner = unwrap(quoted);
      const type = inner && MEDIA_TYPES.find((k) => inner[k]);
      if (!type) return ctx.reply('That reply is not a photo, video or voice note.');

      const fakeMsg = {
        key: { remoteJid: ctx.jid, id: ctxInfo.stanzaId, participant: ctxInfo.participant },
        message: inner,
      };

      const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {}, {
        logger,
        reuploadRequest: ctx.sock.updateMediaMessage,
      });

      const caption = inner[type]?.caption || '';
      if (type === 'imageMessage') {
        return ctx.sock.sendMessage(ctx.jid, { image: buffer, caption }, { quoted: ctx.msg });
      }
      if (type === 'videoMessage') {
        return ctx.sock.sendMessage(ctx.jid, { video: buffer, caption }, { quoted: ctx.msg });
      }
      return ctx.sock.sendMessage(
        ctx.jid,
        { audio: buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true },
        { quoted: ctx.msg }
      );
    },
  },
};
