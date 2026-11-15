// `.hack` — a harmless "fake hacker" gag command. It never takes a target
// (mentions/numbers are ignored), runs no real commands, and touches nothing:
// it only prints the next line of a joke animation each time it's called.

import { card } from '../style.js';

function bar(pct) {
  const filled = Math.round(pct / 10);
  return `[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}] ${pct}%`;
}

const STEPS = [
  '🖥️ HACK STARTING...',
  '🛠️ Initializing hacking tools...',
  '🌐 Connecting to remote servers...',
  ...[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(bar),
  '🔒 System Breach: Successful! 🔓',
  '📡 Transmitting data... 🍰',
  '🥷 Ensuring stealth... 🤫',
  card('Hack successful', ['✅ All done.', 'Run it again to replay.']),
];

// Per chat + sender, so two people in the same group each get their own run.
const progress = new Map();

export const funCommands = {
  hack: {
    async run(ctx) {
      const key = `${ctx.bot}|${ctx.jid}|${ctx.userKey}`;
      const i = progress.get(key) ?? 0;
      await ctx.reply(STEPS[i]);
      const next = i + 1;
      if (next >= STEPS.length) progress.delete(key);
      else progress.set(key, next);
    },
  },
};
