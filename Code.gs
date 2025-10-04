/**
 * Modererat kommentarsflöde – Apps Script Web App
 * Sheet-struktur (bladnamn: "Comments"):
 * timestamp | name | comment | approved
 */

const SHEET_NAME = 'Comments';
const ADMIN_TOKEN = '0924caec289cfc505292708280150e009cd4bc8c655a73da01a08f3cee81101b';
const NOTIFY_TO = 'klassforaldrar.s7tills9.vittra@gmail.com';
const ALLOWED_ORIGINS = ["https://klassforaldrars7tills9vittra.github.io"];

function ensureSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['timestamp', 'name', 'comment', 'approved']);
  }
  return sh;
}

function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeaders(corHeaders_(e));
}

// GET: vidarebefordra callback → JSONP för list
function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = String(p.action || '').toLowerCase();
  if (action === 'list') return handleList_(p, p.callback);
  return json_({ ok: true, msg: 'ok' }, p.callback);
}

function doPost(e) {
  const p = e && e.parameter ? e.parameter : {};
  const action = (p.action || '').toLowerCase();
  if (action === 'submit') return handleSubmit_(p, e);
  if (action === 'moderate') return handleModerate_(p, e);
  return json_({ ok: false, error: 'unknown_action' }, e, 400);
}

// GET: lista kommentarer, olika statusar, med eller utan admin-token
function handleList_(p, cb) {
  const status = String(p.status || 'approved').toLowerCase(); // approved | pending | all
  const limit = Math.max(1, Math.min(500, Number(p.limit || 50)));
  const token = String(p.token || '');

  const sh = ensureSheet_();
  const rng = sh.getDataRange().getValues();
  const head = (rng.shift() || []).map(h => String(h || '').trim().toLowerCase());

  const idx = {
    ts: head.indexOf('timestamp'),
    name: head.indexOf('name'),
    comment: head.indexOf('comment')
  };

  const approvedNames = ['approved', 'approval', 'godkänd', 'godkand', 'godkända', 'godkannande', 'godkännande'];
  let idxApproved = head.findIndex(h => approvedNames.includes(h));
  if (idxApproved < 0) idxApproved = 3;

  const all = rng.map((r, i) => ({
    row: i + 2,
    ts: r[idx.ts >= 0 ? idx.ts : 0],
    name: String(r[idx.name >= 0 ? idx.name : 1] || ''),
    comment: String(r[idx.comment >= 0 ? idx.comment : 2] || ''),
    approved: String(r[idxApproved] || '')
  })).sort((a, b) => new Date(b.ts) - new Date(a.ts));

  let items;
  if (status === 'approved') {
    items = all
      .filter(r => isApproved(r.approved))
      .map(stripId_)
      .slice(0, limit);
  } else if (status === 'pending') {
    if (!isAdminToken_(token)) return json_({ ok: false, error: 'forbidden' }, cb);
    items = all.filter(r => !isApproved(r.approved)).slice(0, limit);
  } else {
    if (!isAdminToken_(token)) return json_({ ok: false, error: 'forbidden' }, cb);
    items = all.slice(0, limit);
  }

  return json_({ ok: true, items }, cb);
}

// Tar bort intern data från objekt
function stripId_(r) {
  return { ts: r.ts, name: r.name, comment: r.comment };
}

function handleSubmit_(p, e) {
  const name = String(p.name || '').trim().slice(0, 60);
  const comment = String(p.comment || '').trim();
  if (comment.length < 3 || comment.length > 500) {
    return json_({ ok: false, error: 'invalid_length' }, e, 400);
  }

  const sh = ensureSheet_();
  const ts = new Date();
  let who = name || '';
  if (!who) {
    try { who = Session.getActiveUser().getEmail() || ''; } catch (err) {}
    if (!who) who = 'Anonym';
  }
  sh.appendRow([ts, who, comment, 'Nej']);

  try {
    const to = (typeof NOTIFY_TO !== 'undefined' && NOTIFY_TO) || Session.getEffectiveUser().getEmail();
    if (to) {
      const subj = 'Ny kommentar på Klassresesidan';
      const body = `Ny kommentar väntar på godkännande:<br>
Från: ${who}<br>
Tid: ${ts}<br><br>
${comment}<br><br>
Godkänn i Sheet (kolumn approved = Ja).`;

      MailApp.sendEmail({ to, subject: subj, htmlBody: body, noReply: true });
    }
  } catch (err) {
    Logger.log('Mail error: ' + err.message);
    Logger.log(err.stack);
  }

  return json_({ ok: true });
}

function handleModerate_(p, e) {
  const token = p.token || '';
  if (!isAdminToken_(token)) return json_({ ok: false, error: 'forbidden' }, e, 403);

  const op = (p.op || '').toLowerCase();
  const row = Number(p.row || 0);
  if (!row || row < 2) return json_({ ok: false, error: 'bad_row' }, e, 400);

  const sh = ensureSheet_();
  if (op === 'approve') {
    const col = findCol_(sh, 'approved');
    sh.getRange(row, col).setValue('Ja');
    return json_({ ok: true });
  } else if (op === 'decline') {
    const col = findCol_(sh, 'approved');
    sh.getRange(row, col).setValue('Nej');
    return json_({ ok: true });
  } else if (op === 'delete') {
    sh.deleteRow(row);
    return json_({ ok: true });
  }

  return json_({ ok: false, error: 'bad_op' }, e, 400);
}

function findCol_(sh, headerName) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const i = headers.indexOf(headerName);
  if (i < 0) throw new Error('header_not_found: ' + headerName);
  return i + 1;
}

function isAdminToken_(token) {
  return token && token === ADMIN_TOKEN;
}

// JSON/JSONP-utdata
function json_(obj, callback, statusCode) {
  const jsonString = JSON.stringify(obj);
  let output;

  if (callback && /^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(callback)) {
    output = ContentService.createTextOutput(`${callback}(${jsonString});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    output = ContentService.createTextOutput(jsonString)
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (statusCode) {
    try {
      output.getResponse().setResponseCode(statusCode);
    } catch (err) {
      // Ignorera om response code inte stöds
    }
  }

  return output;
}

function corHeaders_(e) {
  const origin = (e && e.parameter && e.parameter.origin) || '';
  const allow = ALLOWED_ORIGINS.indexOf('*') >= 0
    ? '*'
    : (ALLOWED_ORIGINS.includes(origin) ? origin : '');
  return {
    'Access-Control-Allow-Origin': allow || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '300'
  };
}

function isApproved(val) {
  const s = String(val || '').trim().toLowerCase();
  return /^j/.test(s) || /^y/.test(s) || s === 'true' || s === 'approved' || s === 'x' || s === '1';
}
