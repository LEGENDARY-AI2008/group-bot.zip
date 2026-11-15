// Shared helpers: ids, message content, targets, small parsers.

// "2348012345678:12@s.whatsapp.net" -> "2348012345678" (also works for @lid)
export function userPart(jid) {
  if (!jid || typeof jid !== 'string') return null;
  return jid.split('@')[0].split(':')[0] || null;
}

export function collectIds(values) {
  const ids = new Set();
  for (const v of values) {
    const u = userPart(v);
    if (u) ids.add(u);
  }
  return ids;
}

export function sameUser(participant, idSet) {
  const candidates = [participant.id, participant.phoneNumber, participant.lid, participant.jid];
  return candidates.some((c) => {
    const u = userPart(c);
    return u && idSet.has(u);
  });
}

export function isAdminRole(participant) {
  return participant.admin === 'admin' || participant.admin === 'superadmin' || participant.admin === true;
}

// One stable key per person, even when WhatsApp shows them as @lid in one place
// and as a phone number in another.
export function canon(p) {
  return userPart(p.phoneNumber) || userPart(p.id);
}

export function findParticipant(metadata, jid) {
  const u = userPart(jid);
  if (!u) return null;
  const set = new Set([u]);
  return metadata?.participants?.find((p) => sameUser(p, set)) || null;
}

export function resolveKey(metadata, jid) {
  const p = findParticipant(metadata, jid);
  return p ? canon(p) : userPart(jid);
}

// Messages in groups with disappearing messages / view once come wrapped.
export function unwrap(message) {
  let cur = message;
  for (let i = 0; i < 5 && cur; i++) {
    const inner =
      cur.ephemeralMessage?.message ||
      cur.viewOnceMessage?.message ||
      cur.viewOnceMessageV2?.message ||
      cur.viewOnceMessageV2Extension?.message ||
      cur.documentWithCaptionMessage?.message;
    if (!inner) break;
    cur = inner;
  }
  return cur;
}

export function getContent(msg) {
  const m = msg.message || {};
  const type =
    Object.keys(m).find((k) => k !== 'messageContextInfo' && k !== 'senderKeyDistributionMessage') || 'unknown';
  const text =
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    '';
  const ctxInfo =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    m.stickerMessage?.contextInfo ||
    m.audioMessage?.contextInfo ||
    {};
  return { m, type, text, ctxInfo, mentions: ctxInfo.mentionedJid || [] };
}

// Who a command is aimed at: @mentions, else the author of the replied-to
// message, else numbers typed in the command.
export function targetJids(ctx) {
  const { ctxInfo } = getContent(ctx.msg);
  if (ctxInfo.mentionedJid?.length) return [...new Set(ctxInfo.mentionedJid)];
  if (ctxInfo.participant) return [ctxInfo.participant];
  return ctx.args
    .filter((a) => /^\+?\d{6,}$/.test(a))
    .map((a) => `${a.replace(/\D/g, '')}@s.whatsapp.net`);
}

const DURATION = /^(\d{1,4})([mhd]?)$/i;

// First "30", "30m", "2h" or "1d" in the args, in minutes.
export function parseMinutes(args, def, max) {
  for (const a of args) {
    const mm = DURATION.exec(a);
    if (!mm) continue;
    let n = parseInt(mm[1], 10);
    const unit = mm[2].toLowerCase();
    if (unit === 'h') n *= 60;
    if (unit === 'd') n *= 1440;
    return Math.min(Math.max(n, 1), max);
  }
  return def;
}

// Whatever is left after removing @mentions, numbers and durations.
export function reasonFrom(args, fallback = 'no reason given') {
  const words = args.filter((a) => !a.startsWith('@') && !/^\+?\d{6,}$/.test(a) && !DURATION.test(a));
  return words.join(' ').trim() || fallback;
}

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const mention = (jid) => '@' + userPart(jid);
