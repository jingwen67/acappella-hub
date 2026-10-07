import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createGoogle, parseFolderId, parseMultipart, parseSpreadsheetId, redirectUri, scoreFileType, sheetLink } from './google.js';

const root = import.meta.dirname;
const port = Number(process.env.PORT) || 4173;
const page = readFileSync(join(root, 'public', 'index.html'));
const assets = {
  '/manifest.webmanifest': ['application/manifest+json; charset=utf-8', readFileSync(join(root, 'public', 'manifest.webmanifest'))],
  '/apple-touch-icon.png': ['image/png', readFileSync(join(root, 'public', 'apple-touch-icon.png'))],
  '/icon-192.png': ['image/png', readFileSync(join(root, 'public', 'icon-192.png'))],
  '/icon-512.png': ['image/png', readFileSync(join(root, 'public', 'icon-512.png'))],
};
const dataDir = join(root, 'data');
const google = createGoogle(dataDir);

mkdirSync(dataDir, { recursive: true });
const avatarDir = join(dataDir, 'avatars');
mkdirSync(avatarDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, 'poll.db'));
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 3000;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS phases (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    closed_at TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS one_open_phase
    ON phases(status) WHERE status = 'open';

  CREATE TABLE IF NOT EXISTS candidacies (
    phase_id INTEGER NOT NULL REFERENCES phases(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    PRIMARY KEY (phase_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS votes (
    phase_id INTEGER NOT NULL REFERENCES phases(id),
    voter_id INTEGER NOT NULL REFERENCES users(id),
    candidate_id INTEGER NOT NULL REFERENCES users(id),
    reaction TEXT NOT NULL CHECK (reaction IN ('like', 'again')),
    PRIMARY KEY (phase_id, voter_id, candidate_id)
  );

  CREATE TABLE IF NOT EXISTS arrangers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS semesters (
    id INTEGER PRIMARY KEY,
    label TEXT NOT NULL UNIQUE COLLATE NOCASE,
    folder_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    arranger TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('big', 'small')),
    semester_id INTEGER REFERENCES semesters(id),
    semester_label TEXT NOT NULL,
    file_name TEXT NOT NULL,
    drive_file_id TEXT,
    drive_url TEXT,
    uploaded_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );
`);

const userColumns = new Set(db.prepare(`PRAGMA table_info(users)`).all().map((column) => column.name));
if (!userColumns.has('is_admin')) db.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`);
if (!userColumns.has('can_start')) db.exec(`ALTER TABLE users ADD COLUMN can_start INTEGER NOT NULL DEFAULT 0`);
if (!userColumns.has('is_md')) db.exec(`ALTER TABLE users ADD COLUMN is_md INTEGER NOT NULL DEFAULT 0`);
if (!userColumns.has('is_arranger')) db.exec(`ALTER TABLE users ADD COLUMN is_arranger INTEGER NOT NULL DEFAULT 0`);
for (const column of ['is_alumni', 'is_president', 'is_vp', 'is_secretary', 'is_treasurer', 'is_media']) {
  if (!userColumns.has(column)) db.exec(`ALTER TABLE users ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
}
for (const column of ['full_name', 'pronouns', 'position', 'voice_part', 'school', 'grad_year', 'program', 'fun_fact', 'favorite_food', 'avatar_ext']) {
  if (!userColumns.has(column)) db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
}
const scoreColumns = new Set(db.prepare(`PRAGMA table_info(scores)`).all().map((column) => column.name));
if (!scoreColumns.has('kinds')) db.exec(`ALTER TABLE scores ADD COLUMN kinds TEXT NOT NULL DEFAULT ''`);
const phaseColumns = new Set(db.prepare(`PRAGMA table_info(phases)`).all().map((column) => column.name));
if (!phaseColumns.has('arranger_id')) db.exec(`ALTER TABLE phases ADD COLUMN arranger_id INTEGER REFERENCES users(id)`);

const statements = {
  userByName: db.prepare(`SELECT id, name, password_hash FROM users WHERE name = ? COLLATE NOCASE`),
  insertUser: db.prepare(`INSERT INTO users (name, password_hash, created_at) VALUES (?, ?, ?)`),
  userBySession: db.prepare(`
    SELECT u.id AS id, u.name AS name, u.is_admin AS is_admin, u.can_start AS can_start,
      u.is_md AS is_md, u.is_arranger AS is_arranger
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `),
  account: db.prepare(`SELECT id, name, is_admin, can_start, is_md, is_arranger, is_alumni FROM users WHERE id = ?`),
  anyAdmin: db.prepare(`SELECT id FROM users WHERE is_admin = 1 LIMIT 1`),
  insertAdmin: db.prepare(`
    INSERT INTO users (name, password_hash, created_at, is_admin, can_start)
    VALUES (?, ?, ?, 1, 1)
  `),
  listUsers: db.prepare(`
    SELECT id, name, is_admin, can_start, is_md, is_arranger,
      is_alumni, is_president, is_vp, is_secretary, is_treasurer, is_media,
      full_name, pronouns, position, voice_part, school, grad_year, program, fun_fact, favorite_food, avatar_ext
    FROM users
    WHERE is_admin = 0
  `),
  profileById: db.prepare(`
    SELECT id, name, is_admin, can_start, is_md, is_arranger,
      is_alumni, is_president, is_vp, is_secretary, is_treasurer, is_media,
      full_name, pronouns, position, voice_part, school, grad_year, program, fun_fact, favorite_food, avatar_ext
    FROM users
    WHERE id = ?
  `),
  saveProfile: db.prepare(`
    UPDATE users
    SET full_name = ?, pronouns = ?, position = ?, voice_part = ?, school = ?, grad_year = ?, program = ?, fun_fact = ?, favorite_food = ?
    WHERE id = ?
  `),
  setAvatar: db.prepare(`UPDATE users SET avatar_ext = ? WHERE id = ?`),
  setMusicDirector: db.prepare(`UPDATE users SET is_md = ? WHERE id = ? AND is_admin = 0`),
  setArranger: db.prepare(`UPDATE users SET is_arranger = ? WHERE id = ?`),
  setAlumni: db.prepare(`UPDATE users SET is_alumni = ? WHERE id = ? AND is_admin = 0`),
  setPresident: db.prepare(`UPDATE users SET is_president = ? WHERE id = ? AND is_admin = 0`),
  setVicePresident: db.prepare(`UPDATE users SET is_vp = ? WHERE id = ? AND is_admin = 0`),
  setSecretary: db.prepare(`UPDATE users SET is_secretary = ? WHERE id = ? AND is_admin = 0`),
  setTreasurer: db.prepare(`UPDATE users SET is_treasurer = ? WHERE id = ? AND is_admin = 0`),
  setMedia: db.prepare(`UPDATE users SET is_media = ? WHERE id = ? AND is_admin = 0`),
  deleteUser: db.prepare(`DELETE FROM users WHERE id = ? AND is_admin = 0`),
  renameUser: db.prepare(`UPDATE users SET name = ? WHERE id = ? AND is_admin = 0`),
  setPassword: db.prepare(`UPDATE users SET password_hash = ? WHERE id = ? AND is_admin = 0`),
  deleteUserSessions: db.prepare(`DELETE FROM sessions WHERE user_id = ?`),
  deleteUserVotes: db.prepare(`DELETE FROM votes WHERE voter_id = ? OR candidate_id = ?`),
  deleteUserCandidacies: db.prepare(`DELETE FROM candidacies WHERE user_id = ?`),
  clearPhaseArranger: db.prepare(`UPDATE phases SET arranger_id = NULL WHERE arranger_id = ?`),
  reassignPhaseCreator: db.prepare(`UPDATE phases SET created_by = ? WHERE created_by = ?`),
  reassignScoreUploader: db.prepare(`UPDATE scores SET uploaded_by = ? WHERE uploaded_by = ?`),
  listRounds: db.prepare(`
    SELECT p.id, p.title, p.status, p.closed_at, u.name AS opened_by
    FROM phases p
    JOIN users u ON u.id = p.created_by
    ORDER BY p.id DESC
  `),
  deletePhaseVotes: db.prepare(`DELETE FROM votes WHERE phase_id = ?`),
  deletePhaseCandidacies: db.prepare(`DELETE FROM candidacies WHERE phase_id = ?`),
  deletePhase: db.prepare(`DELETE FROM phases WHERE id = ?`),
  insertSession: db.prepare(`INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)`),
  deleteSession: db.prepare(`DELETE FROM sessions WHERE token = ?`),
  openPhase: db.prepare(`
    SELECT p.id, p.title, p.status, p.created_by, p.arranger_id, p.created_at, p.closed_at,
      u.name AS opened_by, a.name AS arranger_name
    FROM phases p
    JOIN users u ON u.id = p.created_by
    LEFT JOIN users a ON a.id = p.arranger_id
    WHERE p.status = 'open'
  `),
  phaseById: db.prepare(`SELECT id, status FROM phases WHERE id = ?`),
  insertPhase: db.prepare(`
    INSERT INTO phases (title, status, created_by, arranger_id, created_at) VALUES (?, 'open', ?, ?, ?)
  `),
  closePhase: db.prepare(`UPDATE phases SET status = 'closed', closed_at = ? WHERE id = ? AND status = 'open'`),
  history: db.prepare(`
    SELECT p.id, p.title, p.closed_at, p.created_by, p.arranger_id, a.name AS arranger_name
    FROM phases p
    LEFT JOIN users a ON a.id = p.arranger_id
    WHERE p.status = 'closed' AND (? = 1 OR p.arranger_id = ?)
    ORDER BY p.id DESC
    LIMIT 12
  `),
  candidates: db.prepare(`
    SELECT u.id AS id, u.name AS name, c.created_at AS joined_at,
      (SELECT COUNT(*) FROM votes v
        WHERE v.phase_id = ? AND v.candidate_id = u.id AND v.reaction = 'like') AS likes,
      (SELECT COUNT(*) FROM votes v
        WHERE v.phase_id = ? AND v.candidate_id = u.id AND v.reaction = 'again') AS again,
      (SELECT v.reaction FROM votes v
        WHERE v.phase_id = ? AND v.candidate_id = u.id AND v.voter_id = ?) AS mine
    FROM candidacies c
    JOIN users u ON u.id = c.user_id
    WHERE c.phase_id = ?
    ORDER BY c.created_at ASC, u.id ASC
  `),
  insertCandidacy: db.prepare(`
    INSERT INTO candidacies (phase_id, user_id, created_at) VALUES (?, ?, ?)
  `),
  deleteCandidacy: db.prepare(`DELETE FROM candidacies WHERE phase_id = ? AND user_id = ?`),
  deleteVotesForCandidate: db.prepare(`DELETE FROM votes WHERE phase_id = ? AND candidate_id = ?`),
  upsertVote: db.prepare(`
    INSERT INTO votes (phase_id, voter_id, candidate_id, reaction)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (phase_id, voter_id, candidate_id)
    DO UPDATE SET reaction = excluded.reaction
  `),
  deleteVote: db.prepare(`
    DELETE FROM votes WHERE phase_id = ? AND voter_id = ? AND candidate_id = ?
  `),
  isCandidate: db.prepare(`
    SELECT 1 AS ok FROM candidacies WHERE phase_id = ? AND user_id = ?
  `),
  listArrangers: db.prepare(`SELECT id, name FROM arrangers`),
  scoreArrangerRows: db.prepare(`SELECT arranger, created_at FROM scores`),
  arrangerByName: db.prepare(`SELECT id, name FROM arrangers WHERE name = ? COLLATE NOCASE`),
  insertArranger: db.prepare(`INSERT INTO arrangers (name, created_at) VALUES (?, ?)`),
  listSemesters: db.prepare(`SELECT id, label FROM semesters ORDER BY id DESC`),
  semesterById: db.prepare(`SELECT id, label, folder_id FROM semesters WHERE id = ?`),
  insertSemester: db.prepare(`INSERT INTO semesters (label, folder_id, created_at) VALUES (?, ?, ?)`),
  scoreCountForSemester: db.prepare(`SELECT COUNT(*) AS n FROM scores WHERE semester_id = ?`),
  deleteSemester: db.prepare(`DELETE FROM semesters WHERE id = ?`),
  insertScore: db.prepare(`
    INSERT INTO scores (
      title, arranger, kind, kinds, semester_id, semester_label, file_name, drive_file_id, drive_url, uploaded_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateScoreByFolder: db.prepare(`
    UPDATE scores
    SET title = ?, arranger = ?, kind = ?, kinds = ?, semester_id = ?, semester_label = ?, file_name = ?, drive_url = ?
    WHERE drive_file_id = ?
  `),
};

for (const name of [
  'Ashley',
  'Charlie Mei',
  'Chris Lee',
  'Christina Wang',
  'Jace Li',
  'Jane Ye',
  'Joey Zhao',
  'Lance Chen',
  'Max Gao',
  'PennYo',
  'Pentatonix',
  'Sophia Peng',
  'Wei You',
  '未知网络作者 / unknown online author',
]) {
  if (!statements.arrangerByName.get(name)) statements.insertArranger.run(name, now());
}

for (const oldName of ['网络作者', '网络作者 / Online author']) {
  const legacy = statements.arrangerByName.get(oldName);
  if (!legacy || legacy.name !== oldName) continue;
  if (statements.arrangerByName.get('未知网络作者 / unknown online author')) {
    db.prepare(`DELETE FROM arrangers WHERE id = ?`).run(legacy.id);
  } else {
    db.prepare(`UPDATE arrangers SET name = ? WHERE id = ?`).run('未知网络作者 / unknown online author', legacy.id);
  }
}

function splitArrangers(value) {
  return String(value || '').split(/[,，、]/).map((name) => name.trim()).filter(Boolean);
}

function kindsFromSheet(value) {
  const text = String(value || '').toLowerCase();
  const kinds = [];
  if (text.includes('大歌') || text.includes('all members') || /(?:^|[^a-z])all(?:[^a-z]|$)/.test(text)) kinds.push('all');
  if (text.includes('小组') || text.includes('小歌') || text.includes('small group') || text.includes('group')) kinds.push('group');
  return kinds;
}

function semesterCell(existing, sourceLabel, destLabel) {
  const parts = String(existing || '').split(/[,，]/).map((part) => part.trim()).filter(Boolean);
  const same = (part, label) => part.toLowerCase() === String(label || '').trim().toLowerCase();
  if (!parts.length) return destLabel;
  if (same(sourceLabel, destLabel)) {
    if (parts.some((part) => same(part, destLabel))) return parts.join(', ');
    return [...parts, destLabel].join(', ');
  }
  const next = parts.filter((part) => !same(part, sourceLabel));
  if (!next.some((part) => same(part, destLabel))) next.push(destLabel);
  return next.join(', ') || destLabel;
}

function driveId(value) {
  const id = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(id)) return '';
  return id;
}

function scoreUploads(parts) {
  const files = parts.filter((item) => (item.name === 'files' || item.name === 'folder') && item.filename && item.body.length);
  const uploads = [];
  const usedNames = new Set();
  for (const file of files) {
    const base = file.filename.split(/[/\\]/).pop() || '';
    if (!base || base.startsWith('.') || base === 'Thumbs.db') continue;
    let name = base.replace(/[\\/]/g, ' ');
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let n = 2;
    while (usedNames.has(name.toLowerCase())) {
      name = `${stem} (${n})${ext}`;
      n += 1;
    }
    usedNames.add(name.toLowerCase());
    uploads.push({ name, mime: scoreFileType(name) || 'application/octet-stream', bytes: file.body });
  }
  return uploads;
}

function ensureArranger(name) {
  const clean = cleanText(name, 60);
  if (!clean) return '';
  let row = statements.arrangerByName.get(clean);
  if (!row) {
    try {
      statements.insertArranger.run(clean, now());
    } catch (error) {
      if (!String(error.message).includes('UNIQUE')) throw error;
    }
    row = statements.arrangerByName.get(clean);
  }
  return row ? row.name : '';
}

function now() {
  return new Date().toISOString();
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const actual = Buffer.from(hashHex, 'hex');
  const expected = scryptSync(password, Buffer.from(saltHex, 'hex'), 32);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text || text.length > max || /[\u0000-\u001f]/.test(text)) return '';
  return text;
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

function sessionCookie(token, maxAge) {
  return `solo_sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function asUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    isAdmin: Boolean(row.is_admin),
    isMd: Boolean(row.is_md),
    isArranger: Boolean(row.is_arranger),
  };
}

function isManager(account) {
  return Boolean(account?.isAdmin || account?.isMd);
}

function avatarUrl(row) {
  if (!row?.avatar_ext) return '';
  const file = join(avatarDir, `${row.id}.${row.avatar_ext}`);
  if (!existsSync(file)) return '';
  return `/api/avatars/${row.id}?v=${Math.round(statSync(file).mtimeMs)}`;
}

function publicProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    fullName: row.full_name || '',
    pronouns: row.pronouns || '',
    voicePart: row.voice_part || '',
    school: row.school || '',
    gradYear: row.grad_year || '',
    program: row.program || '',
    funFact: row.fun_fact || '',
    favoriteFood: row.favorite_food || '',
    avatar: avatarUrl(row),
    isMd: Boolean(row.is_md),
    isArranger: Boolean(row.is_arranger),
    isAlumni: Boolean(row.is_alumni),
    isPresident: Boolean(row.is_president),
    isVicePresident: Boolean(row.is_vp),
    isSecretary: Boolean(row.is_secretary),
    isTreasurer: Boolean(row.is_treasurer),
    isMedia: Boolean(row.is_media),
  };
}

function lastNameKey(person) {
  const source = (person.fullName || person.name || '').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  return (parts.at(-1) || source).toLocaleLowerCase('en');
}

function memberList() {
  return statements.listUsers.all().map(publicProfile).sort((a, b) => {
    if (Boolean(a.fullName) !== Boolean(b.fullName)) return a.fullName ? -1 : 1;
    return lastNameKey(a).localeCompare(lastNameKey(b), 'en', { sensitivity: 'base' })
      || (a.fullName || a.name).localeCompare(b.fullName || b.name, 'en', { sensitivity: 'base' });
  });
}

function imageExt(bytes, filename) {
  const ext = String(filename || '').split('.').pop().toLowerCase();
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && (ext === 'jpg' || ext === 'jpeg')) return 'jpg';
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && ext === 'png') return 'png';
  if (bytes.length > 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' && ext === 'webp') return 'webp';
  if (bytes.length > 6 && bytes.subarray(0, 3).toString() === 'GIF' && ext === 'gif') return 'gif';
  return '';
}

function currentUser(req) {
  const token = parseCookies(req).solo_sid;
  if (!token) return null;
  return asUser(statements.userBySession.get(token));
}

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('too_large'), { status: 413 }));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 20_000) {
        reject(Object.assign(new Error('too_large'), { status: 413 }));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('bad_json'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function withTx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function loadCandidates(phaseId, voterId, visible) {
  return statements.candidates.all(phaseId, phaseId, phaseId, voterId, phaseId).map((row) => {
    const candidate = {
      id: row.id,
      name: row.name,
      isMe: row.id === voterId,
      mine: row.mine,
    };
    if (visible) {
      candidate.likes = row.likes;
      candidate.again = row.again;
    }
    return candidate;
  });
}

function byScore(a, b) {
  return b.likes - a.likes || b.again - a.again || a.name.localeCompare(b.name, 'zh');
}

function seesResults(account, phase) {
  if (!account || !phase) return false;
  if (account.isMd) return true;
  return Number(phase.arranger_id) === account.id;
}

function stateFor(user) {
  const account = asUser(statements.account.get(user.id));
  if (!account) throw fail(401, 'login_required');
  const open = statements.openPhase.get();
  const openVisible = seesResults(account, open);
  const history = statements.history.all(account.isMd ? 1 : 0, account.id).map((phase) => ({
    id: phase.id,
    title: phase.title,
    closedAt: phase.closed_at,
    arranger: phase.arranger_name || '',
    candidates: loadCandidates(phase.id, user.id, true).sort(byScore),
  }));

  return {
    user: account,
    phase: open
      ? {
          id: open.id,
          title: open.title,
          status: open.status,
          openedBy: open.opened_by,
          arranger: open.arranger_name || '',
          canSeeResults: openVisible,
          iAmCandidate: Boolean(statements.isCandidate.get(open.id, user.id)),
          candidates: loadCandidates(open.id, user.id, openVisible),
        }
      : null,
    history,
    profile: publicProfile(statements.profileById.get(account.id)),
    members: memberList(),
    admin: isManager(account)
      ? {
          rounds: statements.listRounds.all().map((row) => ({
            id: row.id,
            title: row.title,
            status: row.status,
            openedBy: row.opened_by,
            closedAt: row.closed_at,
          })),
        }
      : null,
    library: libraryFor(account),
  };
}

function rankedArrangers() {
  const stats = new Map();
  for (const row of statements.scoreArrangerRows.all()) {
    for (const name of String(row.arranger || '').split(',')) {
      const key = name.trim().toLowerCase();
      if (!key) continue;
      const current = stats.get(key) || { count: 0, latest: '' };
      current.count += 1;
      if (row.created_at > current.latest) current.latest = row.created_at;
      stats.set(key, current);
    }
  }
  return statements.listArrangers.all()
    .map((row) => {
      const stat = stats.get(row.name.toLowerCase()) || { count: 0, latest: '' };
      return { id: row.id, name: row.name, count: stat.count, latest: stat.latest };
    })
    .sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest) || a.name.localeCompare(b.name, 'en'))
    .map(({ id, name }) => ({ id, name }));
}

function libraryFor(account) {
  const config = google.load();
  const semesters = statements.listSemesters.all().map((row) => ({ id: row.id, label: row.label }));
  const connected = Boolean(config.refreshToken);
  return {
    ready: connected && Boolean(config.spreadsheetId) && semesters.length > 0,
    semesters,
    arrangers: rankedArrangers(),
    setup: account?.isAdmin
      ? {
          connected,
          email: config.email || '',
          hasClient: Boolean(config.clientId && config.clientSecret),
          clientId: config.clientId || '',
          spreadsheetId: config.spreadsheetId || '',
          parentFolderId: config.parentFolderId || '',
        }
      : null,
  };
}

function send(res, status, body, extraHeaders = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(json),
    ...extraHeaders,
  });
  res.end(json);
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requireUser(req) {
  const user = currentUser(req);
  if (!user) throw fail(401, 'login_required');
  return user;
}

function requireManager(req) {
  const user = requireUser(req);
  if (!isManager(user)) throw fail(403, 'forbidden');
  return user;
}

function requireAdmin(req) {
  const user = requireUser(req);
  if (!user.isAdmin) throw fail(403, 'admin_only');
  return user;
}

function passwordError(password) {
  if (typeof password !== 'string' || password.length < 4) return 'password_short';
  if (password.length > 72) return 'password_long';
  return '';
}

if (!statements.anyAdmin.get()) {
  const existing = statements.userByName.get('admin');
  if (existing) {
    db.prepare(`UPDATE users SET is_admin = 1, can_start = 1 WHERE id = ?`).run(existing.id);
    console.log('The account named "admin" is now the administrator. Its password is unchanged.');
  } else {
    const password = process.env.ADMIN_PASSWORD || randomBytes(4).toString('hex');
    statements.insertAdmin.run('admin', hashPassword(password), now());
    writeFileSync(join(dataDir, 'admin-password.txt'), `name: admin\npassword: ${password}\n`);
    console.log(`Admin account created. Name: admin  Password: ${password}`);
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const { pathname } = url;

    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(page);
      return;
    }

    if (req.method === 'GET' && assets[pathname]) {
      const [type, body] = assets[pathname];
      res.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=86400',
        'Content-Length': body.length,
      });
      res.end(body);
      return;
    }

    if (req.method === 'GET' && pathname === '/favicon.ico') {
      const icon = assets['/icon-192.png'][1];
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
        'Content-Length': icon.length,
      });
      res.end(icon);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/state') {
      send(res, 200, stateFor(requireUser(req)));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/register') {
      const body = await readBody(req);
      const name = cleanText(body.name, 20);
      const problem = passwordError(body.password);
      if (!name) throw fail(400, 'name_required');
      if (problem) throw fail(400, problem);
      if (statements.userByName.get(name)) throw fail(409, 'name_taken');

      const createdAt = now();
      const result = statements.insertUser.run(name, hashPassword(body.password), createdAt);
      const user = { id: Number(result.lastInsertRowid), name };
      const token = randomBytes(32).toString('hex');
      statements.insertSession.run(token, user.id, createdAt);
      send(res, 201, stateFor(user), { 'Set-Cookie': sessionCookie(token, 60 * 60 * 24 * 30) });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/login') {
      const body = await readBody(req);
      const name = cleanText(body.name, 20);
      const user = name && statements.userByName.get(name);
      if (!user || typeof body.password !== 'string' || !verifyPassword(body.password, user.password_hash)) {
        throw fail(401, 'bad_login');
      }
      const token = randomBytes(32).toString('hex');
      statements.insertSession.run(token, user.id, now());
      send(res, 200, stateFor(user), { 'Set-Cookie': sessionCookie(token, 60 * 60 * 24 * 30) });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/logout') {
      const token = parseCookies(req).solo_sid;
      if (token) statements.deleteSession.run(token);
      send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/api/avatars/')) {
      requireUser(req);
      const id = Number(pathname.slice('/api/avatars/'.length));
      const row = Number.isInteger(id) ? statements.profileById.get(id) : null;
      const ext = row?.avatar_ext;
      const file = ext && join(avatarDir, `${row.id}.${ext}`);
      if (!file || !existsSync(file)) throw fail(404, 'not_found');
      const body = readFileSync(file);
      const types = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
      res.writeHead(200, {
        'Content-Type': types[ext] || 'application/octet-stream',
        'Cache-Control': 'private, no-cache',
        'Content-Length': body.length,
      });
      res.end(body);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/profile') {
      const user = requireUser(req);
      const body = await readBody(req);
      const fullName = cleanText(body.fullName, 80);
      const pronouns = cleanText(body.pronouns, 40);
      const gradRaw = typeof body.gradYear === 'string' ? body.gradYear.trim() : '';
      if (gradRaw && !/^\d{4}$/.test(gradRaw)) throw fail(400, 'grad_year');
      const optional = (value, max) => (value == null || String(value).trim() === '' ? '' : cleanText(value, max));
      statements.saveProfile.run(
        fullName,
        pronouns,
        '',
        optional(body.voicePart, 40),
        optional(body.school, 80),
        gradRaw,
        optional(body.program, 80),
        optional(body.funFact, 240),
        optional(body.favoriteFood, 80),
        user.id,
      );
      send(res, 200, stateFor(user));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/profile/avatar') {
      const user = requireUser(req);
      const parts = parseMultipart(await readRaw(req, 5 * 1024 * 1024), req.headers['content-type']);
      const file = parts.find((part) => part.name === 'avatar' && part.filename);
      if (!file || !file.body.length) throw fail(400, 'file_required');
      const ext = imageExt(file.body, file.filename);
      if (!ext) throw fail(400, 'avatar_type');
      for (const oldExt of ['jpg', 'png', 'webp', 'gif']) {
        const oldFile = join(avatarDir, `${user.id}.${oldExt}`);
        if (oldExt !== ext && existsSync(oldFile)) unlinkSync(oldFile);
      }
      writeFileSync(join(avatarDir, `${user.id}.${ext}`), file.body);
      statements.setAvatar.run(ext, user.id);
      send(res, 200, stateFor(user));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/phases') {
      const user = requireUser(req);
      if (!user.isMd) throw fail(403, 'cannot_start');
      const body = await readBody(req);
      const title = cleanText(body.title, 40);
      const arrangerId = Number(body.arrangerId);
      if (!title) throw fail(400, 'title_required');
      const arranger = statements.account.get(arrangerId);
      if (!arranger || arranger.is_admin || arranger.is_alumni || !arranger.is_arranger) {
        throw fail(400, 'poll_arranger_required');
      }
      if (statements.openPhase.get()) throw fail(409, 'phase_open');
      try {
        statements.insertPhase.run(title, user.id, arranger.id, now());
      } catch (error) {
        if (String(error.message).includes('UNIQUE')) throw fail(409, 'phase_open');
        throw error;
      }
      send(res, 201, stateFor(user));
      return;
    }

    const removePhase = pathname.match(/^\/api\/phases\/(\d+)\/delete$/);
    if (req.method === 'POST' && removePhase) {
      const user = requireManager(req);
      const phaseId = Number(removePhase[1]);
      if (!statements.phaseById.get(phaseId)) throw fail(404, 'phase_missing');
      withTx(() => {
        statements.deletePhaseVotes.run(phaseId);
        statements.deletePhaseCandidacies.run(phaseId);
        statements.deletePhase.run(phaseId);
      });
      send(res, 200, stateFor(user));
      return;
    }

    const accountEdit = pathname.match(/^\/api\/admin\/users\/(\d+)\/account$/);
    if (req.method === 'POST' && accountEdit) {
      const user = requireAdmin(req);
      const target = statements.account.get(Number(accountEdit[1]));
      if (!target) throw fail(404, 'user_missing');
      if (target.is_admin) throw fail(400, 'cannot_change_admin');
      const body = await readBody(req);
      const name = cleanText(body.name, 20);
      if (!name) throw fail(400, 'name_required');
      const taken = statements.userByName.get(name);
      if (taken && taken.id !== target.id) throw fail(409, 'name_taken');
      const password = typeof body.password === 'string' ? body.password : '';
      if (password) {
        const problem = passwordError(password);
        if (problem) throw fail(400, problem);
      }
      if (name !== target.name) statements.renameUser.run(name, target.id);
      if (password) {
        statements.setPassword.run(hashPassword(password), target.id);
        statements.deleteUserSessions.run(target.id);
      }
      send(res, 200, stateFor(user));
      return;
    }

    const removeUser = pathname.match(/^\/api\/admin\/users\/(\d+)\/delete$/);
    if (req.method === 'POST' && removeUser) {
      const user = requireAdmin(req);
      const target = statements.account.get(Number(removeUser[1]));
      if (!target) throw fail(404, 'user_missing');
      if (target.is_admin) throw fail(400, 'cannot_change_admin');
      withTx(() => {
        statements.deleteUserSessions.run(target.id);
        statements.deleteUserVotes.run(target.id, target.id);
        statements.deleteUserCandidacies.run(target.id);
        statements.clearPhaseArranger.run(target.id);
        statements.reassignPhaseCreator.run(user.id, target.id);
        statements.reassignScoreUploader.run(user.id, target.id);
        statements.deleteUser.run(target.id);
      });
      for (const ext of ['jpg', 'png', 'webp', 'gif']) {
        const file = join(avatarDir, `${target.id}.${ext}`);
        if (existsSync(file)) unlinkSync(file);
      }
      send(res, 200, stateFor(user));
      return;
    }

    const grant = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
    if (req.method === 'POST' && grant) {
      const user = requireManager(req);
      const target = statements.account.get(Number(grant[1]));
      if (!target) throw fail(404, 'user_missing');
      const body = await readBody(req);
      const flags = {
        musicDirector: statements.setMusicDirector,
        arranger: statements.setArranger,
        alumni: statements.setAlumni,
        president: statements.setPresident,
        vicePresident: statements.setVicePresident,
        secretary: statements.setSecretary,
        treasurer: statements.setTreasurer,
        mediaChair: statements.setMedia,
      };
      const adminOnly = new Set(['musicDirector', 'alumni', 'president', 'vicePresident', 'secretary', 'treasurer', 'mediaChair']);
      const changing = Object.keys(flags).filter((key) => typeof body[key] === 'boolean');
      if (!changing.length) throw fail(400, 'bad_json');
      if (!user.isAdmin && changing.some((key) => adminOnly.has(key))) throw fail(403, 'forbidden');
      if (target.is_admin && changing.some((key) => key !== 'arranger')) throw fail(400, 'cannot_change_admin');
      const toAlumni = body.alumni === true;
      const roleKeys = ['musicDirector', 'arranger', 'president', 'vicePresident', 'secretary', 'treasurer', 'mediaChair'];
      for (const key of changing) {
        if ((toAlumni || (target.is_alumni && body.alumni !== false)) && roleKeys.includes(key)) continue;
        flags[key].run(body[key] ? 1 : 0, target.id);
      }
      if (toAlumni) {
        statements.setMusicDirector.run(0, target.id);
        statements.setArranger.run(0, target.id);
        statements.setPresident.run(0, target.id);
        statements.setVicePresident.run(0, target.id);
        statements.setSecretary.run(0, target.id);
        statements.setTreasurer.run(0, target.id);
        statements.setMedia.run(0, target.id);
      }
      send(res, 200, stateFor(user));
      return;
    }

    const action = pathname.match(/^\/api\/phases\/(\d+)\/(close|candidacy|vote)$/);
    if (req.method === 'POST' && action) {
      const user = requireUser(req);
      const phaseId = Number(action[1]);
      const phase = statements.phaseById.get(phaseId);
      if (!phase) throw fail(404, 'phase_missing');
      if (phase.status !== 'open') throw fail(400, 'phase_closed');

      if (action[2] === 'close') {
        statements.closePhase.run(now(), phaseId);
        send(res, 200, stateFor(user));
        return;
      }

      if (action[2] === 'candidacy') {
        const join = Boolean((await readBody(req)).join);
        withTx(() => {
          if (join) {
            if (!statements.isCandidate.get(phaseId, user.id)) {
              statements.insertCandidacy.run(phaseId, user.id, now());
            }
          } else {
            statements.deleteVotesForCandidate.run(phaseId, user.id);
            statements.deleteCandidacy.run(phaseId, user.id);
          }
        });
        send(res, 200, stateFor(user));
        return;
      }

      const body = await readBody(req);
      const candidateId = Number(body.candidateId);
      if (!Number.isInteger(candidateId) || !statements.isCandidate.get(phaseId, candidateId)) {
        throw fail(400, 'not_candidate');
      }
      if (body.reaction == null) {
        statements.deleteVote.run(phaseId, user.id, candidateId);
      } else if (body.reaction === 'like' || body.reaction === 'again') {
        statements.upsertVote.run(phaseId, user.id, candidateId, body.reaction);
      } else {
        throw fail(400, 'bad_reaction');
      }
      send(res, 200, stateFor(user));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/google/settings') {
      const user = requireAdmin(req);
      const body = await readBody(req);
      const clientId = cleanText(body.clientId, 200);
      const secret = typeof body.clientSecret === 'string' ? body.clientSecret.trim() : '';
      const spreadsheetRaw = typeof body.spreadsheet === 'string' ? body.spreadsheet.trim() : '';
      const spreadsheetId = spreadsheetRaw ? parseSpreadsheetId(spreadsheetRaw) : '';
      const parentRaw = typeof body.parentFolder === 'string' ? body.parentFolder.trim() : '';
      const parentFolderId = parentRaw ? parseFolderId(parentRaw) : '';
      const config = google.load();
      if (!clientId) throw fail(400, 'client_required');
      if (!secret && !config.clientSecret) throw fail(400, 'secret_required');
      if (secret && secret.length < 8) throw fail(400, 'secret_required');
      if (spreadsheetRaw && !spreadsheetId) throw fail(400, 'sheet_invalid');
      if (parentRaw && !parentFolderId) throw fail(400, 'folder_invalid');
      const clientChanged = clientId !== config.clientId || (secret && secret !== config.clientSecret);
      const nextParent = parentRaw ? parentFolderId : config.parentFolderId;
      if (nextParent && config.refreshToken && !clientChanged) await google.assertFolder(nextParent);
      google.save({
        ...config,
        clientId,
        clientSecret: secret || config.clientSecret,
        spreadsheetId: spreadsheetRaw ? spreadsheetId : config.spreadsheetId,
        parentFolderId: nextParent,
        refreshToken: clientChanged ? '' : config.refreshToken,
        email: clientChanged ? '' : config.email,
        accessToken: '',
        expiresAt: 0,
      });
      send(res, 200, stateFor(user));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/google/connect') {
      const user = requireAdmin(req);
      const config = google.load();
      if (!config.clientId || !config.clientSecret) throw fail(400, 'client_required');
      const redirect = redirectUri(req.headers.host);
      if (!redirect) throw fail(400, 'connect_on_computer');
      const state = randomBytes(24).toString('hex');
      res.writeHead(302, {
        Location: google.authUrl({ clientId: config.clientId, redirect, state }),
        'Set-Cookie': `google_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
      });
      res.end();
      return;
    }

    if (req.method === 'GET' && pathname === '/api/google/callback') {
      const user = currentUser(req);
      const expected = parseCookies(req).google_state;
      const clearState = 'google_state=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
      const back = (flag) => {
        res.writeHead(302, { Location: `/?scores=1${flag ? `&google=${flag}` : ''}`, 'Set-Cookie': clearState });
        res.end();
      };
      const code = url.searchParams.get('code');
      if (!user?.isAdmin || !expected || url.searchParams.get('state') !== expected) {
        back('error');
        return;
      }
      if (!code) {
        back('denied');
        return;
      }
      try {
        await google.exchange(code, redirectUri(req.headers.host));
        back('');
      } catch (error) {
        console.error(error);
        back('error');
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/google/disconnect') {
      const user = requireAdmin(req);
      const config = google.load();
      google.save({ ...config, refreshToken: '', email: '', accessToken: '', expiresAt: 0 });
      send(res, 200, stateFor(user));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/semesters') {
      const user = requireAdmin(req);
      const body = await readBody(req);
      const label = cleanText(body.label, 40);
      if (!label) throw fail(400, 'semester_required');
      const config = google.load();
      if (!config.refreshToken) throw fail(400, 'google_disconnected');
      if (!config.parentFolderId) throw fail(400, 'parent_missing');
      const folderId = await google.createSemesterFolder(config.parentFolderId, label);
      try {
        statements.insertSemester.run(label, folderId, now());
      } catch (error) {
        if (String(error.message).includes('UNIQUE')) throw fail(409, 'semester_taken');
        throw error;
      }
      send(res, 201, stateFor(user));
      return;
    }

    const removeSemester = pathname.match(/^\/api\/semesters\/(\d+)\/delete$/);
    if (req.method === 'POST' && removeSemester) {
      const user = requireAdmin(req);
      const semesterId = Number(removeSemester[1]);
      if (!statements.semesterById.get(semesterId)) throw fail(404, 'semester_missing');
      if (statements.scoreCountForSemester.get(semesterId).n > 0) throw fail(400, 'semester_used');
      statements.deleteSemester.run(semesterId);
      send(res, 200, stateFor(user));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/arrangers') {
      const user = requireUser(req);
      if (!user.isArranger) throw fail(403, 'not_arranger');
      const name = ensureArranger((await readBody(req)).name);
      if (!name) throw fail(400, 'arranger_required');
      send(res, 200, stateFor(user));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/library/folders') {
      requireUser(req);
      const semester = statements.semesterById.get(Number(url.searchParams.get('semesterId')));
      if (!semester?.folder_id) throw fail(404, 'semester_missing');
      const folders = await google.listScoreFolders(semester.folder_id);
      send(res, 200, {
        id: semester.id,
        label: semester.label,
        url: `https://drive.google.com/drive/folders/${semester.folder_id}`,
        folders,
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/scores/folder') {
      const user = requireUser(req);
      if (!user.isArranger) throw fail(403, 'not_arranger');
      const semester = statements.semesterById.get(Number(url.searchParams.get('semesterId')));
      const folderId = driveId(url.searchParams.get('folderId'));
      if (!semester?.folder_id || !folderId) throw fail(404, 'semester_missing');
      const match = (await google.listScoreFolders(semester.folder_id)).find((item) => item.id === folderId);
      if (!match) throw fail(404, 'folder_not_found');
      const files = await google.listFolderFiles(folderId);
      const row = await google.findScoreRow({
        folderId,
        shortcutId: match.shortcutId,
        title: match.name,
        semester: semester.label,
      });
      const arrangers = splitArrangers(row.arranger).map((name) => ensureArranger(name)).filter(Boolean);
      send(res, 200, {
        folderId,
        title: match.name,
        arrangers,
        kinds: kindsFromSheet(row.kind),
        semesterId: semester.id,
        files,
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/scores/edit') {
      const user = requireUser(req);
      if (!user.isArranger) throw fail(403, 'not_arranger');
      const parts = parseMultipart(await readRaw(req, 120 * 1024 * 1024), req.headers['content-type']);
      const field = (name) => {
        const part = parts.find((item) => item.name === name && !item.filename);
        return part ? part.body.toString('utf8') : '';
      };
      const title = cleanText(field('title'), 80);
      const arrangerNames = [];
      const seenArrangers = new Set();
      for (const part of parts) {
        if (part.name !== 'arranger' || part.filename) continue;
        const name = ensureArranger(part.body.toString('utf8'));
        const key = name.toLowerCase();
        if (!name || seenArrangers.has(key)) continue;
        seenArrangers.add(key);
        arrangerNames.push(name);
      }
      const arranger = arrangerNames.join(', ');
      const picked = new Set(parts.filter((item) => item.name === 'kind' && !item.filename).map((item) => item.body.toString('utf8')));
      const kinds = ['all', 'group'].filter((item) => picked.has(item));
      const source = statements.semesterById.get(Number(field('sourceSemesterId')));
      const semester = statements.semesterById.get(Number(field('semesterId')));
      const folderId = driveId(field('folderId'));
      if (!title) throw fail(400, 'song_required');
      if (!arranger) throw fail(400, 'arranger_required');
      if (!kinds.length) throw fail(400, 'kind_required');
      if (!source?.folder_id || !semester?.folder_id || !folderId) throw fail(400, 'semester_missing');
      const listed = await google.listScoreFolders(source.folder_id);
      const match = listed.find((item) => item.id === folderId);
      if (!match) throw fail(404, 'folder_not_found');
      const nextTitle = title.replace(/[\\/]/g, ' ');
      const destination = source.id === semester.id ? listed : await google.listScoreFolders(semester.folder_id);
      if (destination.some((item) => item.id !== folderId && item.name === nextTitle)) throw fail(400, 'song_taken');
      const uploads = scoreUploads(parts);
      const currentFiles = await google.listFolderFiles(folderId);
      const allowed = new Set(currentFiles.map((file) => file.id));
      const removing = [];
      for (const part of parts) {
        if (part.name !== 'delete' || part.filename) continue;
        const id = driveId(part.body.toString('utf8'));
        if (id && allowed.has(id) && !removing.includes(id)) removing.push(id);
      }
      const config = google.load();
      if (!config.refreshToken || !config.spreadsheetId) throw fail(400, 'google_disconnected');
      const songUrl = `https://drive.google.com/drive/folders/${folderId}`;
      const kindText = kinds.map((item) => (item === 'all' ? '大歌/all members' : '小组/small group')).join(', ');
      const sheetValues = {
        title: nextTitle,
        arranger,
        semester: semester.label,
        kind: kindText,
        link: sheetLink(songUrl, nextTitle),
      };
      const stored = [];
      try {
        for (const file of uploads) {
          const uploaded = await google.uploadFile({
            name: file.name,
            folderId,
            mime: file.mime,
            bytes: file.bytes,
          });
          stored.push(uploaded.id);
        }
        const row = await google.findScoreRow({
          folderId,
          shortcutId: match.shortcutId,
          title: match.name,
          semester: source.label,
        });
        sheetValues.semester = semesterCell(row.semester, source.label, semester.label);
        if (row.row) await google.updateScoreRow(row.row, sheetValues);
        else await google.appendRow(sheetValues);
        const driveName = nextTitle === match.name ? undefined : nextTitle;
        const moveTo = source.folder_id === semester.folder_id ? '' : semester.folder_id;
        if (match.shortcutId) {
          if (driveName || moveTo) {
            await google.updateDriveFile(match.shortcutId, {
              name: driveName,
              addParents: moveTo,
              removeParents: moveTo ? source.folder_id : '',
            });
          }
          if (driveName) await google.updateDriveFile(folderId, { name: driveName });
        } else if (driveName || moveTo) {
          await google.updateDriveFile(folderId, {
            name: driveName,
            addParents: moveTo,
            removeParents: moveTo ? source.folder_id : '',
          });
        }
      } catch (error) {
        for (const id of stored) await google.deleteFile(id).catch((deleteError) => console.error(deleteError));
        throw error;
      }
      for (const id of removing) await google.deleteFile(id);
      const kept = currentFiles.filter((file) => !removing.includes(file.id)).map((file) => file.name);
      const fileName = [...kept, ...uploads.map((file) => file.name)].join(', ').slice(0, 180) || nextTitle;
      const kind = kinds.includes('all') ? 'big' : 'small';
      const updated = statements.updateScoreByFolder.run(
        nextTitle, arranger, kind, kinds.join(','), semester.id, semester.label, fileName, songUrl, folderId,
      );
      if (!updated.changes) {
        statements.insertScore.run(
          nextTitle, arranger, kind, kinds.join(','), semester.id, semester.label,
          fileName, folderId, songUrl, user.id, now(),
        );
      }
      send(res, 200, stateFor(user));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/scores') {
      const user = requireUser(req);
      if (!user.isArranger) throw fail(403, 'not_arranger');
      const parts = parseMultipart(await readRaw(req, 120 * 1024 * 1024), req.headers['content-type']);
      const field = (name) => {
        const part = parts.find((item) => item.name === name && !item.filename);
        return part ? part.body.toString('utf8') : '';
      };
      const title = cleanText(field('title'), 80);
      const arrangerNames = [];
      const seenArrangers = new Set();
      for (const part of parts) {
        if (part.name !== 'arranger' || part.filename) continue;
        const name = ensureArranger(part.body.toString('utf8'));
        const key = name.toLowerCase();
        if (!name || seenArrangers.has(key)) continue;
        seenArrangers.add(key);
        arrangerNames.push(name);
      }
      const arranger = arrangerNames.join(', ');
      const picked = new Set(parts.filter((item) => item.name === 'kind' && !item.filename).map((item) => item.body.toString('utf8')));
      const kinds = ['all', 'group'].filter((item) => picked.has(item));
      const semester = statements.semesterById.get(Number(field('semesterId')));
      if (!title) throw fail(400, 'song_required');
      if (!arranger) throw fail(400, 'arranger_required');
      if (!kinds.length) throw fail(400, 'kind_required');
      if (!semester) throw fail(400, 'semester_missing');
      const uploads = scoreUploads(parts);
      if (!uploads.length) throw fail(400, 'file_required');
      const config = google.load();
      if (!config.refreshToken || !config.spreadsheetId) throw fail(400, 'google_disconnected');
      const songFolderId = await google.createSemesterFolder(semester.folder_id, title.replace(/[\\/]/g, ' '));
      const songUrl = `https://drive.google.com/drive/folders/${songFolderId}`;
      const stored = [];
      try {
        for (const file of uploads) {
          const uploaded = await google.uploadFile({
            name: file.name,
            folderId: songFolderId,
            mime: file.mime,
            bytes: file.bytes,
          });
          stored.push(uploaded.id);
        }
        const kindText = kinds.map((item) => (item === 'all' ? '大歌/all members' : '小组/small group')).join(', ');
        await google.appendRow({
          title,
          arranger,
          semester: semester.label,
          kind: kindText,
          link: sheetLink(songUrl, title),
        });
      } catch (error) {
        for (const id of stored) await google.deleteFile(id).catch((deleteError) => console.error(deleteError));
        throw error;
      }
      statements.insertScore.run(
        title,
        arranger,
        kinds.includes('all') ? 'big' : 'small',
        kinds.join(','),
        semester.id,
        semester.label,
        uploads.map((file) => file.name).join(', ').slice(0, 180),
        songFolderId,
        songUrl,
        user.id,
        now(),
      );
      send(res, 201, stateFor(user));
      return;
    }

    send(res, 404, { error: 'not_found' });
  } catch (error) {
    const status = error.status || 500;
    if (status === 500) console.error(error);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'server' : error.message });
  }
});

server.listen(port, '0.0.0.0', () => {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => `http://${entry.address}:${port}`);
  console.log(`Solo poll at http://127.0.0.1:${port}`);
  for (const address of addresses) console.log(`On this network: ${address}`);
});
