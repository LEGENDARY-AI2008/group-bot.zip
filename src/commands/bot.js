// Bot-level controls: sudo users, public/private mode, status.
// Sudo and private mode are stored per paired number.

import { card, MASTER_NUMBERS } from '../style.js';
import { getBotSetting, setBotSetting } from '../db.js';
import { userPart } from '../util.js';
import { sessionCount } from '../sessions.js';

export function getSudoList(bot) {
  return (getBotSetting(bot, 'sudo', '') || '').split(',').filter(Boolean);
}

function setSudoList(bot, list) {
  setBotSetting(bot, 'sudo', [...new Set(list)].join(','));
}

const numOf = (ctx) => {
  const t = ctx.args.find((a) => /\d{6,}/.test(a));
  return t ? t.replace(/\D/g, '') : null;
};

const started = Date.now();

export const botCommands = {
  setsudo: {
    sudoOnly: true,
    async run(ctx) {
      const n = numOf(ctx);
      if (!n) return ctx.reply(`Usage: ${ctx.prefix}setsudo 2348012345678`);
      if (MASTER_NUMBERS.includes(n)) return ctx.reply(card('Sudo', ['The master is already above sudo.']));
      setSudoList(ctx.bot, [...getSudoList(ctx.bot), n]);
      return ctx.reply(card('Sudo granted', [`+${n} can now use bot controls.`]));
    },
  },

  delsudo: {
    sudoOnly: true,
    async run(ctx) {
      const n = numOf(ctx);
      if (!n) return ctx.reply(`Usage: ${ctx.prefix}delsudo 2348012345678`);
      setSudoList(ctx.bot, getSudoList(ctx.bot).filter((x) => x !== n));
      return ctx.reply(card('Sudo removed', [`+${n} no longer has bot controls.`]));
    },
  },

  sudolist: {
    sudoOnly: true,
    async run(ctx) {
      const list = getSudoList(ctx.bot);
      return ctx.reply(card('Sudo users', list.length ? list.map((n, i) => `${i + 1}. +${n}`) : ['None yet.']));
    },
  },

  public: {
    sudoOnly: true,
    async run(ctx) {
      setBotSetting(ctx.bot, 'mode', 'public');
      return ctx.reply(card('Public mode', ['🟢 Everyone can use commands.']));
    },
  },

  private: {
    sudoOnly: true,
    async run(ctx) {
      setBotSetting(ctx.bot, 'mode', 'private');
      return ctx.reply(card('Private mode', ['🔴 Only the master and sudo users get answers.']));
    },
  },

  status: {
    sudoOnly: true,
    async run(ctx) {
      const up = Math.floor((Date.now() - started) / 1000);
      const h = Math.floor(up / 3600);
      const mm = Math.floor((up % 3600) / 60);
      const mode = getBotSetting(ctx.bot, 'mode', 'public');
      return ctx.reply(card('Bot status', [
        `Mode: ${mode === 'public' ? '🟢 public' : '🔴 private'}`,
        `Uptime: ${h}h ${mm}m`,
        `Bots running on this server: ${sessionCount()}`,
        `Sudo users: ${getSudoList(ctx.bot).length}`,
        `Master: ${MASTER_NUMBERS.length ? userPart(MASTER_NUMBERS[0]) : 'not set'}`,
      ]));
    },
  },
};
