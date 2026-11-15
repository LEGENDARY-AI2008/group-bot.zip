import { groupCommands } from './group.js';
import { moderationCommands } from './moderation.js';
import { protectionCommands } from './protection.js';
import { groupExtraCommands } from './groupextra.js';
import { botCommands } from './bot.js';
import { BOT_NAME, MASTER_NAME, MASTER_NUMBERS, PREFIX, card } from '../style.js';

const list = (set) => Object.keys(set).sort().map((c) => `${PREFIX}${c}`).join('\n');

export const coreCommands = {
  ping: {
    async run(ctx) {
      const up = Math.floor(process.uptime());
      const mins = Math.floor(up / 60);
      return ctx.reply(card('Pong', [`⚡ Online · uptime ${mins >= 1 ? mins + 'm' : up + 's'}`]));
    },
  },

  owner: {
    async run(ctx) {
      const lines = [`👑 Master: *${MASTER_NAME}*`];
      MASTER_NUMBERS.forEach((n) => lines.push(`wa.me/${n}`));
      return ctx.reply(card('My master', lines));
    },
  },

  menu: {
    async run(ctx) {
      return ctx.reply(
        card(`${BOT_NAME} menu`, [
          `Prefix: *${PREFIX}*`,
          '',
          '👥 *Group control*',
          list(groupCommands),
          '',
          '⚔️ *Moderation*',
          list(moderationCommands),
          '',
          '🛡️ *Protection*',
          list(protectionCommands),
          '',
          '🧰 *Group tools*',
          list(groupExtraCommands),
          '',
          '⚡ *Bot control*',
          list(botCommands),
          '',
          '⚡ *Basics*',
          `${PREFIX}menu  ${PREFIX}ping  ${PREFIX}owner`,
        ])
      );
    },
  },
};
