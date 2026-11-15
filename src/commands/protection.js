// Protection switches. The checks themselves run in src/enforce.js.

import { card } from '../style.js';
import { getFlag, setFlag, getBotSetting, setBotSetting } from '../db.js';

function groupToggle(key, label, blurb, { needsAdmin = true, turnsOff = null } = {}) {
  return {
    groupOnly: true, adminOnly: true,
    async run(ctx) {
      const s = (ctx.args[0] || '').toLowerCase();
      const on = getFlag(ctx.bot, ctx.jid, key, '0') === '1';
      if (s === 'on' || s === 'off') {
        setFlag(ctx.bot, ctx.jid, key, s === 'on' ? '1' : '0');
        if (s === 'on' && turnsOff) setFlag(ctx.bot, ctx.jid, turnsOff, '0');
        const lines = [`${s === 'on' ? '🟢 On' : '🔴 Off'} — ${blurb}`];
        if (s === 'on' && needsAdmin && !ctx.botIsAdmin) lines.push('⚠️ Make me a group admin so I can act on it.');
        return ctx.reply(card(label, lines));
      }
      return ctx.reply(card(label, [
        `Status: ${on ? '🟢 on' : '🔴 off'}`,
        blurb,
        `Use: ${ctx.prefix}${key} on | off`,
      ]));
    },
  };
}

export const protectionCommands = {
  antilink: groupToggle('antilink', 'Anti-link', 'links from members are removed and earn a strike.'),
  antisticker: groupToggle('antisticker', 'Anti-sticker', 'stickers from members are removed and earn a strike.'),
  antiimage: groupToggle('antiimage', 'Anti-image', 'images from members are removed and earn a strike.'),
  antivideo: groupToggle('antivideo', 'Anti-video', 'videos from members are removed and earn a strike.'),
  antiaudio: groupToggle('antiaudio', 'Anti-audio', 'voice notes and audio from members are removed and earn a strike.'),
  antispam: groupToggle('antispam', 'Anti-spam', 'more than 6 messages in 8 seconds earns a strike.'),
  mediaonly: groupToggle('mediaonly', 'Media only', 'text messages from members are removed and earn a strike.', { turnsOff: 'textonly' }),
  textonly: groupToggle('textonly', 'Text only', 'media from members is removed and earns a strike.', { turnsOff: 'mediaonly' }),
  antidelete: groupToggle('antidelete', 'Anti-delete', 'deleted messages are put back for the group to see.', { needsAdmin: false }),
  antipromote: groupToggle('antipromote', 'Anti-promote', 'anyone promoted by someone other than the master is demoted again.'),
  antidemote: groupToggle('antidemote', 'Anti-demote', 'anyone demoted by someone other than the master is promoted back.'),

  antitag: {
    groupOnly: true, adminOnly: true,
    async run(ctx) {
      const [s0, s1] = ctx.args.map((a) => a.toLowerCase());
      if (s0 === 'on' || s0 === 'off') {
        setFlag(ctx.bot, ctx.jid, 'antitag', s0 === 'on' ? '1' : '0');
        const lines = [`${s0 === 'on' ? '🟢 On' : '🔴 Off'} — mass tagging is removed and earns a strike.`];
        if (s0 === 'on' && !ctx.botIsAdmin) lines.push('⚠️ Make me a group admin so I can act on it.');
        return ctx.reply(card('Anti-tag', lines));
      }
      if (s0 === 'limit' && parseInt(s1, 10) >= 2) {
        setFlag(ctx.bot, ctx.jid, 'tagmax', parseInt(s1, 10));
        return ctx.reply(card('Anti-tag', [`Limit set: ${parseInt(s1, 10)} tags in one message.`]));
      }
      const on = getFlag(ctx.bot, ctx.jid, 'antitag', '0') === '1';
      return ctx.reply(card('Anti-tag', [
        `Status: ${on ? '🟢 on' : '🔴 off'} · limit ${getFlag(ctx.bot, ctx.jid, 'tagmax', '5')} tags`,
        `Use: ${ctx.prefix}antitag on | off | limit 8`,
      ]));
    },
  },

  antibadword: {
    groupOnly: true, adminOnly: true,
    async run(ctx) {
      const sub = (ctx.args[0] || '').toLowerCase();
      const words = (getFlag(ctx.bot, ctx.jid, 'badwords', '') || '').split(',').filter(Boolean);
      if (sub === 'on' || sub === 'off') {
        setFlag(ctx.bot, ctx.jid, 'antibadword', sub === 'on' ? '1' : '0');
        const lines = [`${sub === 'on' ? '🟢 On' : '🔴 Off'} — banned words are removed and earn a strike.`];
        if (!words.length) lines.push(`The list is empty. Add words: ${ctx.prefix}antibadword add word1 word2`);
        return ctx.reply(card('Anti-badword', lines));
      }
      if (sub === 'add') {
        const add = ctx.args.slice(1).map((w) => w.toLowerCase().replace(/,/g, '')).filter(Boolean);
        if (!add.length) return ctx.reply(`Usage: ${ctx.prefix}antibadword add word1 word2`);
        const next = [...new Set([...words, ...add])];
        setFlag(ctx.bot, ctx.jid, 'badwords', next.join(','));
        return ctx.reply(card('Anti-badword', [`Added ${add.length}. The list now has ${next.length} word(s).`]));
      }
      if (sub === 'remove') {
        const rm = new Set(ctx.args.slice(1).map((w) => w.toLowerCase()));
        const next = words.filter((w) => !rm.has(w));
        setFlag(ctx.bot, ctx.jid, 'badwords', next.join(','));
        return ctx.reply(card('Anti-badword', [`Removed. The list now has ${next.length} word(s).`]));
      }
      if (sub === 'list') {
        return ctx.reply(card('Anti-badword', [words.length ? words.join(', ') : 'The list is empty.']));
      }
      const on = getFlag(ctx.bot, ctx.jid, 'antibadword', '0') === '1';
      return ctx.reply(card('Anti-badword', [
        `Status: ${on ? '🟢 on' : '🔴 off'} · ${words.length} word(s)`,
        `Use: ${ctx.prefix}antibadword on | off | add <words> | remove <word> | list`,
      ]));
    },
  },

  // Whole-bot switch: reject incoming WhatsApp calls.
  anticall: {
    sudoOnly: true,
    async run(ctx) {
      const s = (ctx.args[0] || '').toLowerCase();
      if (s === 'on' || s === 'off') {
        setBotSetting(ctx.bot, 'anticall', s === 'on' ? '1' : '0');
        return ctx.reply(card('Anti-call', [`${s === 'on' ? '🟢 On — calls to this number are rejected.' : '🔴 Off'}`]));
      }
      const on = getBotSetting(ctx.bot, 'anticall', '0') === '1';
      return ctx.reply(card('Anti-call', [`Status: ${on ? '🟢 on' : '🔴 off'}`, `Use: ${ctx.prefix}anticall on | off`]));
    },
  },
};
