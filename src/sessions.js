import fs from 'fs';
import path from 'path';
import pino from 'pino';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  jidNormalizedUser,
} from '@whiskeysockets/baileys';
import { attachHandlers } from './handler.js';

const SESSIONS_DIR = process.env.SESSIONS_DIR || './sessions';
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS || '20', 10);
const PAIR_TIMEOUT_MS = 3 * 60 * 1000;
const logger = pino({ level: 'silent' });

fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// number -> { sock, status, stopped, pairTimer, codeResolve, codeReject }
const sessions = new Map();

const sessionDir = (number) => path.join(SESSIONS_DIR, number);

export function cleanNumber(raw) {
  const n = String(raw || '').replace(/\D/g, '');
  if (n.length < 8 || n.length > 15) return null;
  return n;
}

export function sessionCount() {
  return sessions.size;
}

export function getStatus(number) {
  return sessions.get(number)?.status || 'none';
}

async function removeSession(number) {
  const entry = sessions.get(number);
  if (entry) {
    entry.stopped = true;
    clearTimeout(entry.pairTimer);
    try { entry.sock?.end?.(undefined); } catch {}
    if (entry.codeReject) entry.codeReject(new Error('Session closed before a code was issued.'));
  }
  sessions.delete(number);
  fs.rmSync(sessionDir(number), { recursive: true, force: true });
}

async function connect(number, entry) {
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir(number));
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
  });
  entry.sock = sock;

  sock.ev.on('creds.update', saveCreds);
  attachHandlers(sock, number);

  let codeAsked = false;
  const askCode = async () => {
    if (codeAsked || !entry.codeResolve || sock.authState.creds.registered) return;
    codeAsked = true;
    const resolve = entry.codeResolve;
    const reject = entry.codeReject;
    entry.codeResolve = entry.codeReject = null;
    try {
      const code = await sock.requestPairingCode(number);
      entry.status = 'pairing';
      resolve(code);
    } catch (err) {
      reject(err);
    }
  };

  sock.ev.on('connection.update', async (u) => {
    if (u.qr) askCode(); // socket is ready for pairing
    if (u.connection === 'open') {
      entry.status = 'connected';
      clearTimeout(entry.pairTimer);
      console.log(`[${number}] connected`);
      try {
        const self = jidNormalizedUser(sock.user.id);
        await sock.sendMessage(self, {
          text: '✅ Your bot is connected.\n\nSend *.menu* in any chat to see commands. Add this number to a group and make it admin to use the group commands.',
        });
      } catch {}
    }
    if (u.connection === 'close') {
      if (entry.stopped) return;
      const code = u.lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log(`[${number}] logged out, removing session`);
        await removeSession(number);
        return;
      }
      // Normal after pairing (restart required) or after a network drop.
      if (entry.status !== 'pairing') entry.status = 'connecting';
      setTimeout(() => {
        if (!entry.stopped) connect(number, entry).catch((e) => console.error(`[${number}] reconnect failed`, e.message));
      }, 2000);
    }
  });

  // Fallback if the qr event never fires
  setTimeout(askCode, 6000);
}

export async function requestPairing(number) {
  const existing = sessions.get(number);
  if (existing?.status === 'connected') {
    throw new Error('This number is already connected.');
  }
  if (!existing && sessions.size >= MAX_SESSIONS) {
    throw new Error('The server is full right now. Try again later.');
  }
  if (existing) await removeSession(number); // restart a stale pairing attempt cleanly

  const entry = { sock: null, status: 'starting', stopped: false };
  sessions.set(number, entry);

  const codePromise = new Promise((resolve, reject) => {
    entry.codeResolve = resolve;
    entry.codeReject = reject;
  });

  entry.pairTimer = setTimeout(() => {
    if (entry.status !== 'connected') {
      console.log(`[${number}] pairing timed out`);
      removeSession(number);
    }
  }, PAIR_TIMEOUT_MS);

  try {
    await connect(number, entry);
    const code = await Promise.race([
      codePromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('WhatsApp took too long to respond. Try again.')), 25000)),
    ]);
    return code;
  } catch (err) {
    await removeSession(number);
    throw err;
  }
}

// Bring back every paired number after a restart
export async function restoreAll() {
  if (!fs.existsSync(SESSIONS_DIR)) return;
  for (const number of fs.readdirSync(SESSIONS_DIR)) {
    const credsPath = path.join(sessionDir(number), 'creds.json');
    if (!fs.existsSync(credsPath)) {
      fs.rmSync(sessionDir(number), { recursive: true, force: true });
      continue;
    }
    try {
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      if (!creds.registered) {
        fs.rmSync(sessionDir(number), { recursive: true, force: true });
        continue;
      }
    } catch {
      continue;
    }
    if (sessions.size >= MAX_SESSIONS) break;
    const entry = { sock: null, status: 'connecting', stopped: false };
    sessions.set(number, entry);
    connect(number, entry).catch((e) => console.error(`[${number}] restore failed`, e.message));
  }
  console.log(`Restored ${sessions.size} session(s)`);
}

export async function disconnect(number) {
  const entry = sessions.get(number);
  if (!entry) return false;
  try { await entry.sock?.logout(); } catch {}
  await removeSession(number);
  return true;
}
