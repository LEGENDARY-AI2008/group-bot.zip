import { groupCommands } from './group.js';
import { BOT_NAME, MASTER_NAME, MASTER_NUMBERS, PREFIX, card } from '../style.js';

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
      const group = Object.keys(groupCommands).map((c) => `${PREFIX}${c}`).join('\n');
      return ctx.reply(
        card(`${BOT_NAME} menu`, [
          `Prefix: *${PREFIX}*`,
          '',
          '👥 *Group control*',
          group,
          '',
          '⚡ *Bot*',
          `${PREFIX}menu\n${PREFIX}ping\n${PREFIX}owner`,
        ])
      );
    },
  },
};
