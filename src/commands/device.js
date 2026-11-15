// `.getdevice` — reply to a message from someone to guess whether they're on
// Android or iOS. WhatsApp message IDs are shaped a bit differently per
// client, so this is a pattern guess from the ID, not a confirmed fact.

import { card } from '../style.js';
import { getContent } from '../util.js';

function guessPlatform(id) {
  if (!id) return null;
  if (/^[0-9A-F]{32}$/.test(id)) return 'iOS';
  if (/^3EB0[0-9A-F]+$/i.test(id)) return 'Android (Business/Web)';
  if (/^[0-9A-F]{16,20}$/i.test(id)) return 'Android';
  return null;
}

export const deviceCommands = {
  getdevice: {
    async run(ctx) {
      const { ctxInfo } = getContent(ctx.msg);
      const id = ctxInfo.stanzaId;
      if (!id) return ctx.reply(`Reply to a message from them with ${ctx.prefix}getdevice`);

      const guess = guessPlatform(id);
      return ctx.reply(card('Device guess', [
        guess ? `📱 Likely *${guess}*` : "🤷 Can't tell from that message.",
        '_Guessed from the message ID format — not always accurate._',
      ]));
    },
  },
};
