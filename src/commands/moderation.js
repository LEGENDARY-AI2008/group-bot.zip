// Prison & moderation: strikes, cell (jail), mute, ban, slowmode.

import { card, MASTER_NUMBERS } from '../style.js';
import { setMember, getMember, delMember, clearMembers, listMembers, getFlag, setFlag } from '../db.js';
import {
  targetJids, parseMinutes, reasonFrom, resolveKey, findParticipant,
  isAdminRole, userPart, pick,
} from '../util.js';
import { strike } from '../enforce.js';

function isProtected(ctx, jid) {
  const u = userPart(jid);
  if (u === userPart(ctx.botJid)) return true;
  if (MASTER_NUMBERS.includes(u)) return true;
  const p = findParticipant(ctx.metadata, jid);
  if (!p) return false;
  if (MASTER_NUMBERS.includes(userPart(p.phoneNumber))) return true;
  return isAdminRole(p);
}

const minsLeft = (until) => Math.max(1, Math.ceil((until - Date.now()) / 60000));

function say(ctx, title, lines, mentions = []) {
  return ctx.sock.sendMessage(ctx.jid, { text: card(title, lines), mentions }, { quoted: ctx.msg });
}

function pickTargets(ctx, usage) {
  const all = targetJids(ctx);
  if (!all.length) {
    ctx.reply(usage);
    return null;
  }
  const ok = all.filter((j) => !isProtected(ctx, j));
  if (!ok.length) {
    ctx.reply('Admins, the master and the bot cannot be targeted.');
    return null;
  }
  return ok;
}

const asJid = (key) => `${key}@s.whatsapp.net`;
const names = (jids) => jids.map((j) => '@' + userPart(j)).join(', ');

export const moderationCommands = {
  warn: {
    groupOnly: true, adminOnly: true,
    async run(ctx) {
      const targets = pickTargets(ctx, `Usage: ${ctx.prefix}warn @user [reason]`);
      if (!targets) return;
      const reason = reasonFrom(ctx.args);
      for (const j of targets) await strike(ctx, resolveKey(ctx.metadata, j), j, reason);
    },
  },

  warnings: {
    groupOnly: true, adminOnly: true,
    async run(ctx) {
      const limit = parseInt(getFlag(ctx.bot, ctx.jid, 'warnlimit', '3'), 10) || 3;
      const targets = targetJids(ctx);
      if (targets.length) {
        const j = targets[0];
        const row = getMember(ctx.bot, ctx.jid, resolveKey(ctx.metadata, j), 'warn');
        return say(ctx, 'Record check', [`@${userPart(j)} has *${row?.value || 0}/${limit}* strikes.`], [j]);
      }
      const rows = listMembers(ctx.bot, ctx.jid, 'warn');
      if (!rows.length) return say(ctx, 'Record check', ['Clean sheet. Nobody has strikes.']);
      return say(
        ctx, 'Strike board',
        rows.map((r) => `@${r.user} — ${r.value}/${limit}`),
        rows.map((r) => asJid(r.user))
      );
    },
  },

  resetwarn: {
    groupOnly: true, adminOnly: true,
    async run(ctx) {
      if ((ctx.args[0] || '').toLowerCase() === 'all') {
        clearMembers(ctx.bot, ctx.jid, 'warn');
        return say(ctx, 'Slate wiped', ['All strikes in this group are cleared.']);
      }
      const targets = targetJids(ctx);
      if (!targets.length) return ctx.reply(`Usage: ${ctx.prefix}resetwarn @user  or  ${ctx.prefix}resetwarn all`);
      targets.forEach((j) => delMember(ctx.bot, ctx.jid, resolveKey(ctx.metadata, j), 'warn'));
      return say(ctx, 'Slate wiped', [`Strikes cleared for ${names(targets)}.`], targets);
    },
  },

  warnlimit: {
    groupOnly: true, adminOnly: true,
    async run(ctx) {
      const n = parseInt(ctx.args[0], 10);
      if (!n) {
        const cur = getFlag(ctx.bot, ctx.jid, 'warnlimit', '3');
        return ctx.reply(`Strike limit is *${cur}*. Change it with ${ctx.prefix}warnlimit 5`);
      }
      if (n < 1 || n > 20) return ctx.reply('Pick a limit between 1 and 20.');
      setFlag(ctx.bot, ctx.jid, 'warnlimit', n);
      return say(ctx, 'Law updated', [`Members are removed after *${n}* strikes.`]);
    },
  },

  jail: {
    groupOnly: true, adminOnly: true, botAdminOnly: true,
    async run(ctx) {
      const targets = pickTargets(ctx, `Usage: ${ctx.prefix}jail @user [minutes] [reason]`);
      if (!targets) return;
      const mins = parseMinutes(ctx.args, 30, 1440);
      const reason = reasonFrom(ctx.args);
      const until = Date.now() + mins * 60000;
      targets.forEach((j) => setMember(ctx.bot, ctx.jid, resolveKey(ctx.metadata, j), 'jail', reason, until));
      return say(
        ctx, '⚖️ Judgement passed',
        [
          `⚖️ ${names(targets)}, you have been judged.`,
          `🔒 Taken to the cell.`,
          `Charge: ${reason}`,
          `Sentence: ${mins} min`,
          'Messages from the cell are removed until release.',
          `Early parole: ${ctx.prefix}unjail @user`,
        ],
        targets
      );
    },
  },

  unjail: {
    groupOnly: true, adminOnly: true,
    async run(ctx) {
      if ((ctx.args[0] || '').toLowerCase() === 'all') {
        clearMembers(ctx.bot, ctx.jid, 'jail');
        return say(ctx, 'Jailbreak approved', ['Every cell is open. Everyone is released.']);
      }
      const targets = targetJids(ctx);
      if (!targets.length) return ctx.reply(`Usage: ${ctx.prefix}unjail @user  or  ${ctx.prefix}unjail all`);
      targets.forEach((j) => delMember(ctx.bot, ctx.jid, resolveKey(ctx.metadata, j), 'jail'));
      return say(ctx, '⚖️ Verdict overturned', [`⚖️ ${names(targets)}, the court releases you. Tread carefully.`], targets);
    },
  },

  jaillist: {
    groupOnly: true, adminOnly: true,
    async run(ctx) {
      const rows = listMembers(ctx.bot, ctx.jid, 'jail').filter((r) => !r.until || r.until > Date.now());
      if (!rows.length) return say(ctx, 'Roll call', ['The cells are empty.']);
      return say(
        ctx, 'Roll call',
        rows.map((r) => `🔒 @${r.user} — ${r.until ? minsLeft(r.until) + ' min left' : 'no end date'} (${r.value})`),
        rows.map((r) => asJid(r.user))
      );
    },
  },

  jailrandom: {
    groupOnly: true, adminOnly: true, botAdminOnly: true,
    async run(ctx) {
      const pool = ctx.metadata.participants.map((p) => p.id).filter((j) => !isProtected(ctx, j));
      if (!pool.length) return ctx.reply('Nobody here can be picked.');
      const chosen = pick(pool);
      const mins = parseMinutes(ctx.args, 10, 60);
      setMember(ctx.bot, ctx.jid, resolveKey(ctx.metadata, chosen), 'jail', 'picked by the wheel', Date.now() + mins * 60000);
      return say(
        ctx, 'Wheel of fate',
        [
          `🎰 The wheel stops on @${userPart(chosen)}.`,
          `Sentence: ${mins} min in the cell. Short and fair.`,
          `Early parole: ${ctx.prefix}unjail @user`,
        ],
        [chosen]
      );
    },
  },

  ban: {
    groupOnly: true, adminOnly: true,
    async run(ctx) {
      const targets = pickTargets(ctx, `Usage: ${ctx.prefix}ban @user  (or reply to their message)`);
      if (!targets) return;
      targets.forEach((j) => setMember(ctx.bot, ctx.jid, resolveKey(ctx.metadata, j), 'ban', reasonFrom(ctx.args), 0));
      let removed = false;
      if (ctx.botIsAdmin) {
        try {
          await ctx.sock.groupParticipantsUpdate(ctx.jid, targets, 'remove');
          removed = true;
        } catch {
          /* ignore */
        }
      }
      return say(
        ctx, 'Banished',
        [
          `⛓️ ${names(targets)} banned from this group.`,
          removed ? 'They have been removed.' : 'Make me admin so I can remove them and keep them out.',
          `Lift it with ${ctx.prefix}unban`,
        ],
        targets
      );
    },
  },

  unban: {
    groupOnly: true, adminOnly: true,
    async run(ctx) {
      const targets = targetJids(ctx);
      if (!targets.length) return ctx.reply(`Usage: ${ctx.prefix}unban @user  (or type their number)`);
      targets.forEach((j) => delMember(ctx.bot, ctx.jid, resolveKey(ctx.metadata, j), 'ban'));
      return say(ctx, 'Ban lifted', [`${names(targets)} may return.`], targets);
    },
  },

  bancheck: {
    groupOnly: true, adminOnly: true,
    async run(ctx) {
      const targets = targetJids(ctx);
      if (targets.length) {
        const j = targets[0];
        const banned = !!getMember(ctx.bot, ctx.jid, resolveKey(ctx.metadata, j), 'ban');
        return say(ctx, 'Ban check', [`@${userPart(j)} is ${banned ? '⛓️ banned' : '✅ not banned'}.`], [j]);
      }
      const rows = listMembers(ctx.bot, ctx.jid, 'ban');
      if (!rows.length) return say(ctx, 'Ban list', ['No one is banned here.']);
      return say(ctx, 'Ban list', rows.map((r) => `⛓️ @${r.user}`), rows.map((r) => asJid(r.user)));
    },
  },

  mute: {
    groupOnly: true, adminOnly: true, botAdminOnly: true,
    async run(ctx) {
      const targets = pickTargets(ctx, `Usage: ${ctx.prefix}mute @user [minutes]`);
      if (!targets) return;
      const mins = parseMinutes(ctx.args, 60, 10080);
      const until = Date.now() + mins * 60000;
      targets.forEach((j) => setMember(ctx.bot, ctx.jid, resolveKey(ctx.metadata, j), 'mute', '', until));
      return say(
        ctx, 'Silence ordered',
        [`🤐 ${names(targets)} muted for ${mins} min.`, `Lift it with ${ctx.prefix}unmute`],
        targets
      );
    },
  },

  unmute: {
    groupOnly: true, adminOnly: true,
    async run(ctx) {
      const targets = targetJids(ctx);
      if (!targets.length) return ctx.reply(`Usage: ${ctx.prefix}unmute @user`);
      targets.forEach((j) => delMember(ctx.bot, ctx.jid, resolveKey(ctx.metadata, j), 'mute'));
      return say(ctx, 'Voice returned', [`${names(targets)} can speak again.`], targets);
    },
  },

  slowmode: {
    groupOnly: true, adminOnly: true,
    async run(ctx) {
      const a = (ctx.args[0] || '').toLowerCase();
      if (a === 'off' || a === '0') {
        setFlag(ctx.bot, ctx.jid, 'slowmode', 0);
        return say(ctx, 'Slowmode', ['Off. Chat at full speed.']);
      }
      const n = parseInt(a, 10);
      if (!n) {
        const cur = getFlag(ctx.bot, ctx.jid, 'slowmode', '0');
        return ctx.reply(`Slowmode: ${cur === '0' ? 'off' : cur + 's'}. Use ${ctx.prefix}slowmode 10  or  ${ctx.prefix}slowmode off`);
      }
      if (n < 2 || n > 600) return ctx.reply('Pick between 2 and 600 seconds.');
      setFlag(ctx.bot, ctx.jid, 'slowmode', n);
      return say(ctx, 'Slowmode on', [
        `One message per member every *${n}s*. Faster ones are removed.`,
        ctx.botIsAdmin ? '' : '⚠️ I need admin rights to remove messages.',
      ].filter(Boolean));
    },
  },
};
