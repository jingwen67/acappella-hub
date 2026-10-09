import { Buffer } from 'node:buffer';
export function mergeSemesters(existing,...labels){const values=String(existing||'').split(/[,，、;]/).concat(labels.flatMap(v=>String(v||'').split(/[,，、;]/)));const seen=new Set();return values.map(v=>v.trim()).filter(v=>{const key=v.toLowerCase().replace(/\s+/g,'');if(!key||seen.has(key))return false;seen.add(key);return true;}).join(', ');}
const empty = {
  clientId: '',
  clientSecret: '',
  refreshToken: '',
  email: '',
  spreadsheetId: '',
  parentFolderId: '',
  accessToken: '',
  expiresAt: 0
};
const fileTypes = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mscz: 'application/zip',
  musicxml: 'application/vnd.recordare.musicxml+xml',
  xml: 'application/xml',
  mxl: 'application/vnd.recordare.musicxml'
};
const columns = [['title', ['曲名', '曲名songtitle', 'songtitle', 'title', '歌名', 'song']], ['arranger', ['编曲', '编曲者', '编曲arranger', '编曲者arranger', 'arranger', '改编']], ['semester', ['学期', '学期semester', 'semester', '初次上传学期']], ['kind', ['性质', '性质type', 'type', '类型']], ['link', ['链接', '链接link', 'link', 'url']]];
function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
export function parseFolderId(value) {
  const text = String(value || '').trim();
  const fromUrl = text.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (fromUrl) return fromUrl[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(text)) return text;
  return '';
}
export function parseSpreadsheetId(value) {
  const text = String(value || '').trim();
  const fromUrl = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (fromUrl) return fromUrl[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(text)) return text;
  return '';
}
export function redirectUri(origin) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') return '';
  return `${url.origin}/api/google/callback`;
}
export function columnKey(header) {
  const text = String(header || '').trim().toLowerCase().replace(/\s+/g, '');
  for (const [key, names] of columns) {
    if (names.some(name => name.toLowerCase().replace(/\s+/g, '') === text)) return key;
  }
  return '';
}
export function sheetLink(url, label) {
  const href = String(url).replaceAll('"', '""');
  const text = String(label).replaceAll('"', '""');
  return `=HYPERLINK("${href}","${text}")`;
}
export function scoreFileType(filename) {
  const ext = String(filename || '').split('.').pop().toLowerCase();
  return fileTypes[ext] || '';
}
export function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType || '');
  if (!match) throw fail(400, 'bad_upload');
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const parts = [];
  let cursor = 0;
  while (cursor < buffer.length) {
    const start = buffer.indexOf(boundary, cursor);
    if (start === -1) break;
    let pos = start + boundary.length;
    if (buffer[pos] === 45 && buffer[pos + 1] === 45) break;
    if (buffer[pos] === 13 && buffer[pos + 1] === 10) pos += 2;
    const next = buffer.indexOf(boundary, pos);
    if (next === -1) break;
    const headerEnd = buffer.indexOf('\r\n\r\n', pos);
    if (headerEnd === -1 || headerEnd > next) break;
    const headerText = buffer.subarray(pos, headerEnd).toString('utf8');
    let bodyEnd = next - 2;
    if (bodyEnd < headerEnd + 4) bodyEnd = next;
    const name = /name="([^"]*)"/.exec(headerText)?.[1] || '';
    const starred = /filename\*=UTF-8''([^;\r\n]+)/i.exec(headerText);
    let filename = '';
    if (starred) {
      try {
        filename = decodeURIComponent(starred[1]);
      } catch {
        filename = starred[1];
      }
    } else {
      filename = /filename="([^"]*)"/.exec(headerText)?.[1] || '';
    }
    parts.push({
      name,
      filename,
      body: buffer.subarray(headerEnd + 4, bodyEnd)
    });
    cursor = next;
  }
  return parts;
}
async function googleJson(token, url, options = {}) {
  const headers = {
    Authorization: `Bearer ${token}`
  };
  if (options.body && !options.raw) headers['Content-Type'] = 'application/json';
  Object.assign(headers, options.headers || {});
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body
  });
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {
        raw: text.slice(0, 300)
      };
    }
  }
  if (!res.ok) {
    const reason = data.error?.status || data.error?.message || res.status;
    console.error('Google API', res.status, String(reason).slice(0, 300));
    const message = String(data.error?.message || '');
    if (res.status === 404) throw fail(400, 'folder_not_found');
    if (/has not been used in project|it is disabled/i.test(message)) throw fail(403, 'api_disabled');
    if (res.status === 403) throw fail(403, 'google_forbidden');
    throw fail(502, 'google_failed');
  }
  return data;
}
export function createGoogle(storage) {
  async function load() {
    const file = await storage.get('private/google.json');
    return file ? {
      ...empty,
      ...(await file.json())
    } : {
      ...empty
    };
  }
  async function save(config) {
    await storage.put('private/google.json', JSON.stringify({
      ...empty,
      ...config
    }));
  }
  function authUrl({
    clientId,
    redirect,
    state
  }) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets',
      access_type: 'offline',
      prompt: 'consent',
      state
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  async function exchange(code, redirect) {
    const config = await load();
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirect,
        grant_type: 'authorization_code'
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.refresh_token) {
      console.error('Google connect failed', data.error || res.status);
      throw fail(401, 'google_auth');
    }
    config.refreshToken = data.refresh_token;
    config.accessToken = data.access_token || '';
    config.expiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
    await save(config);
    try {
      const about = await googleJson(config.accessToken, 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)');
      config.email = about.user?.emailAddress || '';
      await save(config);
    } catch (error) {
      console.error('Could not read the connected Google account', error.message);
    }
  }
  async function accessToken() {
    const config = await load();
    if (!config.refreshToken || !config.clientId || !config.clientSecret) throw fail(400, 'google_disconnected');
    if (config.accessToken && config.expiresAt > Date.now() + 30_000) return config.accessToken;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
        grant_type: 'refresh_token'
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      console.error('Google token refresh failed', data.error || res.status);
      throw fail(401, 'google_auth');
    }
    config.accessToken = data.access_token;
    config.expiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
    await save(config);
    return config.accessToken;
  }
  async function assertFolder(folderId) {
    const token = await accessToken();
    const data = await googleJson(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,mimeType&supportsAllDrives=true`);
    if (data.mimeType !== 'application/vnd.google-apps.folder') throw fail(400, 'not_a_folder');
  }
  async function createSemesterFolder(parentId, name) {
    await assertFolder(parentId);
    const token = await accessToken();
    const safeName = String(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const query = `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
    const found = await googleJson(token, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`);
    if (found.files?.[0]?.id) return found.files[0].id;
    const created = await googleJson(token, 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id', {
      method: 'POST',
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      })
    });
    if (!created.id) throw fail(502, 'google_failed');
    return created.id;
  }
  async function uploadFile({
    name,
    folderId,
    mime,
    bytes
  }) {
    const token = await accessToken();
    const boundary = `score-${Date.now().toString(16)}`;
    const meta = Buffer.from(JSON.stringify({
      name,
      parents: [folderId]
    }));
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`), meta, Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--`)]);
    const data = await googleJson(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink', {
      method: 'POST',
      raw: true,
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    });
    return {
      id: data.id,
      url: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`
    };
  }
  async function deleteFile(fileId) {
    const token = await accessToken();
    await googleJson(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
      method: 'DELETE'
    });
  }
  async function appendRow(values) {
    const config = await load();
    if (!config.spreadsheetId) throw fail(400, 'sheet_missing');
    const token = await accessToken();
    const meta = await googleJson(token, `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}?fields=sheets.properties.title`);
    const title = meta.sheets?.[0]?.properties?.title;
    if (!title) throw fail(400, 'sheet_invalid');
    const quoted = `'${String(title).replaceAll("'", "''")}'`;
    const existing = await googleJson(token, `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${encodeURIComponent(`${quoted}!1:1`)}`);
    const headers = existing.values?.[0] || [];
    if (!headers.length) {
      await googleJson(token, `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${encodeURIComponent(`${quoted}!A1`)}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        body: JSON.stringify({
          values: [['曲名Song Title', '编曲Arranger', '学期Semester', '性质Type', '链接Link'], [values.title, values.arranger, values.semester, values.kind, values.link]]
        })
      });
      return;
    }
    if (!headers.some(header => columnKey(header))) throw fail(400, 'sheet_headers');
    const row = headers.map(header => values[columnKey(header)] || '');
    await googleJson(token, `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${encodeURIComponent(`${quoted}!A1`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      body: JSON.stringify({
        values: [row]
      })
    });
  }
  async function listScoreFolders(folderId) {
    const token = await accessToken();
    const safeId = String(folderId).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const query = `'${safeId}' in parents and trashed = false and (mimeType = 'application/vnd.google-apps.folder' or mimeType = 'application/vnd.google-apps.shortcut')`;
    const folders = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({
        q: query,
        fields: 'nextPageToken,files(id,name,mimeType,shortcutDetails(targetId,targetMimeType))',
        pageSize: '100',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true'
      });
      if (pageToken) params.set('pageToken', pageToken);
      const data = await googleJson(token, `https://www.googleapis.com/drive/v3/files?${params}`);
      for (const file of data.files || []) {
        const shortcut = file.mimeType === 'application/vnd.google-apps.shortcut';
        const targetId = shortcut ? file.shortcutDetails?.targetId : file.id;
        const targetMime = shortcut ? file.shortcutDetails?.targetMimeType : file.mimeType;
        if (!targetId || targetMime !== 'application/vnd.google-apps.folder') continue;
        folders.push({
          id: targetId,
          shortcutId: shortcut ? file.id : '',
          name: file.name,
          url: `https://drive.google.com/drive/folders/${targetId}`
        });
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken && folders.length < 500);
    folders.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    return folders;
  }
  async function spreadsheet() {
    const config = await load();
    if (!config.spreadsheetId) throw fail(400, 'sheet_missing');
    const token = await accessToken();
    const meta = await googleJson(token, `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}?fields=sheets.properties.title`);
    const title = meta.sheets?.[0]?.properties?.title;
    if (!title) throw fail(400, 'sheet_invalid');
    return {
      token,
      spreadsheetId: config.spreadsheetId,
      quoted: `'${String(title).replaceAll("'", "''")}'`
    };
  }
  async function listFolderFiles(folderId) {
    const token = await accessToken();
    const safeId = String(folderId).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const query = `'${safeId}' in parents and trashed = false`;
    const files = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({
        q: query,
        fields: 'nextPageToken,files(id,name,mimeType,shortcutDetails(targetMimeType))',
        pageSize: '100',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true'
      });
      if (pageToken) params.set('pageToken', pageToken);
      const data = await googleJson(token, `https://www.googleapis.com/drive/v3/files?${params}`);
      for (const file of data.files || []) {
        const targetMime = file.mimeType === 'application/vnd.google-apps.shortcut' ? file.shortcutDetails?.targetMimeType : file.mimeType;
        if (targetMime === 'application/vnd.google-apps.folder') continue;
        files.push({
          id: file.id,
          name: file.name
        });
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken && files.length < 200);
    files.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    return files;
  }
  async function updateDriveFile(fileId, {
    name,
    addParents,
    removeParents
  } = {}) {
    const token = await accessToken();
    const params = new URLSearchParams({
      supportsAllDrives: 'true',
      fields: 'id,name'
    });
    if (addParents) params.set('addParents', addParents);
    if (removeParents) params.set('removeParents', removeParents);
    await googleJson(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params}`, {
      method: 'PATCH',
      body: JSON.stringify(name ? {
        name
      } : {})
    });
  }
  async function listScoreIndex() {
    const sheet = await spreadsheet();
    const data = await googleJson(sheet.token, `https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/${encodeURIComponent(`${sheet.quoted}!A:Z`)}?valueRenderOption=FORMULA`);
    const keys = (data.values?.[0] || []).map(columnKey);
    if (!keys.includes('title')) throw fail(400, 'sheet_headers');
    return (data.values || []).slice(1).map((cells, index) => {
      const row = {};
      keys.forEach((key, i) => { if (key) row[key] = cells[i] || ''; });
      return {row:index + 2, id:parseFolderId(row.link), name:String(row.title || '').trim(), semester:String(row.semester || '').trim()};
    }).filter(item => item.name).sort((a,b) => a.name.localeCompare(b.name, 'zh'));
  }
  async function findScoreRow({
    folderId,
    shortcutId,
    title,
    semester
  }) {
    const sheet = await spreadsheet();
    const existing = await googleJson(sheet.token, `https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/${encodeURIComponent(`${sheet.quoted}!A:Z`)}?valueRenderOption=FORMULA`);
    const headers = existing.values?.[0] || [];
    if (!headers.some(header => columnKey(header))) throw fail(400, 'sheet_headers');
    const keys = headers.map(header => columnKey(header));
    const wantedTitle = String(title || '').trim().toLowerCase();
    const wantedSemester = String(semester || '').trim().toLowerCase();
    let titleHit = null;
    for (let index = 1; index < (existing.values || []).length; index += 1) {
      const cells = existing.values[index] || [];
      const mapped = {};
      keys.forEach((key, cell) => {
        if (key) mapped[key] = cells[cell] || '';
      });
      const linkId = parseFolderId(mapped.link);
      if (linkId && (linkId === folderId || shortcutId && linkId === shortcutId)) {
        return {
          row: index + 1,
          ...mapped
        };
      }
      const sameTitle = wantedTitle && String(mapped.title || '').trim().toLowerCase() === wantedTitle;
      const semesterParts = String(mapped.semester || '').split(/[,，]/).map(part => part.trim().toLowerCase()).filter(Boolean);
      const sameSemester = !wantedSemester || semesterParts.includes(wantedSemester);
      if (sameTitle && sameSemester) titleHit = {
        row: index + 1,
        ...mapped
      };
    }
    return titleHit || {
      row: 0,
      arranger: '',
      kind: ''
    };
  }
  async function updateScoreRow(rowNumber, values) {
    const sheet = await spreadsheet();
    const headerRes = await googleJson(sheet.token, `https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/${encodeURIComponent(`${sheet.quoted}!1:1`)}?valueRenderOption=FORMULA`);
    const headers = headerRes.values?.[0] || [];
    if (!headers.some(header => columnKey(header))) throw fail(400, 'sheet_headers');
    const end = columnLetter(headers.length);
    const currentRes = await googleJson(sheet.token, `https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/${encodeURIComponent(`${sheet.quoted}!A${rowNumber}:${end}${rowNumber}`)}?valueRenderOption=FORMULA`);
    const current = currentRes.values?.[0] || [];
    const row = headers.map((header, index) => {
      const key = columnKey(header);
      if (!key || !Object.prototype.hasOwnProperty.call(values, key)) return current[index] || '';
      if(key==='semester')return mergeSemesters(current[index],values[key]);
      return values[key] || '';
    });
    await googleJson(sheet.token, `https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/${encodeURIComponent(`${sheet.quoted}!A${rowNumber}:${end}${rowNumber}`)}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: JSON.stringify({
        values: [row]
      })
    });
  }
  async function recordPlanSemesters(jobs){
    const sheet=await spreadsheet();
    const params=new URLSearchParams({ranges:`${sheet.quoted}!A:Z`,fields:'sheets(data(startRow,rowData(values(formattedValue,hyperlink,userEnteredValue,textFormatRuns(format(link))))))'});
    const grid=await googleJson(sheet.token,`https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}?${params}`);
    const values=[],cellRows=[];for(const block of grid.sheets?.[0]?.data||[])for(let i=0;i<(block.rowData||[]).length;i++){const index=(block.startRow||0)+i;cellRows[index]=block.rowData[i].values||[];values[index]=cellRows[index].map(cell=>cell.formattedValue??cell.userEnteredValue?.stringValue??'');}
    const existing={values};
    const keys=(existing.values?.[0]||[]).map(columnKey),semesterColumn=keys.indexOf('semester'),linkColumn=keys.indexOf('link'),titleColumn=keys.indexOf('title');if(semesterColumn<0||linkColumn<0||titleColumn<0)throw fail(400,'sheet_headers');
    const normalize=v=>String(v||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
    const rows=(existing.values||[]).slice(1).map((cells,i)=>({cells,row:i+2,folder:(()=>{const cell=cellRows[i+1]?.[linkColumn]||{};const ids=[cell.hyperlink,...(cell.textFormatRuns||[]).map(run=>run.format?.link?.uri),cell.userEnteredValue?.formulaValue,cells[linkColumn]].map(parseFolderId).filter(Boolean);return [...new Set(ids)].length===1?ids[0]:'';})(),title:normalize(cells[titleColumn])}));
    const titleRows=new Map(),jobTitles=new Map(),matched=new Map(),done=[];
    for(const row of rows)if(row.title){if(!titleRows.has(row.title))titleRows.set(row.title,[]);titleRows.get(row.title).push(row);}
    for(const job of jobs){const title=normalize(job.title||(job.folder_id.startsWith('title:')?job.folder_id.slice(6):''));if(title){if(!jobTitles.has(title))jobTitles.set(title,new Set());jobTitles.get(title).add(job.folder_id);}}
    for(const job of jobs){const direct=rows.filter(row=>row.folder&&row.folder===job.folder_id);const title=normalize(job.title||(job.folder_id.startsWith('title:')?job.folder_id.slice(6):''));const candidates=titleRows.get(title)||[];const hits=direct.length?direct:candidates.length===1&&jobTitles.get(title)?.size===1?candidates:[];
      for(const row of hits){if(!matched.has(row.row))matched.set(row.row,{row,jobs:[]});matched.get(row.row).jobs.push(job);}if(hits.length)done.push(job.id);
    }
    const data=[];for(const {row,jobs:matches} of matched.values()){const value=mergeSemesters(row.cells[semesterColumn],...matches.map(job=>job.semester));if(value!==String(row.cells[semesterColumn]||''))data.push({range:`${sheet.quoted}!${columnLetter(semesterColumn+1)}${row.row}`,values:[[value]]});}
    if(data.length)await googleJson(sheet.token,`https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values:batchUpdate`,{method:'POST',body:JSON.stringify({valueInputOption:'RAW',data})});return [...new Set(done)];
  }

  return {
    load,
    save,
    authUrl,
    exchange,
    assertFolder,
    createSemesterFolder,
    uploadFile,
    deleteFile,
    appendRow,
    listScoreFolders,
    listScoreIndex,
    recordPlanSemesters,
    listFolderFiles,
    updateDriveFile,
    findScoreRow,
    updateScoreRow
  };
}
function columnLetter(count) {
  let n = count;
  let letters = '';
  while (n > 0) {
    const index = (n - 1) % 26;
    letters = String.fromCharCode(65 + index) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters || 'A';
}
