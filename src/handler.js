import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { groupCommands } from './commands/group.js';
import { coreCommands } from './commands/core.js';
import { getGroup } from './db.js';

const PREFIX = process.env.PREFIX || '.';
const commands = { ...coreCommands, ...groupCommands };

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

async function handleMessage(sock, bot, msg) {
  if (!msg.message) return;
  const jid = msg.key.remoteJid;
  if (!jid || jid === 'status@broadcast') return;

  const text =
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    msg.message.imageMessage?.caption ||
    msg.message.videoMessage?.caption ||
    '';
  if (!text.startsWith(PREFIX)) return;

  const [cmdName, ...args] = text.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = commands[cmdName?.toLowerCase()];
  if (!cmd) return;

  const isGroup = jid.endsWith('@g.us');
  const reply = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });
  const botJid = jidNormalizedUser(sock.user.id);

  if (cmd.groupOnly && !isGroup) return reply('This command works in groups only.');

  let metadata = null;
  let isAdmin = false;
  let botIsAdmin = false;

  if (isGroup) {
    metadata = await sock.groupMetadata(jid);
    const sender = jidNormalizedUser(msg.key.participant || jid);
    const me = metadata.participants.find((p) => jidNormalizedUser(p.id) === sender);
    const bt = metadata.participants.find((p) => jidNormalizedUser(p.id) === botJid);
    isAdmin = !!me?.admin;
    botIsAdmin = !!bt?.admin;
  }

  // The owner (the account the bot runs on) always counts as admin-level
  if (cmd.adminOnly && !isAdmin && !msg.key.fromMe) {
    return reply('Only group admins can use this command.');
  }
  if (cmd.botAdminOnly && !botIsAdmin) {
    return reply('I need to be a group admin to do that.');
  }

  try {
    await cmd.run({ sock, bot, msg, jid, args, metadata, reply, botJid });
  } catch (err) {
    console.error(`[${bot}] .${cmdName} failed:`, err);
    await reply(`Something went wrong running .${cmdName}.`);
  }
}
