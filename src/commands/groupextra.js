// Extra group tools.

import pino from 'pino';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { card } from '../style.js';
import { getFlag, setFlag } from '../db.js';
import {
  getContent, unwrap, targetJids, resolveKey, findParticipant, isAdminRole, userPart,
} from '../util.js';

const logger = pino({ level: 'silent' });
const votes = new Map(); // votekick tallies: key -> { voters:Set, t }
const timers = new Map(); // closetime timers per group

const EPHEMERAL = { off: 0, '24h': 86400, '7d': 604800, '90d': 7776000 };

export const groupExtraCommands = {
  votekick: {
    groupOnly: true, botAdminOnly: true,
    async run(ctx) {
      const [target] = targetJids(ctx);
      if (!target) return ctx.reply(`Usage: ${ctx.prefix}votekick @user  (every member who agrees sends the same command)`);
      const p = findParticipant(ctx.metadata, target);
      if (userPart(target) === userPart(ctx.botJid) || (p && isAdminRole(p))) {
        return ctx.reply('Admins and the bot cannot be vote-kicked.');
      }
      const need = parseInt(getFlag(ctx.bot, ctx.jid, 'votes', '5'), 10) || 5;
      const k = `${ctx.bot}|${ctx.jid}|${resolveKey(ctx.metadata, target)}`;
      let entry = votes.get(k);
      if (!entry || Date.now() - entry.t > 10 * 60000) entry = { voters: new Set(), t: Date.now() };
      entry.voters.add(ctx.userKey);
      votes.set(k, entry);

      if (entry.voters.size >= need) {
        votes.delete(k);
        await ctx.sock.groupParticipantsUpdate(ctx.jid, [target], 'remove');
        return ctx.sock.sendMessage(ctx.jid, {
          text: card('Vote carried', [`@${userPart(target)} was voted out (${need} votes).`]),
          mentions: [target],
        });
      }
      return ctx.sock.sendMessage(ctx.jid, {
        text: card('Vote counted', [`@${userPart(target)}: ${entry.voters.size}/${need} votes.`, 'Votes expire after 10 minutes.']),
        mentions: [target],
      });
    },
  },

  membertag: {
    groupOnly: true, adminOnly: true,
    async run(ctx) {
      const members = ctx.metadata.participants.filter((p) => !isAdminRole(p)).map((p) => p.id);
      if (!members.length) return ctx.reply('There are no regular members to tag.');
      const text = ctx.args.join(' ');
      const list = members.map((j) => `@${userPart(j)}`).join('\n');
      return ctx.sock.sendMessage(ctx.jid, { text: `${text ? text + '\n\n' : ''}${list}`, mentions: members });
    },
  },

  setgrouppic: {
    groupOnly: true, adminOnly: true, botAdminOnly: true,
    async run(ctx) {
      const c = getContent(ctx.msg);
      let source = null;
      if (c.m.imageMessage) {
        source = ctx.msg;
      } else if (c.ctxInfo.quotedMessage) {
        const q = unwrap(c.ctxInfo.quotedMessage);
        if (q?.imageMessage) {
          source = {
            key: { remoteJid: ctx.jid, id: c.ctxInfo.stanzaId, participant: c.ctxInfo.participant },
            message: q,
          };
        }
      }
      if (!source) return ctx.reply(`Send an image with the caption ${ctx.prefix}setgrouppic, or reply to an image.`);
      const buffer = await downloadMediaMessage(source, 'buffer', {}, {
        logger,
        reuploadRequest: ctx.sock.updateMediaMessage,
      });
      await ctx.sock.updateProfilePicture(ctx.jid, buffer);
      return ctx.reply(card('Group picture', ['Updated.']));
    },
  },

  ephemeral: {
    groupOnly: true, adminOnly: true, botAdminOnly: true,
    async run(ctx) {
      const a = (ctx.args[0] || '').toLowerCase();
      if (!(a in EPHEMERAL)) return ctx.reply(`Usage: ${ctx.prefix}ephemeral off | 24h | 7d | 90d`);
      await ctx.sock.groupToggleEphemeral(ctx.jid, EPHEMERAL[a]);
      return ctx.reply(card('Disappearing messages', [a === 'off' ? 'Turned off.' : `Messages disappear after ${a}.`]));
    },
  },

  closetime: {
    groupOnly: true, adminOnly: true, botAdminOnly: true,
    async run(ctx) {
      const k = `${ctx.bot}|${ctx.jid}`;
      const a = (ctx.args[0] || '').toLowerCase();
      if (timers.has(k)) {
        clearTimeout(timers.get(k));
        timers.delete(k);
      }
      if (a === 'off') {
        await ctx.sock.groupSettingUpdate(ctx.jid, 'not_announcement');
        return ctx.reply(card('Timed close', ['Cancelled. Group is open.']));
      }
      const mins = parseInt(a, 10);
      if (!mins || mins < 1 || mins > 1440) return ctx.reply(`Usage: ${ctx.prefix}closetime 30  (minutes, up to 1440)  or  ${ctx.prefix}closetime off`);
      await ctx.sock.groupSettingUpdate(ctx.jid, 'announcement');
      timers.set(k, setTimeout(async () => {
        timers.delete(k);
        try {
          await ctx.sock.groupSettingUpdate(ctx.jid, 'not_announcement');
          await ctx.sock.sendMessage(ctx.jid, { text: card('Timed close', ['Time is up. The group is open again.']) });
        } catch {
          /* ignore */
        }
      }, mins * 60000));
      return ctx.reply(card('Timed close', [`🔒 Only admins can send for ${mins} min, then it opens by itself.`, 'If the bot restarts before then, open it with .open.']));
    },
  },

  lock: {
    groupOnly: true, adminOnly: true, botAdminOnly: true,
    async run(ctx) {
      await ctx.sock.groupSettingUpdate(ctx.jid, 'locked');
      return ctx.reply(card('Group info locked', ['Only admins can edit the group name, picture and description.']));
    },
  },

  unlock: {
    groupOnly: true, adminOnly: true, botAdminOnly: true,
    async run(ctx) {
      await ctx.sock.groupSettingUpdate(ctx.jid, 'unlocked');
      return ctx.reply(card('Group info unlocked', ['Every member can edit the group name, picture and description.']));
    },
  },

  timezonegroup: {
    groupOnly: true, adminOnly: true,
    async run(ctx) {
      const tz = ctx.args[0];
      if (!tz) return ctx.reply(`Current timezone: ${getFlag(ctx.bot, ctx.jid, 'tz', 'Africa/Lagos')}. Change it: ${ctx.prefix}timezonegroup Africa/Lagos`);
      try {
        new Intl.DateTimeFormat('en', { timeZone: tz });
      } catch {
        return ctx.reply('That timezone is not valid. Examples: Africa/Lagos, Europe/London, America/New_York.');
      }
      setFlag(ctx.bot, ctx.jid, 'tz', tz);
      return ctx.reply(card('Group timezone', [`Set to ${tz}. ${ctx.prefix}time and ${ctx.prefix}date use it now.`]));
    },
  },

  listadmins: {
    groupOnly: true,
    async run(ctx) {
      const admins = ctx.metadata.participants.filter(isAdminRole).map((p) => p.id);
      return ctx.sock.sendMessage(ctx.jid, {
        text: card('Group admins', admins.map((j, i) => `${i + 1}. @${userPart(j)}`)),
        mentions: admins,
      }, { quoted: ctx.msg });
    },
  },

  groupinfo: {
    groupOnly: true,
    async run(ctx) {
      const m = ctx.metadata;
      const lines = [
        `Name: ${m.subject}`,
        `Members: ${m.participants.length} · Admins: ${m.participants.filter(isAdminRole).length}`,
        `Created: ${m.creation ? new Date(m.creation * 1000).toLocaleDateString('en-NG') : 'unknown'}`,
        `Who can send: ${m.announce ? 'admins only' : 'everyone'}`,
        `Who can edit info: ${m.restrict ? 'admins only' : 'everyone'}`,
      ];
      if (m.desc) lines.push('', `About: ${String(m.desc).slice(0, 300)}`);
      return ctx.reply(card('Group info', lines));
    },
  },

  leave: {
    groupOnly: true, sudoOnly: true,
    async run(ctx) {
      await ctx.sock.sendMessage(ctx.jid, { text: card('Leaving', ['The master has called me out. Goodbye.']) });
      await ctx.sock.groupLeave(ctx.jid);
    },
  },
};
