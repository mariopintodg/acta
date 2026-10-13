/* Acta — grabadora de reuniones con transcripción y análisis visual.
   Todo se guarda en este dispositivo (IndexedDB). El audio va a OpenAI solo para transcribir;
   el texto va a Anthropic (Claude) para el análisis. Las claves se guardan solo en este navegador. */
(() => {
'use strict';

/* =========================================================
   Helpers
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtT = sec => { if (sec == null || isNaN(sec)) return ''; sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
const fmtClock = ms => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return (h ? String(h).padStart(2, '0') + ':' : '') + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0'); };
const fmtDate = d => { try { return new Date(d + (String(d).length === 10 ? 'T12:00:00' : '')).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } };
const fmtBytes = b => b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const nf = n => Number(n || 0).toLocaleString('es-CL');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const slug = s => String(s || 'reunion').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'reunion';
let toastT;
function toast(msg, ms = 3200) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); }

const IC = {
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6" fill="currentColor"/>',
  money: '<path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3S9.5 10.5 12 11s4.5 1.3 4.5 3.2-2 3.3-4.5 3.3-4.5-1.3-4.5-3"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3 3 0 0 1 0 6M21 20c0-2.6-1.6-4.8-4-5.6"/>',
  time: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  tech: '<rect x="3.5" y="4.5" width="17" height="12" rx="2"/><path d="M8 20h8M12 16.5V20"/>',
  design: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.4-1.1-1.6-1.1-2.7 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z"/><circle cx="7.5" cy="11" r="1" fill="currentColor"/><circle cx="10.5" cy="7.2" r="1" fill="currentColor"/><circle cx="15" cy="7.5" r="1" fill="currentColor"/>',
  legal: '<path d="M12 3v18M5 21h14M6 7h12M6 7l-3 7a3 3 0 0 0 6 0L6 7ZM18 7l-3 7a3 3 0 0 0 6 0l-3-7Z"/>',
  growth: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  idea: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3Z"/>',
  risk: '<path d="M12 4 2.8 19.5h18.4L12 4Z"/><path d="M12 10v4M12 17v.3"/>',
  check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  question: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4M12 16.5v.3"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  share: '<path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4V3Z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/>',
  pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'
};
const icon = (k, sw = 1.8, size) => `<svg viewBox="0 0 24 24"${size ? ` width="${size}" height="${size}"` : ''} fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k] || IC.spark}</svg>`;
const TOPIC_COLORS = ['var(--t1)', 'var(--t2)', 'var(--t3)', 'var(--t4)', 'var(--t5)', 'var(--t6)'];
const tc = i => TOPIC_COLORS[((i % 6) + 6) % 6];

const TEMPLATES = {
  general: { name: 'General', desc: 'Resumen equilibrado de cualquier conversación', focus: 'Cubre todo de forma equilibrada.' },
  proyecto: { name: 'Proyecto / kickoff', desc: 'Alcance, requisitos, plazos y responsables', focus: 'Enfócate en alcance, requisitos, entregables, plazos, presupuesto, responsables y dependencias. El brief debe servir para arrancar el proyecto.' },
  cliente: { name: 'Cliente / venta', desc: 'Necesidades, objeciones, presupuesto y cierre', focus: 'Enfócate en necesidades y dolores del cliente, presupuesto, objeciones, criterios de decisión, competencia y próximo paso comercial.' },
  ideas: { name: 'Lluvia de ideas', desc: 'Ideas agrupadas, las más prometedoras primero', focus: 'Enfócate en capturar TODAS las ideas, agruparlas por tema y destacar las más prometedoras y por qué.' },
  uno: { name: '1:1 / seguimiento', desc: 'Avances, bloqueos y compromisos', focus: 'Enfócate en avances desde la última vez, bloqueos, feedback dado y compromisos de cada persona.' }
};
const KP_ICONS = ['target', 'money', 'people', 'time', 'tech', 'design', 'legal', 'growth', 'idea', 'risk'];
const CLAUDE_MODELS = [['claude-sonnet-5-5', 'Claude Sonnet 5.5 — recomendado'], ['claude-opus-5-5', 'Claude Opus 5.5 — máximo detalle'], ['claude-haiku-5-5', 'Claude Haiku 5.5 — más rápido y económico']];
const STT_MODELS = [['gpt-4o-transcribe-diarize', 'Con hablantes (recomendado)'], ['whisper-1', 'Whisper — con marcas de tiempo, sin hablantes'], ['gpt-4o-transcribe', 'Solo texto']];
const MAX_UPLOAD = 25 * 1024 * 1024;
const PART_SEC = 55 * 60;

/* =========================================================
   Settings (localStorage — only this device)
   ========================================================= */
const DEFAULTS = { anthropicKey: '', openaiKey: '', claudeModel: 'claude-sonnet-5-5', sttModel: 'gpt-4o-transcribe-diarize', language: 'es', theme: 'system', captions: false, bitrate: 32000, followAudio: true };
const Settings = {
  v: { ...DEFAULTS },
  load() { try { Object.assign(this.v, JSON.parse(localStorage.getItem('acta:settings') || '{}')); } catch {} return this; },
  set(patch) { Object.assign(this.v, patch); try { localStorage.setItem('acta:settings', JSON.stringify(this.v)); if ('theme' in patch) localStorage.setItem('acta:theme', this.v.theme); } catch {} if ('theme' in patch) applyTheme(); }
}.load();
function applyTheme() { const t = Settings.v.theme; if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); }
applyTheme();

/* =========================================================
   Storage (IndexedDB)
   ========================================================= */
const DB = {
  _p: null,
  open() {
    if (this._p) return this._p;
    this._p = new Promise((res, rej) => {
      const r = indexedDB.open('acta', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('meetings', { keyPath: 'id' });
        d.createObjectStore('transcripts');
        d.createObjectStore('audio');
        const c = d.createObjectStore('chunks', { autoIncrement: true }); c.createIndex('rec', 'recId');
        d.createObjectStore('kv');
      };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return this._p;
  },
  async tx(store, mode, fn) {
    const d = await this.open();
    return new Promise((res, rej) => { const t = d.transaction(store, mode); const st = t.objectStore(store); let out; Promise.resolve(fn(st)).then(v => out = v); t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  },
  req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  get(store, key) { return this.tx(store, 'readonly', st => this.req(st.get(key))); },
  put(store, val, key) { return this.tx(store, 'readwrite', st => this.req(key === undefined ? st.put(val) : st.put(val, key))); },
  del(store, key) { return this.tx(store, 'readwrite', st => this.req(st.delete(key))); },
  all(store) { return this.tx(store, 'readonly', st => this.req(st.getAll())); },
  keys(store) { return this.tx(store, 'readonly', st => this.req(st.getAllKeys())); },
  async chunksFor(recId) { return this.tx('chunks', 'readonly', st => this.req(st.index('rec').getAll(recId))); },
  async delChunks(recId) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction('chunks', 'readwrite'); const idx = t.objectStore('chunks').index('rec'); const c = idx.openKeyCursor(IDBKeyRange.only(recId)); c.onsuccess = () => { const cur = c.result; if (cur) { t.objectStore('chunks').delete(cur.primaryKey); cur.continue(); } }; t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  async clearAll() { for (const s of ['meetings', 'transcripts', 'audio', 'chunks', 'kv']) await this.tx(s, 'readwrite', st => this.req(st.clear())); }
};

/* =========================================================
   App state
   ========================================================= */
const S = { meetings: [], loaded: false, route: { view: 'library' }, q: '', trq: '', chats: {}, progress: {}, running: new Set(), recovery: null, taskFilter: 'pending', ownerFilter: '' };
const meetingById = id => S.meetings.find(m => m.id === id);
async function loadMeetings() { S.meetings = (await DB.all('meetings')).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); S.loaded = true; }
async function saveMeeting(m) { await DB.put('meetings', m); const i = S.meetings.findIndex(x => x.id === m.id); if (i >= 0) S.meetings[i] = m; else { S.meetings.unshift(m); S.meetings.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); } return m; }
async function patchMeeting(id, patch) { const m = meetingById(id) || await DB.get('meetings', id); if (!m) return; Object.assign(m, patch); return saveMeeting(m); }
async function getSegments(id) { const t = await DB.get('transcripts', id); return (t && t.segments) || []; }
async function deleteMeeting(id) {
  const m = meetingById(id);
  await DB.del('meetings', id); await DB.del('transcripts', id).catch(() => {});
  for (const p of (m?.audioParts || [])) await DB.del('audio', p.key).catch(() => {});
  S.meetings = S.meetings.filter(x => x.id !== id); Player.unload(id);
}

/* =========================================================
   Transcript parsing (pasted text / SRT / VTT / Otter-style)
   ========================================================= */
function parseTime(str) { const p = str.replace(',', '.').split(':').map(Number); if (p.some(isNaN)) return null; return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; }
function parseTranscript(raw, durationMin) {
  raw = String(raw || '').replace(/\r/g, '').trim(); if (!raw) return { segments: [], estimated: false };
  const segs = [];
  if (/-->/.test(raw)) {
    raw.split(/\n\s*\n/).forEach(block => {
      const lines = block.split('\n').filter(l => l.trim() && !/^WEBVTT/.test(l) && !/^\d+$/.test(l.trim()));
      const tl = lines.findIndex(l => l.includes('-->')); if (tl < 0) return;
      const [a, b] = lines[tl].split('-->').map(x => x.trim().split(' ')[0].replace(/[.,]\d+$/, ''));
      let text = lines.slice(tl + 1).join(' '), s = null;
      const vm = text.match(/<v\s+([^>]+)>/); if (vm) s = vm[1].trim();
      text = text.replace(/<[^>]+>/g, '').trim(); if (!text) return;
      const sm = text.match(/^([^:]{1,32}):\s+(.*)$/); if (!s && sm && !/\d:\d/.test(sm[1])) { s = sm[1].trim(); text = sm[2]; }
      segs.push({ t: parseTime(a), end: parseTime(b), s, text });
    });
  } else {
    let lastSpeaker = null, pendingT = null;
    raw.split('\n').forEach(line => {
      let l = line.trim(); if (!l) return;
      let t = null, s = null;
      const tm = l.match(/^\[?\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\]?\s*[-–—]?\s*/);
      if (tm) { t = parseTime(tm[1]); l = l.slice(tm[0].length); }
      const ot = l.match(/^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .'-]{0,30}?)\s+((?:\d{1,2}:)?\d{1,2}:\d{2})$/);
      if (ot) { lastSpeaker = ot[1].trim(); pendingT = parseTime(ot[2]); return; }
      const sm = l.match(/^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 ._'-]{0,30}):\s*(.*)$/);
      if (sm) { s = sm[1].trim(); l = sm[2]; }
      const st = l.match(/^((?:\d{1,2}:)?\d{1,2}:\d{2})$/);
      if (!l && s) { lastSpeaker = s; return; }
      if (st && !s) { pendingT = parseTime(st[1]); return; }
      if (!l) return;
      if (t == null && pendingT != null) { t = pendingT; pendingT = null; }
      if (!s) s = lastSpeaker; else lastSpeaker = s;
      segs.push({ t, s, text: l });
    });
  }
  let estimated = false;
  if (segs.length && segs.every(x => x.t == null)) {
    estimated = true;
    const words = segs.map(x => x.text.split(/\s+/).length), total = words.reduce((a, b) => a + b, 0);
    const dur = durationMin ? durationMin * 60 : total / 140 * 60; let acc = 0;
    segs.forEach((x, i) => { x.t = Math.round(acc / total * dur); acc += words[i]; });
  } else { let last = 0; segs.forEach(x => { if (x.t == null) x.t = last; else last = x.t; }); }
  segs.forEach(x => { if (!x.s) delete x.s; if (x.end == null) delete x.end; });
  return { segments: segs, estimated };
}
const wordsOf = t => String(t).split(/\s+/).filter(Boolean).length;
const wordCount = segs => segs.reduce((a, x) => a + wordsOf(x.text), 0);
const segDuration = segs => { if (!segs.length) return 0; const last = segs[segs.length - 1]; return Math.max(last.end || 0, last.t + Math.max(5, Math.round(wordsOf(last.text) / 2.4))); };
function mergeSegments(segs) {
  const out = [];
  segs.forEach(x => {
    const p = out[out.length - 1];
    if (p && p.s === x.s && (x.t - (p.end ?? p.t)) < 2.5 && p.text.length + x.text.length < 600) { p.text += ' ' + x.text; p.end = x.end ?? p.end; }
    else out.push({ ...x });
  });
  return out;
}

/* =========================================================
   Speaker helpers
   ========================================================= */
const speakerLabels = segs => [...new Set(segs.map(x => x.s).filter(Boolean))];
function spkName(m, label) { if (!label) return ''; const n = m?.speakers?.[label]; if (n) return n; const [base, part] = String(label).split('·'); let out = base; const num = base.match(/^(?:speaker|spk|hablante)?[_ -]?(\d+)$/i); if (/^[A-Z]$/.test(base)) out = 'Persona ' + base; else if (num) out = 'Persona ' + String.fromCharCode(65 + (+num[1] % 26)); return part ? out + ' · parte ' + part : out; }
function spkIndex(m, label) { const labels = m?._labels || []; const i = labels.indexOf(label); return i < 0 ? 0 : i; }

/* =========================================================
   Speech to text (OpenAI)
   ========================================================= */
function extFor(type) { type = String(type || ''); if (type.includes('webm')) return 'webm'; if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'm4a'; if (type.includes('mpeg') || type.includes('mp3')) return 'mp3'; if (type.includes('wav')) return 'wav'; if (type.includes('ogg')) return 'ogg'; return 'webm'; }
async function openaiTranscribe(blob, offset, partNo, onStatus) {
  if (blob.size > MAX_UPLOAD) throw { code: 'too_big', message: `El audio pesa ${fmtBytes(blob.size)} y el límite de transcripción es 25 MB por archivo. Grábalo con Acta (divide las partes solo) o comprímelo a MP3/M4A.` };
  const model = Settings.v.sttModel;
  const build = withLang => {
    const fd = new FormData();
    fd.append('file', blob, 'reunion.' + extFor(blob.type));
    fd.append('model', model);
    if (model === 'gpt-4o-transcribe-diarize') { fd.append('response_format', 'diarized_json'); fd.append('chunking_strategy', 'auto'); }
    else if (model === 'whisper-1') { fd.append('response_format', 'verbose_json'); fd.append('timestamp_granularities[]', 'segment'); }
    else fd.append('response_format', 'json');
    if (withLang && Settings.v.language && Settings.v.language !== 'auto') fd.append('language', Settings.v.language);
    return fd;
  };
  const call = async withLang => {
    let res;
    try { res = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + Settings.v.openaiKey.trim() }, body: build(withLang) }); }
    catch { throw { code: 'network', message: 'No hay conexión con el servicio de transcripción. Revisa tu internet y reintenta.' }; }
    if (!res.ok) { let j = {}; try { j = await res.json(); } catch {} const msg = j.error?.message || ''; throw { code: res.status === 401 ? 'bad_openai_key' : 'openai_' + res.status, status: res.status, message: res.status === 401 ? 'La clave de OpenAI no es válida. Revísala en Ajustes.' : res.status === 429 ? 'OpenAI rechazó la solicitud por límite de uso o saldo insuficiente. Revisa tu cuenta de OpenAI.' : 'Error de transcripción: ' + (msg || res.status), raw: msg }; }
    return res.json();
  };
  onStatus && onStatus(partNo);
  let j;
  try { j = await call(true); } catch (e) { if (e.status === 400 && /language/i.test(e.raw || '')) j = await call(false); else throw e; }
  const suffix = partNo > 0 ? '·' + (partNo + 1) : '';
  if (Array.isArray(j.segments) && j.segments.length) {
    return j.segments.map(sg => ({ t: Math.round((offset + (+sg.start || 0)) * 10) / 10, end: Math.round((offset + (+sg.end || 0)) * 10) / 10, s: sg.speaker != null ? String(sg.speaker) + suffix : undefined, text: String(sg.text || '').trim() })).filter(x => x.text);
  }
  const text = String(j.text || '').trim(); if (!text) return [];
  const sentences = text.match(/[^.!?¿¡]+[.!?]+|\S[^.!?]*$/g) || [text];
  const dur = j.duration || (blob.size * 8 / (Settings.v.bitrate || 32000));
  const total = wordsOf(text); let acc = 0;
  return sentences.map(sn => { const t = offset + acc / total * dur; acc += wordsOf(sn); return { t: Math.round(t), text: sn.trim() }; });
}

/* =========================================================
   Claude (Anthropic Messages API, streamed)
   ========================================================= */
async function claude({ system, messages, tools, tool_choice, max_tokens = 16000, onText, onProgress, signal }) {
  if (!Settings.v.anthropicKey) throw { code: 'no_anthropic', message: 'Agrega tu clave de Claude (Anthropic) en Ajustes para analizar.' };
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-api-key': Settings.v.anthropicKey.trim(), 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: Settings.v.claudeModel, max_tokens, system, messages, tools, tool_choice, stream: true })
    });
  } catch (e) { if (e.name === 'AbortError') throw e; throw { code: 'network', message: 'No hay conexión con Claude. Revisa tu internet y reintenta.' }; }
  if (!res.ok) {
    let j = {}; try { j = await res.json(); } catch {}
    const m = j.error?.message || String(res.status);
    throw { code: res.status === 401 ? 'bad_anthropic_key' : 'anthropic_' + res.status, message: res.status === 401 ? 'La clave de Claude no es válida. Revísala en Ajustes.' : res.status === 429 ? 'Claude alcanzó el límite de uso por ahora. Espera un momento y reintenta.' : res.status === 529 ? 'Claude está saturado en este momento. Reintenta en unos minutos.' : 'Error de Claude: ' + m };
  }
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = '', text = '', json = '', stop = null, chars = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const ev = buf.slice(0, i); buf = buf.slice(i + 2);
      const data = ev.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('');
      if (!data) continue;
      let o; try { o = JSON.parse(data); } catch { continue; }
      if (o.type === 'content_block_delta') {
        if (o.delta.type === 'text_delta') { text += o.delta.text; chars += o.delta.text.length; onText && onText(text); }
        else if (o.delta.type === 'input_json_delta') { json += o.delta.partial_json; chars += o.delta.partial_json.length; }
        onProgress && onProgress(chars);
      } else if (o.type === 'message_delta') stop = o.delta?.stop_reason || stop;
      else if (o.type === 'error') throw { code: 'stream', message: 'Claude interrumpió la respuesta: ' + (o.error?.message || 'error') };
    }
  }
  let toolInput = null;
  if (json) { try { toolInput = JSON.parse(json); } catch { throw { code: 'bad_json', message: stop === 'max_tokens' ? 'La reunión es muy larga para un solo análisis con este modelo. Prueba con Claude Opus o divide la transcripción.' : 'Claude devolvió un resultado incompleto. Reintenta.' }; } }
  return { text, toolInput, stop };
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Título corto y específico (máx. 8 palabras)' },
    tldr: { type: 'string', description: 'Resumen de 2-3 frases con lo esencial y el resultado' },
    mood: { type: 'object', properties: { label: { type: 'string' }, score: { type: 'integer', minimum: 0, maximum: 100 }, note: { type: 'string' } }, required: ['label', 'score', 'note'] },
    tags: { type: 'array', items: { type: 'string' } },
    speakers: { type: 'array', description: 'Para cada etiqueta de hablante de la transcripción, el nombre real si se deduce con seguridad del contexto; si no, deja name vacío', items: { type: 'object', properties: { label: { type: 'string' }, name: { type: 'string' } }, required: ['label', 'name'] } },
    participants: { type: 'array', items: { type: 'string' } },
    keyPoints: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' }, icon: { type: 'string', enum: KP_ICONS } }, required: ['title', 'detail', 'icon'] } },
    topics: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, start: { type: 'number' }, end: { type: 'number' }, summary: { type: 'string' } }, required: ['name', 'start', 'end', 'summary'] } },
    decisions: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, why: { type: 'string' } }, required: ['text'] } },
    actions: { type: 'array', items: { type: 'object', properties: { task: { type: 'string' }, owner: { type: 'string' }, due: { type: 'string' }, priority: { type: 'string', enum: ['alta', 'media', 'baja'] } }, required: ['task', 'owner', 'priority'] } },
    ideas: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, note: { type: 'string' } }, required: ['text'] } },
    risks: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, severity: { type: 'string', enum: ['alta', 'media', 'baja'] } }, required: ['text', 'severity'] } },
    questions: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
    numbers: { type: 'array', items: { type: 'object', properties: { value: { type: 'string' }, label: { type: 'string' } }, required: ['value', 'label'] } },
    quotes: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, who: { type: 'string' }, t: { type: 'number' } }, required: ['text', 'who'] } },
    mindmap: { type: 'object', properties: { center: { type: 'string' }, branches: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, children: { type: 'array', items: { type: 'string' } } }, required: ['label', 'children'] } } }, required: ['center', 'branches'] },
    nextSteps: { type: 'array', items: { type: 'string' } },
    brief: { type: 'string', description: 'Documento Markdown (# título, ## secciones, listas con -) que sirva de materia prima para arrancar o continuar el proyecto: Contexto, Objetivo, Alcance, Requisitos y detalles, Decisiones tomadas, Pendientes y preguntas, Plan inicial. Concreto, sin relleno.' }
  },
  required: ['title', 'tldr', 'mood', 'tags', 'speakers', 'participants', 'keyPoints', 'topics', 'decisions', 'actions', 'ideas', 'risks', 'questions', 'numbers', 'quotes', 'mindmap', 'nextSteps', 'brief']
};
const transcriptText = (m, segs) => segs.map(x => `[${fmtT(x.t)}] ${x.s ? (m?.speakers?.[x.s] ? `${m.speakers[x.s]} (${x.s})` : x.s) + ': ' : ''}${x.text}`).join('\n');
async function analyze(m, segs, template, onProgress) {
  const tpl = TEMPLATES[template] || TEMPLATES.general;
  const labels = speakerLabels(segs);
  const notes = [m.notes, ...(m.notesLog || []).map(n => `[${fmtT(n.t)}] ${n.text}`)].filter(Boolean).join('\n');
  const marks = (m.marks || []).map(k => `[${fmtT(k.t)}] ${k.label || 'Momento marcado'}`).join('\n');
  const system = `Eres un analista de reuniones de primer nivel. Produces actas visuales precisas y útiles para trabajar.
Reglas:
- Escribe en español de Chile, claro y profesional.
- No inventes nada: usa solo lo que se dijo. Si una sección no aplica, devuelve un arreglo vacío.
- Los tiempos de la transcripción están como [m:ss] o [h:mm:ss]; en tu respuesta exprésalos en segundos.
- Los temas (topics) cubren la reunión en orden, sin solaparse, de 2 a 7.
- keyPoints: 3 a 6. mindmap: 3 a 6 ramas con 2 a 4 hojas.
- Las notas y momentos marcados por el usuario son prioridad: los anotó porque le importan.
- Tareas: empieza con verbo; owner es la persona responsable si se dijo, si no "Sin asignar"; due solo si se mencionó un plazo.
- quotes: frases textuales cortas y memorables.
- speakers: ${labels.length ? `etiquetas presentes: ${labels.join(', ')}. Deduce el nombre de cada una solo si es claro (alguien la nombra, se presenta o coincide con un participante); si no, deja name vacío.` : 'no hay etiquetas de hablante; devuelve un arreglo vacío.'}
- Enfoque de esta reunión: ${tpl.focus}`;
  const user = `Datos de la reunión
- Título provisional: ${m.titleHint || '(sin título, propón uno)'}
- Fecha: ${m.date}
- Duración: ${fmtT(m.durationSec)}
- Participantes declarados: ${(m.participants || []).join(', ') || '(no indicados)'}
- Contexto: ${m.context || '(no indicado)'}
${notes ? `\nNotas del usuario durante la reunión:\n${notes}\n` : ''}${marks ? `\nMomentos que el usuario marcó como importantes:\n${marks}\n` : ''}
Transcripción:
${transcriptText(m, segs)}

Genera el acta llamando a la herramienta guardar_acta una sola vez, con todos los campos completos. No escribas texto fuera de la herramienta.`;
  const r = await claude({ system, messages: [{ role: 'user', content: user }], tools: [{ name: 'guardar_acta', description: 'Guarda el acta estructurada de la reunión', input_schema: ANALYSIS_SCHEMA }], tool_choice: { type: 'auto' }, max_tokens: 32000, onProgress });
  let input = r.toolInput;
  if (!input && r.text) { try { let t = r.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, ''); const a0 = t.indexOf('{'), b0 = t.lastIndexOf('}'); input = JSON.parse(t.slice(a0, b0 + 1)); } catch {} }
  if (!input) throw { code: 'bad_json', message: r.stop === 'max_tokens' ? 'La reunión es muy larga para un solo análisis. Prueba con Claude Opus en Ajustes.' : 'Claude no devolvió el acta. Toca Reintentar.' };
  return normalize(input, m.durationSec || segDuration(segs), m.titleHint);
}
function normalize(a, dur, titleHint) {
  const arr = v => Array.isArray(v) ? v : [];
  const out = {
    title: a.title || titleHint || 'Reunión sin título', tldr: a.tldr || '',
    mood: a.mood && typeof a.mood === 'object' ? { label: a.mood.label || '', score: Math.max(0, Math.min(100, +a.mood.score || 0)), note: a.mood.note || '' } : null,
    tags: arr(a.tags).slice(0, 6).map(String), participants: arr(a.participants).map(String),
    speakers: arr(a.speakers).filter(x => x && x.label),
    keyPoints: arr(a.keyPoints).slice(0, 6).map(k => ({ title: k.title || '', detail: k.detail || '', icon: KP_ICONS.includes(k.icon) ? k.icon : 'target' })),
    topics: arr(a.topics).map(t => ({ name: t.name || '', start: Math.max(0, +t.start || 0), end: +t.end || 0, summary: t.summary || '' })).filter(t => t.name),
    decisions: arr(a.decisions).map(d => ({ text: d.text || String(d), why: d.why || '' })),
    actions: arr(a.actions).map(x => ({ id: uid(), task: x.task || String(x), owner: x.owner || 'Sin asignar', due: x.due || '', priority: ['alta', 'media', 'baja'].includes(x.priority) ? x.priority : 'media', done: false })),
    ideas: arr(a.ideas).map(x => ({ text: x.text || String(x), note: x.note || '' })),
    risks: arr(a.risks).map(x => ({ text: x.text || String(x), severity: ['alta', 'media', 'baja'].includes(x.severity) ? x.severity : 'media' })),
    questions: arr(a.questions).map(x => ({ text: x.text || String(x) })),
    numbers: arr(a.numbers).slice(0, 8).map(x => ({ value: String(x.value ?? ''), label: x.label || '' })).filter(x => x.value),
    quotes: arr(a.quotes).slice(0, 6).map(x => ({ text: x.text || '', who: x.who || '', t: x.t != null ? +x.t : null })).filter(x => x.text),
    mindmap: a.mindmap && a.mindmap.center ? { center: a.mindmap.center, branches: arr(a.mindmap.branches).slice(0, 7).map(b => ({ label: b.label || '', children: arr(b.children).slice(0, 5).map(String) })) } : null,
    nextSteps: arr(a.nextSteps).map(String), brief: a.brief || ''
  };
  out.topics.sort((x, y) => x.start - y.start);
  out.topics.forEach((t, i) => { const nx = out.topics[i + 1]; if (!t.end || t.end <= t.start) t.end = nx ? nx.start : dur; if (nx && t.end > nx.start) t.end = nx.start; if (dur && t.end > dur) t.end = dur; });
  return out;
}

/* =========================================================
   Processing pipeline
   ========================================================= */
function setProgress(id, text) { S.progress[id] = text; const el = $('#proc-detail'); if (el && S.route.view === 'meeting' && S.route.id === id) el.textContent = text; }
async function processMeeting(id, { template } = {}) {
  if (S.running.has(id)) return; S.running.add(id);
  let m = meetingById(id) || await DB.get('meetings', id);
  try {
    let segs = await getSegments(id);
    if (!segs.length) {
      if (!Settings.v.openaiKey) {
        if (m.liveSegments?.length) { segs = m.liveSegments; await DB.put('transcripts', { segments: segs }, id); }
        else throw { code: 'no_openai', message: 'Para transcribir el audio agrega tu clave de OpenAI en Ajustes. También puedes pegar una transcripción.' };
      } else {
        if (!m.audioParts?.length) throw { code: 'no_audio', message: 'Esta reunión no tiene audio ni transcripción.' };
        m = await patchMeeting(id, { status: 'transcribing', error: null }); render();
        const all = [];
        for (let p = 0; p < m.audioParts.length; p++) {
          const part = m.audioParts[p]; const blob = await DB.get('audio', part.key);
          if (!blob) throw { code: 'no_audio', message: 'No encuentro el audio de esta reunión en el dispositivo.' };
          setProgress(id, m.audioParts.length > 1 ? `Transcribiendo parte ${p + 1} de ${m.audioParts.length} (${fmtBytes(blob.size)})…` : `Transcribiendo ${fmtT(m.durationSec)} de audio (${fmtBytes(blob.size)})…`);
          all.push(...await openaiTranscribe(blob, part.offset || 0, p));
        }
        segs = mergeSegments(all);
        if (!segs.length) throw { code: 'empty', message: 'No se detectó voz en la grabación. Revisa que el micrófono haya captado audio.' };
        await DB.put('transcripts', { segments: segs }, id);
        if (!m.durationSec) m.durationSec = segDuration(segs);
      }
    }
    m = await patchMeeting(id, { status: 'analyzing', error: null, hasTranscript: true, words: wordCount(segs), durationSec: m.durationSec || segDuration(segs) }); render();
    setProgress(id, `Claude está leyendo ${nf(wordCount(segs))} palabras…`);
    const tpl = template || m.template || 'general';
    const analysis = await analyze(m, segs, tpl, n => setProgress(id, `Escribiendo el acta… ${nf(n)} caracteres`));
    const speakers = { ...(m.speakers || {}) };
    analysis.speakers.forEach(sp => { if (sp.name && !m.speakersEdited?.[sp.label]) speakers[sp.label] = sp.name; });
    const prev = m.analysis?.actions || [];
    analysis.actions.forEach(a => { const old = prev.find(p => p.task === a.task); if (old) a.done = old.done; });
    await patchMeeting(id, { status: 'ready', error: null, analysis, template: tpl, speakers, analyzedAt: Date.now() });
    if (S.route.view === 'meeting' && S.route.id === id) toast('Acta lista');
  } catch (e) {
    console.error(e);
    await patchMeeting(id, { status: 'error', error: { code: e.code || 'error', message: e.message || 'No se pudo completar el proceso.' } });
  } finally { S.running.delete(id); delete S.progress[id]; render(); }
}

/* =========================================================
   Recorder
   ========================================================= */
const Rec = {
  state: 'idle', stream: null, mr: null, ctx: null, analyser: null, mime: '', recId: null,
  activeMs: 0, lastStart: 0, part: 0, partStartSec: 0, seq: 0, parts: [], marks: [], notesLog: [], live: [], wake: null, raf: 0, tick: 0, sr: null, interim: '',
  elapsed() { return this.activeMs + (this.state === 'recording' ? performance.now() - this.lastStart : 0); },
  pickMime() { const c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac']; for (const t of c) if (window.MediaRecorder && MediaRecorder.isTypeSupported?.(t)) return t; return ''; },
  async start(meta) {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw { message: 'Este navegador no permite grabar audio. Usa Chrome (Android) o Safari (iPhone) actualizados.' };
    try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }); }
    catch (e) { throw { message: e.name === 'NotAllowedError' ? 'Acta necesita permiso para usar el micrófono. Actívalo en los permisos del sitio y vuelve a intentarlo.' : 'No se pudo acceder al micrófono: ' + e.message }; }
    this.mime = this.pickMime(); this.recId = uid(); this.startedAt = Date.now(); this.pending = new Set(); this.activeMs = 0; this.part = 0; this.seq = 0; this.parts = [{ part: 0, offset: 0 }]; this.marks = []; this.notesLog = []; this.live = []; this.meta = meta;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); const src = this.ctx.createMediaStreamSource(this.stream); this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 1024; src.connect(this.analyser); } catch {}
    this.startPart(0);
    this.state = 'recording'; this.lastStart = performance.now();
    this.saveActive(); this.lockScreen(); if (Settings.v.captions || !Settings.v.openaiKey) this.startCaptions();
    window.addEventListener('beforeunload', this.guard);
    this.tick = setInterval(() => { if (this.state === 'recording' && this.elapsed() / 1000 - this.partStartSec >= PART_SEC) this.rotate(); this.saveActive(); }, 5000);
  },
  startPart(p) {
    const opts = { audioBitsPerSecond: +Settings.v.bitrate || 32000 }; if (this.mime) opts.mimeType = this.mime;
    const mr = new MediaRecorder(this.stream, opts); this.mime = mr.mimeType || this.mime;
    const recId = this.recId;
    mr.ondataavailable = e => { if (e.data && e.data.size) { const pr = DB.put('chunks', { recId, part: p, seq: this.seq++, blob: e.data, type: mr.mimeType }).catch(() => {}); this.pending.add(pr); pr.finally(() => this.pending.delete(pr)); } };
    mr.start(4000); this.mr = mr; this.part = p; this.partStartSec = this.elapsed() / 1000;
  },
  rotate() { const old = this.mr; const next = this.part + 1; const off = this.elapsed() / 1000; this.parts.push({ part: next, offset: off }); try { old.stop(); } catch {} this.startPart(next); this.partStartSec = off; },
  pause() { if (this.state !== 'recording') return; this.activeMs = this.elapsed(); this.state = 'paused'; try { this.mr.pause(); } catch {} this.saveActive(); },
  resume() { if (this.state !== 'paused') return; this.lastStart = performance.now(); this.state = 'recording'; try { this.mr.resume(); } catch {} },
  addMark(label) { const t = Math.round(this.elapsed() / 1000); this.marks.push({ t, label: label || '' }); this.saveActive(); return t; },
  addNote(text) { const t = Math.round(this.elapsed() / 1000); this.notesLog.push({ t, text }); this.saveActive(); return t; },
  saveActive() { if (!this.recId) return; DB.put('kv', { recId: this.recId, mime: this.mime, startedAt: this.startedAt || (this.startedAt = Date.now()), elapsed: Math.round(this.elapsed() / 1000), parts: this.parts, marks: this.marks, notesLog: this.notesLog, live: this.live, meta: this.meta }, 'activeRec').catch(() => {}); },
  async stop() {
    if (this.state === 'idle') return null;
    const dur = Math.round(this.elapsed() / 1000);
    this.activeMs = this.elapsed(); this.state = 'stopping';
    await new Promise(res => { const mr = this.mr; if (!mr || mr.state === 'inactive') return res(); mr.addEventListener('stop', () => setTimeout(res, 120), { once: true }); try { mr.stop(); } catch { res(); } });
    await Promise.all([...this.pending]);
    this.cleanup();
    const info = { recId: this.recId, mime: this.mime, parts: this.parts, marks: this.marks, notesLog: this.notesLog, live: this.live, meta: this.meta, durationSec: dur };
    this.state = 'idle'; this.recId = null;
    return info;
  },
  async discard() { const id = this.recId; if (this.mr && this.mr.state !== 'inactive') try { this.mr.stop(); } catch {} this.cleanup(); this.state = 'idle'; this.recId = null; await sleep(300); if (id) await DB.delChunks(id); await DB.del('kv', 'activeRec'); },
  cleanup() {
    clearInterval(this.tick); cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    try { this.ctx?.close(); } catch {} this.ctx = null; this.analyser = null;
    this.stopCaptions(); this.wake?.release?.().catch(() => {}); this.wake = null;
    window.removeEventListener('beforeunload', this.guard); document.removeEventListener('visibilitychange', this.onVis);
  },
  guard(e) { e.preventDefault(); e.returnValue = ''; },
  async lockScreen() { try { if ('wakeLock' in navigator) { this.wake = await navigator.wakeLock.request('screen'); document.addEventListener('visibilitychange', this.onVis); } } catch {} },
  onVis: async () => { if (document.visibilityState === 'visible' && Rec.state !== 'idle' && (!Rec.wake || Rec.wake.released)) { try { Rec.wake = await navigator.wakeLock.request('screen'); } catch {} } },
  startCaptions() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
    const sr = new SR(); sr.lang = Settings.v.language && Settings.v.language !== 'auto' ? (Settings.v.language === 'es' ? 'es-CL' : Settings.v.language) : 'es-CL'; sr.continuous = true; sr.interimResults = true;
    sr.onresult = e => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) { const text = r[0].transcript.trim(); if (text) this.live.push({ t: Math.max(0, Math.round(this.elapsed() / 1000 - wordsOf(text) / 2.5)), text }); } else interim += r[0].transcript; } this.interim = interim; updateCaption(); };
    sr.onend = () => { if (this.sr === sr && this.state !== 'idle' && this.state !== 'stopping') { setTimeout(() => { try { sr.start(); } catch {} }, 250); } };
    sr.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.sr = null; } };
    try { sr.start(); this.sr = sr; } catch {}
  },
  stopCaptions() { const sr = this.sr; this.sr = null; try { sr?.stop(); } catch {} }
};
async function assembleRecording(info) {
  const chunks = (await DB.chunksFor(info.recId)).sort((a, b) => a.part - b.part || a.seq - b.seq);
  if (!chunks.length) return [];
  const byPart = new Map(); chunks.forEach(c => { if (!byPart.has(c.part)) byPart.set(c.part, []); byPart.get(c.part).push(c.blob); });
  const id = info.meetingId; const out = [];
  for (const [p, blobs] of [...byPart.entries()].sort((a, b) => a[0] - b[0])) {
    const type = chunks.find(c => c.part === p)?.type || info.mime || 'audio/webm';
    const blob = new Blob(blobs, { type: type.split(';')[0] });
    const key = id + ':' + p; await DB.put('audio', blob, key);
    out.push({ key, part: p, offset: (info.parts.find(x => x.part === p) || {}).offset || 0, size: blob.size, type: blob.type });
  }
  return out;
}
async function finishRecording(info, extra = {}) {
  const id = uid(); info.meetingId = id;
  const parts = await assembleRecording(info);
  const meta = info.meta || {};
  const live = info.live?.length ? mergeSegments(info.live) : [];
  const m = { id, createdAt: Date.now(), date: today(), durationSec: info.durationSec || info.elapsed || 0, titleHint: meta.title || '', participants: meta.participants || [], template: meta.template || 'general', context: meta.context || '', notes: '', notesLog: info.notesLog || [], marks: info.marks || [], audioParts: parts, liveSegments: live, speakers: {}, status: parts.length ? 'queued' : 'error', source: 'record', ...extra };
  if (!parts.length) m.error = { code: 'no_audio', message: 'No se guardó audio de esta grabación.' };
  await saveMeeting(m);
  await DB.delChunks(info.recId); await DB.del('kv', 'activeRec');
  return m;
}

/* =========================================================
   Audio player (multi-part)
   ========================================================= */
const Player = {
  el: null, m: null, urls: {}, cur: -1, total: 0, onTime: null,
  unload(id) { if (this.m && this.m.id === id) { this.el?.pause(); this.m = null; } Object.keys(this.urls).filter(k => k.startsWith(id + ':')).forEach(k => { URL.revokeObjectURL(this.urls[k]); delete this.urls[k]; }); },
  async attach(m, el) {
    this.el = el; this.m = m; this.cur = -1; this.total = m.durationSec || 0;
    el.addEventListener('timeupdate', () => this.onTime && this.onTime(this.time()));
    el.addEventListener('ended', () => { if (this.cur + 1 < m.audioParts.length) this.load(this.cur + 1).then(() => el.play().catch(() => {})); else this.onTime && this.onTime(this.time()); });
    el.addEventListener('play', () => this.onState && this.onState(true)); el.addEventListener('pause', () => this.onState && this.onState(false));
    await this.load(0);
  },
  async url(key) { if (!this.urls[key]) { const b = await DB.get('audio', key); if (!b) return null; this.urls[key] = URL.createObjectURL(b); } return this.urls[key]; },
  async load(i) { if (i === this.cur) return true; const p = this.m.audioParts[i]; const u = p && await this.url(p.key); if (!u) return false; this.el.src = u; this.cur = i; this.el.playbackRate = this.rate || 1; return true; },
  time() { const p = this.m?.audioParts[this.cur]; return (p ? p.offset : 0) + (this.el?.currentTime || 0); },
  async seek(t, play = true) {
    if (!this.m) return; const parts = this.m.audioParts; let i = 0; for (let k = 0; k < parts.length; k++) if (parts[k].offset <= t) i = k;
    await this.load(i); const off = t - parts[i].offset;
    const set = () => { try { this.el.currentTime = Math.max(0, off); } catch {} if (play) this.el.play().catch(() => {}); };
    if (this.el.readyState >= 1) set(); else this.el.addEventListener('loadedmetadata', set, { once: true });
  },
  toggle() { if (!this.el) return; if (this.el.paused) this.el.play().catch(() => {}); else this.el.pause(); },
  setRate(r) { this.rate = r; if (this.el) this.el.playbackRate = r; }
};

/* =========================================================
   Router
   ========================================================= */
function parseHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  const [a, b, c] = h.split('/');
  if (a === 'm' && b) return { view: 'meeting', id: b, tab: c || 'resumen' };
  if (['record', 'import', 'settings', 'tasks'].includes(a)) return { view: a };
  return { view: 'library' };
}
function go(hash) { if (location.hash.slice(1) === hash) { onRoute(); return; } location.hash = hash; }
function onRoute() {
  const prev = S.route; S.route = parseHash();
  if (Rec.state !== 'idle' && S.route.view !== 'record') { S.route = { view: 'record' }; history.replaceState(null, '', '#record'); toast('Estás grabando. Detén la grabación para salir.'); }
  if (prev.view !== S.route.view || prev.id !== S.route.id) { S.trq = ''; window.scrollTo(0, 0); }
  render();
}
window.addEventListener('hashchange', onRoute);
document.addEventListener('click', e => { const b = e.target.closest('[data-nav]'); if (!b) return; const v = b.dataset.nav; go(v === 'library' ? '' : v); });
$('#q').addEventListener('input', e => { S.q = e.target.value.trim().toLowerCase(); if (S.route.view !== 'library') go(''); else render(); });

/* =========================================================
   Render dispatcher
   ========================================================= */
function render() {
  const app = $('#app'); const v = S.route.view;
  $$('.dock [data-nav]').forEach(b => b.setAttribute('aria-current', (b.dataset.nav === v || (v === 'meeting' && b.dataset.nav === 'library')) ? 'page' : 'false'));
  document.body.classList.toggle('recording', Rec.state !== 'idle');
  if (v === 'record') return renderRecord(app);
  if (v === 'import') return renderImport(app);
  if (v === 'settings') return renderSettings(app);
  if (v === 'tasks') return renderTasks(app);
  if (v === 'meeting') { const m = meetingById(S.route.id); if (m) return renderMeeting(app, m); if (S.loaded) { app.innerHTML = `<div class="empty"><h3>No encuentro esta reunión</h3><p>Puede que se haya eliminado.</p><button class="btn" data-nav="library">Volver a reuniones</button></div>`; return; } }
  renderLibrary(app);
}

/* =========================================================
   Library
   ========================================================= */
function miniTopicBar(m) {
  const t = m.analysis?.topics || []; if (!t.length) return '';
  const tot = t.reduce((a, x) => a + Math.max(1, x.end - x.start), 0);
  return `<div class="topicbar" aria-hidden="true">${t.map((x, i) => `<i style="width:${Math.max(1, x.end - x.start) / tot * 100}%;background:${tc(i)}"></i>`).join('')}</div>`;
}
const STATUS_TXT = { queued: 'En cola', transcribing: 'Transcribiendo', analyzing: 'Analizando', error: 'Requiere atención' };
function renderLibrary(app) {
  const q = S.q;
  const list = S.meetings.filter(m => !q || [m.analysis?.title, m.titleHint, m.analysis?.tldr, (m.analysis?.tags || []).join(' '), (m.participants || []).join(' '), Object.values(m.speakers || {}).join(' ')].join(' ').toLowerCase().includes(q));
  const pending = S.meetings.reduce((a, m) => a + (m.analysis?.actions || []).filter(x => !x.done).length, 0);
  const needsKeys = !Settings.v.anthropicKey || !Settings.v.openaiKey;
  app.innerHTML = `
  ${S.recovery ? `<div class="notice" style="margin-bottom:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span style="flex:1;min-width:220px"><b>Hay una grabación sin terminar</b> de ${fmtT(S.recovery.elapsed)}. La app se cerró mientras grababas, pero el audio quedó guardado.</span><button class="btn sm primary" id="rec-recover">Recuperar y procesar</button><button class="btn sm ghost danger" id="rec-discard">Descartar</button></div>` : ''}
  ${needsKeys && S.loaded ? `<div class="notice info" style="margin-bottom:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span style="flex:1;min-width:220px"><b>Configura Acta en 2 minutos.</b> Agrega tus claves de Claude y OpenAI para transcribir con hablantes y generar las actas.</span><button class="btn sm primary" data-nav="settings">${icon('key')}Ir a Ajustes</button></div>` : ''}
  ${q ? '' : `<section class="hero-rec">
    <svg class="hero-wave" viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden="true">${Array.from({ length: 40 }, (_, i) => { const h = 12 + Math.abs(Math.sin(i * .7) * 70 + Math.sin(i * 1.9) * 20); return `<rect x="${i * 7.5}" y="${60 - h / 2}" width="4" height="${h}" rx="2" fill="#F2F3F7"/>`; }).join('')}</svg>
    <div style="position:relative"><h2>¿Empieza una reunión?</h2><p>Graba con el micrófono del celular. Al terminar, Acta transcribe quién dijo qué y arma el acta visual.</p></div>
    <button class="btn lg" data-nav="record" style="position:relative">${icon('mic', 2)}Grabar ahora</button>
  </section>`}
  <div class="page-head">
    <div><div class="eyebrow">Tu biblioteca</div><h1>Reuniones</h1>
    <p>${S.meetings.length ? `${S.meetings.length} ${S.meetings.length === 1 ? 'reunión' : 'reuniones'} · ${pending} ${pending === 1 ? 'tarea pendiente' : 'tareas pendientes'}` : 'Cada conversación convertida en un acta visual: decisiones, tareas, mapa mental y un brief listo para trabajar.'}</p></div>
  </div>
  ${!S.loaded ? `<div class="empty"><p>Cargando…</p></div>` :
    list.length ? `<div class="grid-lib">${list.map(cardHTML).join('')}</div>`
    : q ? `<div class="empty"><h3>Sin resultados</h3><p>Ninguna reunión coincide con “${esc(q)}”.</p></div>`
    : `<div class="empty">${icon('doc', 1.6, 34)}<h3>Aún no hay actas</h3><p style="max-width:48ch">Graba tu próxima conversación o importa un audio o una transcripción que ya tengas.</p><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="btn primary" data-nav="record">${icon('mic')}Grabar</button><button class="btn" data-nav="import">${icon('upload')}Importar</button><button class="btn ghost" id="load-demo">Ver un ejemplo</button></div></div>`}
  <p class="status-line">Guardado solo en este dispositivo${S.meetings.length ? ' · respáldalo desde Ajustes' : ''}</p>`;
  $$('[data-open]', app).forEach(b => b.onclick = () => go('m/' + b.dataset.open));
  const rr = $('#rec-recover'); if (rr) rr.onclick = recoverRecording;
  const rd = $('#rec-discard'); if (rd) rd.onclick = async () => { const r = S.recovery; S.recovery = null; await DB.delChunks(r.recId); await DB.del('kv', 'activeRec'); render(); toast('Grabación descartada'); };
  const ld = $('#load-demo'); if (ld) ld.onclick = loadDemo;
}
function cardHTML(m) {
  const a = m.analysis || {}; const acts = a.actions || []; const done = acts.filter(x => x.done).length;
  const st = m.status && m.status !== 'ready' ? `<span class="chip ${m.status === 'error' ? 'err' : 'proc'}">${S.running.has(m.id) || m.status !== 'error' ? STATUS_TXT[m.status] || 'Procesando' : STATUS_TXT.error}</span>` : '';
  return `<button class="mcard" data-open="${esc(m.id)}">
    <div class="mcard-meta"><span class="mono">${esc(fmtDate(m.date))}</span>${m.durationSec ? `<span class="mono">${esc(fmtT(m.durationSec))}</span>` : ''}${(a.tags || []).includes('ejemplo') ? '<span class="chip ex">Ejemplo</span>' : ''}${m.audioParts?.length ? `<span title="Con audio">${icon('mic', 1.8, 14)}</span>` : ''}${st}</div>
    <h3>${esc(a.title || m.titleHint || 'Reunión del ' + fmtDate(m.date))}</h3>
    ${a.tldr ? `<p class="tl">${esc(a.tldr)}</p>` : `<p class="tl">${esc(m.status === 'error' ? (m.error?.message || '') : 'El acta se está preparando…')}</p>`}
    ${miniTopicBar(m)}
    ${m.analysis ? `<div class="mcard-foot"><span><b>${(a.decisions || []).length}</b> decisiones</span><span><b>${done}/${acts.length}</b> tareas</span><span><b>${(a.ideas || []).length}</b> ideas</span></div>` : ''}
  </button>`;
}
async function recoverRecording() {
  const r = S.recovery; S.recovery = null;
  toast('Recuperando la grabación…');
  const m = await finishRecording({ recId: r.recId, mime: r.mime, parts: r.parts || [{ part: 0, offset: 0 }], marks: r.marks, notesLog: r.notesLog, live: r.live, meta: r.meta, durationSec: r.elapsed });
  go('m/' + m.id); if (m.status === 'queued') processMeeting(m.id);
}

/* =========================================================
   Record view
   ========================================================= */
let recMeta = null;
function renderRecord(app) {
  const on = Rec.state !== 'idle';
  recMeta = recMeta || { title: '', participants: '', template: 'general', context: '' };
  app.innerHTML = `
  <div class="rec-grid">
    <section class="stage" aria-label="Grabadora">
      <div class="stage-top">
        <span class="live ${Rec.state === 'recording' ? 'on' : ''}" id="live"><i></i><span id="live-txt">${Rec.state === 'recording' ? 'Grabando' : Rec.state === 'paused' ? 'En pausa' : 'Listo para grabar'}</span></span>
        <span style="font-size:12.5px;color:var(--stage-muted)" id="rec-size">${on ? '' : (Settings.v.openaiKey ? 'Transcripción con hablantes al terminar' : 'Sin clave de OpenAI: se usará el dictado del teléfono')}</span>
      </div>
      <div class="timer" id="timer">${fmtClock(Rec.elapsed())}<small id="timer-sub">${on ? 'No bloquees la pantalla mientras grabas' : 'Toca el botón rojo para empezar'}</small></div>
      <canvas class="wave" id="wave" aria-hidden="true"></canvas>
      <div class="meter" aria-hidden="true"><i id="lvl"></i></div>
      <div class="controls">
        <div class="cbtn-lbl"><button class="cbtn" id="r-mark" ${on ? '' : 'disabled'} aria-label="Marcar momento importante">${icon('bookmark', 1.9)}</button>Marcar</div>
        <div class="cbtn-lbl"><button class="bigrec ${on ? 'on' : ''}" id="r-main" aria-label="${on ? 'Detener y procesar' : 'Empezar a grabar'}"><span></span></button>${on ? 'Terminar' : 'Grabar'}</div>
        <div class="cbtn-lbl"><button class="cbtn" id="r-pause" ${on ? '' : 'disabled'} aria-label="${Rec.state === 'paused' ? 'Reanudar' : 'Pausar'}">${icon(Rec.state === 'paused' ? 'play' : 'pause', 2)}</button><span id="pause-lbl">${Rec.state === 'paused' ? 'Seguir' : 'Pausa'}</span></div>
      </div>
      <div class="marks" id="marks">${Rec.marks.map(k => `<span class="mark"><b>${fmtT(k.t)}</b>${esc(k.label || 'Momento importante')}</span>`).join('')}</div>
      <div class="caption" id="caption" ${on && Rec.sr ? '' : 'hidden'}></div>
      ${on ? `<div style="display:flex;justify-content:center"><button class="btn sm ghost" id="r-discard" style="color:var(--stage-muted)">Descartar grabación</button></div><div id="discard-confirm"></div>` : ''}
    </section>
    <aside style="display:grid;gap:16px">
      <section class="panel">
        <div class="eyebrow">Notas en vivo</div>
        <p class="muted" style="font-size:13px;margin:6px 0 12px">Cada nota queda con su minuto. Claude les da prioridad en el acta.</p>
        <div class="notes-log" id="notes-log">${Rec.notesLog.map(n => `<div><b>${fmtT(n.t)}</b><span>${esc(n.text)}</span></div>`).join('') || '<span class="muted" style="font-size:13px">Aún no hay notas.</span>'}</div>
        <form class="note-in field" id="note-f" style="margin-top:12px;display:flex"><input id="note-in" placeholder="${on ? 'Escribe y presiona Enter' : 'Disponible al grabar'}" ${on ? '' : 'disabled'} aria-label="Nota"><button class="btn" ${on ? '' : 'disabled'}>Añadir</button></form>
      </section>
      <section class="panel">
        <div class="eyebrow">Detalles de la reunión</div>
        <div class="form" style="margin-top:12px;gap:14px">
          <div class="field"><label for="r-title">Título</label><input id="r-title" value="${esc(recMeta.title)}" placeholder="Claude propone uno"></div>
          <div class="field"><label for="r-people">Participantes</label><input id="r-people" value="${esc(recMeta.participants)}" placeholder="Camila, Diego, yo"><span class="hint">Ayuda a ponerle nombre a cada voz.</span></div>
          <div class="field"><label for="r-tpl">Tipo de reunión</label><select id="r-tpl">${Object.entries(TEMPLATES).map(([k, t]) => `<option value="${k}" ${recMeta.template === k ? 'selected' : ''}>${t.name}</option>`).join('')}</select></div>
          <div class="field"><label for="r-ctx">Contexto</label><textarea id="r-ctx" rows="2" placeholder="¿De qué proyecto se trata?">${esc(recMeta.context)}</textarea></div>
        </div>
      </section>
    </aside>
  </div>`;
  const syncMeta = () => { recMeta = { title: $('#r-title').value, participants: $('#r-people').value, template: $('#r-tpl').value, context: $('#r-ctx').value }; if (Rec.state !== 'idle') { Rec.meta = metaFromForm(); Rec.saveActive(); } };
  $$('#r-title,#r-people,#r-tpl,#r-ctx').forEach(el => el.addEventListener('input', syncMeta));
  $('#r-main').onclick = async () => {
    if (Rec.state === 'idle') {
      try { await Rec.start(metaFromForm()); render(); drawLoop(); toast('Grabando'); }
      catch (e) { toast(e.message || 'No se pudo iniciar la grabación', 5000); }
    } else {
      const btn = $('#r-main'); btn.disabled = true; $('#timer-sub').textContent = 'Guardando audio…';
      Rec.meta = metaFromForm();
      const info = await Rec.stop();
      const m = await finishRecording(info);
      recMeta = null; document.body.classList.remove('recording');
      go('m/' + m.id);
      if (m.status === 'queued') processMeeting(m.id);
    }
  };
  $('#r-pause').onclick = () => { if (Rec.state === 'recording') Rec.pause(); else Rec.resume(); renderRecordState(); };
  $('#r-mark').onclick = () => { const t = Rec.addMark(''); $('#marks').insertAdjacentHTML('beforeend', `<span class="mark"><b>${fmtT(t)}</b>Momento importante</span>`); if (navigator.vibrate) navigator.vibrate(30); };
  $('#note-f').onsubmit = e => { e.preventDefault(); const v = $('#note-in').value.trim(); if (!v || Rec.state === 'idle') return; const t = Rec.addNote(v); $('#note-in').value = ''; const log = $('#notes-log'); if (Rec.notesLog.length === 1) log.innerHTML = ''; log.insertAdjacentHTML('beforeend', `<div><b>${fmtT(t)}</b><span>${esc(v)}</span></div>`); log.scrollTop = log.scrollHeight; };
  const rd = $('#r-discard'); if (rd) rd.onclick = () => { $('#discard-confirm').innerHTML = `<div class="confirm" style="justify-content:center">¿Descartar todo el audio grabado?<button class="btn sm solid-danger" id="dc-yes">Descartar</button><button class="btn sm" id="dc-no">Seguir grabando</button></div>`; $('#dc-yes').onclick = async () => { await Rec.discard(); recMeta = null; document.body.classList.remove('recording'); go(''); toast('Grabación descartada'); }; $('#dc-no').onclick = () => $('#discard-confirm').innerHTML = ''; };
  sizeWave(); if (on) drawLoop(); else drawIdle();
  updateCaption();
}
function metaFromForm() { const g = id => ($(id)?.value || '').trim(); return { title: g('#r-title'), participants: g('#r-people').split(',').map(x => x.trim()).filter(Boolean), template: $('#r-tpl')?.value || 'general', context: g('#r-ctx') }; }
function renderRecordState() {
  const live = $('#live'); if (!live) return;
  live.classList.toggle('on', Rec.state === 'recording'); $('#live-txt').textContent = Rec.state === 'recording' ? 'Grabando' : 'En pausa';
  $('#r-pause').innerHTML = icon(Rec.state === 'paused' ? 'play' : 'pause', 2); $('#pause-lbl').textContent = Rec.state === 'paused' ? 'Seguir' : 'Pausa';
}
function updateCaption() { const c = $('#caption'); if (!c) return; const last = Rec.live.slice(-2).map(x => esc(x.text)).join(' '); c.hidden = !(Rec.state !== 'idle' && Rec.sr); c.innerHTML = `${last}${Rec.interim ? ` <em>${esc(Rec.interim)}</em>` : ''}` || 'Escuchando…'; }
function sizeWave() { const c = $('#wave'); if (!c) return; const r = c.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1); c.width = Math.max(1, r.width * dpr); c.height = Math.max(1, r.height * dpr); }
window.addEventListener('resize', sizeWave);
const waveHist = [];
function drawIdle() { const c = $('#wave'); if (!c) return; const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); const n = 64, bw = c.width / n; g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--stage-line').trim() || '#2A2F3E'; for (let i = 0; i < n; i++) { const h = 3 * (window.devicePixelRatio || 1); g.fillRect(i * bw + bw * .2, c.height / 2 - h / 2, bw * .6, h); } }
function drawLoop() {
  cancelAnimationFrame(Rec.raf);
  const cs = getComputedStyle(document.documentElement);
  const accent = cs.getPropertyValue('--stage-accent').trim() || '#8E9BFF', dim = cs.getPropertyValue('--stage-line').trim() || '#2A2F3E';
  const data = new Uint8Array(Rec.analyser ? Rec.analyser.fftSize : 1024);
  let lastSize = 0;
  const frame = () => {
    if (Rec.state === 'idle') return;
    const c = $('#wave'); const t = $('#timer');
    if (t) t.firstChild.nodeValue = fmtClock(Rec.elapsed());
    let level = 0;
    if (Rec.analyser && Rec.state === 'recording') { Rec.analyser.getByteTimeDomainData(data); let sum = 0; for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; } level = Math.min(1, Math.sqrt(sum / data.length) * 4); }
    waveHist.push(level); if (waveHist.length > 90) waveHist.shift();
    const lv = $('#lvl'); if (lv) lv.style.width = (level * 100).toFixed(0) + '%';
    if (c) {
      const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
      const n = 90, bw = c.width / n;
      for (let i = 0; i < n; i++) { const v = waveHist[waveHist.length - n + i] ?? 0; const h = Math.max(3 * (window.devicePixelRatio || 1), v * c.height * .92); g.fillStyle = i > n - 4 ? accent : (v > .02 ? accent : dim); g.globalAlpha = .35 + .65 * (i / n); g.beginPath(); const x = i * bw + bw * .2, w = bw * .6, y = c.height / 2 - h / 2; if (g.roundRect) g.roundRect(x, y, w, h, w / 2); else g.rect(x, y, w, h); g.fill(); }
      g.globalAlpha = 1;
    }
    Rec.raf = requestAnimationFrame(frame);
  };
  Rec.raf = requestAnimationFrame(frame);
  clearInterval(drawLoop._s); drawLoop._s = setInterval(async () => { if (Rec.state === 'idle') { clearInterval(drawLoop._s); return; } const el = $('#rec-size'); if (!el) return; const est = Rec.elapsed() / 1000 * (+Settings.v.bitrate || 32000) / 8; if (est !== lastSize) { lastSize = est; el.textContent = `≈ ${fmtBytes(est)} · ${Rec.mime.split(';')[0].replace('audio/', '').toUpperCase() || 'AUDIO'}`; } }, 2000);
}

/* =========================================================
   Import view
   ========================================================= */
let impDraft = null;
function renderImport(app) {
  const d = impDraft || (impDraft = { mode: 'audio', title: '', date: today(), participants: '', template: 'general', context: '', notes: '', transcript: '', file: null, duration: '' });
  app.innerHTML = `
  <div class="page-head"><div><div class="eyebrow">Importar</div><h1>Trae una conversación que ya tienes</h1><p>Un audio grabado con otra app, o la transcripción de Meet, Zoom, Teams o las notas de voz del teléfono.</p></div></div>
  <section class="panel" style="max-width:860px">
    <div class="seg-ctl" role="group" aria-label="Qué vas a importar"><button data-mode="audio" aria-pressed="${d.mode === 'audio'}">Archivo de audio</button><button data-mode="text" aria-pressed="${d.mode === 'text'}">Transcripción en texto</button></div>
    <form class="form" id="imp-f" novalidate>
      ${d.mode === 'audio' ? `
      <div class="field"><span class="lbl">Audio</span>
        <div class="drop" id="drop"><span class="btn sm filebtn">${icon('upload')}Elegir audio<input id="i-file" type="file" accept="audio/*,video/mp4,.m4a,.mp3,.wav,.webm,.ogg,.mp4"></span><span id="i-fname">${d.file ? `${esc(d.file.name)} · ${fmtBytes(d.file.size)}` : 'M4A, MP3, WAV, WEBM u OGG · hasta 25 MB'}</span></div>
        ${Settings.v.openaiKey ? '' : '<p class="notice" style="margin-top:8px">Para transcribir audio necesitas tu clave de OpenAI en Ajustes.</p>'}
      </div>` : `
      <div class="field"><label for="i-tx">Transcripción</label>
        <div class="drop" id="drop"><span class="btn sm filebtn">${icon('upload')}Subir archivo<input id="i-txfile" type="file" accept=".txt,.md,.srt,.vtt,text/plain"></span><span>o pega el texto · .txt, .srt, .vtt</span></div>
        <textarea id="i-tx" class="mono-area" rows="12" placeholder="[0:00] Ana: Partamos por el alcance…&#10;[0:15] Diego: Yo propongo…">${esc(d.transcript)}</textarea><span class="hint" id="tx-info"></span>
      </div>`}
      <div class="field"><span class="lbl">Tipo de reunión</span><div class="tpls" role="group">${Object.entries(TEMPLATES).map(([k, t]) => `<button type="button" class="tpl" data-tpl="${k}" aria-pressed="${d.template === k}"><b>${t.name}</b><span>${t.desc}</span></button>`).join('')}</div></div>
      <div class="row">
        <div class="field"><label for="i-title">Título</label><input id="i-title" value="${esc(d.title)}" placeholder="Claude propone uno"></div>
        <div class="field"><label for="i-date">Fecha</label><input id="i-date" type="date" value="${esc(d.date)}"></div>
        <div class="field"><label for="i-people">Participantes</label><input id="i-people" value="${esc(d.participants)}" placeholder="Camila, Diego, yo"></div>
      </div>
      <div class="row two">
        <div class="field"><label for="i-ctx">Contexto</label><textarea id="i-ctx" rows="2" placeholder="¿De qué proyecto se trata?">${esc(d.context)}</textarea></div>
        <div class="field"><label for="i-notes">Tus notas</label><textarea id="i-notes" rows="2" placeholder="Lo que anotaste. Claude le da prioridad.">${esc(d.notes)}</textarea></div>
      </div>
      <div id="imp-status"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary lg" type="submit">${icon('spark')}Crear acta</button>${d.mode === 'text' ? '<button type="button" class="btn ghost" id="i-example">Usar texto de ejemplo</button>' : ''}</div>
    </form>
  </section>
  <section class="panel howto" style="max-width:860px;margin-top:16px"><div class="eyebrow">Dónde conseguir la transcripción</div>
    <ol style="margin-top:10px">
      <li><b>iPhone:</b> Notas de Voz → abre la grabación → ícono de transcripción → copiar.</li>
      <li><b>Android:</b> Grabadora (Pixel) o Grabadora de voz (Samsung) → Transcripción → compartir como texto.</li>
      <li><b>Meet, Zoom, Teams:</b> descarga la transcripción (.vtt o .txt) y súbela aquí.</li>
    </ol></section>`;
  const sync = () => { d.title = $('#i-title').value; d.date = $('#i-date').value; d.participants = $('#i-people').value; d.context = $('#i-ctx').value; d.notes = $('#i-notes').value; if ($('#i-tx')) { d.transcript = $('#i-tx').value; const p = parseTranscript(d.transcript); $('#tx-info').textContent = p.segments.length ? `${nf(p.segments.length)} intervenciones · ${nf(wordCount(p.segments))} palabras${p.estimated ? ' · sin marcas de tiempo: se estimarán' : ''}` : ''; } };
  $$('input,textarea', $('#imp-f')).forEach(el => el.addEventListener('input', sync)); sync();
  $$('[data-mode]').forEach(b => b.onclick = () => { sync(); d.mode = b.dataset.mode; renderImport(app); });
  $$('[data-tpl]').forEach(b => b.onclick = () => { d.template = b.dataset.tpl; $$('[data-tpl]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  const takeAudio = f => { if (!f) return; d.file = f; $('#i-fname').textContent = `${f.name} · ${fmtBytes(f.size)}${f.size > MAX_UPLOAD ? ' · supera 25 MB' : ''}`; if (!$('#i-title').value) { $('#i-title').value = f.name.replace(/\.[^.]+$/, ''); sync(); } };
  const takeText = f => { if (!f) return; const r = new FileReader(); r.onload = () => { $('#i-tx').value = r.result; if (!$('#i-title').value) $('#i-title').value = f.name.replace(/\.[^.]+$/, ''); sync(); }; r.readAsText(f); };
  const fi = $('#i-file'); if (fi) fi.onchange = e => takeAudio(e.target.files[0]);
  const ft = $('#i-txfile'); if (ft) ft.onchange = e => takeText(e.target.files[0]);
  const drop = $('#drop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; d.mode === 'audio' ? takeAudio(f) : takeText(f); });
  const ex = $('#i-example'); if (ex) ex.onclick = () => { $('#i-tx').value = EXAMPLE_TX; if (!$('#i-people').value) $('#i-people').value = 'Camila, Diego, Tú'; if (!$('#i-ctx').value) $('#i-ctx').value = 'Primera reunión para definir la app de reservas de una peluquería.'; sync(); };
  $('#imp-f').onsubmit = async e => {
    e.preventDefault(); sync(); const st = $('#imp-status');
    const base = { id: uid(), createdAt: Date.now(), date: d.date || today(), titleHint: d.title.trim(), participants: d.participants.split(',').map(x => x.trim()).filter(Boolean), template: d.template, context: d.context.trim(), notes: d.notes.trim(), notesLog: [], marks: [], speakers: {}, status: 'queued', source: 'import' };
    if (d.mode === 'audio') {
      if (!d.file) { st.innerHTML = '<p class="err">Elige el archivo de audio de la reunión.</p>'; return; }
      if (d.file.size > MAX_UPLOAD) { st.innerHTML = `<p class="err">El archivo pesa ${fmtBytes(d.file.size)}. El límite de transcripción es 25 MB: compártelo como M4A o MP3 desde la app de grabación, o recórtalo en partes.</p>`; return; }
      const dur = await audioDuration(d.file);
      const key = base.id + ':0'; await DB.put('audio', d.file, key);
      base.audioParts = [{ key, part: 0, offset: 0, size: d.file.size, type: d.file.type }]; base.durationSec = dur;
    } else {
      const p = parseTranscript(d.transcript);
      if (p.segments.length < 2) { st.innerHTML = '<p class="err">Pega o sube la transcripción de la reunión.</p>'; return; }
      await DB.put('transcripts', { segments: p.segments }, base.id);
      base.durationSec = segDuration(p.segments); base.estimatedTimes = p.estimated; base.words = wordCount(p.segments); base.audioParts = [];
    }
    await saveMeeting(base); impDraft = null;
    go('m/' + base.id); processMeeting(base.id);
  };
}
function audioDuration(file) { return new Promise(res => { const a = new Audio(); const u = URL.createObjectURL(file); a.preload = 'metadata'; a.onloadedmetadata = () => { const d = isFinite(a.duration) ? Math.round(a.duration) : 0; URL.revokeObjectURL(u); res(d); }; a.onerror = () => { URL.revokeObjectURL(u); res(0); }; a.src = u; setTimeout(() => res(0), 6000); }); }

/* =========================================================
   Meeting view
   ========================================================= */
function renderMeeting(app, m) {
  const a = m.analysis;
  m._labels = speakerLabels(S._segCache?.[m.id] || []);
  if (!a || (m.status && m.status !== 'ready')) return renderProcessing(app, m);
  const tab = S.route.tab || 'resumen';
  const tabs = [['resumen', 'Resumen'], ['mapa', 'Mapa mental'], ['brief', 'Brief'], ['transcripcion', 'Transcripción'], ['preguntar', 'Preguntar']];
  const people = (a.participants?.length ? a.participants : m.participants) || [];
  app.innerHTML = `
  <button class="btn ghost sm back" data-nav="library">${icon('back')}Reuniones</button>
  <header class="m-head">
    <div class="m-meta">
      <span>${icon('cal')}${esc(fmtDate(m.date))}</span>
      ${m.durationSec ? `<span class="mono">${icon('time')}${esc(fmtT(m.durationSec))}${m.estimatedTimes ? ' aprox.' : ''}</span>` : ''}
      ${people.length ? `<span>${icon('users')}${esc(people.join(', '))}</span>` : ''}
      <span class="chip">${esc((TEMPLATES[m.template] || TEMPLATES.general).name)}</span>
    </div>
    <h1 id="m-title" contenteditable="true" spellcheck="false" title="Toca para cambiar el título">${esc(a.title)}</h1>
    ${(a.tags || []).length ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${a.tags.map(t => `<span class="chip ${t === 'ejemplo' ? 'ex' : ''}">#${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="m-actions">
      <button class="btn sm" id="m-share">${icon('share')}Compartir</button>
      <button class="btn sm" id="m-md">${icon('download')}Exportar .md</button>
      <button class="btn sm" id="m-copy">${icon('copy')}Copiar resumen</button>
      <span style="display:inline-flex;gap:6px;align-items:center"><select id="re-tpl" class="btn sm" aria-label="Tipo de análisis">${Object.entries(TEMPLATES).map(([k, t]) => `<option value="${k}" ${m.template === k ? 'selected' : ''}>${t.name}</option>`).join('')}</select><button class="btn sm" id="re-run">${icon('refresh')}Re-analizar</button></span>
      <span id="del-slot"><button class="btn sm ghost danger" id="m-del">${icon('trash')}Eliminar</button></span>
    </div>
  </header>
  <nav class="tabs" role="tablist">${tabs.map(([k, l]) => `<button class="tab" role="tab" data-tab="${k}" aria-selected="${tab === k}">${l}</button>`).join('')}</nav>
  <section id="tab-body"></section>`;
  $$('[data-tab]').forEach(b => b.onclick = () => { history.replaceState(null, '', '#m/' + m.id + '/' + b.dataset.tab); S.route.tab = b.dataset.tab; $$('[data-tab]').forEach(x => x.setAttribute('aria-selected', x === b)); renderTab(m); });
  const h1 = $('#m-title');
  h1.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); h1.blur(); } });
  h1.addEventListener('blur', async () => { const v = h1.textContent.trim(); if (v && v !== a.title) { a.title = v; await saveMeeting(m); toast('Título actualizado'); } else h1.textContent = a.title; });
  $('#m-share').onclick = () => shareMeeting(m);
  $('#m-md').onclick = async () => downloadText(slug(a.title) + '.md', await fullMd(m));
  $('#m-copy').onclick = () => copyText(summaryText(m), 'Resumen copiado');
  $('#re-run').onclick = () => { processMeeting(m.id, { template: $('#re-tpl').value }); m.status = 'analyzing'; render(); };
  $('#m-del').onclick = () => { $('#del-slot').innerHTML = `<span class="confirm">¿Eliminar reunión, audio y acta?<button class="btn sm solid-danger" id="del-yes">Eliminar</button><button class="btn sm" id="del-no">Cancelar</button></span>`; $('#del-yes').onclick = async () => { await deleteMeeting(m.id); go(''); toast('Reunión eliminada'); }; $('#del-no').onclick = () => render(); };
  renderTab(m);
}
function renderProcessing(app, m) {
  const st = m.status || 'queued'; const running = S.running.has(m.id);
  const hasAudio = !!m.audioParts?.length;
  const steps = [];
  if (hasAudio) steps.push({ k: 'saved', t: 'Audio guardado en el dispositivo', d: `${fmtT(m.durationSec)} · ${fmtBytes(m.audioParts.reduce((a, p) => a + (p.size || 0), 0))}`, s: 'done' });
  if (hasAudio) steps.push({ k: 'tr', t: Settings.v.sttModel === 'gpt-4o-transcribe-diarize' ? 'Transcribir e identificar hablantes' : 'Transcribir', d: '', s: st === 'transcribing' ? 'run' : ((st === 'analyzing' || m.hasTranscript) ? 'done' : 'todo') });
  else steps.push({ k: 'tx', t: 'Transcripción recibida', d: '', s: 'done' });
  steps.push({ k: 'an', t: 'Crear el acta con Claude', d: '', s: st === 'analyzing' ? 'run' : 'todo' });
  if (st === 'error') { const fail = steps.find(s => s.s === 'todo' || s.s === 'run'); if (fail) fail.s = 'fail'; }
  const err = m.error;
  app.innerHTML = `
  <button class="btn ghost sm back" data-nav="library">${icon('back')}Reuniones</button>
  <div class="m-head"><div class="m-meta"><span>${icon('cal')}${esc(fmtDate(m.date))}</span>${m.durationSec ? `<span class="mono">${icon('time')}${fmtT(m.durationSec)}</span>` : ''}</div><h1>${esc(m.analysis?.title || m.titleHint || 'Nueva reunión')}</h1></div>
  <section class="panel" style="max-width:720px">
    <h2>${st === 'error' ? 'El acta necesita tu atención' : 'Preparando el acta'}</h2>
    <div class="stepper">${steps.map(s => `<div class="pstep ${s.s}"><span class="dot">${s.s === 'done' ? icon('check', 3) : s.s === 'fail' ? '!' : ''}</span><div><b>${s.t}</b><small ${s.s === 'run' ? 'id="proc-detail"' : ''}>${esc(s.s === 'run' ? (S.progress[m.id] || 'Trabajando…') : s.s === 'fail' ? (err?.message || '') : s.d)}</small></div></div>`).join('')}</div>
    ${st === 'error' ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
      <button class="btn primary" id="p-retry">${icon('refresh')}Reintentar</button>
      ${/key|no_openai|no_anthropic/.test(err?.code || '') ? `<button class="btn" data-nav="settings">${icon('key')}Ir a Ajustes</button>` : ''}
      ${hasAudio ? `<button class="btn ghost" id="p-paste">Pegar transcripción</button>` : ''}
      <button class="btn ghost danger" id="p-del">${icon('trash')}Eliminar</button></div>
      <div id="p-paste-box"></div>` : `<p class="muted" style="font-size:13px;margin-top:12px">${running ? 'Puedes revisar otras reuniones mientras tanto; mantén la app abierta hasta que termine.' : 'En cola…'}</p>`}
    ${hasAudio ? `<div style="margin-top:16px"><audio controls preload="metadata" id="p-audio" style="width:100%"></audio></div>` : ''}
  </section>
  ${(m.marks?.length || m.notesLog?.length) ? `<section class="panel" style="max-width:720px;margin-top:16px"><div class="eyebrow">Lo que marcaste</div><div class="notes-log" style="margin-top:10px">${[...(m.marks || []).map(k => ({ t: k.t, text: '★ ' + (k.label || 'Momento importante') })), ...(m.notesLog || [])].sort((a, b) => a.t - b.t).map(n => `<div><b>${fmtT(n.t)}</b><span>${esc(n.text)}</span></div>`).join('')}</div></section>` : ''}`;
  if (hasAudio) DB.get('audio', m.audioParts[0].key).then(b => { const el = $('#p-audio'); if (b && el) el.src = URL.createObjectURL(b); });
  const r = $('#p-retry'); if (r) r.onclick = () => processMeeting(m.id);
  const pd = $('#p-del'); if (pd) pd.onclick = async () => { await deleteMeeting(m.id); go(''); toast('Reunión eliminada'); };
  const pp = $('#p-paste'); if (pp) pp.onclick = () => { $('#p-paste-box').innerHTML = `<div class="field" style="margin-top:14px"><label for="pp-tx">Transcripción</label><textarea id="pp-tx" class="mono-area" rows="8" placeholder="Pega aquí el texto de la reunión"></textarea><button class="btn primary" id="pp-go" style="justify-self:start">Usar este texto</button></div>`; $('#pp-go').onclick = async () => { const p = parseTranscript($('#pp-tx').value, m.durationSec ? m.durationSec / 60 : null); if (p.segments.length < 2) { toast('Pega la transcripción completa'); return; } await DB.put('transcripts', { segments: p.segments }, m.id); processMeeting(m.id); }; };
  if (st === 'queued' && !running) processMeeting(m.id);
}

async function renderTab(m) {
  const body = $('#tab-body'); const a = m.analysis || {};
  const segs = await getSegments(m.id); S._segCache = S._segCache || {}; S._segCache[m.id] = segs; m._labels = speakerLabels(segs);
  if (!$('#tab-body')) return;
  const tab = S.route.tab || 'resumen';
  if (tab === 'resumen') return renderSummary(body, m, a, segs);
  if (tab === 'mapa') { body.innerHTML = `<div class="mm-wrap">${mindmapSVG(a.mindmap)}</div><p class="mm-note">En el celular, desliza hacia el lado para recorrer el mapa.</p>`; return; }
  if (tab === 'brief') {
    body.innerHTML = `<div class="tools-row"><button class="btn sm" id="b-copy">${icon('copy')}Copiar brief</button><button class="btn sm" id="b-dl">${icon('download')}Descargar .md</button><button class="btn sm" id="b-share">${icon('share')}Compartir</button></div><article class="brief">${md(a.brief || '_Sin brief para esta reunión._')}</article>`;
    $('#b-copy').onclick = () => copyText(a.brief || '', 'Brief copiado');
    $('#b-dl').onclick = () => downloadText(slug(a.title) + '-brief.md', a.brief || '');
    $('#b-share').onclick = () => shareText(a.title + ' — brief', a.brief || '');
    return;
  }
  if (tab === 'transcripcion') return renderTranscript(body, m, a, segs);
  if (tab === 'preguntar') return renderAsk(body, m, a, segs);
}

function box(title, color, soft, ic, items, n) { return `<div class="box"><div class="box-h"><span class="ic" style="background:${soft};color:${color}">${icon(ic, 2)}</span><h3>${title}</h3><span class="n">${n ?? ''}</span></div>${items || '<div class="empty-li">Nada registrado.</div>'}</div>`; }
function talkTime(m, segs) {
  const map = new Map(); let total = 0;
  segs.forEach(x => { if (!x.s) return; const w = wordsOf(x.text); map.set(x.s, (map.get(x.s) || 0) + w); total += w; });
  if (map.size < 2) return '';
  const rows = [...map.entries()].sort((a, b) => b[1] - a[1]);
  return `<div class="sec"><div class="sec-h"><h2>Quién habló</h2><span class="count">Proporción de palabras</span></div><div class="panel talk">${rows.map(([l, w]) => `<div class="talk-row"><span class="nm">${esc(spkName(m, l))}</span><span class="tb"><i style="width:${(w / total * 100).toFixed(1)}%;background:${tc(spkIndex(m, l))}"></i></span><span>${Math.round(w / total * 100)}%</span></div>`).join('')}</div></div>`;
}
function renderSummary(body, m, a, segs) {
  const acts = a.actions || []; const done = acts.filter(x => x.done).length;
  const dur = m.durationSec || segDuration(segs);
  const sevC = s => s === 'alta' ? 'var(--risk)' : s === 'media' ? 'var(--idea)' : 'var(--muted)';
  const sevS = s => s === 'alta' ? 'var(--risk-soft)' : s === 'media' ? 'var(--idea-soft)' : 'var(--surface-2)';
  const marks = m.marks || [];
  body.innerHTML = `
  <div class="tldr"><div class="eyebrow">En pocas palabras</div><p>${esc(a.tldr)}</p>
    ${a.mood ? `<div class="mood"><b>${esc(a.mood.label)}</b><span class="track"><i style="width:${a.mood.score}%"></i></span><span>${esc(a.mood.note)}</span></div>` : ''}</div>
  <div class="stats">
    <div class="stat"><b class="mono">${dur ? fmtT(dur) : '—'}</b><span>Duración${m.estimatedTimes ? ' aprox.' : ''}</span></div>
    <div class="stat"><b>${nf(m.words || wordCount(segs))}</b><span>Palabras</span></div>
    <div class="stat"><b>${(a.decisions || []).length}</b><span>Decisiones</span></div>
    <div class="stat"><b>${done}<span style="font-size:17px;color:var(--muted)">/${acts.length}</span></b><span>Tareas hechas</span></div>
    <div class="stat"><b>${(a.topics || []).length}</b><span>Temas</span></div>
  </div>
  ${(a.topics || []).length ? `<div class="sec"><div class="sec-h"><h2>Recorrido de la conversación</h2><span class="count">Toca un tema para ir a ese momento</span></div>
    <div class="timeline">${timelineHTML(a.topics, dur)}<svg class="density" id="dens" preserveAspectRatio="none" aria-hidden="true"></svg>
    ${marks.length ? `<div class="tl-marks">${marks.map(k => `<button data-jump="${k.t}" style="left:${Math.min(100, k.t / dur * 100)}%" title="${esc(k.label || 'Momento marcado')} · ${fmtT(k.t)}">${icon('bookmark', 2)}</button>`).join('')}</div>` : ''}
    <div class="tl-axis mono"><span>0:00</span><span>${fmtT(dur / 2)}</span><span>${fmtT(dur)}</span></div>
    <div class="tl-legend">${a.topics.map((t, i) => `<span><i style="background:${tc(i)}"></i>${esc(t.name)} <em>${fmtT(t.start)}</em></span>`).join('')}${marks.length ? `<span>${icon('bookmark', 2, 12)}Tus marcas</span>` : ''}</div></div></div>` : ''}
  ${(a.keyPoints || []).length ? `<div class="sec"><div class="sec-h"><h2>Puntos clave</h2></div><div class="g3">${a.keyPoints.map(k => `<div class="kp"><span class="kp-ic">${icon(k.icon)}</span><h4>${esc(k.title)}</h4><p>${esc(k.detail)}</p></div>`).join('')}</div></div>` : ''}
  <div class="sec g2">
    ${box('Decisiones', 'var(--dec)', 'var(--dec-soft)', 'flag', (a.decisions || []).map(d => `<div class="li"><span class="mk" style="background:var(--dec)"></span><div>${esc(d.text)}${d.why ? `<small>${esc(d.why)}</small>` : ''}</div></div>`).join(''), (a.decisions || []).length)}
    <div class="box"><div class="box-h"><span class="ic" style="background:var(--act-soft);color:var(--act)">${icon('check', 2.2)}</span><h3>Tareas</h3><span class="n">${done} de ${acts.length} hechas</span></div>
      ${acts.length ? acts.map((t, i) => taskHTML(t, `${m.id}|${i}`)).join('') : '<div class="empty-li">Nada registrado.</div>'}</div>
  </div>
  <div class="sec g3">
    ${box('Ideas', 'var(--idea)', 'var(--idea-soft)', 'idea', (a.ideas || []).map(d => `<div class="li"><span class="mk" style="background:var(--idea)"></span><div>${esc(d.text)}${d.note ? `<small>${esc(d.note)}</small>` : ''}</div></div>`).join(''), (a.ideas || []).length)}
    ${box('Riesgos', 'var(--risk)', 'var(--risk-soft)', 'risk', (a.risks || []).map(d => `<div class="li"><span class="mk" style="background:${sevC(d.severity)}"></span><div>${esc(d.text)}<span class="sev" style="background:${sevS(d.severity)};color:${sevC(d.severity)}">${d.severity}</span></div></div>`).join(''), (a.risks || []).length)}
    ${box('Preguntas abiertas', 'var(--q)', 'var(--q-soft)', 'question', (a.questions || []).map(d => `<div class="li"><span class="mk" style="background:var(--q)"></span><div>${esc(d.text)}</div></div>`).join(''), (a.questions || []).length)}
  </div>
  ${talkTime(m, segs)}
  ${(a.numbers || []).length ? `<div class="sec"><div class="sec-h"><h2>Cifras mencionadas</h2></div><div class="nums">${a.numbers.map(n => `<div class="num"><b>${esc(n.value)}</b><span>${esc(n.label)}</span></div>`).join('')}</div></div>` : ''}
  ${(a.quotes || []).length ? `<div class="sec"><div class="sec-h"><h2>Frases para recordar</h2></div><div class="quotes">${a.quotes.map(q => `<figure class="quote"><p>“${esc(q.text)}”</p><small>${esc(q.who)}${q.t != null ? ` · <button class="tlink" data-jump="${q.t}">${fmtT(q.t)}</button>` : ''}</small></figure>`).join('')}</div></div>` : ''}
  ${(a.nextSteps || []).length ? `<div class="sec"><div class="sec-h"><h2>Próximos pasos</h2></div><div class="steps">${a.nextSteps.map(s => `<div class="step"><span>${esc(s)}</span></div>`).join('')}</div></div>` : ''}`;
  drawDensity(m, segs, dur);
  bindTasks(body);
  $$('[data-topic],[data-jump]', body).forEach(b => b.onclick = () => { S.jump = +(b.dataset.topic ?? b.dataset.jump); S.route.tab = 'transcripcion'; history.replaceState(null, '', '#m/' + m.id + '/transcripcion'); $$('[data-tab]').forEach(x => x.setAttribute('aria-selected', x.dataset.tab === 'transcripcion')); renderTab(m); });
}
function taskHTML(t, ref, extra = '') {
  return `<label class="task ${t.done ? 'done' : ''}"><input type="checkbox" data-task="${esc(ref)}" ${t.done ? 'checked' : ''}><div><div class="tx">${esc(t.task)}</div><div class="sub"><span>${icon('users')} ${esc(t.owner)}</span>${t.due ? `<span>${icon('cal')} ${esc(t.due)}</span>` : ''}${extra}</div></div><span class="prio ${t.priority}">${t.priority}</span></label>`;
}
function bindTasks(root) {
  $$('[data-task]', root).forEach(cb => cb.onchange = async () => {
    const [id, i] = cb.dataset.task.split('|'); const m = meetingById(id); if (!m?.analysis) return;
    m.analysis.actions[+i].done = cb.checked; cb.closest('.task').classList.toggle('done', cb.checked);
    await saveMeeting(m);
    const n = cb.closest('.box')?.querySelector('.n'); if (n) { const acts = m.analysis.actions; n.textContent = `${acts.filter(x => x.done).length} de ${acts.length} hechas`; }
  });
}
function timelineHTML(topics, dur) {
  const total = dur || topics[topics.length - 1].end || 1;
  return `<div class="tl-bar">${topics.map((t, i) => { const w = Math.max(2, (Math.max(1, t.end - t.start)) / total * 100); return `<button data-topic="${t.start}" style="flex:${w} 1 0;background:${tc(i)}" title="${esc(t.name)} · ${fmtT(t.start)}–${fmtT(t.end)}${t.summary ? ' · ' + esc(t.summary) : ''}">${esc(t.name)}</button>`; }).join('')}</div>`;
}
function drawDensity(m, segs, dur) {
  const svg = $('#dens'); if (!svg || !segs.length) return;
  const N = 72; const b = new Array(N).fill(0);
  segs.forEach(x => { const k = Math.min(N - 1, Math.floor(x.t / dur * N)); b[k] += wordsOf(x.text); });
  const max = Math.max(...b, 1); const W = 720, H = 46, bw = W / N; const topics = m.analysis?.topics || [];
  const colorAt = sec => { const i = topics.findIndex(t => sec >= t.start && sec < t.end); return i < 0 ? 'var(--faint)' : tc(i); };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = b.map((v, i) => { const h = Math.max(2, v / max * (H - 4)); return `<rect x="${i * bw + 1}" y="${(H - h) / 2}" width="${Math.max(1, bw - 2.5)}" height="${h}" rx="1.5" fill="${colorAt((i + .5) / N * dur)}" opacity="${v ? .85 : .25}"/>`; }).join('');
}

/* mind map */
function wrapLabel(s, max) { const w = String(s).split(/\s+/); const lines = []; let cur = ''; w.forEach(x => { if ((cur + ' ' + x).trim().length > max && cur) { lines.push(cur); cur = x; } else cur = (cur + ' ' + x).trim(); }); if (cur) lines.push(cur); return lines.slice(0, 3); }
function mindmapSVG(mm) {
  if (!mm || !mm.branches?.length) return `<div class="empty-li" style="padding:28px">Sin mapa mental para esta reunión.</div>`;
  const W = 1100, H = 700, cx = W / 2, cy = H / 2, R1 = 215, R2 = 365; const n = mm.branches.length; let out = ''; const nodes = [];
  mm.branches.forEach((b, i) => {
    const ang = -Math.PI / 2 + i * 2 * Math.PI / n;
    const bx = cx + Math.cos(ang) * R1 * 1.25, by = cy + Math.sin(ang) * R1 * .82; const col = tc(i);
    out += `<path d="M${cx} ${cy} Q ${cx + Math.cos(ang) * R1 * .55} ${cy + Math.sin(ang) * R1 * .2}, ${bx} ${by}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" opacity=".7"/>`;
    const k = b.children.length; const spread = Math.min(1.25, 0.42 * Math.max(1, k - 1) + 0.2);
    b.children.forEach((c, j) => {
      const a2 = ang + (k === 1 ? 0 : (-spread / 2 + spread * j / (k - 1)));
      const lx = cx + Math.cos(a2) * R2 * 1.32, ly = cy + Math.sin(a2) * R2 * .84;
      out += `<path d="M${bx} ${by} Q ${(bx + lx) / 2} ${by}, ${lx} ${ly}" fill="none" stroke="${col}" stroke-width="1.5" opacity=".45"/>`;
      nodes.push({ x: lx, y: ly, text: c, col, leaf: true, right: Math.cos(a2) >= -0.05 });
    });
    nodes.push({ x: bx, y: by, text: b.label, col, leaf: false });
  });
  const txt = (lines, x, y, size, weight, fill, fam = 'IBM Plex Sans, system-ui, sans-serif') => `<text x="${x}" y="${y - (lines.length - 1) * size * .6}" text-anchor="middle" font-family="${fam}" font-size="${size}" font-weight="${weight}" fill="${fill}">${lines.map((l, i) => `<tspan x="${x}" dy="${i ? size * 1.2 : 0}">${esc(l)}</tspan>`).join('')}</text>`;
  nodes.filter(x => x.leaf).forEach(nd => { const lines = wrapLabel(nd.text, 20); const tw = Math.max(...lines.map(l => l.length)) * 7.4 + 20; const th = lines.length * 16 + 12; let x0 = nd.right ? nd.x : nd.x - tw; x0 = Math.max(6, Math.min(W - tw - 6, x0)); out += `<rect x="${x0}" y="${nd.y - th / 2}" width="${tw}" height="${th}" rx="8" fill="var(--surface)" stroke="${nd.col}" stroke-opacity=".55"/>` + txt(lines, x0 + tw / 2, nd.y + 4.5, 13, 400, 'var(--ink)'); });
  nodes.filter(x => !x.leaf).forEach(nd => { const lines = wrapLabel(nd.text, 16); const tw = Math.max(...lines.map(l => l.length)) * 8.6 + 28; const th = lines.length * 18 + 16; out += `<rect x="${nd.x - tw / 2}" y="${nd.y - th / 2}" width="${tw}" height="${th}" rx="10" fill="${nd.col}"/>` + txt(lines, nd.x, nd.y + 5, 14.5, 600, 'var(--bg)'); });
  const cl = wrapLabel(mm.center, 16); const cw = Math.max(...cl.map(l => l.length)) * 11 + 44, ch = cl.length * 24 + 26;
  out += `<rect x="${cx - cw / 2}" y="${cy - ch / 2}" width="${cw}" height="${ch}" rx="14" fill="var(--ink)"/>` + txt(cl, cx, cy + 7, 20, 700, 'var(--bg)', 'Bricolage Grotesque, system-ui, sans-serif');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa mental: ${esc(mm.center)}">${out}</svg>`;
}

/* transcript tab */
function renderTranscript(body, m, a, segs) {
  const labels = m._labels; const topics = a.topics || []; const hasAudio = !!m.audioParts?.length;
  body.innerHTML = `
  ${hasAudio ? `<div class="player" id="player"><button class="pp" id="pp" aria-label="Reproducir">${icon('play', 2)}</button><span class="time mono" id="p-time">0:00</span><input type="range" id="p-seek" min="0" max="${Math.max(1, Math.round(m.durationSec || segDuration(segs)))}" step="1" value="0" aria-label="Posición del audio"><span class="time mono">${fmtT(m.durationSec || segDuration(segs))}</span><select id="p-rate" aria-label="Velocidad">${[1, 1.25, 1.5, 2].map(r => `<option value="${r}" ${(Player.rate || 1) === r ? 'selected' : ''}>${r}×</option>`).join('')}</select><audio id="p-el" preload="metadata"></audio></div>` : ''}
  ${labels.length ? `<div class="speakers"><span class="muted" style="font-size:12.5px">Hablantes:</span>${labels.map(l => `<label class="spk"><i style="background:${tc(spkIndex(m, l))}"></i><input data-spk="${esc(l)}" value="${esc(spkName(m, l))}" aria-label="Nombre de ${esc(l)}"></label>`).join('')}<span class="muted" style="font-size:12px">Toca un nombre para corregirlo.</span></div>` : ''}
  <div class="tr-tools"><div class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="trq" type="search" placeholder="Buscar en la transcripción" value="${esc(S.trq)}" aria-label="Buscar en la transcripción"></div><span id="tr-count" class="muted" style="font-size:13px"></span>
  ${hasAudio ? `<label class="switch" style="align-items:center"><input type="checkbox" id="follow" ${Settings.v.followAudio ? 'checked' : ''}><span style="font-size:13px">Seguir el audio</span></label>` : ''}
  <button class="btn sm" id="tr-copy" style="margin-left:auto">${icon('copy')}Copiar texto</button></div>
  <div class="tr" id="tr"></div>`;
  const marks = [...(m.marks || []).map(k => ({ t: k.t, text: k.label || 'Momento marcado', kind: 'mark' })), ...(m.notesLog || []).map(n => ({ t: n.t, text: n.text, kind: 'note' }))].sort((x, y) => x.t - y.t);
  const draw = () => {
    const q = S.trq.trim().toLowerCase(); let html = '', ti = -1, hits = 0, mi = 0;
    const rx = q ? new RegExp(esc(S.trq.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') : null;
    segs.forEach((x, k) => {
      if (!q) {
        const idx = topics.findIndex(t => x.t >= t.start && x.t < t.end);
        if (idx !== ti && idx >= 0) { ti = idx; html += `<div class="seg-topic" style="color:${tc(idx)}"><i style="background:${tc(idx)}"></i>${esc(topics[idx].name)}</div>`; }
        while (mi < marks.length && marks[mi].t <= x.t) { const mk = marks[mi++]; html += `<div class="seg-mark">${icon(mk.kind === 'mark' ? 'bookmark' : 'edit', 2)}<span class="mono" style="font-size:12px">${fmtT(mk.t)}</span><span>${esc(mk.text)}</span></div>`; }
      } else if (!x.text.toLowerCase().includes(q) && !spkName(m, x.s).toLowerCase().includes(q)) return;
      hits++;
      let t = esc(x.text); if (rx) t = t.replace(rx, s => `<mark>${s}</mark>`);
      html += `<div class="seg" id="seg-${k}" data-t="${x.t}"><button class="tlink" data-play="${x.t}">${fmtT(x.t)}</button><div>${x.s ? `<span class="who" style="color:${tc(spkIndex(m, x.s))}">${esc(spkName(m, x.s))}</span>` : ''}${t}</div></div>`;
    });
    $('#tr').innerHTML = html || '<div class="empty-li">Sin coincidencias.</div>';
    $('#tr-count').textContent = q ? `${hits} ${hits === 1 ? 'coincidencia' : 'coincidencias'}` : `${segs.length} intervenciones`;
    $$('[data-play]').forEach(b => b.onclick = () => { if (hasAudio) Player.seek(+b.dataset.play); else toast('Esta reunión no tiene audio guardado.'); });
  };
  draw();
  $('#trq').addEventListener('input', e => { S.trq = e.target.value; draw(); });
  $('#tr-copy').onclick = () => copyText(segs.map(x => `[${fmtT(x.t)}] ${x.s ? spkName(m, x.s) + ': ' : ''}${x.text}`).join('\n'), 'Transcripción copiada');
  $$('[data-spk]').forEach(inp => inp.addEventListener('change', async () => { const l = inp.dataset.spk; const v = inp.value.trim(); m.speakers = m.speakers || {}; m.speakersEdited = m.speakersEdited || {}; if (v) m.speakers[l] = v; else delete m.speakers[l]; m.speakersEdited[l] = true; await saveMeeting(m); draw(); toast('Nombre actualizado'); }));
  if (hasAudio) {
    const el = $('#p-el'); const seek = $('#p-seek'); let lastIdx = -1; let dragging = false;
    Player.attach(m, el);
    Player.onState = playing => { const b = $('#pp'); if (b) { b.innerHTML = icon(playing ? 'pause' : 'play', 2); b.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir'); } };
    Player.onTime = t => {
      if (!$('#p-time')) return; $('#p-time').textContent = fmtT(t); if (!dragging) seek.value = Math.round(t);
      let idx = -1; for (let k = 0; k < segs.length; k++) { if (segs[k].t <= t + .3) idx = k; else break; }
      if (idx !== lastIdx) { $('#seg-' + lastIdx)?.classList.remove('now'); const el2 = $('#seg-' + idx); el2?.classList.add('now'); lastIdx = idx; if (el2 && Settings.v.followAudio && !el.paused) el2.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    };
    $('#pp').onclick = () => Player.toggle();
    seek.addEventListener('input', () => { dragging = true; $('#p-time').textContent = fmtT(+seek.value); });
    seek.addEventListener('change', () => { dragging = false; Player.seek(+seek.value, !el.paused); });
    $('#p-rate').onchange = e => Player.setRate(+e.target.value);
    $('#follow').onchange = e => Settings.set({ followAudio: e.target.checked });
  }
  if (S.jump != null) {
    const target = $$('.seg').find(el => +el.dataset.t >= S.jump - .5); const t = S.jump; S.jump = null;
    if (target) { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); target.classList.add('now'); setTimeout(() => target.classList.remove('now'), 1800); }
    if (hasAudio) Player.seek(t, false);
  }
}

/* ask tab */
function renderAsk(body, m, a, segs) {
  const chat = S.chats[m.id] || (S.chats[m.id] = []);
  const sugs = ['¿Qué quedó pendiente y quién lo tiene?', 'Redacta un correo de seguimiento para los participantes', '¿Qué riesgos no se conversaron y deberían revisarse?', 'Arma un plan de trabajo de 4 semanas', '¿Qué preguntas llevo a la próxima reunión?'];
  body.innerHTML = `<div class="ask">
    ${chat.length ? '' : `<p class="muted">Pregúntale a esta reunión lo que necesites. Claude responde con la transcripción completa y el acta.</p><div class="sugs">${sugs.map(s => `<button class="sug" data-sug="${esc(s)}">${esc(s)}</button>`).join('')}</div>`}
    <div class="msgs" id="msgs">${chat.map((c, i) => `<div class="msg ${c.role === 'user' ? 'u' : 'a'}">${esc(c.content)}</div>${c.role === 'assistant' ? `<div class="msg-tools"><button class="btn sm ghost" data-cp="${i}">${icon('copy')}Copiar</button></div>` : ''}`).join('')}</div>
    <form class="ask-in" id="ask-f"><textarea id="ask-q" rows="1" placeholder="Escribe tu pregunta…" aria-label="Tu pregunta"></textarea><button class="btn primary" ${Settings.v.anthropicKey ? '' : 'disabled'}>Preguntar</button></form>
    ${Settings.v.anthropicKey ? '' : `<p class="notice">Agrega tu clave de Claude en <button class="btn sm" data-nav="settings">Ajustes</button> para preguntar.</p>`}
  </div>`;
  $$('[data-cp]', body).forEach(b => b.onclick = () => copyText(chat[+b.dataset.cp].content, 'Respuesta copiada'));
  let busy = false;
  const ask = async q => {
    if (!q.trim() || busy || !Settings.v.anthropicKey) return; busy = true;
    chat.push({ role: 'user', content: q.trim() }); renderAsk(body, m, a, segs);
    const box = document.createElement('div'); box.className = 'msg a'; box.textContent = 'Pensando…'; $('#msgs').appendChild(box); box.scrollIntoView({ block: 'end', behavior: 'smooth' });
    const ctx = `Eres el asistente de esta reunión. Responde en español de Chile, directo y útil, en texto plano (listas con guiones si ayudan, sin markdown pesado). Basa tus respuestas en la reunión; si algo no se dijo, acláralo. Puedes proponer ideas propias si te las piden, separándolas de lo conversado.\n\nActa:\n${JSON.stringify({ ...a, brief: undefined, speakers: undefined })}\n\nTranscripción:\n${transcriptText(m, segs)}`;
    try {
      const r = await claude({ system: [{ type: 'text', text: ctx, cache_control: { type: 'ephemeral' } }], messages: chat.map(c => ({ role: c.role, content: c.content })), max_tokens: 4000, onText: t => { box.textContent = t; } });
      chat.push({ role: 'assistant', content: r.text || '(sin respuesta)' });
    } catch (e) { chat.pop(); toast(e.message || 'No se pudo responder', 5000); }
    busy = false; if (S.route.view === 'meeting' && S.route.id === m.id && S.route.tab === 'preguntar') renderAsk(body, m, a, segs);
  };
  $$('[data-sug]', body).forEach(b => b.onclick = () => ask(b.dataset.sug));
  $('#ask-f').onsubmit = e => { e.preventDefault(); ask($('#ask-q').value); };
  $('#ask-q').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(e.target.value); } });
}

/* =========================================================
   Tasks view (all meetings)
   ========================================================= */
function renderTasks(app) {
  const ready = S.meetings.filter(m => m.analysis?.actions?.length);
  const owners = [...new Set(ready.flatMap(m => m.analysis.actions.map(t => t.owner)))].sort();
  const pend = ready.reduce((a, m) => a + m.analysis.actions.filter(t => !t.done).length, 0);
  const groups = ready.map(m => ({ m, items: m.analysis.actions.map((t, i) => ({ t, i })).filter(({ t }) => (S.taskFilter === 'all' || !t.done) && (!S.ownerFilter || t.owner === S.ownerFilter)) })).filter(g => g.items.length);
  app.innerHTML = `
  <div class="page-head"><div><div class="eyebrow">Todas tus reuniones</div><h1>Tareas</h1><p>${pend} ${pend === 1 ? 'pendiente' : 'pendientes'} en ${ready.length} ${ready.length === 1 ? 'reunión' : 'reuniones'}.</p></div></div>
  <div class="tools-row">
    <div class="seg-ctl" role="group" aria-label="Filtro"><button data-tf="pending" aria-pressed="${S.taskFilter === 'pending'}">Pendientes</button><button data-tf="all" aria-pressed="${S.taskFilter === 'all'}">Todas</button></div>
    ${owners.length ? `<select id="t-owner" class="btn sm" aria-label="Responsable"><option value="">Todos los responsables</option>${owners.map(o => `<option ${S.ownerFilter === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : ''}
  </div>
  ${groups.length ? groups.map(({ m, items }) => `<section class="tgroup"><h3><button data-open="${esc(m.id)}">${esc(m.analysis.title)}</button><small>${esc(fmtDate(m.date))}</small></h3><div class="box">${items.map(({ t, i }) => taskHTML(t, `${m.id}|${i}`)).join('')}</div></section>`).join('')
    : `<div class="empty">${icon('check', 1.6, 34)}<h3>${ready.length ? 'Todo al día' : 'Sin tareas todavía'}</h3><p>${ready.length ? 'No hay tareas pendientes con este filtro.' : 'Las tareas aparecen aquí cuando Acta procesa tus reuniones.'}</p></div>`}`;
  $$('[data-tf]').forEach(b => b.onclick = () => { S.taskFilter = b.dataset.tf; render(); });
  const so = $('#t-owner'); if (so) so.onchange = e => { S.ownerFilter = e.target.value; render(); };
  $$('[data-open]', app).forEach(b => b.onclick = () => go('m/' + b.dataset.open));
  bindTasks(app);
}

/* =========================================================
   Settings
   ========================================================= */
async function renderSettings(app) {
  const v = Settings.v;
  let est = null; try { est = await navigator.storage?.estimate?.(); } catch {}
  let persisted = false; try { persisted = await navigator.storage?.persisted?.(); } catch {}
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  app.innerHTML = `
  <div class="page-head"><div><div class="eyebrow">Ajustes</div><h1>Configura Acta</h1><p>Todo queda guardado solo en este dispositivo.</p></div></div>
  <div class="set-grid">
    ${standalone ? '' : `<section class="panel howto"><h2>Instálala en tu celular</h2><ol style="margin-top:10px"><li><b>iPhone (Safari):</b> botón Compartir → <b>Agregar a pantalla de inicio</b>.</li><li><b>Android (Chrome):</b> menú ⋮ → <b>Instalar aplicación</b>.</li></ol><p class="muted" style="font-size:13px;margin-top:10px">Así se abre a pantalla completa, funciona sin conexión para revisar tus actas y aparece junto a tus otras apps.</p></section>`}
    <section class="panel">
      <h2>Claves de servicio</h2>
      <p class="muted" style="font-size:13.5px;margin-top:6px">Acta usa tu propia cuenta: pagas solo lo que usas, directo al proveedor. Las claves no salen de este dispositivo salvo para llamar a cada servicio.</p>
      <div class="form">
        <div class="field"><label for="k-anthropic">Claude (Anthropic) — análisis y preguntas</label>
          <div class="key-row"><input id="k-anthropic" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-…" value="${esc(v.anthropicKey)}"><button class="btn" id="t-anthropic" type="button">Probar</button></div>
          <span class="hint" id="r-anthropic">Créala en console.anthropic.com → API Keys.</span></div>
        <div class="field"><label for="k-openai">OpenAI — transcripción con hablantes</label>
          <div class="key-row"><input id="k-openai" type="password" autocomplete="off" spellcheck="false" placeholder="sk-…" value="${esc(v.openaiKey)}"><button class="btn" id="t-openai" type="button">Probar</button></div>
          <span class="hint" id="r-openai">Créala en platform.openai.com → API keys. Sin esta clave, Acta usa el dictado del teléfono (menos preciso y sin hablantes).</span></div>
      </div>
    </section>
    <section class="panel">
      <h2>Inteligencia</h2>
      <div class="form">
        <div class="row two">
          <div class="field"><label for="s-claude">Modelo de Claude</label><select id="s-claude">${CLAUDE_MODELS.map(([k, l]) => `<option value="${k}" ${v.claudeModel === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label for="s-stt">Transcripción</label><select id="s-stt">${STT_MODELS.map(([k, l]) => `<option value="${k}" ${v.sttModel === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
        <div class="row two">
          <div class="field"><label for="s-lang">Idioma de las reuniones</label><select id="s-lang"><option value="es" ${v.language === 'es' ? 'selected' : ''}>Español</option><option value="en" ${v.language === 'en' ? 'selected' : ''}>Inglés</option><option value="pt" ${v.language === 'pt' ? 'selected' : ''}>Portugués</option><option value="auto" ${v.language === 'auto' ? 'selected' : ''}>Detectar automáticamente</option></select></div>
          <div class="field"><label for="s-br">Calidad de grabación</label><select id="s-br"><option value="32000" ${+v.bitrate === 32000 ? 'selected' : ''}>Estándar · voz clara, ~14 MB por hora</option><option value="64000" ${+v.bitrate === 64000 ? 'selected' : ''}>Alta · ~29 MB por hora</option></select></div>
        </div>
        <label class="switch"><input type="checkbox" id="s-cap" ${v.captions ? 'checked' : ''}><span><b>Subtítulos en vivo</b><small>Muestra el texto mientras grabas, usando el dictado del teléfono. En algunos Android puede interferir con el micrófono.</small></span></label>
      </div>
    </section>
    <section class="panel">
      <h2>Apariencia</h2>
      <div class="seg-ctl" style="margin-top:12px" role="group" aria-label="Tema">${[['system', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([k, l]) => `<button data-theme-set="${k}" aria-pressed="${v.theme === k}">${l}</button>`).join('')}</div>
    </section>
    <section class="panel">
      <h2>Almacenamiento y respaldo</h2>
      ${est ? `<div style="margin-top:12px;display:grid;gap:8px"><div class="store-bar"><i style="width:${Math.min(100, est.usage / est.quota * 100).toFixed(1)}%"></i></div><span class="muted" style="font-size:13px">${fmtBytes(est.usage)} usados de ${fmtBytes(est.quota)} disponibles${persisted ? ' · protegido contra borrado automático' : ''}</span></div>` : ''}
      <div class="tools-row" style="margin-top:14px">
        ${persisted ? '' : `<button class="btn sm" id="s-persist">${icon('pin')}Proteger mis datos</button>`}
        <button class="btn sm" id="s-export">${icon('download')}Exportar respaldo</button>
        <span class="btn sm filebtn">${icon('upload')}Importar respaldo<input type="file" id="s-import" accept="application/json,.json"></span>
      </div>
      <p class="muted" style="font-size:12.5px">El respaldo incluye actas, transcripciones y tareas (no el audio).</p>
      <div style="margin-top:14px" id="wipe-slot"><button class="btn sm ghost danger" id="s-wipe">${icon('trash')}Borrar todo</button></div>
    </section>
    <section class="panel howto"><h2>Privacidad</h2><ol style="margin-top:10px">
      <li>Tus reuniones, audios y actas viven en este dispositivo.</li>
      <li>El audio se envía a OpenAI solo para transcribirlo; el texto se envía a Anthropic solo para crear el acta y responder preguntas.</li>
      <li>Avísales a los participantes que estás grabando.</li></ol></section>
    <p class="status-line">Acta 1.0</p>
  </div>`;
  const keyIn = (id, k) => $(id).addEventListener('change', e => { Settings.set({ [k]: e.target.value.trim() }); toast('Clave guardada'); });
  keyIn('#k-anthropic', 'anthropicKey'); keyIn('#k-openai', 'openaiKey');
  $('#t-anthropic').onclick = async () => {
    Settings.set({ anthropicKey: $('#k-anthropic').value.trim() }); const r = $('#r-anthropic'); r.textContent = 'Probando…';
    try { await claude({ messages: [{ role: 'user', content: 'Responde solo: ok' }], max_tokens: 5 }); r.innerHTML = `<span class="ok-badge">${icon('check', 2.4, 14)}Conectado con ${esc(Settings.v.claudeModel)}</span>`; }
    catch (e) { r.innerHTML = `<span class="ok-badge bad">${esc(e.message || 'No funcionó')}</span>`; }
  };
  $('#t-openai').onclick = async () => {
    Settings.set({ openaiKey: $('#k-openai').value.trim() }); const r = $('#r-openai'); r.textContent = 'Probando…';
    try { const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer ' + Settings.v.openaiKey } }); if (!res.ok) throw new Error(res.status === 401 ? 'La clave no es válida' : 'Error ' + res.status); r.innerHTML = `<span class="ok-badge">${icon('check', 2.4, 14)}Conectado</span>`; }
    catch (e) { r.innerHTML = `<span class="ok-badge bad">${esc(e.message === 'Failed to fetch' ? 'Sin conexión con OpenAI' : e.message)}</span>`; }
  };
  $('#s-claude').onchange = e => Settings.set({ claudeModel: e.target.value });
  $('#s-stt').onchange = e => Settings.set({ sttModel: e.target.value });
  $('#s-lang').onchange = e => Settings.set({ language: e.target.value });
  $('#s-br').onchange = e => Settings.set({ bitrate: +e.target.value });
  $('#s-cap').onchange = e => Settings.set({ captions: e.target.checked });
  $$('[data-theme-set]').forEach(b => b.onclick = () => { Settings.set({ theme: b.dataset.themeSet }); $$('[data-theme-set]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  const sp = $('#s-persist'); if (sp) sp.onclick = async () => { let ok = false; try { ok = await navigator.storage.persist(); } catch {} toast(ok ? 'Tus datos quedaron protegidos' : 'El navegador no lo permitió. Instalar la app suele habilitarlo.'); renderSettings(app); };
  $('#s-export').onclick = exportBackup;
  $('#s-import').onchange = e => importBackup(e.target.files[0]);
  $('#s-wipe').onclick = () => { $('#wipe-slot').innerHTML = `<span class="confirm">Se borrarán todas las reuniones, audios y actas de este dispositivo.<button class="btn sm solid-danger" id="w-yes">Borrar todo</button><button class="btn sm" id="w-no">Cancelar</button></span>`; $('#w-yes').onclick = async () => { await DB.clearAll(); S.meetings = []; toast('Datos borrados'); renderSettings(app); }; $('#w-no').onclick = () => renderSettings(app); };
}
async function exportBackup() {
  const meetings = await DB.all('meetings'); const transcripts = {};
  for (const m of meetings) { const t = await DB.get('transcripts', m.id); if (t) transcripts[m.id] = t.segments; }
  const data = { app: 'acta', version: 1, exportedAt: new Date().toISOString(), meetings: meetings.map(m => ({ ...m, audioParts: [] })), transcripts };
  downloadText(`acta-respaldo-${today()}.json`, JSON.stringify(data), 'application/json');
}
async function importBackup(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text()); if (data.app !== 'acta' || !Array.isArray(data.meetings)) throw new Error();
    let n = 0;
    for (const m of data.meetings) { if (!m.id) continue; const exists = await DB.get('meetings', m.id); if (exists) continue; m.audioParts = []; await DB.put('meetings', m); if (data.transcripts?.[m.id]) await DB.put('transcripts', { segments: data.transcripts[m.id] }, m.id); n++; }
    await loadMeetings(); toast(n ? `${n} ${n === 1 ? 'reunión importada' : 'reuniones importadas'}` : 'No había reuniones nuevas en el respaldo');
  } catch { toast('Ese archivo no es un respaldo de Acta.'); }
}

/* =========================================================
   Export / share
   ========================================================= */
function summaryText(m) {
  const a = m.analysis || {}; const L = [];
  L.push(`${a.title} — ${fmtDate(m.date)}`, '', a.tldr, '');
  if (a.decisions?.length) { L.push('Decisiones:'); a.decisions.forEach(d => L.push('- ' + d.text)); L.push(''); }
  if (a.actions?.length) { L.push('Tareas:'); a.actions.forEach(t => L.push(`- [${t.done ? 'x' : ' '}] ${t.task} — ${t.owner}${t.due ? ' · ' + t.due : ''}`)); L.push(''); }
  if (a.nextSteps?.length) { L.push('Próximos pasos:'); a.nextSteps.forEach((s, i) => L.push(`${i + 1}. ${s}`)); }
  return L.join('\n').trim();
}
async function fullMd(m) {
  const a = m.analysis || {}; const segs = await getSegments(m.id); const L = [];
  const people = (a.participants?.length ? a.participants : m.participants) || [];
  L.push(`# ${a.title}`, '', `**Fecha:** ${fmtDate(m.date)}${m.durationSec ? ` · **Duración:** ${fmtT(m.durationSec)}` : ''}${people.length ? ` · **Participantes:** ${people.join(', ')}` : ''}`, '');
  if (a.tags?.length) L.push(a.tags.map(t => '#' + t).join(' '), '');
  L.push('## Resumen', '', a.tldr, '');
  const sec = (t, arr, f) => { if (arr?.length) { L.push(`## ${t}`, ''); arr.forEach(x => L.push(f(x))); L.push(''); } };
  sec('Puntos clave', a.keyPoints, k => `- **${k.title}:** ${k.detail}`);
  sec('Temas', a.topics, t => `- \`${fmtT(t.start)}\` **${t.name}** — ${t.summary}`);
  sec('Decisiones', a.decisions, d => `- ${d.text}${d.why ? ` _(${d.why})_` : ''}`);
  sec('Tareas', a.actions, t => `- [${t.done ? 'x' : ' '}] ${t.task} — **${t.owner}**${t.due ? ` · ${t.due}` : ''} · prioridad ${t.priority}`);
  sec('Ideas', a.ideas, d => `- ${d.text}${d.note ? ` — ${d.note}` : ''}`);
  sec('Riesgos', a.risks, d => `- (${d.severity}) ${d.text}`);
  sec('Preguntas abiertas', a.questions, d => `- ${d.text}`);
  sec('Cifras', a.numbers, d => `- **${d.value}** — ${d.label}`);
  sec('Citas', a.quotes, q => `> "${q.text}" — ${q.who}${q.t != null ? ` (${fmtT(q.t)})` : ''}`);
  sec('Momentos marcados', m.marks, k => `- \`${fmtT(k.t)}\` ${k.label || 'Momento importante'}`);
  sec('Notas', m.notesLog, n => `- \`${fmtT(n.t)}\` ${n.text}`);
  if (a.nextSteps?.length) { L.push('## Próximos pasos', ''); a.nextSteps.forEach((s, i) => L.push(`${i + 1}. ${s}`)); L.push(''); }
  if (a.mindmap) { L.push('## Mapa mental', '', `- **${a.mindmap.center}**`); a.mindmap.branches.forEach(b => { L.push(`  - ${b.label}`); b.children.forEach(c => L.push(`    - ${c}`)); }); L.push(''); }
  if (a.brief) L.push('---', '', a.brief.replace(/^# /m, '## Brief: '), '');
  if (segs.length) { L.push('---', '', '## Transcripción', ''); segs.forEach(x => L.push(`\`${fmtT(x.t)}\` ${x.s ? `**${spkName(m, x.s)}:** ` : ''}${x.text}  `)); }
  return L.join('\n');
}
function downloadText(name, text, type = 'text/markdown') {
  const blob = new Blob([text], { type: type + ';charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
async function shareText(title, text) {
  if (navigator.share) { try { await navigator.share({ title, text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  copyText(text, 'Copiado para compartir');
}
async function shareMeeting(m) {
  const a = m.analysis; const file = new File([await fullMd(m)], slug(a.title) + '.md', { type: 'text/markdown' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ title: a.title, text: summaryText(m), files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  shareText(a.title, summaryText(m));
}
function copyText(text, ok) { try { navigator.clipboard.writeText(text).then(() => toast(ok), () => fallbackCopy(text, ok)); } catch { fallbackCopy(text, ok); } }
function fallbackCopy(text, ok) { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); let r = false; try { r = document.execCommand('copy'); } catch {} ta.remove(); toast(r ? ok : 'No se pudo copiar'); }
function md(src) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1<em>$2</em>').replace(/`(.+?)`/g, '<code class="mono">$1</code>');
  let html = '', inList = false;
  String(src).split('\n').forEach(line => {
    const l = line.trimEnd(); const li = l.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
    if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(li[1])}</li>`; return; }
    if (inList) { html += '</ul>'; inList = false; }
    const h = l.match(/^(#{1,3})\s+(.*)$/); if (h) { html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; return; }
    if (l.trim() === '---') { html += '<hr style="border:0;border-top:1px solid var(--line);margin:20px 0">'; return; }
    if (l.trim()) html += `<p>${inline(l)}</p>`;
  });
  if (inList) html += '</ul>';
  return html;
}

/* =========================================================
   Demo meeting
   ========================================================= */
const EXAMPLE_TX = `[0:00] Tú: Partamos. La idea es definir la primera versión de la app de reservas para la peluquería de Camila.
[0:12] Camila: Lo más urgente es que la gente pueda reservar sola. Hoy pierdo como diez llamadas al día mientras atiendo.
[0:31] Diego: Técnicamente lo más rápido es una web app, sin pasar por las tiendas. En tres semanas tenemos algo funcionando.
[0:52] Tú: Me parece. Entonces la versión uno es web, que se pueda instalar en el celular.
[1:10] Camila: Necesito que me lleguen avisos por WhatsApp cuando alguien reserve, y que el cliente reciba un recordatorio el día antes.
[1:34] Diego: El recordatorio por WhatsApp tiene costo por mensaje. Calculo unos 30 mil pesos al mes con el volumen que tienes.
[1:58] Camila: Eso lo pago feliz si baja las inasistencias. Hoy falta como el 20% de la gente.
[2:20] Tú: Decidamos entonces: recordatorios por WhatsApp sí van en la versión uno.
[2:41] Diego: Ojo con los pagos. Si cobramos un abono para reservar, eso suma dos semanas más.
[3:02] Camila: El abono me gusta, pero no es urgente. Dejémoslo para después.
[3:15] Tú: Ok, pagos quedan para la versión dos. Diego, ¿puedes mandar el presupuesto final el viernes?
[3:24] Diego: Sí, el viernes lo envío con el detalle por etapa.
[3:40] Camila: Otra cosa: quiero que se vea como mi local, con mis colores y fotos de los cortes.
[3:58] Tú: Yo me encargo del diseño. Camila, ¿me mandas fotos y tu logo esta semana?
[4:10] Camila: Sí, el miércoles te los mando.
[4:22] Diego: Una duda que no hemos resuelto: ¿cuántas personas atienden? Porque cambia cómo armamos la agenda.
[4:35] Camila: Somos tres, pero los sábados viene una cuarta persona.
[4:50] Tú: Entonces la agenda tiene que ser por profesional. Lo anoto como requisito.
[5:12] Diego: Y una idea: podríamos mostrar los horarios con poca demanda con un pequeño descuento para llenar los huecos.
[5:30] Camila: ¡Eso me encanta! Los martes en la mañana están vacíos.
[5:45] Tú: Lo dejamos como idea para evaluar. Cerremos: lanzamiento meta el 15 de noviembre.`;
async function loadDemo() {
  const id = 'ejemplo-' + uid(); const segs = parseTranscript(EXAMPLE_TX).segments;
  const analysis = {
    title: 'App de reservas para la peluquería', tldr: 'Se definió la versión 1: una web app instalable donde los clientes reservan solos, con agenda por profesional y recordatorios por WhatsApp. Los pagos con abono quedan para la versión 2. Meta de lanzamiento: 15 de noviembre.',
    mood: { label: 'Productiva', score: 82, note: 'Acuerdo rápido en lo esencial y entusiasmo con las ideas nuevas.' }, tags: ['ejemplo', 'producto', 'reservas', 'v1'], participants: ['Tú', 'Camila', 'Diego'], speakers: [],
    keyPoints: [{ title: 'Reservas sin llamadas', detail: 'Camila pierde unas diez llamadas al día; la autogestión es la prioridad.', icon: 'target' }, { title: 'Web app primero', detail: 'Sin tiendas de apps: funcional en unas tres semanas.', icon: 'tech' }, { title: 'Menos inasistencias', detail: 'Hoy falta cerca del 20% de los clientes; los recordatorios apuntan a bajarlo.', icon: 'growth' }, { title: 'Costo de WhatsApp', detail: 'Alrededor de 30 mil pesos al mes, aprobado por Camila.', icon: 'money' }, { title: 'Identidad del local', detail: 'Colores, logo y fotos de cortes de la peluquería.', icon: 'design' }, { title: 'Agenda por profesional', detail: 'Tres personas, y una cuarta los sábados.', icon: 'people' }],
    topics: [{ name: 'Problema y formato', start: 0, end: 70, summary: 'Por qué reservar online y por qué web app.' }, { name: 'Recordatorios WhatsApp', start: 70, end: 161, summary: 'Avisos, costo y decisión.' }, { name: 'Pagos y presupuesto', start: 161, end: 220, summary: 'El abono se posterga.' }, { name: 'Diseño y marca', start: 220, end: 262, summary: 'Estilo del local.' }, { name: 'Agenda del equipo', start: 262, end: 312, summary: 'Agenda por profesional.' }, { name: 'Ideas y cierre', start: 312, end: 350, summary: 'Descuentos y fecha meta.' }],
    decisions: [{ text: 'La versión 1 será una web app instalable', why: 'Más rápido que publicar en tiendas' }, { text: 'Los recordatorios por WhatsApp entran en la v1', why: 'Pueden bajar el 20% de inasistencias' }, { text: 'El cobro de abono queda para la v2', why: 'Sumaba dos semanas y no es urgente' }, { text: 'La agenda se organiza por profesional', why: '' }, { text: 'Lanzamiento meta: 15 de noviembre', why: '' }],
    actions: [{ id: uid(), task: 'Enviar presupuesto final con detalle por etapa', owner: 'Diego', due: 'Viernes', priority: 'alta', done: false }, { id: uid(), task: 'Mandar fotos de cortes y logo', owner: 'Camila', due: 'Miércoles', priority: 'alta', done: true }, { id: uid(), task: 'Diseñar la interfaz con la identidad del local', owner: 'Tú', due: '', priority: 'media', done: false }, { id: uid(), task: 'Agregar agenda por profesional a los requisitos', owner: 'Tú', due: '', priority: 'media', done: false }],
    ideas: [{ text: 'Mostrar horarios de baja demanda con un pequeño descuento', note: 'Llena huecos como los martes en la mañana' }],
    risks: [{ text: 'El costo de WhatsApp crece con el volumen de reservas', severity: 'media' }, { text: 'Tres semanas es un plazo ajustado para el 15 de noviembre', severity: 'media' }],
    questions: [{ text: '¿Cómo se manejan cancelaciones y reagendamientos?' }, { text: '¿Qué profesional atiende cada servicio?' }],
    numbers: [{ value: '10', label: 'llamadas perdidas al día' }, { value: '3 semanas', label: 'para la v1' }, { value: '$30.000', label: 'costo mensual de WhatsApp' }, { value: '20%', label: 'de clientes que no llega' }, { value: '15 nov', label: 'lanzamiento meta' }],
    quotes: [{ text: 'Eso lo pago feliz si baja las inasistencias.', who: 'Camila', t: 118 }, { text: '¡Eso me encanta! Los martes en la mañana están vacíos.', who: 'Camila', t: 330 }],
    mindmap: { center: 'App de reservas', branches: [{ label: 'Versión 1', children: ['Web app instalable', 'Reserva autónoma', 'Agenda por profesional'] }, { label: 'WhatsApp', children: ['Aviso a Camila', 'Recordatorio al cliente', '~$30.000/mes'] }, { label: 'Versión 2', children: ['Cobro de abono', '+2 semanas'] }, { label: 'Diseño', children: ['Colores del local', 'Logo', 'Fotos de cortes'] }, { label: 'Ideas', children: ['Descuento en horas vacías', 'Martes AM'] }] },
    nextSteps: ['Recibir fotos y logo (miércoles)', 'Recibir presupuesto por etapa (viernes)', 'Cerrar requisitos con agenda por profesional', 'Diseñar pantallas principales', 'Desarrollar la v1 y probar con clientes reales', 'Lanzar el 15 de noviembre'],
    brief: '# Brief: App de reservas para la peluquería\n\n## Contexto\nLa peluquería pierde unas diez llamadas al día y cerca del 20% de los clientes no llega a su hora.\n\n## Objetivo\nQue los clientes reserven solos y bajar las inasistencias.\n\n## Alcance v1\n- Web app instalable en el celular\n- Reserva autónoma de horas\n- Agenda por profesional (3 personas, 4 los sábados)\n- Aviso por WhatsApp a la dueña en cada reserva\n- Recordatorio por WhatsApp al cliente el día antes\n- Diseño con colores, logo y fotos del local\n\n## Fuera de alcance (v2)\n- Cobro de abono al reservar\n\n## Pendientes\n- Presupuesto final por etapa (Diego, viernes)\n- Fotos y logo (Camila, miércoles)\n- Definir cancelaciones y reagendamientos'
  };
  await DB.put('transcripts', { segments: segs }, id);
  await saveMeeting({ id, createdAt: Date.now() - 86400000, date: today(), durationSec: 350, participants: ['Camila', 'Diego', 'Tú'], template: 'proyecto', context: 'Primera reunión para definir la app de reservas.', notes: '', notesLog: [{ t: 95, text: 'Preguntar costo exacto de WhatsApp Business' }], marks: [{ t: 140, label: 'Decisión WhatsApp' }], audioParts: [], speakers: {}, status: 'ready', words: wordCount(segs), analysis });
  go('m/' + id);
}

/* =========================================================
   Boot
   ========================================================= */
(async () => {
  try { await loadMeetings(); } catch (e) { S.loaded = true; toast('No se pudo abrir el almacenamiento del navegador. Revisa que no estés en modo privado.', 6000); }
  try { const r = await DB.get('kv', 'activeRec'); if (r && r.recId) { const ch = await DB.chunksFor(r.recId); if (ch.length) S.recovery = r; else await DB.del('kv', 'activeRec'); } } catch {}
  onRoute();
  for (const m of S.meetings) if (['queued', 'transcribing', 'analyzing'].includes(m.status)) processMeeting(m.id);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
})();
