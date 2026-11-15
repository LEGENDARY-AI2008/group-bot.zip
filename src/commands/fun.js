// `.hack` — a harmless "fake hacker" gag command. It never takes a target
// (mentions/numbers are ignored) and runs no real commands or anything that
// touches anything: one call fires off the whole animation fast, as a run of
// separate messages (not edits), so the full trail stays in the chat for
// anyone who joins or scrolls back later.

import { card } from '../style.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
];

export const funCommands = {
  hack: {
    async run(ctx) {
      await ctx.sock.sendMessage(ctx.jid, { text: STEPS[0] }, { quoted: ctx.msg });

      for (const line of STEPS.slice(1)) {
        await sleep(350);
        await ctx.sock.sendMessage(ctx.jid, { text: line });
      }

      await sleep(350);
      return ctx.sock.sendMessage(
        ctx.jid,
        { text: card('Hack successful', ['✅ All done.', 'Run it again to replay.']) }
      );
    },
  },
};
