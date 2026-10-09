import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { createGoogle, parseFolderId, parseMultipart, parseSpreadsheetId, redirectUri, scoreFileType, sheetLink, mergeSemesters } from './google.js';
import { database, boundedBody, hashPassword, verifyPassword, initialize, responseSink } from './runtime.js';
import { assets } from './assets.js';
import { galleryService } from '../gallery.js';
import {readVoiceParts,validateVoiceParts} from './voice-parts.js';
export default {
  async fetch(request, env) {
    if (!env.DB || !env.FILES) return new Response('Storage unavailable', {
      status: 503
    });
    const origin = new URL(request.url).origin;
    if (request.method !== 'GET' && request.method !== 'HEAD' && request.headers.get('Origin') && request.headers.get('Origin') !== origin) return new Response('Forbidden', {
      status: 403
    });
    const asset = assets[new URL(request.url).pathname];
    if (request.method === 'GET' && asset) return new Response(Buffer.from(asset.data, 'base64'), {
      headers: {
        'Content-Type': asset.type
      }
    });
    const db = database(env.DB);
    const google = createGoogle(env.FILES);
    const gallery = galleryService({db, files:env.FILES, imageExt, fail});
    const req = {
      request,
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers)
    };
    const res = responseSink();
    const statements = {
      userByName: db.prepare(`SELECT id, name, password_hash FROM users WHERE name = ? COLLATE NOCASE`),
      insertUser: db.prepare(`INSERT INTO users (name, password_hash, created_at) VALUES (?, ?, ?)`),
      userBySession: db.prepare(`
    SELECT u.id AS id, u.name AS name, u.is_admin AS is_admin, u.can_start AS can_start,
      u.is_md AS is_md, u.is_arranger AS is_arranger, u.is_president AS is_president
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `),
      account: db.prepare(`SELECT id, name, is_admin, can_start, is_md, is_arranger, is_alumni, is_crew FROM users WHERE id = ?`),
      anyAdmin: db.prepare(`SELECT id FROM users WHERE is_admin = 1 LIMIT 1`),
      insertAdmin: db.prepare(`
    INSERT INTO users (name, password_hash, created_at, is_admin, can_start)
    VALUES (?, ?, ?, 1, 1)
  `),
      listUsers: db.prepare(`
    SELECT id, name, is_admin, can_start, is_md, is_arranger,
      is_alumni, is_crew, is_president, is_vp, is_secretary, is_treasurer, is_media,
      full_name, pronouns, position, voice_part, school, grad_year, program, fun_fact, favorite_food, avatar_ext
    FROM users
    WHERE is_admin = 0
  `),
      profileById: db.prepare(`
    SELECT id, name, is_admin, can_start, is_md, is_arranger,
      is_alumni, is_crew, is_president, is_vp, is_secretary, is_treasurer, is_media,
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
      setCrew: db.prepare(`UPDATE users SET is_crew = ? WHERE id = ? AND is_admin = 0`),
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
    SELECT p.poll_type,p.part_a,p.part_b,p.part_locks,p.candidate_order,p.status,p.registration_locked,p.voting_mode,p.started_at,p.revealed_ranks,p.id, p.title, p.created_by, p.arranger_id, p.created_at, p.closed_at,
      u.name AS opened_by, a.name AS arranger_name
    FROM phases p
    JOIN users u ON u.id = p.created_by
    LEFT JOIN users a ON a.id = p.arranger_id
    WHERE p.status = 'open'
  `),
      phaseById: db.prepare(`SELECT * FROM phases WHERE id = ?`),
      insertPhase: db.prepare(`
    INSERT INTO phases (title, status, created_by, arranger_id, created_at,voting_mode,poll_type,part_a,part_b,plan_song_id) VALUES (?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)
  `),
      closePhase: db.prepare(`UPDATE phases SET status = 'closed', closed_at = ? WHERE id = ? AND status = 'open'`),
      history: db.prepare(`
    SELECT p.poll_type,p.part_a,p.part_b,p.part_locks,p.candidate_order,p.status,p.registration_locked,p.voting_mode,p.revealed_ranks,p.id, p.title, p.closed_at, p.created_by, p.arranger_id, a.name AS arranger_name
    FROM phases p
    LEFT JOIN users a ON a.id = p.arranger_id
    WHERE p.status = 'closed'
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
    INSERT OR IGNORE INTO candidacies (phase_id, user_id, created_at) VALUES (?, ?, ?)
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
  `)
    };
    function splitArrangers(value) {
      return String(value || '').split(/[,，、]/).map(name => name.trim()).filter(Boolean);
    }
    function kindsFromSheet(value) {
      const text = String(value || '').toLowerCase();
      const kinds = [];
      if (text.includes('大歌') || text.includes('all members') || /(?:^|[^a-z])all(?:[^a-z]|$)/.test(text)) kinds.push('all');
      if (text.includes('小组') || text.includes('小歌') || text.includes('small group') || text.includes('group')) kinds.push('group');
      return kinds;
    }
    function semesterCell(existing, sourceLabel, destLabel) {return mergeSemesters(existing,sourceLabel,destLabel);}
    function driveId(value) {
      const id = String(value || '').trim();
      if (!/^[a-zA-Z0-9_-]{10,}$/.test(id)) return '';
      return id;
    }
    function scoreUploads(parts) {
      const files = parts.filter(item => (item.name === 'files' || item.name === 'folder') && item.filename && item.body.length);
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
        uploads.push({
          name,
          mime: scoreFileType(name) || 'application/octet-stream',
          bytes: file.body
        });
      }
      return uploads;
    }
    async function ensureArranger(name) {
      const clean = cleanText(name, 60);
      if (!clean) return '';
      let row = await statements.arrangerByName.get(clean);
      if (!row) {
        try {
          await statements.insertArranger.run(clean, now());
        } catch (error) {
          if (!String(error.message).includes('UNIQUE')) throw error;
        }
        row = await statements.arrangerByName.get(clean);
      }
      return row ? row.name : '';
    }
    function now() {
      return new Date().toISOString();
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
      return `solo_sid=${token}; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=${maxAge}`;
    }
    function asUser(row) {
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        isAdmin: Boolean(row.is_admin),
        isMd: Boolean(row.is_md),
        isArranger: Boolean(row.is_arranger),
        isPresident: Boolean(row.is_president)
      };
    }
    function isManager(account) {
      return Boolean(account?.isAdmin || account?.isMd);
    }
    function avatarUrl(row) {
      return row?.avatar_ext ? `/api/avatars/${row.id}?v=${row.avatar_ext}` : '';
    }
    function publicProfile(row) {
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        fullName: row.full_name || '',
        pronouns: row.pronouns || '',
        voicePart: readVoiceParts(row.voice_part).join(' / '),
        voiceParts: readVoiceParts(row.voice_part),
        school: row.school || '',
        gradYear: row.grad_year || '',
        program: row.program || '',
        funFact: row.fun_fact || '',
        favoriteFood: row.favorite_food || '',
        avatar: avatarUrl(row),
        isMd: Boolean(row.is_md),
        isArranger: Boolean(row.is_arranger),
        isAlumni: Boolean(row.is_alumni),
        isCrew: Boolean(row.is_crew),
        isPresident: Boolean(row.is_president),
        isVicePresident: Boolean(row.is_vp),
        isSecretary: Boolean(row.is_secretary),
        isTreasurer: Boolean(row.is_treasurer),
        isMedia: Boolean(row.is_media)
      };
    }
    function lastNameKey(person) {
      const source = (person.fullName || person.name || '').trim();
      const parts = source.split(/\s+/).filter(Boolean);
      return (parts.at(-1) || source).toLocaleLowerCase('en');
    }
    async function memberList() {
      return (await statements.listUsers.all()).map(publicProfile).sort((a, b) => {
        if (Boolean(a.fullName) !== Boolean(b.fullName)) return a.fullName ? -1 : 1;
        return lastNameKey(a).localeCompare(lastNameKey(b), 'en', {
          sensitivity: 'base'
        }) || (a.fullName || a.name).localeCompare(b.fullName || b.name, 'en', {
          sensitivity: 'base'
        });
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
    async function currentUser(req) {
      const token = parseCookies(req).solo_sid;
      if (!token) return null;
      return asUser(await statements.userBySession.get(token));
    }
    async function readRaw(req, limit) {
      return await boundedBody(req.request, limit);
    }
    async function readBody(req) {
      const bytes = await readRaw(req, 20000);
      if (!bytes.length) return {};
      try {
        return JSON.parse(bytes.toString('utf8'));
      } catch {
        throw fail(400, 'bad_json');
      }
    }
    async function withTx(fn) {
      db.beginBatch();
      try {
        const result = await fn();
        await db.commitBatch();
        return result;
      } catch (error) {
        db.cancelBatch();
        throw error;
      }
    }
    async function loadCandidates(phaseId, voterId, visible) {
      return (await statements.candidates.all(phaseId, phaseId, phaseId, voterId, phaseId)).map(row => {
        const candidate = {
          id: row.id,
          name: row.name,
          isMe: row.id === voterId,
          mine: row.mine
        };
        if (visible) {
          candidate.likes = Number(row.likes);
          candidate.again = Number(row.again);
        }
        return candidate;
      });
    }
    function byScore(a, b) {
      return b.likes - a.likes || a.name.localeCompare(b.name, 'zh');
    }
    function seesResults(account, phase) {
      if (!account || !phase) return false;
      return account.isAdmin;
    }
    async function rankedResults(phase,account){
      if (phase.poll_type!=='solo') return (await env.voting.view(phase,account)).candidates;
      const all=(await loadCandidates(phase.id,account.id,true)).sort(byScore);
      let rank=0,last=null;
      const ranked=all.map(c=>{if(c.likes!==last){rank++;last=c.likes;}return {...c,rank};});
      return ranked.filter(c=>account.isAdmin||c.rank<=phase.revealed_ranks).map(c=>account.isAdmin?c:{id:c.id,name:c.name,rank:c.rank,isMe:c.isMe});
    }

    async function stateFor(user, songId=null) {
      const account = asUser(await statements.account.get(user.id));
      if (!account) throw fail(401, 'login_required');
      const open = await statements.openPhase.get();
      const openVisible = seesResults(account, open);
      const openDuet = open && open.poll_type!=='solo' ? await env.voting.view(open,account) : null;
      const history = await Promise.all((songId?await env.plans.pollHistory(songId):await statements.history.all()).map(async phase => ({
        id: phase.id,
        title: phase.title,
        closedAt: phase.closed_at,
        arranger: phase.arranger_name || '',
        votingMode:phase.voting_mode, revealedRanks:phase.revealed_ranks, canReveal:account.isMd&&!account.isAdmin, canSeeResults:account.isAdmin, candidates:await rankedResults(phase,account), recordings:env.recordings?await env.recordings.list(phase.id,account):[], pollType:phase.poll_type,partA:phase.part_a,partB:phase.part_b
      })));
      return {
        user: account,
        phase: open ? {
          ...(openDuet||{}),
          recordings:env.recordings?await env.recordings.list(open.id,account):[],
          id: open.id,
          title: open.title,
          status: open.status,
          votingMode:open.voting_mode,
          started:Boolean(open.started_at),
          registrationLocked:Boolean(open.registration_locked),
          voteLimit:open.registration_locked?1:2,
          openedBy: open.opened_by,
          arranger: open.arranger_name || '',
          canSeeResults: openVisible,
          pollType:open.poll_type,
          iAmCandidate: openDuet?openDuet.iAmCandidate:Boolean(await statements.isCandidate.get(open.id, user.id)),
          candidates: openDuet?openDuet.candidates:(await loadCandidates(open.id, user.id, openVisible)).sort((a,b)=>{const order=JSON.parse(open.candidate_order);const ai=order.indexOf(a.id),bi=order.indexOf(b.id);return (ai<0?100000:ai)-(bi<0?100000:bi);})
        } : null,
        history,
        profile: publicProfile(await statements.profileById.get(account.id)),
        members: await memberList(),
        admin: isManager(account) ? {
          rounds: (await statements.listRounds.all()).map(row => ({
            id: row.id,
            title: row.title,
            status: row.status,
            openedBy: row.opened_by,
            closedAt: row.closed_at
          }))
        } : null,
        library: await libraryFor(account)
      };
    }
    async function rankedArrangers() {
      const stats = new Map();
      for (const row of await statements.scoreArrangerRows.all()) {
        for (const name of String(row.arranger || '').split(',')) {
          const key = name.trim().toLowerCase();
          if (!key) continue;
          const current = stats.get(key) || {
            count: 0,
            latest: ''
          };
          current.count += 1;
          if (row.created_at > current.latest) current.latest = row.created_at;
          stats.set(key, current);
        }
      }
      return (await statements.listArrangers.all()).map(row => {
        const stat = stats.get(row.name.toLowerCase()) || {
          count: 0,
          latest: ''
        };
        return {
          id: row.id,
          name: row.name,
          count: stat.count,
          latest: stat.latest
        };
      }).sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest) || a.name.localeCompare(b.name, 'en')).map(({
        id,
        name
      }) => ({
        id,
        name
      }));
    }
    async function libraryFor(account) {
      const config = await google.load();
      const semesters = (await statements.listSemesters.all()).map(row => ({
        id: row.id,
        label: row.label
      }));
      const connected = Boolean(config.refreshToken);
      return {
        ready: connected && Boolean(config.spreadsheetId) && semesters.length > 0,
        semesters,
        arrangers: await rankedArrangers(),
        setup: account?.isAdmin ? {
          connected,
          email: config.email || '',
          hasClient: Boolean(config.clientId && config.clientSecret),
          clientId: config.clientId || '',
          spreadsheetId: config.spreadsheetId || '',
          parentFolderId: config.parentFolderId || ''
        } : null
      };
    }
    function send(res, status, body, extraHeaders = {}) {
      const json = JSON.stringify(body);
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Length': Buffer.byteLength(json),
        ...extraHeaders
      });
      res.end(json);
    }
    function fail(status, message) {
      const error = new Error(message);
      error.status = status;
      return error;
    }
    async function requireUser(req) {
      const user = await currentUser(req);
      if (!user) throw fail(401, 'login_required');
      return user;
    }
    async function requireManager(req) {
      const user = await requireUser(req);
      if (!isManager(user)) throw fail(403, 'forbidden');
      return user;
    }
    async function requireAdmin(req) {
      const user = await requireUser(req);
      if (!user.isAdmin) throw fail(403, 'admin_only');
      return user;
    }
    function passwordError(password) {
      if (typeof password !== 'string' || password.length < 4) return 'password_short';
      if (password.length > 72) return 'password_long';
      return '';
    }
    async function handle(req, res) {
      try {
        const url = new URL(req.url || '/', 'http://localhost');
        const {
          pathname
        } = url;

    const albumRoute = pathname.match(/^\/api\/profiles\/(\d+)\/photos$/);
    const photoRoute = pathname.match(/^\/api\/photos\/([a-zA-Z0-9-]+)(?:\/(delete|avatar))?$/);
    if (albumRoute || photoRoute) {
      const user = await requireUser(req);
      if (albumRoute) {
        const owner = Number(albumRoute[1]);
        if (req.method === 'GET') { send(res, 200, await gallery.list(owner, user)); return; }
        if (req.method === 'POST') {
          const parts = parseMultipart(await readRaw(req, 5 * 1024 * 1024 + 65536), req.headers['content-type']);
          send(res, 201, await gallery.upload(owner, user, parts.find(p => p.name === 'photo' && p.filename))); return;
        }
      } else if (req.method === 'GET' && !photoRoute[2]) {
        const photo = await gallery.bytes(photoRoute[1]);
        res.writeHead(200, {'Content-Type':photo.type,'Cache-Control':'private, no-cache','X-Content-Type-Options':'nosniff'});
        res.end(Buffer.from(photo.body)); return;
      } else if (req.method === 'POST' && photoRoute[2]) {
        const result = await gallery[photoRoute[2] === 'avatar' ? 'select' : 'remove'](photoRoute[1], user);
        send(res, 200, result); return;
      }
      throw fail(405, 'not_found');
    }
        if (pathname === '/api/admin/invitations' && env.invitations) {
          const user = await requireAdmin(req);
          if (req.method === 'GET') { send(res, 200, await env.invitations.list()); return; }
          if (req.method === 'POST') { send(res, 201, await env.invitations.create(user)); return; }
        }
        const revokeInvite = pathname.match(/^\/api\/admin\/invitations\/([a-f0-9]+)\/revoke$/);
        if (req.method === 'POST' && revokeInvite && env.invitations) {
          await requireAdmin(req); await env.invitations.revoke(revokeInvite[1]); send(res, 200, await env.invitations.list()); return;
        }
        if (req.method === 'GET' && pathname === '/api/state') {
          send(res, 200, await stateFor(await requireUser(req)));
          return;
        }
        if (req.method === 'POST' && pathname === '/api/register') {
          const body = await readBody(req);
          const name = cleanText(body.name, 20);
          const problem = passwordError(body.password);
          if (!name) throw fail(400, 'name_required');
          if (problem) throw fail(400, problem);
          if (await statements.userByName.get(name)) throw fail(409, 'name_taken');
          const createdAt = now();
          const passwordHash = await hashPassword(body.password);
          const result = env.INVITE_REQUIRED
            ? await env.invitations.register({code:body.invitationCode, name, passwordHash, createdAt})
            : await statements.insertUser.run(name, passwordHash, createdAt);
          const user = {
            id: Number(result.lastInsertRowid),
            name
          };
          const token = randomBytes(32).toString('hex');
          await statements.insertSession.run(token, user.id, createdAt);
          send(res, 201, await stateFor(user), {
            'Set-Cookie': sessionCookie(token, 60 * 60 * 24 * 30)
          });
          return;
        }
        if (req.method === 'POST' && pathname === '/api/login') {
          const body = await readBody(req);
          const name = cleanText(body.name, 20);
          const user = name && (await statements.userByName.get(name));
          if (!user || typeof body.password !== 'string' || !(await verifyPassword(body.password, user.password_hash))) {
            throw fail(401, 'bad_login');
          }
          const token = randomBytes(32).toString('hex');
          await statements.insertSession.run(token, user.id, now());
          send(res, 200, await stateFor(user), {
            'Set-Cookie': sessionCookie(token, 60 * 60 * 24 * 30)
          });
          return;
        }
        if (req.method === 'POST' && pathname === '/api/logout') {
          const token = parseCookies(req).solo_sid;
          if (token) await statements.deleteSession.run(token);
          send(res, 200, {
            ok: true
          }, {
            'Set-Cookie': sessionCookie('', 0)
          });
          return;
        }
        if (req.method === 'GET' && pathname.startsWith('/api/avatars/')) {
          await requireUser(req);
          const id = Number(pathname.slice('/api/avatars/'.length));
          const row = Number.isInteger(id) ? await statements.profileById.get(id) : null;
          const ext = row?.avatar_ext;
          const file = ext && (await env.FILES.get(`avatars/${row.id}.${ext}`));
          if (!file) throw fail(404, 'not_found');
          const body = Buffer.from(await file.arrayBuffer());
          const types = {
            jpg: 'image/jpeg',
            png: 'image/png',
            webp: 'image/webp',
            gif: 'image/gif'
          };
          res.writeHead(200, {
            'Content-Type': types[ext] || 'application/octet-stream',
            'Cache-Control': 'private, no-cache',
            'Content-Length': body.length
          });
          res.end(body);
          return;
        }
        if (req.method === 'POST' && pathname === '/api/profile') {
          const user = await requireUser(req);
          const body = await readBody(req);
          const fullName = cleanText(body.fullName, 80);
          const pronouns = cleanText(body.pronouns, 40);
          const gradRaw = typeof body.gradYear === 'string' ? body.gradYear.trim() : '';
          if (gradRaw && !/^\d{4}$/.test(gradRaw)) throw fail(400, 'grad_year');
          if(body.crewMedia!==undefined&&typeof body.crewMedia!=='boolean')throw fail(400,'bad_action');
          const optional = (value, max) => value == null || String(value).trim() === '' ? '' : cleanText(value, max);
          await statements.saveProfile.run(fullName, pronouns, '', JSON.stringify(body.voiceParts===undefined?readVoiceParts(body.voicePart):validateVoiceParts(body.voiceParts)), optional(body.school, 80), gradRaw, optional(body.program, 80), optional(body.funFact, 240), optional(body.favoriteFood, 80), user.id);
          if(body.crewMedia!==undefined)await statements.setCrew.run(body.crewMedia?1:0,user.id);
          send(res, 200, await stateFor(user));
          return;
        }
        if(req.method==='POST' && /^\/api\/members\/\d+\/voice-parts$/.test(pathname)) {
          const user=await requireUser(req);const id=Number(pathname.split('/')[3]);
          const actor=await statements.profileById.get(user.id);
          if(id!==user.id&&!actor.is_admin&&!actor.is_md)throw fail(403,'forbidden');
          const target=await statements.profileById.get(id);if(!target)throw fail(404,'not_found');
          const body=await readBody(req);const parts=validateVoiceParts(body.voiceParts);
          if(body.crewMedia!==undefined&&typeof body.crewMedia!=='boolean')throw fail(400,'bad_action');
          await db.prepare('UPDATE users SET voice_part = ? WHERE id = ?').run(JSON.stringify(parts),id);
          if(body.crewMedia!==undefined)await statements.setCrew.run(body.crewMedia?1:0,id);
          send(res,200,await stateFor(user));return;
        }
        if (req.method === 'POST' && pathname === '/api/profile/avatar') {
          const user = await requireUser(req);
          const parts = parseMultipart(await readRaw(req, 5 * 1024 * 1024), req.headers['content-type']);
          const file = parts.find(part => part.name === 'avatar' && part.filename);
          if (!file || !file.body.length) throw fail(400, 'file_required');
          const ext = imageExt(file.body, file.filename);
          if (!ext) throw fail(400, 'avatar_type');
          for (const oldExt of ['jpg', 'png', 'webp', 'gif']) {
            if (oldExt !== ext) await env.FILES.delete(`avatars/${user.id}.${oldExt}`);
          }
          await env.FILES.put(`avatars/${user.id}.${ext}`, file.body);
          await statements.setAvatar.run(ext, user.id);
          send(res, 200, await stateFor(user));
          return;
        }
        if (req.method === 'POST' && pathname === '/api/phases') {
          const user = await requireUser(req);
          if (!user.isMd) throw fail(403, 'cannot_start');
          const body = await readBody(req);
          const title = cleanText(body.title, 40);
          const arrangerId = Number(body.arrangerId);
          if (!title) throw fail(400, 'title_required');
          const arranger = await statements.account.get(arrangerId);
          if (!arranger || arranger.is_admin || arranger.is_alumni || !arranger.is_arranger) {
            throw fail(400, 'poll_arranger_required');
          }
          if (await statements.openPhase.get()) throw fail(409, 'phase_open');
          try {
            if(body.votingMode&&!['default','feedback'].includes(body.votingMode))throw fail(400,'bad_voting_mode');
            const pollType=body.pollType||'solo';
            const songId=body.planSongId?Number(body.planSongId):null;if(songId){if(pollType!=='solo'||!Number.isInteger(songId))throw fail(400,'plan_invalid');await env.plans.pollSong(songId);}
            if(!['solo','pair','parts'].includes(pollType))throw fail(400,'bad_voting_mode');
            await statements.insertPhase.run(title, user.id, arranger.id, now(),pollType==='solo'?(body.votingMode||'default'):'default',pollType,cleanText(body.partA,30)||'Part A',cleanText(body.partB,30)||'Part B',songId);
          } catch (error) {
            if (String(error.message).includes('UNIQUE')) throw fail(409, 'phase_open');
            throw error;
          }
          send(res, 201, await stateFor(user));
          return;
        }
        const removePhase = pathname.match(/^\/api\/phases\/(\d+)\/delete$/);
        if (req.method === 'POST' && removePhase) {
          const user = await requireManager(req);
          const phaseId = Number(removePhase[1]);
          if (!(await statements.phaseById.get(phaseId))) throw fail(404, 'phase_missing');
          await withTx(async () => {
            await statements.deletePhaseVotes.run(phaseId);
            await statements.deletePhaseCandidacies.run(phaseId);
            await statements.deletePhase.run(phaseId);
          });
          send(res, 200, await stateFor(user));
          return;
        }
        const accountEdit = pathname.match(/^\/api\/admin\/users\/(\d+)\/account$/);
        if (req.method === 'POST' && accountEdit) {
          const user = await requireAdmin(req);
          const target = await statements.account.get(Number(accountEdit[1]));
          if (!target) throw fail(404, 'user_missing');
          if (target.is_admin) throw fail(400, 'cannot_change_admin');
          const body = await readBody(req);
          const name = cleanText(body.name, 20);
          if (!name) throw fail(400, 'name_required');
          const taken = await statements.userByName.get(name);
          if (taken && taken.id !== target.id) throw fail(409, 'name_taken');
          const password = typeof body.password === 'string' ? body.password : '';
          if (password) {
            const problem = passwordError(password);
            if (problem) throw fail(400, problem);
          }
          if (name !== target.name) await statements.renameUser.run(name, target.id);
          if (password) {
            await statements.setPassword.run(await hashPassword(password), target.id);
            await statements.deleteUserSessions.run(target.id);
          }
          send(res, 200, await stateFor(user));
          return;
        }
        const removeUser = pathname.match(/^\/api\/admin\/users\/(\d+)\/delete$/);
        if (req.method === 'POST' && removeUser) {
          const user = await requireAdmin(req);
          const target = await statements.account.get(Number(removeUser[1]));
          if (!target) throw fail(404, 'user_missing');
          if (target.is_admin) throw fail(400, 'cannot_change_admin');
      const ownedPhotos = await db.prepare('SELECT id,ext FROM photos WHERE owner_id = ?').all(target.id);
          await withTx(async () => {
            await statements.deleteUserSessions.run(target.id);
            await statements.deleteUserVotes.run(target.id, target.id);
            await statements.deleteUserCandidacies.run(target.id);
            await statements.clearPhaseArranger.run(target.id);
            await statements.reassignPhaseCreator.run(user.id, target.id);
            await statements.reassignScoreUploader.run(user.id, target.id);
            await statements.deleteUser.run(target.id);
          });
          for (const photo of ownedPhotos) await env.FILES.delete('photos/'+photo.id+'.'+photo.ext);
          for (const ext of ['jpg', 'png', 'webp', 'gif']) {
            await env.FILES.delete(`avatars/${target.id}.${ext}`);
          }
          send(res, 200, await stateFor(user));
          return;
        }
        const grant = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
        if (req.method === 'POST' && grant) {
          const user = await requireManager(req);
          const target = await statements.account.get(Number(grant[1]));
          if (!target) throw fail(404, 'user_missing');
          const body = await readBody(req);
          const flags = {
            musicDirector: statements.setMusicDirector,
            arranger: statements.setArranger,
            alumni: statements.setAlumni,
            crew: statements.setCrew,
            president: statements.setPresident,
            vicePresident: statements.setVicePresident,
            secretary: statements.setSecretary,
            treasurer: statements.setTreasurer,
            mediaChair: statements.setMedia
          };
          const adminOnly = new Set(['musicDirector', 'alumni', 'crew', 'president', 'vicePresident', 'secretary', 'treasurer', 'mediaChair']);
          const changing = Object.keys(flags).filter(key => typeof body[key] === 'boolean');
          if (!changing.length) throw fail(400, 'bad_json');
          if (!user.isAdmin && changing.some(key => adminOnly.has(key))) throw fail(403, 'forbidden');
          if (target.is_admin && changing.some(key => key !== 'arranger')) throw fail(400, 'cannot_change_admin');
          if (body.alumni === true && body.crew === true) throw fail(400, 'bad_json');
          const toAlumni = body.alumni === true;
          const roleKeys = ['musicDirector', 'arranger', 'president', 'vicePresident', 'secretary', 'treasurer', 'mediaChair'];
          await withTx(async () => {
            for (const key of changing) {
              if ((toAlumni || target.is_alumni && body.alumni !== false) && roleKeys.includes(key)) continue;
              await flags[key].run(body[key] ? 1 : 0, target.id);
            }
            if (body.crew === true) await statements.setAlumni.run(0, target.id);
            if (toAlumni) {
              await statements.setCrew.run(0, target.id);
              await statements.setMusicDirector.run(0, target.id);
              await statements.setArranger.run(0, target.id);
              await statements.setPresident.run(0, target.id);
              await statements.setVicePresident.run(0, target.id);
              await statements.setSecretary.run(0, target.id);
              await statements.setTreasurer.run(0, target.id);
              await statements.setMedia.run(0, target.id);
            }
          });
          send(res, 200, await stateFor(user));
          return;
        }
        if(pathname==='/api/plan/results'&&req.method==='GET'){const user=await requireUser(req);const id=Number(url.searchParams.get('songId'));if(!Number.isInteger(id)||id<=0)throw fail(400,'plan_invalid');const state=await stateFor(user,id);send(res,200,{history:state.history});return;}
        if(pathname==='/api/plan/library'&&req.method==='GET'){
          const user=await requireUser(req);if(!isManager(user)&&!user.isPresident)throw fail(403,'forbidden');const source=Number(url.searchParams.get('semesterId'));if(source){const semester=await statements.semesterById.get(source);if(!semester?.folder_id)throw fail(404,'semester_missing');send(res,200,{folders:(await google.listScoreFolders(semester.folder_id)).map(s=>({...s,semester:semester.label}))});}else send(res,200,{folders:await google.listScoreIndex()});return;
        }
        if(pathname==='/api/plan'&&req.method==='GET'){
          const user=await requireUser(req);const semesterId=Number(url.searchParams.get('semesterId'));
          if(semesterId){const semester=await statements.semesterById.get(semesterId);if(!semester?.folder_id)throw fail(404,'semester_missing');const folders=await google.listScoreFolders(semester.folder_id);send(res,200,await env.plans.fromSemester(user,semester.label,folders));}
          else send(res,200,await env.plans.list(user,Number(url.searchParams.get('termId'))||undefined));return;
        }
        if(pathname.startsWith('/api/plan/')&&req.method==='POST'){
          if(/^\/api\/plan\/sync\/\d+$/.test(pathname)){const user=await requireUser(req);if(!isManager(user)&&!user.isPresident)throw fail(403,'forbidden');await env.plans.sync(google.recordPlanSemesters);send(res,200,await env.plans.list(user,Number(pathname.split('/').at(-1))));return;}
          const user=await requireUser(req);const match=pathname.match(/^\/api\/plan\/(term|current|archive|add|bulk|save|big|lock|edit|delete|entry)(?:\/(\d+))?$/);
          if(!match)throw fail(404,'not_found');const data=await env.plans.mutate(user,match[1],Number(match[2]),await readBody(req));if(['add','bulk','edit'].includes(match[1])){await env.plans.sync(google.recordPlanSemesters);send(res,200,await env.plans.list(user,data.term.id));}else send(res,200,data);return;
        }
        if (req.method==='GET' && pathname==='/api/recordings/cleanup') {
          if(!env.recordings)throw fail(404,'not_found');
          await env.recordings.cleanup();if(env.plans)await env.plans.sync(google.recordPlanSemesters);send(res,200,{ok:true});return;
        }
        const audioUpload=pathname.match(/^\/api\/phases\/(\d+)\/recordings$/);
        if(req.method==='POST'&&audioUpload){const user=await requireUser(req);send(res,201,await env.recordings.begin(Number(audioUpload[1]),user,await readBody(req)));return;}
        const audioAction=pathname.match(/^\/api\/recordings\/([a-f0-9-]+)\/(complete|delete)$/);
        if(req.method==='POST'&&audioAction){const user=await requireUser(req);if(audioAction[2]==='complete')await env.recordings.complete(audioAction[1],user);else await env.recordings.remove(audioAction[1],user);send(res,200,await stateFor(user));return;}
        const audioRead=pathname.match(/^\/api\/recordings\/([a-f0-9-]+)$/);
        if(req.method==='GET'&&audioRead){await requireUser(req);res.writeHead(302,{Location:await env.recordings.play(audioRead[1]),'Cache-Control':'private, no-store'});res.end();return;}
        const action = pathname.match(/^\/api\/phases\/(\d+)\/(start|reveal|close|candidacy|vote|pair|confirm|cancel|audition)$/);
        if (req.method === 'POST' && action) {
          const user = await requireUser(req);
          const phaseId = Number(action[1]);
          if(env.voting){await env.voting.action(phaseId,action[2],user,await readBody(req));send(res,200,await stateFor(user));return;}
          const phase = await statements.phaseById.get(phaseId);
          if (!phase) throw fail(404, 'phase_missing');
          if (phase.status !== 'open') throw fail(400, 'phase_closed');
          if (action[2] === 'close') {
            if (!user.isMd && !user.isAdmin) throw fail(403, 'forbidden');
            await statements.closePhase.run(now(), phaseId);
            send(res, 200, await stateFor(user));
            return;
          }
          if (action[2] === 'candidacy') {
            const join = Boolean((await readBody(req)).join);
            await withTx(async () => {
              if (join) {
                if (!(await statements.isCandidate.get(phaseId, user.id))) {
                  await statements.insertCandidacy.run(phaseId, user.id, now());
                }
              } else {
                await statements.deleteVotesForCandidate.run(phaseId, user.id);
                await statements.deleteCandidacy.run(phaseId, user.id);
              }
            });
            send(res, 200, await stateFor(user));
            return;
          }
          const body = await readBody(req);
          const candidateId = Number(body.candidateId);
          if (!Number.isInteger(candidateId) || !(await statements.isCandidate.get(phaseId, candidateId))) {
            throw fail(400, 'not_candidate');
          }
          if (body.reaction == null) {
            await statements.deleteVote.run(phaseId, user.id, candidateId);
          } else if (body.reaction === 'like' || body.reaction === 'again') {
            await statements.upsertVote.run(phaseId, user.id, candidateId, body.reaction);
          } else {
            throw fail(400, 'bad_reaction');
          }
          send(res, 200, await stateFor(user));
          return;
        }
        if (req.method === 'POST' && pathname === '/api/google/settings') {
          const user = await requireAdmin(req);
          const body = await readBody(req);
          const clientId = cleanText(body.clientId, 200);
          const secret = typeof body.clientSecret === 'string' ? body.clientSecret.trim() : '';
          const spreadsheetRaw = typeof body.spreadsheet === 'string' ? body.spreadsheet.trim() : '';
          const spreadsheetId = spreadsheetRaw ? parseSpreadsheetId(spreadsheetRaw) : '';
          const parentRaw = typeof body.parentFolder === 'string' ? body.parentFolder.trim() : '';
          const parentFolderId = parentRaw ? parseFolderId(parentRaw) : '';
          const config = await google.load();
          if (!clientId) throw fail(400, 'client_required');
          if (!secret && !config.clientSecret) throw fail(400, 'secret_required');
          if (secret && secret.length < 8) throw fail(400, 'secret_required');
          if (spreadsheetRaw && !spreadsheetId) throw fail(400, 'sheet_invalid');
          if (parentRaw && !parentFolderId) throw fail(400, 'folder_invalid');
          const clientChanged = clientId !== config.clientId || secret && secret !== config.clientSecret;
          const nextParent = parentRaw ? parentFolderId : config.parentFolderId;
          if (nextParent && config.refreshToken && !clientChanged) await google.assertFolder(nextParent);
          await google.save({
            ...config,
            clientId,
            clientSecret: secret || config.clientSecret,
            spreadsheetId: spreadsheetRaw ? spreadsheetId : config.spreadsheetId,
            parentFolderId: nextParent,
            refreshToken: clientChanged ? '' : config.refreshToken,
            email: clientChanged ? '' : config.email,
            accessToken: '',
            expiresAt: 0
          });
          send(res, 200, await stateFor(user));
          return;
        }
        if (req.method === 'GET' && pathname === '/api/google/connect') {
          const user = await requireAdmin(req);
          const config = await google.load();
          if (!config.clientId || !config.clientSecret) throw fail(400, 'client_required');
          const redirect = redirectUri(env.PUBLIC_ORIGIN);
          if (!redirect) throw fail(400, 'connect_on_computer');
          const state = randomBytes(24).toString('hex');
          res.writeHead(302, {
            Location: google.authUrl({
              clientId: config.clientId,
              redirect,
              state
            }),
            'Set-Cookie': `google_state=${state}; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=600`
          });
          res.end();
          return;
        }
        if (req.method === 'GET' && pathname === '/api/google/callback') {
          const user = await currentUser(req);
          const expected = parseCookies(req).google_state;
          const clearState = 'google_state=; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=0';
          const back = flag => {
            res.writeHead(302, {
              Location: `/?scores=1${flag ? `&google=${flag}` : ''}`,
              'Set-Cookie': clearState
            });
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
            await google.exchange(code, redirectUri(env.PUBLIC_ORIGIN));
            back('');
          } catch (error) {
            console.error(error);
            back('error');
          }
          return;
        }
        if (req.method === 'POST' && pathname === '/api/google/disconnect') {
          const user = await requireAdmin(req);
          const config = await google.load();
          await google.save({
            ...config,
            refreshToken: '',
            email: '',
            accessToken: '',
            expiresAt: 0
          });
          send(res, 200, await stateFor(user));
          return;
        }
        if (req.method === 'POST' && pathname === '/api/semesters') {
          const user = await requireAdmin(req);
          const body = await readBody(req);
          const label = cleanText(body.label, 40);
          if (!label) throw fail(400, 'semester_required');
          const config = await google.load();
          if (!config.refreshToken) throw fail(400, 'google_disconnected');
          if (!config.parentFolderId) throw fail(400, 'parent_missing');
          const folderId = await google.createSemesterFolder(config.parentFolderId, label);
          try {
            await statements.insertSemester.run(label, folderId, now());
          } catch (error) {
            if (String(error.message).includes('UNIQUE')) throw fail(409, 'semester_taken');
            throw error;
          }
          send(res, 201, await stateFor(user));
          return;
        }
        const removeSemester = pathname.match(/^\/api\/semesters\/(\d+)\/delete$/);
        if (req.method === 'POST' && removeSemester) {
          const user = await requireAdmin(req);
          const semesterId = Number(removeSemester[1]);
          if (!(await statements.semesterById.get(semesterId))) throw fail(404, 'semester_missing');
          if ((await statements.scoreCountForSemester.get(semesterId)).n > 0) throw fail(400, 'semester_used');
          await statements.deleteSemester.run(semesterId);
          send(res, 200, await stateFor(user));
          return;
        }
        if (req.method === 'POST' && pathname === '/api/arrangers') {
          const user = await requireUser(req);
          if (!user.isArranger) throw fail(403, 'not_arranger');
          const name = await ensureArranger((await readBody(req)).name);
          if (!name) throw fail(400, 'arranger_required');
          send(res, 200, await stateFor(user));
          return;
        }
        if (req.method === 'GET' && pathname === '/api/library/folders') {
          await requireUser(req);
          const semester = await statements.semesterById.get(Number(url.searchParams.get('semesterId')));
          if (!semester?.folder_id) throw fail(404, 'semester_missing');
          const folders = await google.listScoreFolders(semester.folder_id);
          send(res, 200, {
            id: semester.id,
            label: semester.label,
            url: `https://drive.google.com/drive/folders/${semester.folder_id}`,
            folders
          });
          return;
        }
        if (req.method === 'GET' && pathname === '/api/library/songs') {
          const user = await requireUser(req);
          if (!user.isArranger) throw fail(403, 'not_arranger');
          const semesters = await statements.listSemesters.all();
          const folders = (await google.listScoreIndex()).map(item => ({...item, semesterId:semesters.find(s => item.semester.split(/[,，]/).some(label => label.trim().toLowerCase() === s.label.toLowerCase()))?.id || 0}));
          send(res, 200, {folders});
          return;
        }
        if (req.method === 'GET' && pathname === '/api/scores/folder') {
          const user = await requireUser(req);
          if (!user.isArranger) throw fail(403, 'not_arranger');
          let semester = await statements.semesterById.get(Number(url.searchParams.get('semesterId')));
          const folderId = driveId(url.searchParams.get('folderId'));
          if (!folderId) throw fail(404, 'folder_not_found');
          let match = semester?.folder_id ? (await google.listScoreFolders(semester.folder_id)).find(item => item.id === folderId) : null;
          if (!match) {
            for (const item of await statements.listSemesters.all()) {
              const source = await statements.semesterById.get(item.id);
              if (!source?.folder_id) continue;
              const found = (await google.listScoreFolders(source.folder_id)).find(item => item.id === folderId);
              if (found) {semester=source;match=found;break;}
            }
          }
          if (!match) throw fail(404, 'folder_not_found');
          const files = await google.listFolderFiles(folderId);
          const row = await google.findScoreRow({
            folderId,
            shortcutId: match.shortcutId,
            title: match.name,
            semester: semester.label
          });
          const arrangers = (await Promise.all(splitArrangers(row.arranger).map(async name => await ensureArranger(name)))).filter(Boolean);
          send(res, 200, {
            folderId,
            title: match.name,
            arrangers,
            kinds: kindsFromSheet(row.kind),
            semesterId: semester.id,
            files
          });
          return;
        }
        if (req.method === 'POST' && pathname === '/api/scores/edit') {
          const user = await requireUser(req);
          if (!user.isArranger) throw fail(403, 'not_arranger');
          const parts = parseMultipart(await readRaw(req, 4 * 1024 * 1024), req.headers['content-type']);
          const field = name => {
            const part = parts.find(item => item.name === name && !item.filename);
            return part ? part.body.toString('utf8') : '';
          };
          const title = cleanText(field('title'), 80);
          const arrangerNames = [];
          const seenArrangers = new Set();
          for (const part of parts) {
            if (part.name !== 'arranger' || part.filename) continue;
            const name = await ensureArranger(part.body.toString('utf8'));
            const key = name.toLowerCase();
            if (!name || seenArrangers.has(key)) continue;
            seenArrangers.add(key);
            arrangerNames.push(name);
          }
          const arranger = arrangerNames.join(', ');
          const picked = new Set(parts.filter(item => item.name === 'kind' && !item.filename).map(item => item.body.toString('utf8')));
          const kinds = ['all', 'group'].filter(item => picked.has(item));
          const source = await statements.semesterById.get(Number(field('sourceSemesterId')));
          const semester = await statements.semesterById.get(Number(field('semesterId')));
          const folderId = driveId(field('folderId'));
          if (!title) throw fail(400, 'song_required');
          if (!arranger) throw fail(400, 'arranger_required');
          if (!kinds.length) throw fail(400, 'kind_required');
          if (!source?.folder_id || !semester?.folder_id || !folderId) throw fail(400, 'semester_missing');
          const listed = await google.listScoreFolders(source.folder_id);
          const match = listed.find(item => item.id === folderId);
          if (!match) throw fail(404, 'folder_not_found');
          const nextTitle = title.replace(/[\\/]/g, ' ');
          const destination = source.id === semester.id ? listed : await google.listScoreFolders(semester.folder_id);
          if (destination.some(item => item.id !== folderId && item.name === nextTitle)) throw fail(400, 'song_taken');
          const uploads = scoreUploads(parts);
          const currentFiles = await google.listFolderFiles(folderId);
          const allowed = new Set(currentFiles.map(file => file.id));
          const removing = [];
          for (const part of parts) {
            if (part.name !== 'delete' || part.filename) continue;
            const id = driveId(part.body.toString('utf8'));
            if (id && allowed.has(id) && !removing.includes(id)) removing.push(id);
          }
          const config = await google.load();
          if (!config.refreshToken || !config.spreadsheetId) throw fail(400, 'google_disconnected');
          const songUrl = `https://drive.google.com/drive/folders/${folderId}`;
          const kindText = kinds.map(item => item === 'all' ? '大歌/all members' : '小组/small group').join(', ');
          const sheetValues = {
            title: nextTitle,
            arranger,
            semester: semester.label,
            kind: kindText,
            link: sheetLink(songUrl, nextTitle)
          };
          const stored = [];
          try {
            for (const file of uploads) {
              const uploaded = await google.uploadFile({
                name: file.name,
                folderId,
                mime: file.mime,
                bytes: file.bytes
              });
              stored.push(uploaded.id);
            }
            const row = await google.findScoreRow({
              folderId,
              shortcutId: match.shortcutId,
              title: match.name,
              semester: source.label
            });
            sheetValues.semester = semesterCell(row.semester, source.label, semester.label);
            if (row.row) await google.updateScoreRow(row.row, sheetValues);else await google.appendRow(sheetValues);
            const driveName = nextTitle === match.name ? undefined : nextTitle;
            const moveTo = source.folder_id === semester.folder_id ? '' : semester.folder_id;
            if (match.shortcutId) {
              if (driveName || moveTo) {
                await google.updateDriveFile(match.shortcutId, {
                  name: driveName,
                  addParents: moveTo,
                  removeParents: moveTo ? source.folder_id : ''
                });
              }
              if (driveName) await google.updateDriveFile(folderId, {
                name: driveName
              });
            } else if (driveName || moveTo) {
              await google.updateDriveFile(folderId, {
                name: driveName,
                addParents: moveTo,
                removeParents: moveTo ? source.folder_id : ''
              });
            }
          } catch (error) {
            for (const id of stored) await google.deleteFile(id).catch(deleteError => console.error(deleteError));
            throw error;
          }
          for (const id of removing) await google.deleteFile(id);
          const kept = currentFiles.filter(file => !removing.includes(file.id)).map(file => file.name);
          const fileName = [...kept, ...uploads.map(file => file.name)].join(', ').slice(0, 180) || nextTitle;
          const kind = kinds.includes('all') ? 'big' : 'small';
          const updated = await statements.updateScoreByFolder.run(nextTitle, arranger, kind, kinds.join(','), semester.id, semester.label, fileName, songUrl, folderId);
          if (!updated.changes) {
            await statements.insertScore.run(nextTitle, arranger, kind, kinds.join(','), semester.id, semester.label, fileName, folderId, songUrl, user.id, now());
          }
          send(res, 200, await stateFor(user));
          return;
        }
        if (req.method === 'POST' && pathname === '/api/scores') {
          const user = await requireUser(req);
          if (!user.isArranger) throw fail(403, 'not_arranger');
          const parts = parseMultipart(await readRaw(req, 4 * 1024 * 1024), req.headers['content-type']);
          const field = name => {
            const part = parts.find(item => item.name === name && !item.filename);
            return part ? part.body.toString('utf8') : '';
          };
          const title = cleanText(field('title'), 80);
          const arrangerNames = [];
          const seenArrangers = new Set();
          for (const part of parts) {
            if (part.name !== 'arranger' || part.filename) continue;
            const name = await ensureArranger(part.body.toString('utf8'));
            const key = name.toLowerCase();
            if (!name || seenArrangers.has(key)) continue;
            seenArrangers.add(key);
            arrangerNames.push(name);
          }
          const arranger = arrangerNames.join(', ');
          const picked = new Set(parts.filter(item => item.name === 'kind' && !item.filename).map(item => item.body.toString('utf8')));
          const kinds = ['all', 'group'].filter(item => picked.has(item));
          const semester = await statements.semesterById.get(Number(field('semesterId')));
          if (!title) throw fail(400, 'song_required');
          if (!arranger) throw fail(400, 'arranger_required');
          if (!kinds.length) throw fail(400, 'kind_required');
          if (!semester) throw fail(400, 'semester_missing');
          const uploads = scoreUploads(parts);
          if (!uploads.length) throw fail(400, 'file_required');
          const config = await google.load();
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
                bytes: file.bytes
              });
              stored.push(uploaded.id);
            }
            const kindText = kinds.map(item => item === 'all' ? '大歌/all members' : '小组/small group').join(', ');
            await google.appendRow({
              title,
              arranger,
              semester: semester.label,
              kind: kindText,
              link: sheetLink(songUrl, title)
            });
          } catch (error) {
            for (const id of stored) await google.deleteFile(id).catch(deleteError => console.error(deleteError));
            throw error;
          }
          await statements.insertScore.run(title, arranger, kinds.includes('all') ? 'big' : 'small', kinds.join(','), semester.id, semester.label, uploads.map(file => file.name).join(', ').slice(0, 180), songFolderId, songUrl, user.id, now());
          send(res, 201, await stateFor(user));
          return;
        }
        send(res, 404, {
          error: 'not_found'
        });
      } catch (error) {
        const status = error.status || 500;
        if (status === 500) console.error(error);
        if (!res.headersSent) send(res, status, {
          error: status === 500 ? 'server' : error.message
        });
      }
    }
    try { await initialize(env); await handle(req, res); } catch(error) { console.error('Storage unavailable', error); return Response.json({error:'server'},{status:503}); }
    return res.response();
  }
};
