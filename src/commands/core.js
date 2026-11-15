import { groupCommands } from './group.js';

export const coreCommands = {
  ping: {
    async run(ctx) {
      return ctx.reply('Pong! 🏓');
    },
  },

  menu: {
    async run(ctx) {
      const prefix = process.env.PREFIX || '.';
      const names = Object.keys(groupCommands).map((c) => prefix + c);
      return ctx.reply(
        `*GROUP BOT MENU*\n━━━━━━━━━━━━━━━━\n\n👥 *Group control*\n${names.join('\n')}\n\n⚡ *Bot*\n${prefix}menu\n${prefix}ping`
      );
    },
  },
};
