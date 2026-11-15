// One place for the bot's look and wording. Change BOT_NAME / MASTER_NAME in
// the environment (or the defaults below) and every reply follows.

export const BOT_NAME = process.env.BOT_NAME || '乂օռʟʏ숬ʍɨʟɛӼ乂';
export const MASTER_NAME = process.env.MASTER_NAME || '乂օռʟʏ숬ʍɨʟɛӼ乂';
export const PREFIX = process.env.PREFIX || '.';

// Numbers (country code, digits only, comma separated) that count as the master.
// The master can use admin-only commands in any group the bot is in.
export const MASTER_NUMBERS = (process.env.MASTER_NUMBERS || '')
  .split(',')
  .map((n) => n.replace(/\D/g, ''))
  .filter(Boolean);

const LINE = '━━━━━━━━━━━━━━━━━━━━';

// A titled card: header, a divider, the lines, then the footer.
export function card(title, lines = []) {
  const body = Array.isArray(lines) ? lines.join('\n') : lines;
  return `╭${LINE}\n┃ ✦ *${title}*\n╰${LINE}\n${body ? body + '\n' : ''}\n_${BOT_NAME} · serving ${MASTER_NAME}_`;
}

export const msg = {
  notAdmin: () => card('Admins only', ['This command is for group admins.']),
  botNotAdmin: () => card('Need admin rights', ['Make me a group admin first, then try again.']),
  groupOnly: () => card('Groups only', ['Use this command inside a group.']),
  error: (cmd) => card('Something went wrong', [`.${cmd} could not finish. Try again.`]),
  ok: (title, text) => card(title, [text]),
};
