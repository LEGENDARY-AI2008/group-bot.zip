import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { groupCommands } from './commands/group.js';
import { coreCommands } from './commands/core.js';
import { moderationCommands } from './commands/moderation.js';
import { protectionCommands } from './commands/protection.js';
import { groupExtraCommands } from './commands/groupextra.js';
import { botCommands } from './commands/bot.js';
import { funCommands } from './commands/fun.js';
import { mediaCommands } from './commands/media.js';
import { deviceCommands } from './commands/device.js';
import { getGroup, getBotSetting } from './db.js';
import { PREFIX, MASTER_NUMBERS, msg as m, card } from './style.js';
import { enforce } from './enforce.js';
import { collectIds, sameUser, isAdminRole, userPart, getContent } from './util.js';
import { getSudoList } from './commands/bot.js';

const commands = {
  ...coreCommands,
  ...groupCommands,
  ...moderationCommands,
  ...protectionCommands,
  ...groupExtraCommands,
  ...botCommands,
  ...funCommands,
  ...mediaCommands,
  ...deviceCommands,
};

export function attachHandlers(sock, bot) {
  // Welcome and goodbye messages
  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    try {
      const settings = getGroup(bot, id);
      for (const p of participants) {
        const jid = typeof p === 'string' ? p : p.id;
        const name = '@' + jid.split('@')[0];
        if (action === 'add' && settings.welcome_enabled) {
          const text = (settings.welcome_text || 'Welcome {name}! 👋').replaceAll('{name}', name);
          await sock.sendMessage(id, { text, mentions: [jid] });
        }
        if (action === 'remove' && settings.goodbye_enabled) {
          const text = (settings.goodbye_text || 'Goodbye {name} 👋').replaceAll('{name}', name);
          await sock.sendMessage(id, { text, mentions: [jid] });
        }
      }
    } catch (err) {
      console.error(`[${bot}] participants.update error:`, err.message);
    }
  });

  // Anti-call: reject incoming calls when switched on
  sock.ev.on('call', async (calls) => {
    if (getBotSetting(bot, 'anticall', '0') !== '1') return;
    for (const c of calls) {
      try {
        if (c.status === 'offer') await sock.rejectCall(c.id, c.from);
      } catch {
        /* ignore */
      }
    }
  });

  // Commands
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        await handleMessage(sock, bot, msg);
      } catch (err) {
        console.error(`[${bot}] handler error:`, err);
      }
    }
  });
}

function isAdminOf(metadata, ids) {
  const p = metadata.participants.find((x) => sameUser(x, ids));
  return { p, admin: !!p && isAdminRole(p) };
}

async function handleMessage(sock, bot, msg) {
  if (!msg.message) return;
  const jid = msg.key.remoteJid;
  if (!jid || jid === 'status@broadcast') return;

  // Protection (jail, mute, switches) must see EVERY group message, not only commands,
  // so the command lookup happens after the protection check below.
  const { text } = getContent(msg);
  const isCommand = text.startsWith(PREFIX);
  const [cmdName, ...args] = isCommand ? text.slice(PREFIX.length).trim().split(/\s+/) : [];
  const cmd = isCommand ? commands[cmdName?.toLowerCase()] : null;

  const isGroup = jid.endsWith('@g.us');
  const reply = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });
  const botJid = jidNormalizedUser(sock.user.id);

  // Public / private mode. Private = only the master and sudo users get answers.
  const senderRaw = msg.key.participant || jid;
  const senderIds = collectIds([
    msg.key.participant,
    msg.key.participantAlt,
    msg.key.participantPn,
    msg.key.remoteJidAlt,
  ]);
  const sudoList = getSudoList(bot);
  const isMaster = msg.key.fromMe || MASTER_NUMBERS.some((n) => senderIds.has(n));
  const isSudo = isMaster || sudoList.some((n) => senderIds.has(n));
  let metadata = null;
  let isAdmin = false;
  let botIsAdmin = false;
  let userKey = userPart(senderRaw);

  if (isGroup) {
    metadata = await sock.groupMetadata(jid);
    const botIds = collectIds([sock.user?.id, sock.user?.lid]);
    const me = isAdminOf(metadata, senderIds);
    const bt = isAdminOf(metadata, botIds);
    isAdmin = me.admin;
    botIsAdmin = bt.admin;
    // Stable key for storage: the phone number when WhatsApp gives it
    userKey = (me.p && (userPart(me.p.phoneNumber) || userPart(me.p.id))) || userKey;

    if (process.env.DEBUG_ADMIN === '1') {
      console.log(`[${bot}] admin check`, { sender: [...senderIds], matched: !!me.p, isAdmin, botIsAdmin });
    }
  }

  const senderJid = isGroup && msg.key.participant ? msg.key.participant : jid;
  const ctx = {
    sock, bot, msg, jid, args, metadata, reply, botJid,
    prefix: PREFIX, isGroup, isAdmin, botIsAdmin, isMaster, isSudo,
    userKey, senderJid,
  };

  // Protection checks run before commands. A member who breaks a rule has their
  // message removed and earns a strike, unless the command itself is what they sent.
  if (isGroup && !msg.key.fromMe) {
    const handled = await enforce(ctx);
    if (handled) return;
  }

  // Everything below is for commands only.
  if (!cmd) return;

  const mode = getBotSetting(bot, 'mode', 'public');
  if (mode === 'private' && !isSudo) return;
  if (cmd.sudoOnly && !isSudo) return reply(card('Masters only', ['This command is for the master and sudo users.']));
  if (cmd.groupOnly && !isGroup) return reply(m.groupOnly());

  if (cmd.adminOnly && !isAdmin && !isMaster && !isSudo && !msg.key.fromMe) {
    return reply(m.notAdmin());
  }
  if (cmd.botAdminOnly && !botIsAdmin) {
    return reply(m.botNotAdmin());
  }

  try {
    await cmd.run(ctx);
  } catch (err) {
    console.error(`[${bot}] .${cmdName} failed:`, err);
    await reply(m.error(cmdName));
  }
}
