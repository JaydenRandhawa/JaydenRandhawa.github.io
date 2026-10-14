(() => {
'use strict';

/* =====================================================================
   Helpers & constants
   ===================================================================== */
const KEY = 'paperTodo.data.v1', SKEY = 'paperTodo.settings.v1', DAY = 864e5;
const FB_BASE = 'https://www.gstatic.com/firebasejs/10.12.2/';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
const genId = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), b => b.toString(16).padStart(2, '0')).join('');
const tagSort = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
/* Display mode: open the page with ?display for a read-only wall dashboard (optional ?zoom=1.5). */
const qs = new URLSearchParams(location.search);
const DISPLAY = qs.has('display') && qs.get('display') !== '0';

const P = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  cal: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  list: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'
};
const ic = (n, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;

/* ---------- dates (stored as local YYYY-MM-DD strings) ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayStr = () => ymd(new Date());
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((parseD(a) - parseD(b)) / DAY); // a - b
const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : '';
const validTime = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '') ? s : '';
const fmtTime = hm => { const [h, m] = hm.split(':').map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
const addMin = (hm, n) => { const [h, m] = hm.split(':').map(Number), t = Math.min(h * 60 + m + n, 23 * 60 + 59); return pad(Math.floor(t / 60)) + ':' + pad(t % 60); };
function fmt(s) {
  const d = parseD(s), n = new Date();
  return d.toLocaleDateString(undefined, d.getFullYear() === n.getFullYear()
    ? { weekday: 'short', month: 'short', day: 'numeric' }
    : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/* =====================================================================
   State & settings
   ===================================================================== */
const DEFAULTS = { view: 'category', filterTag: '', collapsed: {}, accountId: '', cfg: null, cfgText: '', sync: false, sound: true };
let settings = { ...DEFAULTS };
let state = null;                 // { title, titleAt, tasks:[] }  (tasks may include tombstones)
let session = { pass: null, salt: null };
let keyCache = new Map();
let editingId = null, formKind = 'task', lastToggled = null, dayKey = todayStr();
let detailId = null, backTo = null, lastSub = null;

function loadSettings() { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SKEY) || '{}') }; } catch { return { ...DEFAULTS }; } }
function saveSettings() { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch {} }

const STATUSES = ['unorganized', 'scheduled', 'progress', 'completed'];
/* A recurring rule lives on a reminder: { id, title, notes, days:[0-6 (Sun=0)], weeks (0 = indefinite), start, dayOnly, gen (last day generated through) } */
function normRec(r) {
  return {
    id: String(r.id || uid()),
    title: String(r.title || '').trim().slice(0, 200),
    notes: String(r.notes || '').slice(0, 2000),
    days: [...new Set((Array.isArray(r.days) ? r.days : []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort(),
    weeks: Math.max(0, Math.min(520, Math.floor(+r.weeks || 0))),
    start: validDate(r.start) || todayStr(),
    dayOnly: !!r.dayOnly,
    gen: validDate(r.gen)
  };
}
function normTask(t) {
  const id = String(t.id || uid());
  if (t.deleted) return { id, deleted: true, updatedAt: +t.updatedAt || Date.now() };
  return {
    id,
    title: String(t.title || '').slice(0, 200),
    notes: String(t.notes || ''),
    tag: String(t.tag || '').trim(),
    kind: t.kind === 'reminder' ? 'reminder' : 'task',
    todoDate: validDate(t.todoDate),
    dueDate: validDate(t.dueDate),
    status: STATUSES.includes(t.status) ? t.status : 'unorganized',
    prevStatus: STATUSES.includes(t.prevStatus) ? t.prevStatus : null,
    createdAt: +t.createdAt || Date.now(),
    updatedAt: +t.updatedAt || Date.now(),
    completedAt: +t.completedAt || null,
    cal: !!t.cal,
    allDay: t.allDay !== false,
    startTime: validTime(t.startTime),
    endTime: validTime(t.endTime),
    linkId: String(t.linkId || ''),
    recs: (Array.isArray(t.recs) ? t.recs : []).filter(x => x && typeof x === 'object').map(normRec).filter(x => x.title && x.days.length).slice(0, 20),
    recId: String(t.recId || ''),
    recFrom: String(t.recFrom || ''),
    recDay: !!t.recDay,
    subs: (Array.isArray(t.subs) ? t.subs : []).filter(x => x && typeof x === 'object' && String(x.title || '').trim()).slice(0, 100)
      .map(x => ({ id: String(x.id || uid()), title: String(x.title).slice(0, 200), done: !!x.done, doneAt: x.done ? (+x.doneAt || null) : null }))
  };
}
function normCal(c) { return { token: c && /^[a-f0-9]{20,64}$/.test(c.token || '') ? c.token : '', at: +(c && c.at) || 0, base: c && /^https?:\/\/\S+$/.test(c.base || '') ? c.base.replace(/\/+$/, '') : '' }; }
function normalizeState(s) {
  s = s || {};
  const cutoff = Date.now() - 30 * DAY;
  return {
    title: typeof s.title === 'string' ? (s.title === 'TODO school' && !s.titleAt ? 'TODO' : s.title) : 'TODO',
    titleAt: +s.titleAt || 0,
    cal: normCal(s.cal),
    tasks: (Array.isArray(s.tasks) ? s.tasks : []).filter(t => t && typeof t === 'object').map(normTask).filter(t => !t.deleted || t.updatedAt > cutoff)
  };
}
const emptyState = () => ({ title: 'TODO', titleAt: 0, cal: { token: '', at: 0, base: '' }, tasks: [] });
const find = id => state.tasks.find(t => t.id === id && !t.deleted);
const touch = t => { t.updatedAt = Date.now(); };
function canonTag(tag) {
  if (!tag) return '';
  const hit = state.tasks.find(t => !t.deleted && t.tag && t.tag.toLowerCase() === tag.toLowerCase());
  return hit ? hit.tag : tag;
}

/* Per-task last-write-wins merge. Deleted tasks stay as tombstones for 30 days. */
function mergeStates(a, b) {
  const map = new Map();
  for (const t of [...a.tasks, ...b.tasks]) {
    const c = map.get(t.id);
    if (!c || t.updatedAt > c.updatedAt) map.set(t.id, t);
  }
  const useB = (b.titleAt || 0) > (a.titleAt || 0);
  return { title: useB ? b.title : a.title, titleAt: useB ? b.titleAt : a.titleAt, cal: (b.cal.at || 0) > (a.cal.at || 0) ? b.cal : a.cal, tasks: [...map.values()] };
}
const stableJSON = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x);
const canon = s => JSON.stringify({
  t: s.title, a: s.titleAt, c: s.cal.token + '|' + s.cal.at + '|' + s.cal.base,
  k: [...s.tasks].sort((x, y) => (x.id < y.id ? -1 : 1)).map(stableJSON)
});

/* =====================================================================
   Encryption (AES-GCM, key from PBKDF2). Passphrase lives in memory only.
   ===================================================================== */
const enc = new TextEncoder(), dec = new TextDecoder();
function toB64(buf) { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
function fromB64(s) { const r = atob(s), b = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) b[i] = r.charCodeAt(i); return b; }
async function keyFor(saltB64) {
  if (keyCache.has(saltB64)) return keyCache.get(saltB64);
  const km = await crypto.subtle.importKey('raw', enc.encode(session.pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: fromB64(saltB64), iterations: 250000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  keyCache.set(saltB64, key);
  return key;
}
async function seal(st) {
  if (!session.pass) return { v: 1, enc: false, data: st };
  const key = await keyFor(session.salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(st)));
  return { v: 1, enc: true, salt: session.salt, iv: toB64(iv), ct: toB64(ct) };
}
async function openEnv(env) {
  if (!env.enc) return env.data;
  if (!session.pass) throw new Error('LOCKED');
  try {
    const key = await keyFor(env.salt);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv) }, key, fromB64(env.ct));
    return JSON.parse(dec.decode(pt));
  } catch { throw new Error('BADPASS'); }
}

/* =====================================================================
   Persistence (localStorage first, then optional cloud push)
   ===================================================================== */
let saveT = null, dirty = false;
function save() { dirty = true; clearTimeout(saveT); saveT = setTimeout(() => flush(), 250); }
async function flush(opts = {}) {
  if (!state) return;
  clearTimeout(saveT); dirty = false;
  try {
    // Plain path writes synchronously (safe inside pagehide); encrypted path awaits.
    const env = session.pass ? await seal(state) : { v: 1, enc: false, data: state };
    localStorage.setItem(KEY, JSON.stringify(env));
  } catch (e) { toast('Could not save on this device. Storage may be full or blocked.'); return; }
  if (!opts.noPush) schedulePush();
}
const commit = () => { runRecurring(); render(); save(); };

/* =====================================================================
   Cloud sync (Firestore, loaded on demand)
   ===================================================================== */
const sync = { status: 'off', msg: '', at: null, app: null, ref: null, unsub: null, pushT: null, blocked: false, db: null, feedErr: '' };
function setStatus(k, msg = '') {
  sync.status = k; sync.msg = msg;
  if (k === 'synced') sync.at = new Date();
  paintStatus();
}
function paintStatus() {
  const k = sync.status;
  document.body.dataset.sync = k;
  $('#sync-dot').className = 'sdot ' + ({ synced: 'ok', syncing: 'busy', connecting: 'busy', error: 'err' }[k] || '');
  let t = { off: 'Not connected', connecting: 'Connecting…', syncing: 'Syncing…' }[k];
  if (k === 'synced') t = 'Synced at ' + (sync.at || new Date()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (k === 'error') t = 'Sync problem: ' + sync.msg + (/permission/i.test(sync.msg) ? ' Check your Firestore rules.' : '');
  const el = $('#sy-status'); el.textContent = t; el.className = 'status ' + k;
}
const loadScript = src => new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = src; s.onload = res;
  s.onerror = () => rej(new Error('Could not load Firebase. Are you offline?'));
  document.head.appendChild(s);
});
async function loadFirebase() {
  if (window.firebase && firebase.firestore) return;
  await loadScript(FB_BASE + 'firebase-app-compat.js');
  await loadScript(FB_BASE + 'firebase-firestore-compat.js');
}
function parseCfg(txt) {
  const o = {};
  for (const m of txt.matchAll(/["']?([A-Za-z]\w*)["']?\s*:\s*["']([^"']*)["']/g)) o[m[1]] = m[2];
  return o.apiKey && o.projectId ? o : null;
}
/* Config comes from firebase-config.js (a pasted "const firebaseConfig = {...}" block) when present. */
function fileCfg() {
  let c = null;
  try { if (typeof firebaseConfig !== 'undefined') c = firebaseConfig; } catch {}
  c = c || window.FIREBASE_CONFIG;
  return c && typeof c === 'object' && c.apiKey && c.projectId && !/^(PASTE|YOUR_)/i.test(c.apiKey) ? c : null;
}
const getCfg = () => fileCfg() || settings.cfg;
function teardownSync() {
  clearTimeout(sync.pushT);
  if (sync.unsub) { try { sync.unsub(); } catch {} }
  const a = sync.app; sync.unsub = null; sync.app = null; sync.ref = null; sync.db = null;
  if (a) a.delete().catch(() => {});
}
async function connectSync() {
  if (!getCfg() || !settings.accountId || !state) return;
  teardownSync(); sync.blocked = false; setStatus('connecting');
  try {
    await loadFirebase();
    sync.app = firebase.initializeApp(getCfg(), 'todo-' + Date.now());
    sync.db = sync.app.firestore(); sync.ref = sync.db.collection('paperTodo').doc(settings.accountId);
    sync.unsub = sync.ref.onSnapshot(onRemote, err => setStatus('error', err.message));
  } catch (e) { setStatus('error', e.message); }
}
async function onRemote(snap) {
  if (!state) return;
  if (!snap.exists) { sync.blocked = false; pushNow(); return; }
  if (snap.metadata.hasPendingWrites) return; // echo of our own write
  let remote;
  try { remote = normalizeState(await openEnv(JSON.parse(snap.data().payload))); }
  catch (e) {
    sync.blocked = true; // never overwrite data we can't read
    setStatus('error', e.message === 'LOCKED' ? 'The cloud copy is encrypted. Turn on the passphrase lock with the same passphrase.'
      : e.message === 'BADPASS' ? 'That passphrase does not match the cloud copy.' : 'The cloud copy could not be read.');
    return;
  }
  sync.blocked = false;
  const before = canon(state);
  state = mergeStates(state, remote); runRecurring();
  const cm = canon(state);
  if (cm !== before) { render(); await flush({ noPush: true }); if (!$('#m-cal').hidden) refreshCal(); if (!$('#m-detail').hidden && !$('#m-detail').contains(document.activeElement)) renderDetail(); }
  if (cm !== canon(remote)) schedulePush(0); else setStatus('synced');
}
function schedulePush(delay = 800) { if (!sync.ref) return; clearTimeout(sync.pushT); sync.pushT = setTimeout(pushNow, delay); }
async function pushNow() {
  if (!sync.ref || sync.blocked || !state) return;
  try {
    setStatus('syncing');
    const env = await seal(state);
    await sync.ref.set({ payload: JSON.stringify(env), updatedAt: Date.now() });
    setStatus('synced');
    pushFeed();
  } catch (e) { setStatus('error', e.message); }
}

/* =====================================================================
   Sections, grouping & urgency
   ===================================================================== */
const SECTIONS = [
  { id: 'todo', name: 'TODO', preset: { kind: 'task', status: 'scheduled' }, empty: 'Nothing scheduled. Give an unorganized task a to-do date to move it here.' },
  { id: 'unorganized', name: 'Unorganized', preset: { kind: 'task', status: 'unorganized' }, empty: 'Brain-dump above. Dates can wait.' },
  { id: 'reminders', name: 'Reminders', preset: { kind: 'reminder', status: 'scheduled' }, empty: 'No reminders. Use the + to add one.' },
  { id: 'completed', name: 'Completed', preset: null, empty: 'Finished tasks land here.' }
];
function sectionOf(t) {
  if (t.status === 'completed') return 'completed';
  if (t.kind === 'reminder') return 'reminders';
  if (t.status === 'unorganized') return 'unorganized';
  return 'todo';
}
const actDate = t => [t.todoDate, t.dueDate].filter(Boolean).sort()[0] || '';
const byUrgency = (a, b) => (actDate(a) || '9999-12-31').localeCompare(actDate(b) || '9999-12-31') || (a.startTime || '').localeCompare(b.startTime || '') || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.createdAt - b.createdAt;

/* Deadline = due date, or the to-do date when there is no due date. Past it → overdue; today/tomorrow → soon. */
function urgency(t) {
  if (t.status === 'completed') return 'none';
  const dl = t.dueDate || t.todoDate;
  if (!dl) return 'none';
  const d = diffDays(dl, todayStr());
  return d < 0 ? 'overdue' : d <= 1 ? 'soon' : 'none';
}
/* Date view groups tasks by the exact date you next need to act (earliest of to-do and due date). */
const MAX_GAP_LINES = 10; // longer runs of empty days collapse into one "N empty days" line
function tagColor(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${h % 360} 60% 72%)`; }
function byTag(list) {
  const m = new Map();
  list.forEach(t => { const k = t.tag || ''; if (!m.has(k)) m.set(k, []); m.get(k).push(t); });
  return [...m.keys()].sort((a, b) => !a ? 1 : !b ? -1 : tagSort(a, b)).map(k => ({ label: k || 'No tag', untagged: !k, dot: k ? tagColor(k) : '', items: m.get(k) }));
}
function byExactDate(list, spacers) {
  const today = todayStr(), m = new Map(), none = [];
  list.forEach(t => { const d = actDate(t); if (!d) { none.push(t); return; } if (!m.has(d)) m.set(d, []); m.get(d).push(t); });
  const dates = [...m.keys()].sort(), out = [];
  const group = d => {
    const n = diffDays(d, today);
    return { label: fmt(d), date: d, items: m.get(d),
      dot: n < 0 ? 'var(--red)' : n <= 1 ? 'var(--amber)' : '',
      rel: n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n < 0 ? `${-n}d ago` : '' };
  };
  if (!spacers) dates.forEach(d => out.push(group(d)));
  else if (dates.length) {
    const start = dates[0], end = dates[dates.length - 1];
    let empties = [];
    const flushEmpties = () => {
      if (empties.length > MAX_GAP_LINES) out.push({ run: empties.length });
      else empties.forEach(e => out.push({ gap: true, date: e, today: e === today }));
      empties = [];
    };
    for (const d = parseD(start), e = parseD(end); d <= e; d.setDate(d.getDate() + 1)) {
      const k = ymd(d);
      if (m.has(k)) { flushEmpties(); out.push(group(k)); } else empties.push(k);
    }
  }
  if (none.length) out.push({ label: 'No date', dot: '', items: none });
  return out;
}
function groupBy(secId, list) {
  if (secId === 'completed') {
    const l = [...list].sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    return settings.view === 'category' ? byTag(l) : [{ label: '', items: l }];
  }
  const l = [...list].sort(byUrgency);
  return settings.view === 'category' ? byTag(l) : byExactDate(l, secId === 'todo');
}

/* =====================================================================
   Rendering
   ===================================================================== */
function rowHTML(t, showTag, secId) {
  const done = t.status === 'completed', u = urgency(t), today = todayStr();
  const ucls = u === 'overdue' ? 'red' : u === 'soon' ? 'amber' : '';
  let meta = '';
  if (showTag && t.tag) meta += `<span class="pill"><i class="dot" style="background:${tagColor(t.tag)}"></i>${esc(t.tag)}</span>`;
  if (t.todoDate) {
    const d = diffDays(t.todoDate, today), lab = t.kind === 'reminder' ? 'On' : 'Do';
    const txt = d === 0 ? `${lab} today` : d === 1 ? `${lab} tomorrow` : `${lab} ${fmt(t.todoDate)}`;
    const cls = done ? '' : t.dueDate ? (d < 0 ? 'amber' : '') : ucls;
    meta += `<span class="pill ${cls}" title="${t.kind === 'reminder' ? 'Reminder date' : 'Planned work date'}">${ic('cal', 12)}${txt}</span>`;
  }
  if (t.kind === 'reminder' && !t.allDay && t.startTime && t.endTime) meta += `<span class="pill" title="Time block">${ic('clock', 12)}${fmtTime(t.startTime)} – ${fmtTime(t.endTime)}</span>`;
  if (t.dueDate) {
    const d = diffDays(t.dueDate, today);
    const txt = done ? `Due ${fmt(t.dueDate)}` : d < 0 ? `${-d}d overdue` : d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : `Due ${fmt(t.dueDate)}`;
    meta += `<span class="pill ${ucls}" title="Official deadline">${txt}</span>`;
  }
  if (t.todoDate && t.dueDate && !done) {
    const g = diffDays(t.dueDate, t.todoDate);
    const txt = g > 0 ? `${g}d buffer` : g === 0 ? 'Same-day' : `${-g}d after due`;
    meta += `<span class="pill ${g < 0 ? 'red' : ''}" title="Gap between your to-do date and the due date">${txt}</span>`;
  }
  if (t.subs.length) { const dn = t.subs.filter(x => x.done).length; meta += `<span class="pill ${dn === t.subs.length ? 'green' : ''}" title="Subtasks done">${ic('list', 12)}${dn}/${t.subs.length}</span>`; }
  const lr = t.linkId ? find(t.linkId) : null;
  if (lr && lr.kind === 'reminder') meta += `<button type="button" class="pill" data-action="open-link" data-link="${esc(lr.id)}" title="Linked reminder">${ic('link', 12)}<span class="ell">${esc(lr.title)}</span></button>`;
  meta += recPill(t);
  if (t.kind === 'reminder' && t.recs.length && !done) meta += `<span class="pill" title="Recurring tasks generated from this reminder">${ic('repeat', 12)}${t.recs.length} recurring</span>`;
  if (t.kind === 'reminder') { const n = state.tasks.filter(x => !x.deleted && x.linkId === t.id).length; if (n) meta += `<span class="pill" title="Tasks linked to this reminder">${ic('link', 12)}${n} linked</span>`; }
  if (secId === 'todo') meta += `<button type="button" class="pill ${t.status === 'progress' ? 'accent' : ''}" data-action="cycle" title="Change status">${t.status === 'progress' ? 'In progress' : 'Scheduled'}</button>`;
  if (t.cal && !done && (t.todoDate || t.dueDate) && !taskSuppressed(t)) meta += `<button type="button" class="pill accent" data-action="uncal" title="Remove from calendar feed">${ic('cal', 12)}On calendar</button>`;
  if (done && t.completedAt) meta += `<span class="pill">Done ${fmt(ymd(new Date(t.completedAt)))}</span>`;
  return `<li class="row ${done ? 'done' : ''} ${u === 'overdue' ? 'overdue' : ''} ${u === 'soon' ? 'soon' : ''} ${lastToggled === t.id ? 'just' : ''}" data-id="${esc(t.id)}">
    <button type="button" class="check" data-action="toggle" aria-pressed="${done}" aria-label="${done ? 'Mark not done' : 'Mark done'}: ${esc(t.title)}"><span class="box">${done ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path pathLength="24" d="M20 6 9 17l-5-5"/></svg>' : ''}</span></button>
    <div class="row-body" data-action="open" role="button" tabindex="0" aria-label="Open ${esc(t.title)}">
      <div class="row-title">${esc(t.title)}</div>
      ${t.notes ? `<div class="row-notes">${esc(t.notes)}</div>` : ''}
      ${meta ? `<div class="meta">${meta}</div>` : ''}
    </div>
    <button type="button" class="row-edit" data-action="edit" aria-label="Edit ${esc(t.title)}" title="Edit">${ic('pencil', 17)}</button>
  </li>`;
}
function sectionHTML(s, list) {
  const col = !DISPLAY && !!settings.collapsed[s.id];
  let body = '';
  if (!col) {
    if (!list.length) body = `<p class="empty">${s.empty}</p>`;
    else {
      const gs = groupBy(s.id, list);
      const flat = gs.length === 1 && (gs[0].label === '' || gs[0].untagged);
      body = gs.map(g => {
        if (g.gap) return `<div class="gap ${g.today ? 'today' : ''}" title="${esc(fmt(g.date))}: nothing planned">${g.today ? '<span>Today</span>' : ''}</div>`;
        if (g.run) return `<div class="gap-run" title="${g.run} days with nothing planned">${g.run} empty days</div>`;
        return `${flat ? '' : `<h3 class="grp">${g.dot ? `<i class="dot" style="background:${g.dot}"></i>` : ''}${esc(g.label)}${g.rel ? `<span class="grp-rel">${g.rel}</span>` : ''}<span class="grp-n">${g.items.length}</span></h3>`}
        <ul class="rows">${g.items.map(t => rowHTML(t, settings.view === 'date', s.id)).join('')}</ul>`;
      }).join('');
    }
  }
  return `<section class="sec ${col ? 'collapsed' : ''} ${s.id === 'todo' && settings.view === 'date' ? 'timeline' : ''}">
    <div class="sec-head">
      <button type="button" class="sec-toggle" data-action="collapse" data-sec="${s.id}" aria-expanded="${!col}">
        <span class="sec-name hand">${s.id === 'completed' ? ic('check', 22) : ''}${s.name}</span><span class="sec-count">${list.length}</span><span class="chev">${ic('chev', 18)}</span>
      </button>
      ${s.preset ? `<button type="button" class="icon-btn" data-action="add" data-sec="${s.id}" aria-label="Add to ${s.name}">${ic('plus', 22)}</button>` : ''}
      ${s.id === 'completed' && list.length ? `<button type="button" class="btn sm danger" data-action="clear-done">Clear completed</button>` : ''}
    </div>${body}</section>`;
}
function render() {
  if (!state) return;
  dayKey = todayStr();
  const ti = $('#title');
  if (document.activeElement !== ti && ti.value !== state.title) ti.value = state.title;
  document.title = state.title || 'Todo';
  $$('[data-action=view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === settings.view)));

  const live = state.tasks.filter(t => !t.deleted);
  const tags = [...new Set(live.map(t => t.tag).filter(Boolean))].sort(tagSort);
  if (!DISPLAY && settings.filterTag && !tags.includes(settings.filterTag)) { settings.filterTag = ''; saveSettings(); }
  $('#chips').innerHTML = tags.length ? [''].concat(tags).map(t =>
    `<button type="button" class="chip" data-action="chip" data-tag="${esc(t)}" aria-pressed="${t === settings.filterTag}">${t ? esc(t) : 'All'}</button>`).join('') : '';
  $('#tag-list').innerHTML = tags.map(t => `<option value="${esc(t)}"></option>`).join('');

  const ft = DISPLAY ? '' : settings.filterTag;
  const shown = live.filter(t => !ft || t.tag === ft);
  const by = { todo: [], unorganized: [], reminders: [], completed: [] };
  shown.forEach(t => by[sectionOf(t)].push(t));
  const sample = live.length || DISPLAY ? '' : `<div class="sample"><p class="hand">A blank page.</p><p>Type a task above to start, or <button type="button" class="link" data-action="sample">load a few sample tasks</button> to see how it works.</p></div>`;
  const secs = DISPLAY ? SECTIONS.filter(s => s.id !== 'completed' && by[s.id].length) : SECTIONS;
  $('#sections').innerHTML = sample + (DISPLAY && !secs.length ? '<p class="empty all-clear hand">Nothing on the list.</p>' : secs.map(s => sectionHTML(s, by[s.id])).join(''));
  lastToggled = null;
}

/* =====================================================================
   Task actions
   ===================================================================== */
let actx = null;
/* Soft "thock" plus a two-note rising chime, synthesized with Web Audio (no audio files needed). */
function playDone() {
  if (settings.sound === false) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    actx = actx || new AC();
    if (actx.state === 'suspended') actx.resume();
    const t0 = actx.currentTime + 0.01;
    const master = actx.createGain(); master.gain.value = 0.22; master.connect(actx.destination);
    const k = actx.createOscillator(), kg = actx.createGain();
    k.type = 'sine'; k.frequency.setValueAtTime(220, t0); k.frequency.exponentialRampToValueAtTime(90, t0 + 0.08);
    kg.gain.setValueAtTime(0.6, t0); kg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
    k.connect(kg); kg.connect(master); k.start(t0); k.stop(t0 + 0.12);
    [[659.25, 0.07], [987.77, 0.16]].forEach(([f, dt]) => {
      const t = t0 + dt, o = actx.createOscillator(), o2 = actx.createOscillator(), g = actx.createGain(), g2 = actx.createGain();
      o.type = 'sine'; o.frequency.value = f; o2.type = 'triangle'; o2.frequency.value = f * 2; g2.gain.value = 0.14;
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(master);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.start(t); o2.start(t); o.stop(t + 0.65); o2.stop(t + 0.65);
    });
  } catch {}
}
function toggleDone(id) {
  const t = find(id); if (!t) return;
  if (t.status === 'completed') {
    t.status = t.prevStatus && t.prevStatus !== 'completed' ? t.prevStatus : (t.todoDate ? 'scheduled' : 'unorganized');
    t.completedAt = null;
  } else { t.prevStatus = t.status; t.status = 'completed'; t.completedAt = Date.now(); lastToggled = id; playDone(); }
  touch(t); commit();
}
function deleteTask(id) {
  state.tasks.forEach(x => { if (x.linkId === id) { x.linkId = ''; touch(x); } });
  const i = state.tasks.findIndex(t => t.id === id);
  if (i > -1) state.tasks[i] = { id, deleted: true, updatedAt: Date.now() };
}
function clearCompleted() {
  const done = state.tasks.filter(t => !t.deleted && t.status === 'completed' && (!settings.filterTag || t.tag === settings.filterTag));
  if (!done.length) return;
  const scope = settings.filterTag ? ` tagged ${settings.filterTag}` : '';
  if (!confirm(`Delete ${done.length} completed task${done.length === 1 ? '' : 's'}${scope}? This cannot be undone.`)) return;
  done.forEach(t => deleteTask(t.id));
  commit(); toast('Completed list cleared.');
}
function addSamples() {
  const add = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  [
    { title: 'MTE502 Lab 3 Code', notes: 'Add X and Y value outputs', tag: 'MTE502', status: 'progress', todoDate: add(0), dueDate: add(3), cal: true,
      subs: [{ title: 'Write the X output', done: true, doneAt: Date.now() }, { title: 'Add the Y output' }, { title: 'Test it on the board' }] },
    { title: 'MEC713 problem set 4', tag: 'MEC713', status: 'scheduled', todoDate: add(1), dueDate: add(1) },
    { title: 'EES612 reading notes', tag: 'EES612', status: 'scheduled', todoDate: add(-3), dueDate: add(-1) },
    { title: 'Update résumé for Co-Op postings', tag: 'Co-Op', status: 'unorganized' },
    { title: 'Renew transit pass', kind: 'reminder', status: 'scheduled', tag: 'Personal', todoDate: add(14) },
    { title: 'Lab 3 work session', kind: 'reminder', status: 'scheduled', tag: 'MTE502', todoDate: add(1), allDay: false, startTime: '14:00', endTime: '16:00', cal: true }
  ].map(o => normTask(o)).forEach((t, i, all) => { if (i === 0) t.linkId = all[5].id; state.tasks.push(t); });
  commit();
}

/* =====================================================================
   Recurring tasks (generated from a reminder)
   ===================================================================== */
const REC_AHEAD = 7;   // normal rules create tasks this many days ahead (today included)
const REC_BACK = 60;   // catch-up limit if the app wasn't opened for a long time
const DOWN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const recEnd = rc => rc.weeks ? addDays(rc.start, rc.weeks * 7 - 1) : '';
function recDaysText(days) {
  const s = [...days].sort((x, y) => x - y).join('');
  if (s === '0123456') return 'Every day';
  if (s === '12345') return 'Weekdays';
  if (s === '06') return 'Weekends';
  return [1, 2, 3, 4, 5, 6, 0].filter(d => days.includes(d)).map(d => DOWN[d]).join(', ');
}
const recPill = t => {
  const rf = t.recFrom ? find(t.recFrom) : null;
  return rf && rf.kind === 'reminder' ? `<button type="button" class="pill" data-action="open-link" data-link="${esc(rf.id)}" title="Generated by a recurring task">${ic('repeat', 12)}<span class="ell">${esc(rf.title)}</span></button>` : '';
};
/* Idempotent. Task ids are derived from rule + date, so devices that both generate merge into one task.
   Each day's task is independent: finishing one never affects the next. */
function runRecurring() {
  if (!state) return false;
  const today = todayStr(), yesterday = addDays(today, -1);
  const ids = new Set(state.tasks.map(t => t.id)); // includes tombstones, so deleted tasks are not recreated
  const fresh = []; let changed = false;
  for (const rm of state.tasks) {
    if (rm.deleted || rm.kind !== 'reminder' || !rm.recs.length) continue;
    for (const rc of rm.recs) {
      if (rm.status === 'completed') { // generation stops; skip the paused days so they aren't backfilled later
        if (rc.gen < yesterday) { rc.gen = yesterday; touch(rm); changed = true; }
        continue;
      }
      const end = recEnd(rc);
      let last = rc.dayOnly ? today : addDays(today, REC_AHEAD - 1);
      if (end && end < last) last = end;
      // Day-only tasks exist for their own day only, so days already gone are never created late.
      const from = [rc.start, rc.gen ? addDays(rc.gen, 1) : '', rc.dayOnly ? today : addDays(today, -REC_BACK)].sort().pop();
      for (let d = from; d <= last; d = addDays(d, 1)) {
        if (!rc.days.includes(parseD(d).getDay())) continue;
        const id = `rec-${rc.id}-${d}`;
        if (ids.has(id)) continue;
        ids.add(id);
        fresh.push(normTask({ id, title: rc.title, notes: rc.notes, tag: rm.tag, kind: 'task', status: 'scheduled',
          todoDate: d, recId: rc.id, recFrom: rm.id, recDay: rc.dayOnly }));
      }
      if (last > (rc.gen || '')) { rc.gen = last; touch(rm); changed = true; }
    }
  }
  if (fresh.length) { state.tasks.push(...fresh); changed = true; }
  // "Only on the day" tasks disappear once their day has passed, done or not. (The tombstone keeps them from being recreated.)
  for (const t of [...state.tasks]) {
    if (!t.deleted && t.recDay && t.todoDate && t.todoDate < today) { deleteTask(t.id); changed = true; }
  }
  return changed;
}
let recFor = null, recDays = new Set();
function setRecDays(arr) {
  recDays = new Set(arr);
  $$('[data-action=dow]').forEach(b => b.setAttribute('aria-pressed', String(recDays.has(+b.dataset.val))));
}
function syncRecForever() { $('#r-weeks').disabled = $('#r-forever').checked; }
function openRec(rid) {
  const rm = find(rid); if (!rm) return;
  recFor = rid;
  $('#r-for').textContent = `Creates a task from “${rm.title}” on the days you pick.`;
  $('#r-title').value = ''; $('#r-notes').value = '';
  setRecDays([1, 2, 3, 4, 5]);
  $('#r-start').value = todayStr(); $('#r-start').min = todayStr();
  $('#r-weeks').value = 4; $('#r-forever').checked = false; syncRecForever();
  $('#r-day').checked = false;
  openModal('m-rec');
  setTimeout(() => $('#r-title').focus(), 30);
}
function saveRec() {
  const rm = find(recFor); if (!rm) { closeModals(); return; }
  const title = $('#r-title').value.trim();
  if (!title) { $('#r-title').focus(); toast('Give the recurring task a title.'); return; }
  if (!recDays.size) { toast('Pick at least one day of the week.'); return; }
  let weeks = 0;
  if (!$('#r-forever').checked) {
    weeks = Math.floor(+$('#r-weeks').value);
    if (!(weeks >= 1 && weeks <= 520)) { toast('Enter 1 to 520 weeks, or choose indefinitely.'); return; }
  }
  if (rm.recs.length >= 20) { toast('That is the limit of 20 recurring tasks per reminder.'); return; }
  rm.recs.push(normRec({ id: uid(), title, notes: $('#r-notes').value.trim(), days: [...recDays], weeks,
    start: validDate($('#r-start').value) || todayStr(), dayOnly: $('#r-day').checked, gen: '' }));
  touch(rm);
  const back = backTo;
  closeModals(); commit();
  if (back && find(back)) openDetail(back);
}
function recHTML(rc, rm) {
  const today = todayStr(), end = recEnd(rc), ended = !!end && end < today;
  let pills = `<span class="pill">${ic('repeat', 12)}${esc(recDaysText(rc.days))}</span>`;
  pills += `<span class="pill">${rc.weeks ? plural(rc.weeks, 'week') : 'Indefinitely'}</span>`;
  if (rc.start > today) pills += `<span class="pill">Starts ${esc(fmt(rc.start))}</span>`;
  if (end && !ended) pills += `<span class="pill">Until ${esc(fmt(end))}</span>`;
  if (rc.dayOnly) pills += `<span class="pill" title="Each task only shows on its own day">Only on the day</span>`;
  if (ended) pills += `<span class="pill green">Ended</span>`;
  else if (rm.status === 'completed') pills += `<span class="pill amber" title="Generation resumes if you mark the reminder not done">Paused, reminder done</span>`;
  return `<li class="row" data-rid="${esc(rc.id)}">
    <div class="rec-body">
      <div class="row-title">${esc(rc.title)}</div>
      ${rc.notes ? `<div class="row-notes">${esc(rc.notes)}</div>` : ''}
      <div class="meta">${pills}</div>
    </div>
    <button type="button" class="icon-btn sm" data-action="rec-del" aria-label="Stop repeating: ${esc(rc.title)}" title="Stop repeating">${ic('x', 16)}</button>
  </li>`;
}

/* =====================================================================
   Modals
   ===================================================================== */
const openModal = id => { $('#' + id).hidden = false; document.body.classList.add('modal-open'); };
function closeModals() { $$('.overlay').forEach(o => o.hidden = true); document.body.classList.remove('modal-open'); backTo = null; }
let formAllDay = true;
function setAllDay(v) {
  formAllDay = v;
  $$('[data-action=allday]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.val === '1') === v)));
  $('#time-inputs').hidden = v;
}
function updateLinkUI() {
  const linked = formKind === 'task' && !!$('#f-link').value;
  $('#link-hint').hidden = !linked; $('#f-cal').disabled = linked;
}
function fillLinkOptions(current) {
  const rs = state.tasks.filter(r => !r.deleted && r.kind === 'reminder' && (r.status !== 'completed' || r.id === current)).sort(byUrgency);
  $('#f-link').innerHTML = '<option value="">None</option>' + rs.map(r => `<option value="${esc(r.id)}">${esc(r.title)}${r.todoDate ? ' (' + esc(fmt(r.todoDate)) + ')' : ''}</option>`).join('');
  $('#f-link').value = current || '';
}
function setKind(k) {
  formKind = k;
  $('#time-block').hidden = k !== 'reminder'; $('#link-row').hidden = k === 'reminder';
  $$('[data-action=kind]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === k)));
  $('#lbl-todo').textContent = k === 'reminder' ? 'Reminder date' : 'To-do date';
  updateLinkUI();
}
function openTask(id, preset) {
  editingId = id || null;
  const t = id ? find(id) : null;
  const p = t || { title: '', notes: '', tag: '', kind: 'task', todoDate: '', dueDate: '', status: 'unorganized', allDay: true, startTime: '', endTime: '', linkId: '', ...(preset || {}) };
  $('#task-heading').textContent = t ? 'Edit ' + (p.kind === 'reminder' ? 'reminder' : 'task') : (p.kind === 'reminder' ? 'New reminder' : 'New task');
  $('#f-title').value = p.title; $('#f-notes').value = p.notes; $('#f-tag').value = p.tag || '';
  $('#f-todo').value = p.todoDate; $('#f-due').value = p.dueDate; $('#f-status').value = p.status; $('#f-cal').checked = !!p.cal;
  $('#btn-del').hidden = !t;
  $('#f-start').value = p.startTime || ''; $('#f-end').value = p.endTime || '';
  fillLinkOptions(p.linkId); setAllDay(p.allDay !== false);
  const lt = t && p.kind === 'reminder' ? state.tasks.filter(x => !x.deleted && x.linkId === t.id) : [];
  $('#linked-tasks').hidden = !lt.length; $('#linked-tasks').textContent = lt.length ? 'Linked tasks: ' + lt.map(x => x.title).join(', ') : '';
  setKind(p.kind);
  openModal('m-task');
  setTimeout(() => $('#f-title').focus(), 30);
}
function saveTask() {
  const title = $('#f-title').value.trim();
  if (!title) { $('#f-title').focus(); toast('Give the task a title.'); return; }
  let startTime = '', endTime = '';
  if (formKind === 'reminder' && !formAllDay) {
    startTime = $('#f-start').value; endTime = $('#f-end').value;
    if (!$('#f-todo').value) { toast('Pick a reminder date for a time block.'); return; }
    if (!startTime) { toast('Add a start time, or switch to all day.'); return; }
    if (!endTime) endTime = addMin(startTime, 60);
    if (endTime <= startTime) { toast('The end time must be after the start time.'); return; }
  }
  const v = {
    allDay: formKind === 'reminder' ? formAllDay : true, startTime, endTime, linkId: formKind === 'task' ? $('#f-link').value : '',
    title, notes: $('#f-notes').value.trim(), tag: canonTag($('#f-tag').value.trim()), kind: formKind,
    todoDate: $('#f-todo').value, dueDate: $('#f-due').value, status: $('#f-status').value, cal: $('#f-cal').checked
  };
  if (v.kind === 'task' && v.status === 'unorganized' && v.todoDate) v.status = 'scheduled';
  const t = editingId ? find(editingId) : null;
  if (t) {
    const was = t.status;
    Object.assign(t, v);
    if (v.status === 'completed' && was !== 'completed') { t.completedAt = Date.now(); t.prevStatus = was; }
    if (v.status !== 'completed' && was === 'completed') t.completedAt = null;
    if (v.kind === 'task') state.tasks.forEach(x => { if (x.linkId === t.id) { x.linkId = ''; touch(x); } });
    touch(t);
  } else {
    state.tasks.push(normTask({ ...v, completedAt: v.status === 'completed' ? Date.now() : null }));
  }
  const back = backTo;
  closeModals(); commit();
  if (back && find(back)) openDetail(back);
}

/* ---------- expanded task view + subtasks ---------- */
const CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path pathLength="24" d="M20 6 9 17l-5-5"/></svg>';
const relDay = d => { const n = diffDays(d, todayStr()); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 0 ? `in ${n} days` : `${-n} days ago`; };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function openDetail(id) { if (!find(id)) return; detailId = id; renderDetail(); openModal('m-detail'); }
function detailInfo(t) {
  const done = t.status === 'completed', u = urgency(t), tone = u === 'overdue' ? 'red' : u === 'soon' ? 'amber' : '', today = todayStr();
  const row = (label, val, cls = '') => `<div class="d-row"><dt>${label}</dt><dd class="${cls}">${val}</dd></div>`;
  let rows = '';
  if (t.todoDate) {
    const late = diffDays(t.todoDate, today) < 0;
    rows += row(t.kind === 'reminder' ? 'Reminder date' : 'To-do date', `${esc(fmt(t.todoDate))}<span class="rel">${relDay(t.todoDate)}</span>`, done ? '' : t.dueDate ? (late ? 'amber' : '') : tone);
  }
  if (t.kind === 'reminder' && t.todoDate) rows += row('Time', !t.allDay && t.startTime && t.endTime ? `${fmtTime(t.startTime)} – ${fmtTime(t.endTime)}` : 'All day');
  if (t.dueDate) rows += row('Due date', `${esc(fmt(t.dueDate))}<span class="rel">${relDay(t.dueDate)}</span>`, done ? '' : tone);
  if (t.todoDate && t.dueDate && !done) {
    const g = diffDays(t.dueDate, t.todoDate);
    rows += row('Buffer', g > 0 ? `${plural(g, 'day')} between to-do and due` : g === 0 ? 'Same day' : `${plural(-g, 'day')} after the due date`, g < 0 ? 'red' : '');
  }
  if (!t.todoDate && !t.dueDate) rows += row('Dates', 'Not set yet');
  rows += row('Status', done ? 'Completed' + (t.completedAt ? ' ' + esc(fmt(ymd(new Date(t.completedAt)))) : '') : { unorganized: 'Unorganized', scheduled: 'Scheduled', progress: 'In progress' }[t.status]);
  let pills = '';
  if (t.tag) pills += `<span class="pill"><i class="dot" style="background:${tagColor(t.tag)}"></i>${esc(t.tag)}</span>`;
  const lr = t.linkId ? find(t.linkId) : null;
  if (lr && lr.kind === 'reminder') pills += `<button type="button" class="pill" data-action="open-link" data-link="${esc(lr.id)}" title="Open linked reminder">${ic('link', 12)}<span class="ell">${esc(lr.title)}</span></button>`;
  pills += recPill(t);
  if (t.kind === 'reminder') state.tasks.filter(x => !x.deleted && x.linkId === t.id).forEach(x => { pills += `<button type="button" class="pill" data-action="open-link" data-link="${esc(x.id)}" title="Open linked task">${ic('link', 12)}<span class="ell">${esc(x.title)}</span></button>`; });
  if (t.cal && !done && (t.todoDate || t.dueDate) && !taskSuppressed(t)) pills += `<span class="pill accent">${ic('cal', 12)}On calendar</span>`;
  return `${t.notes ? `<p class="d-notes">${esc(t.notes)}</p>` : ''}<dl class="d-dates">${rows}</dl>${pills ? `<div class="meta">${pills}</div>` : ''}`;
}
function subHTML(sb, done) {
  return `<li class="row ${done ? 'done' : ''} ${lastSub === sb.id ? 'just' : ''}" data-sid="${esc(sb.id)}">
    <button type="button" class="check" data-action="sub-toggle" aria-pressed="${done}" aria-label="${done ? 'Mark not done' : 'Mark done'}: ${esc(sb.title)}"><span class="box">${done ? CHECK_SVG : ''}</span></button>
    <input class="sub-input" value="${esc(sb.title)}" maxlength="200" aria-label="Subtask title" enterkeyhint="done">
    <button type="button" class="icon-btn sm" data-action="sub-del" aria-label="Delete subtask: ${esc(sb.title)}">${ic('x', 16)}</button>
  </li>`;
}
function renderDetail() {
  const t = detailId && find(detailId);
  if (!t) { detailId = null; if (!$('#m-detail').hidden) closeModals(); return; }
  $('#d-title').textContent = t.title;
  $('#d-info').innerHTML = detailInfo(t);
  const open = t.subs.filter(x => !x.done), dn = t.subs.filter(x => x.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  $('#d-count').textContent = t.subs.length ? `${dn.length}/${t.subs.length}` : '';
  $('#d-active').innerHTML = open.length ? open.map(x => subHTML(x, false)).join('') : `<li class="sub-empty">${t.subs.length ? 'All subtasks are done.' : 'No subtasks yet.'}</li>`;
  $('#d-done-wrap').hidden = !dn.length; $('#d-done-count').textContent = dn.length;
  $('#d-done').innerHTML = dn.map(x => subHTML(x, true)).join('');
  $('#d-toggle').textContent = t.status === 'completed' ? 'Mark not done' : 'Mark task done';
  const isRem = t.kind === 'reminder';
  $('#d-rec').hidden = !isRem;
  if (isRem) {
    $('#d-rec-count').textContent = t.recs.length || '';
    $('#d-rec-list').innerHTML = t.recs.length ? t.recs.map(rc => recHTML(rc, t)).join('') : '<li class="sub-empty">Nothing repeating yet.</li>';
  }
  lastSub = null;
}
function subToggle(sid) {
  const t = find(detailId), sb = t && t.subs.find(x => x.id === sid); if (!sb) return;
  sb.done = !sb.done; sb.doneAt = sb.done ? Date.now() : null;
  if (sb.done) { lastSub = sid; playDone(); }
  touch(t); commit(); renderDetail();
}
function subDelete(sid) {
  const t = find(detailId); if (!t) return;
  t.subs = t.subs.filter(x => x.id !== sid); touch(t); commit(); renderDetail();
}
function refreshLockUI() {
  const on = !!session.pass;
  $('#lock-off').hidden = on; $('#lock-on').hidden = !on; $('#btn-lock').hidden = !on;
}
function openSync() {
  $('#sy-id').value = settings.accountId || ''; $('#sy-cfg').value = settings.cfgText || '';
  $('#lk-pass').value = ''; $('#lk-pass2').value = ''; $('#opt-sound').checked = settings.sound !== false;
  const fc = !!fileCfg(); $('#cfg-note').hidden = !fc; $('#sy-cfg').hidden = fc;
  refreshLockUI(); paintStatus(); openModal('m-sync');
}

/* ---------- lock / unlock ---------- */
async function enableLock() {
  const a = $('#lk-pass').value, b = $('#lk-pass2').value;
  if (!(window.crypto && crypto.subtle)) return toast('Encryption needs a secure (https) page.');
  if (a.length < 6) return toast('Use a passphrase of at least 6 characters.');
  if (a !== b) return toast('The two passphrases do not match.');
  session.pass = a; session.salt = toB64(crypto.getRandomValues(new Uint8Array(16))); keyCache.clear();
  await flush(); refreshLockUI(); $('#lk-pass').value = ''; $('#lk-pass2').value = '';
  toast('Passphrase lock is on.');
}
async function disableLock() {
  const msg = sync.ref ? 'Remove the lock? Your tasks will be stored unencrypted on this device and in the cloud.' : 'Remove the lock? Your tasks will be stored unencrypted on this device.';
  if (!confirm(msg)) return;
  session.pass = null; session.salt = null; keyCache.clear(); sync.blocked = false;
  await flush(); refreshLockUI(); toast('Lock removed.');
}
async function lockNow() {
  if (!session.pass) return;
  await flush({ noPush: true });
  teardownSync(); setStatus('off');
  state = null; session = { pass: null, salt: null }; keyCache.clear();
  closeModals(); $('#app').hidden = true; showLock();
}
function showLock() { $('#lock').hidden = false; $('#lk-input').value = ''; $('#lk-err').textContent = ''; setTimeout(() => $('#lk-input').focus(), 50); }
async function tryUnlock() {
  const p = $('#lk-input').value; if (!p) return;
  try {
    const env = JSON.parse(localStorage.getItem(KEY));
    session.pass = p; session.salt = env.salt; keyCache.clear();
    state = normalizeState(await openEnv(env));
    $('#lock').hidden = true; startApp();
  } catch (e) {
    session = { pass: null, salt: null }; keyCache.clear(); state = null;
    $('#lk-err').textContent = 'That passphrase did not work.';
    $('#lk-input').select();
  }
}

/* ---------- sync controls ---------- */
async function doConnect() {
  const id = $('#sy-id').value.trim(), cfg = fileCfg() || parseCfg($('#sy-cfg').value);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return toast('Account ID needs 8–64 letters, numbers, - or _.');
  if (!cfg) return toast('No Firebase config found. Add it to firebase-config.js, or paste it into the box.');
  if (!session.pass && !confirm('The passphrase lock is off, so your tasks will be stored unencrypted in Firestore. Connect anyway?')) return;
  Object.assign(settings, { accountId: id, cfg, cfgText: fileCfg() ? '' : $('#sy-cfg').value, sync: true }); saveSettings();
  await connectSync();
}
function disconnect() { teardownSync(); settings.sync = false; saveSettings(); setStatus('off'); }

/* ---------- calendar feed ---------- */
const icsText = x => String(x).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsStamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function icsFold(line) {
  const c = Array.from(line);
  if (c.length <= 60) return line;
  const out = [c.slice(0, 60).join('')];
  for (let i = 60; i < c.length; i += 58) out.push(' ' + c.slice(i, i + 58).join(''));
  return out.join('\r\n');
}
/* A task linked to a live reminder is left off the calendar; the reminder stands in for it. */
const taskSuppressed = t => { if (!t.linkId) return false; const r = find(t.linkId); return !!r && r.kind === 'reminder'; };
const feedItems = () => state.tasks.filter(t => !t.deleted && t.cal && t.status !== 'completed' && (t.todoDate || t.dueDate) && !taskSuppressed(t));
function buildICS() {
  const stamp = icsStamp(new Date());
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Paper Todo//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsText(state.title || 'Todo'), 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  feedItems().forEach(t => {
    const linked = t.kind === 'reminder' ? state.tasks.filter(x => !x.deleted && x.linkId === t.id && x.status !== 'completed') : [];
    const desc = [t.tag ? 'Tag: ' + t.tag : '', t.notes,
      linked.length ? 'Linked tasks:\n' + linked.map(x => '- ' + x.title + (x.dueDate ? ' (due ' + fmt(x.dueDate) + ')' : '')).join('\n') : ''
    ].filter(Boolean).join('\n');
    const timed = t.kind === 'reminder' && !t.allDay && !!t.startTime && !!t.endTime && !!t.todoDate;
    const add = (d, prefix, suffix, isTimed) => {
      const d8 = d.replace(/-/g, '');
      L.push('BEGIN:VEVENT', `UID:${t.id}-${suffix}@paper-todo`, `DTSTAMP:${stamp}`);
      if (isTimed) L.push(`DTSTART:${d8}T${t.startTime.replace(':', '')}00`, `DTEND:${d8}T${t.endTime.replace(':', '')}00`);
      else { const next = parseD(d); next.setDate(next.getDate() + 1); L.push(`DTSTART;VALUE=DATE:${d8}`, `DTEND;VALUE=DATE:${ymd(next).replace(/-/g, '')}`); }
      L.push(`SUMMARY:${icsText(prefix + t.title)}`);
      if (desc) L.push('DESCRIPTION:' + icsText(desc));
      L.push(isTimed ? 'TRANSP:OPAQUE' : 'TRANSP:TRANSPARENT', 'END:VEVENT');
    };
    if (t.todoDate && (timed || t.todoDate !== t.dueDate)) add(t.todoDate, t.kind === 'reminder' ? '' : 'Do: ', 'do', timed);
    if (t.dueDate) add(t.dueDate, 'Due: ', 'due', false);
  });
  L.push('END:VCALENDAR');
  return L.map(icsFold).join('\r\n') + '\r\n';
}
async function pushFeed() {
  if (!sync.db || !state || !state.cal.token) return;
  try { await sync.db.collection('paperTodoCal').doc(state.cal.token).set({ ics: buildICS(), updatedAt: Date.now() }); sync.feedErr = ''; }
  catch (e) { sync.feedErr = e.message; }
  if (!$('#m-cal').hidden) refreshCal();
}
function deleteFeedDoc(token) { if (sync.db && token) sync.db.collection('paperTodoCal').doc(token).delete().catch(() => {}); }
const fileFeedBase = () => {
  let b = '';
  try { if (typeof CALENDAR_FEED_URL !== 'undefined') b = CALENDAR_FEED_URL; } catch {}
  return String(b || window.CALENDAR_FEED_URL || '').trim().replace(/\/+$/, '');
};
const feedBase = () => fileFeedBase() || state.cal.base || String(settings.feedBase || '').trim().replace(/\/+$/, '');
function workerCode() {
  const c = getCfg() || {};
  return String.raw`const PROJECT_ID = '${c.projectId || 'YOUR_PROJECT_ID'}';
const API_KEY = '${c.apiKey || 'YOUR_API_KEY'}';

export default {
  async fetch(request) {
    const token = new URL(request.url).pathname.replace(/^\/|\.ics$/g, '');
    if (!/^[a-f0-9]{20,64}$/.test(token)) return new Response('Not found', { status: 404 });
    const api = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
      '/databases/(default)/documents/paperTodoCal/' + token + '?key=' + API_KEY;
    const res = await fetch(api);
    if (!res.ok) return new Response('Not found', { status: 404 });
    const doc = await res.json();
    const ics = doc.fields && doc.fields.ics && doc.fields.ics.stringValue;
    if (!ics) return new Response('Not found', { status: 404 });
    return new Response(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
  }
};`;
}
function refreshCal() {
  const on = !!state.cal.token, base = feedBase(), fromFile = !!fileFeedBase();
  $('#cal-off').hidden = on; $('#cal-on').hidden = !on;
  $('#cal-need').textContent = sync.db ? '' : 'Calendar feeds need cloud sync. Connect it in the cloud settings first.';
  $('#cal-base-row').hidden = fromFile;
  if (!fromFile) $('#cal-base').value = state.cal.base || settings.feedBase || '';
  const bh = $('#cal-base-hint');
  bh.hidden = !base;
  bh.textContent = fromFile ? 'Worker URL loaded from firebase-config.js.'
    : base ? `Saved with your account, so your other devices have it too. To keep it in your repo as well, add this line to firebase-config.js: const CALENDAR_FEED_URL = "${base}";` : '';
  $('#worker-code').textContent = workerCode();
  if (!on) return;
  const n = feedItems().length;
  $('#cal-count').textContent = `${n} item${n === 1 ? '' : 's'} on your calendar feed.`;
  const https = base ? `${base}/${state.cal.token}.ics` : '';
  const webcal = https.replace(/^https?:/, 'webcal:');
  $('#cal-https').value = https; $('#cal-webcal').value = webcal;
  const open = $('#cal-open'); open.href = https ? webcal : '#'; open.hidden = !https;
  $('#cal-err').textContent = sync.feedErr
    ? 'Feed upload problem: ' + sync.feedErr + (/permission/i.test(sync.feedErr) ? ' Update your Firestore rules (see the cloud settings).' : '')
    : (base ? '' : 'Add your Worker URL below to get the subscribe links.');
}
function openCal() { if (!state) return; refreshCal(); openModal('m-cal'); }
function newFeedToken() { deleteFeedDoc(state.cal.token); state.cal = { ...state.cal, token: genId(), at: Date.now() }; sync.feedErr = ''; commit(); refreshCal(); }
function copyText(text) {
  const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Copied.'); } catch { toast('Could not copy. Select the text and copy it by hand.'); } ta.remove(); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('Copied.'), fallback); else fallback();
}

/* ---------- backup ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify({ v: 1, exportedAt: new Date().toISOString(), data: state }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `todo-backup-${todayStr()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- toast ---------- */
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200); }

/* =====================================================================
   Events
   ===================================================================== */
let downTarget = null;
document.addEventListener('pointerdown', e => { downTarget = e.target; });
document.addEventListener('click', async e => {
  const t = e.target;
  if (t.classList && t.classList.contains('overlay') && downTarget === t) { closeModals(); return; }
  const el = t.closest('[data-action]'); if (!el) return;
  if (DISPLAY && !el.closest('#lock')) return; // read-only
  const a = el.dataset.action;
  const rowEl = el.closest('[data-id]'), id = rowEl && rowEl.dataset.id;
  switch (a) {
    case 'toggle': toggleDone(id); break;
    case 'edit': openTask(id); break;
    case 'cycle': { const k = find(id); if (k) { k.status = k.status === 'progress' ? 'scheduled' : 'progress'; touch(k); commit(); } break; }
    case 'add': { const s = SECTIONS.find(x => x.id === el.dataset.sec); openTask(null, { ...s.preset, tag: settings.filterTag }); break; }
    case 'collapse': settings.collapsed[el.dataset.sec] = !settings.collapsed[el.dataset.sec]; saveSettings(); render(); break;
    case 'view': settings.view = el.dataset.val; saveSettings(); render(); break;
    case 'chip': settings.filterTag = el.dataset.tag; saveSettings(); render(); break;
    case 'open-sync': openSync(); break;
    case 'close': closeModals(); break;
    case 'kind': setKind(el.dataset.val); break;
    case 'delete-task': if (editingId && confirm('Delete this task? This cannot be undone.')) { deleteTask(editingId); closeModals(); commit(); } break;
    case 'lock-now': await lockNow(); break;
    case 'enable-lock': await enableLock(); break;
    case 'disable-lock': await disableLock(); break;
    case 'gen-id': $('#sy-id').value = genId(); break;
    case 'connect': await doConnect(); break;
    case 'disconnect': disconnect(); break;
    case 'export': exportData(); break;
    case 'import': $('#file').click(); break;
    case 'sample': addSamples(); break;
    case 'clear-done': clearCompleted(); break;
    case 'uncal': { const k = find(id); if (k) { k.cal = false; touch(k); commit(); } break; }
    case 'open-cal': openCal(); break;
    case 'allday': setAllDay(el.dataset.val === '1'); break;
    case 'open-link': openDetail(el.dataset.link); break;
    case 'open': openDetail(id); break;
    case 'detail-edit': { const did = detailId; closeModals(); backTo = did; openTask(did); break; }
    case 'detail-toggle': toggleDone(detailId); renderDetail(); break;
    case 'sub-toggle': subToggle(el.closest('[data-sid]').dataset.sid); break;
    case 'sub-del': subDelete(el.closest('[data-sid]').dataset.sid); break;
    case 'rec-new': { const did = detailId; closeModals(); backTo = did; openRec(did); break; }
    case 'rec-del': {
      const k = find(detailId), rid = el.closest('[data-rid]').dataset.rid;
      if (k && confirm('Stop repeating this task? Tasks already created stay on your list.')) { k.recs = k.recs.filter(x => x.id !== rid); touch(k); commit(); renderDetail(); }
      break;
    }
    case 'dow': { const n = +el.dataset.val; if (recDays.has(n)) recDays.delete(n); else recDays.add(n); setRecDays([...recDays]); break; }
    case 'dow-preset': setRecDays(el.dataset.val === 'all' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]); break;
    case 'cal-on': if (!sync.db) { toast('Connect cloud sync first.'); break; } state.cal = { ...state.cal, token: genId(), at: Date.now() }; sync.feedErr = ''; commit(); refreshCal(); break;
    case 'cal-regen': if (confirm('Make a new link? Calendars subscribed to the old link will stop updating.')) newFeedToken(); break;
    case 'cal-off': if (confirm('Turn off the calendar feed? Subscribed calendars will stop updating.')) { deleteFeedDoc(state.cal.token); state.cal = { ...state.cal, token: '', at: Date.now() }; commit(); refreshCal(); } break;
    case 'copy': { const tgt = $('#' + el.dataset.target); copyText('value' in tgt ? tgt.value : tgt.textContent); break; }
    case 'reset-local': if (confirm("Erase this device's copy? Encrypted data in the cloud (if you sync) is not affected.")) { localStorage.removeItem(KEY); location.reload(); } break;
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModals();
  if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('sub-input')) { e.preventDefault(); e.target.blur(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.row-body')) { e.preventDefault(); e.target.click(); }
});
$('#cal-base').addEventListener('change', e => {
  const v = e.target.value.trim().replace(/\/+$/, '');
  if (v && !/^https?:\/\/\S+$/.test(v)) { toast('Enter the full Worker address, starting with https://'); return; }
  state.cal = { ...state.cal, base: v, at: Date.now() }; settings.feedBase = ''; saveSettings(); commit(); refreshCal();
});
$('#f-link').addEventListener('change', updateLinkUI);
$('#r-forever').addEventListener('change', syncRecForever);
$('#rec-form').addEventListener('submit', e => { e.preventDefault(); saveRec(); });
document.addEventListener('change', e => {
  const inp = e.target; if (!inp.classList || !inp.classList.contains('sub-input')) return;
  const t = find(detailId), sb = t && t.subs.find(x => x.id === inp.closest('[data-sid]').dataset.sid); if (!sb) return;
  const v = inp.value.trim();
  if (!v) { inp.value = sb.title; return; }
  sb.title = v.slice(0, 200); touch(t); commit();
});
$('#sub-form').addEventListener('submit', e => {
  e.preventDefault();
  const inp = $('#sub-new'), v = inp.value.trim(), t = find(detailId);
  if (!v || !t) return;
  if (t.subs.length >= 100) { toast('That is the limit of 100 subtasks.'); return; }
  t.subs.push({ id: uid(), title: v.slice(0, 200), done: false, doneAt: null });
  touch(t); inp.value = ''; commit(); renderDetail(); inp.focus();
});
$('#opt-sound').addEventListener('change', e => { settings.sound = e.target.checked; saveSettings(); if (settings.sound) playDone(); });
$('#title').addEventListener('blur', e => { if (state && !e.target.value.trim()) { e.target.value = 'TODO'; state.title = 'TODO'; state.titleAt = Date.now(); document.title = 'TODO'; save(); } });
$('#task-form').addEventListener('submit', e => { e.preventDefault(); saveTask(); });
$('#lock-form').addEventListener('submit', e => { e.preventDefault(); tryUnlock(); });
$('#title').addEventListener('input', e => { state.title = e.target.value; state.titleAt = Date.now(); document.title = state.title || 'Todo'; save(); });
$('#quick').addEventListener('submit', e => {
  e.preventDefault();
  let v = $('#q').value.trim(); if (!v) return;
  let tag = '';
  v = v.replace(/(^|\s)#([^\s#]+)/, (m, sp, tg) => { tag = tg; return sp; }).trim();
  if (!v) { v = tag; tag = ''; }
  state.tasks.push(normTask({ title: v, tag: canonTag(tag || settings.filterTag), status: 'unorganized' }));
  $('#q').value = ''; commit();
});
$('#file').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    const inc = normalizeState(j.data || j);
    state = mergeStates(state, inc); commit();
    toast(`Imported ${inc.tasks.filter(t => !t.deleted).length} tasks.`);
  } catch { toast('That file is not a valid backup.'); }
});
window.addEventListener('pagehide', () => { if (dirty) flush(); });
window.addEventListener('online', () => { if (settings.sync && state && sync.status === 'error') connectSync(); });
const dayCheck = () => { if (state && dayKey !== todayStr()) commit(); };
document.addEventListener('visibilitychange', () => { if (!document.hidden) dayCheck(); });
setInterval(dayCheck, 60000);

/* =====================================================================
   Boot
   ===================================================================== */
function initDisplay() {
  document.body.classList.add('display');
  const z = parseFloat(qs.get('zoom'));
  document.documentElement.style.setProperty('--dz', String(z >= 0.6 && z <= 3 ? z : 1.3));
  $('#title').readOnly = true; $('#title').tabIndex = -1;
  const clock = $('#clock'); clock.hidden = false;
  const tick = () => {
    const n = new Date();
    clock.innerHTML = `<b>${esc(n.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}</b><span>${esc(n.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }))}</span>`;
  };
  tick(); setInterval(tick, 15000);
  // Refresh nightly to clear memory and pick up new code, unless a passphrase is held in memory.
  const next = new Date(); next.setHours(3, 0, 0, 0); if (next <= Date.now()) next.setDate(next.getDate() + 1);
  setTimeout(() => { if (!session.pass) location.reload(); }, next - Date.now());
}
function startApp() {
  $('#app').hidden = false;
  refreshLockUI(); if (runRecurring()) save(); render(); paintStatus();
  if (settings.sync) connectSync();
}
function boot() {
  $$('[data-ic]').forEach(el => { el.innerHTML = ic(el.dataset.ic, +el.dataset.s || 18); });
  settings = loadSettings();
  if (DISPLAY) initDisplay();
  if (!settings.collapsed || typeof settings.collapsed !== 'object') settings.collapsed = {};
  const raw = localStorage.getItem(KEY);
  let env = null;
  try { env = raw ? JSON.parse(raw) : null; } catch { if (raw) { try { localStorage.setItem(KEY + '.bak', raw); } catch {} } }
  if (env && env.enc) { showLock(); return; }
  state = env && env.data ? normalizeState(env.data) : emptyState();
  startApp();
}
boot();
})();
