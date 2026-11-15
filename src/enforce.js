// Runs on every group message from a normal member before commands are looked
// at: jail, mute, ban, slowmode and the protection switches.

import { getFlag, getMember, setMember, delMember } from './db.js';
import { card } from './style.js';
import { getContent, userPart } from './util.js';

const LINK_RE =
  /(https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/|\b[a-z0-9-]{2,}\.(com|net|org|io|me|ly|xyz|ng|co|info|app|link|site|online)\b)/i;
const MEDIA_TYPES = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'];

const lastMsg = new Map(); // slowmode
const burst = new Map(); // antispam

async function del(sock, jid, key) {
  try {
    await sock.sendMessage(jid, { delete: key });
  } catch {
    /* needs the bot to be admin */
  }
}

function badWords(bot, jid) {
  return (getFlag(bot, jid, 'badwords', '') || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function hasBadWord(text, words) {
  const t = text.toLowerCase();
  return words.some((w) => {
    const safe = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${safe}([^a-z0-9]|$)`).test(t);
  });
}

function isSpam(k) {
  const t = Date.now();
  const list = (burst.get(k) || []).filter((x) => t - x < 8000);
  list.push(t);
  burst.set(k, list);
  if (list.length > 6) {
    burst.set(k, []);
    return true;
  }
  return false;
}

// One strike. At the limit the member is removed (needs the bot to be admin).
export async function strike(ctx, userKey, userJid, reason) {
  const { sock, bot, jid, botIsAdmin } = ctx;
  const limit = parseInt(getFlag(bot, jid, 'warnlimit', '3'), 10) || 3;
  const row = getMember(bot, jid, userKey, 'warn');
  const count = parseInt(row?.value || '0', 10) + 1;

  if (count >= limit) {
    delMember(bot, jid, userKey, 'warn');
    let removed = false;
    if (botIsAdmin) {
      try {
        await sock.groupParticipantsUpdate(jid, [userJid], 'remove');
        removed = true;
      } catch {
        /* ignore */
      }
    }
    await sock.sendMessage(jid, {
      text: card('Sentence passed', [
        `@${userPart(userJid)} used up all ${limit} strikes.`,
        `Last charge: ${reason}`,
        removed ? '🚪 Removed from the group.' : '⚠️ I need admin rights to remove them.',
      ]),
      mentions: [userJid],
    });
    return { count, kicked: removed };
  }

  setMember(bot, jid, userKey, 'warn', String(count));
  await sock.sendMessage(jid, {
    text: card('Strike issued', [
      `@${userPart(userJid)} — strike *${count}/${limit}*`,
      `Charge: ${reason}`,
      `${limit - count} more and the cell door closes for good.`,
    ]),
    mentions: [userJid],
  });
  return { count, kicked: false };
}

// Returns true when the message was handled (deleted/blocked) and commands
// should not run for it.
export async function enforce(ctx) {
  const { sock, bot, jid, msg, userKey, senderJid, isAdmin, isMaster, isSudo, botIsAdmin } = ctx;
  if (msg.key.fromMe || isMaster || isSudo || isAdmin) return false;

  const c = getContent(msg);
  const t = Date.now();
  const key = `${bot}|${jid}|${userKey}`;

  // Banned members are removed again if they get back in and speak.
  if (getMember(bot, jid, userKey, 'ban')) {
    await del(sock, jid, msg.key);
    if (botIsAdmin) {
      try {
        await sock.groupParticipantsUpdate(jid, [senderJid], 'remove');
      } catch {
        /* ignore */
      }
    }
    return true;
  }

  // Jail and mute: the message is removed until release.
  for (const kind of ['jail', 'mute']) {
    const row = getMember(bot, jid, userKey, kind);
    if (!row) continue;
    if (row.until && row.until < t) {
      delMember(bot, jid, userKey, kind);
      if (kind === 'jail') {
        await sock.sendMessage(jid, {
          text: card('Sentence served', [`@${userPart(senderJid)} walks free. Behave.`]),
          mentions: [senderJid],
        });
      }
      continue;
    }
    await del(sock, jid, msg.key);
    return true;
  }

  const slow = parseInt(getFlag(bot, jid, 'slowmode', '0'), 10) || 0;
  if (slow > 0) {
    const last = lastMsg.get(key) || 0;
    if (t - last < slow * 1000) {
      await del(sock, jid, msg.key);
      return true;
    }
    lastMsg.set(key, t);
  }

  const on = (k) => getFlag(bot, jid, k, '0') === '1';
  const isMedia = MEDIA_TYPES.includes(c.type);
  let reason = null;

  if (on('antilink') && LINK_RE.test(c.text)) reason = 'posting links';
  else if (on('antibadword') && hasBadWord(c.text, badWords(bot, jid))) reason = 'bad language';
  else if (on('antitag') && c.mentions.length >= (parseInt(getFlag(bot, jid, 'tagmax', '5'), 10) || 5)) reason = 'mass tagging';
  else if (on('antisticker') && c.type === 'stickerMessage') reason = 'sending stickers';
  else if (on('antiimage') && c.type === 'imageMessage') reason = 'sending images';
  else if (on('antivideo') && c.type === 'videoMessage') reason = 'sending videos';
  else if (on('antiaudio') && c.type === 'audioMessage') reason = 'sending audio';
  else if (on('mediaonly') && !isMedia && c.text) reason = 'text in a media-only group';
  else if (on('textonly') && isMedia) reason = 'media in a text-only group';
  else if (on('antispam') && isSpam(key)) reason = 'spamming';

  if (!reason) return false;

  await del(sock, jid, msg.key);
  await strike(ctx, userKey, senderJid, reason);
  return true;
}
