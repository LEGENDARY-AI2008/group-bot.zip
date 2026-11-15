import { getGroup, setGroupField } from '../db.js';

const digitsToJid = (num) => `${num.replace(/\D/g, '')}@s.whatsapp.net`;
const numberArgs = (args) => args.filter((a) => /\d{6,}/.test(a)).map(digitsToJid);

function getTargets(ctx) {
  const info = ctx.msg.message?.extendedTextMessage?.contextInfo;
  if (info?.mentionedJid?.length) return info.mentionedJid;
  if (info?.participant) return [info.participant];
  return numberArgs(ctx.args);
}

function quotedKey(ctx) {
  const info = ctx.msg.message?.extendedTextMessage?.contextInfo;
  if (!info?.stanzaId) return null;
  return {
    remoteJid: ctx.jid,
    fromMe: false,
    id: info.stanzaId,
    participant: info.participant,
  };
}

function toggleCommand(label, enabledField, textField, hint) {
  return {
    groupOnly: true,
    adminOnly: true,
    async run(ctx) {
      const [sub, ...rest] = ctx.args;
      const s = (sub || '').toLowerCase();
      if (s === 'on') {
        setGroupField(ctx.bot, ctx.jid, enabledField, 1);
        return ctx.reply(`${label} messages on.`);
      }
      if (s === 'off') {
        setGroupField(ctx.bot, ctx.jid, enabledField, 0);
        return ctx.reply(`${label} messages off.`);
      }
      if (s === 'set' && rest.length) {
        setGroupField(ctx.bot, ctx.jid, textField, rest.join(' '));
        return ctx.reply(`${label} text saved. Use {name} for ${hint}.`);
      }
      return ctx.reply(`Usage: .${label.toLowerCase()} on | off | set <text>`);
    },
  };
}

export const groupCommands = {
  add: {
    groupOnly: true, adminOnly: true, botAdminOnly: true,
    async run(ctx) {
      const nums = numberArgs(ctx.args);
      if (!nums.length) return ctx.reply('Usage: .add 2348012345678');
      const res = await ctx.sock.groupParticipantsUpdate(ctx.jid, nums, 'add');
      const failed = res.filter((r) => String(r.status) !== '200');
      return ctx.reply(
        failed.length
          ? `Could not add ${failed.length} number(s). Their privacy settings may block it.`
          : `Added ${nums.length} member(s).`
      );
    },
  },

  kick: {
    groupOnly: true, adminOnly: true, botAdminOnly: true,
    async run(ctx) {
      const targets = getTargets(ctx).filter((t) => t !== ctx.botJid);
      if (!targets.length) return ctx.reply('Tag, reply to, or type the number to remove.');
      await ctx.sock.groupParticipantsUpdate(ctx.jid, targets, 'remove');
      return ctx.reply(`Removed ${targets.length} member(s).`);
    },
  },

  promote: {
    groupOnly: true, adminOnly: true, botAdminOnly: true,
    async run(ctx) {
      const targets = getTargets(ctx);
      if (!targets.length) return ctx.reply('Tag, reply to, or type the number to promote.');
      await ctx.sock.groupParticipantsUpdate(ctx.jid, targets, 'promote');
      return ctx.reply(`Promoted ${targets.length} member(s).`);
    },
  },

  demote: {
    groupOnly: true, adminOnly: true, botAdminOnly: true,
    async run(ctx) {
      const targets = getTargets(ctx);
      if (!targets.length) return ctx.reply('Tag, reply to, or type the number to demote.');
      await ctx.sock.groupParticipantsUpdate(ctx.jid, targets, 'demote');
      return ctx.reply(`Demoted ${targets.length} member(s).`);
    },
  },

  tagall: {
    groupOnly: true, adminOnly: true,
    async run(ctx) {
      const mentions = ctx.metadata.participants.map((p) => p.id);
      const text = ctx.args.join(' ');
      const list = mentions.map((m) => `@${m.split('@')[0]}`).join('\n');
      return ctx.sock.sendMessage(ctx.jid, {
        text: `${text ? text + '\n\n' : ''}${list}`,
        mentions,
      });
    },
  },

  tagadmins: {
    groupOnly: true, adminOnly: true,
    async run(ctx) {
      const admins = ctx.metadata.participants.filter((p) => p.admin).map((p) => p.id);
      const list = admins.map((m) => `@${m.split('@')[0]}`).join('\n');
      return ctx.sock.sendMessage(ctx.jid, { text: `Attention admins:\n${list}`, mentions: admins });
    },
  },

  hidetag: {
    groupOnly: true, adminOnly: true,
    async run(ctx) {
      const text = ctx.args.join(' ');
      if (!text) return ctx.reply('Usage: .hidetag your message');
      const mentions = ctx.metadata.participants.map((p) => p.id);
      return ctx.sock.sendMessage(ctx.jid, { text, mentions });
    },
  },

  groupname: {
    groupOnly: true, adminOnly: true, botAdminOnly: true,
    async run(ctx) {
      const name = ctx.args.join(' ').trim();
      if (!name) return ctx.reply('Usage: .groupname New Name');
      await ctx.sock.groupUpdateSubject(ctx.jid, name);
      return ctx.reply('Group name updated.');
    },
  },

  groupdesc: {
    groupOnly: true, adminOnly: true, botAdminOnly: true,
    async run(ctx) {
      const desc = ctx.args.join(' ').trim();
      if (!desc) return ctx.reply('Usage: .groupdesc New description');
      await ctx.sock.groupUpdateDescription(ctx.jid, desc);
      return ctx.reply('Group description updated.');
    },
  },

  grouplink: {
    groupOnly: true, adminOnly: true, botAdminOnly: true,
    async run(ctx) {
      const code = await ctx.sock.groupInviteCode(ctx.jid);
      return ctx.reply(`https://chat.whatsapp.com/${code}`);
    },
  },

  resetgrouplink: {
    groupOnly: true, adminOnly: true, botAdminOnly: true,
    async run(ctx) {
      await ctx.sock.groupRevokeInvite(ctx.jid);
      const code = await ctx.sock.groupInviteCode(ctx.jid);
      return ctx.reply(`New link: https://chat.whatsapp.com/${code}`);
    },
  },

  invite: {
    groupOnly: true, adminOnly: true, botAdminOnly: true,
    async run(ctx) {
      const nums = numberArgs(ctx.args);
      if (!nums.length) return ctx.reply('Usage: .invite 2348012345678');
      const code = await ctx.sock.groupInviteCode(ctx.jid);
      for (const jid of nums) {
        await ctx.sock.sendMessage(jid, {
          text: `You are invited to join *${ctx.metadata.subject}*:\nhttps://chat.whatsapp.com/${code}`,
        });
      }
      return ctx.reply(`Invite sent to ${nums.length} number(s).`);
    },
  },

  announce: {
    groupOnly: true, adminOnly: true,
    async run(ctx) {
      const text = ctx.args.join(' ');
      if (!text) return ctx.reply('Usage: .announce your message');
      const mentions = ctx.metadata.participants.map((p) => p.id);
      return ctx.sock.sendMessage(ctx.jid, { text: `📢 *ANNOUNCEMENT*\n\n${text}`, mentions });
    },
  },

  open: {
    groupOnly: true, adminOnly: true, botAdminOnly: true,
    async run(ctx) {
      await ctx.sock.groupSettingUpdate(ctx.jid, 'not_announcement');
      return ctx.reply('Group opened. Everyone can send messages.');
    },
  },

  close: {
    groupOnly: true, adminOnly: true, botAdminOnly: true,
    async run(ctx) {
      await ctx.sock.groupSettingUpdate(ctx.jid, 'announcement');
      return ctx.reply('Group closed. Only admins can send messages.');
    },
  },

  welcome: toggleCommand('Welcome', 'welcome_enabled', 'welcome_text', 'the new member'),
  goodbye: toggleCommand('Goodbye', 'goodbye_enabled', 'goodbye_text', 'the member who left'),

  pin: {
    groupOnly: true, adminOnly: true, botAdminOnly: true,
    async run(ctx) {
      const key = quotedKey(ctx);
      if (!key) return ctx.reply('Reply to the message you want to pin.');
      await ctx.sock.sendMessage(ctx.jid, { pin: key, type: 1, time: 604800 });
      return ctx.reply('Message pinned for 7 days.');
    },
  },

  unpin: {
    groupOnly: true, adminOnly: true, botAdminOnly: true,
    async run(ctx) {
      const key = quotedKey(ctx);
      if (!key) return ctx.reply('Reply to the pinned message to unpin it.');
      await ctx.sock.sendMessage(ctx.jid, { pin: key, type: 0 });
      return ctx.reply('Message unpinned.');
    },
  },

  groupstatus: {
    groupOnly: true,
    async run(ctx) {
      const m = ctx.metadata;
      const s = getGroup(ctx.bot, ctx.jid);
      const admins = m.participants.filter((p) => p.admin).length;
      return ctx.reply(
        `*${m.subject}*\n` +
          `Members: ${m.participants.length}\n` +
          `Admins: ${admins}\n` +
          `Created: ${new Date(m.creation * 1000).toLocaleString('en-NG')}\n` +
          `Welcome: ${s.welcome_enabled ? 'on' : 'off'}\n` +
          `Goodbye: ${s.goodbye_enabled ? 'on' : 'off'}`
      );
    },
  },
};
