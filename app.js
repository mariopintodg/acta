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
const fmtBytes = b => b > 1e9 ? (b / 1e9).toFixed(1).replace('.', ',') + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';
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
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  text: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  mind: '<circle cx="12" cy="12" r="3"/><circle cx="4.5" cy="5.5" r="2"/><circle cx="19.5" cy="5.5" r="2"/><circle cx="4.5" cy="18.5" r="2"/><circle cx="19.5" cy="18.5" r="2"/><path d="M9.8 10 6 7M14.2 10 18 7M9.8 14 6 17M14.2 14 18 17"/>',
  chat: '<path d="M4 5h16v11H9l-5 4V5Z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  report: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 17v-3M12 17v-6M15 17v-2"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  scissors: '<circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M8.2 7.6 20 18M8.2 16.4 20 6"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  week: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M7 14h2M11 14h2M15 14h2M7 17h2"/>',
  wifioff: '<path d="M2 8.5a15 15 0 0 1 4-2.6M9.5 5.2A15 15 0 0 1 22 8.5M5 12a10 10 0 0 1 3.4-2M12.6 9.1A10 10 0 0 1 19 12M8.5 15.5a5 5 0 0 1 7 0M12 19h.01M3 3l18 18"/>',
  face: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9v1.5M15 9v1.5M12 9v4h-1M9.5 16a4 4 0 0 0 5 0"/>',
  word: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M8.5 12l1.3 5 1.7-4 1.7 4 1.3-5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>'
};
const icon = (k, sw = 1.8, size) => `<svg viewBox="0 0 24 24"${size ? ` width="${size}" height="${size}"` : ''} fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k] || IC.spark}</svg>`;
const TOPIC_COLORS = ['var(--t1)', 'var(--t2)', 'var(--t3)', 'var(--t4)', 'var(--t5)', 'var(--t6)'];
const tc = i => TOPIC_COLORS[((i % 6) + 6) % 6];

const TEMPLATES = {
  auto: { name: 'Que Acta lo decida', desc: 'Detecta si fue reunión, clase, venta u obra', focus: 'Primero identifica qué tipo de conversación es (reunión de trabajo, clase o capacitación, venta, obra, consulta profesional, asamblea, lluvia de ideas, etc.) y aplica el enfoque que mejor le sirva a quien grabó.' },
  general: { name: 'General', desc: 'Resumen equilibrado de cualquier conversación', focus: 'Cubre todo de forma equilibrada.' },
  proyecto: { name: 'Proyecto / kickoff', desc: 'Alcance, requisitos, plazos y responsables', focus: 'Enfócate en alcance, requisitos, entregables, plazos, presupuesto, responsables y dependencias. El brief debe servir para arrancar el proyecto.' },
  cliente: { name: 'Cliente / venta', desc: 'Necesidades, objeciones, presupuesto y cierre', focus: 'Enfócate en necesidades y dolores del cliente, presupuesto, objeciones, criterios de decisión, competencia y próximo paso comercial.' },
  ideas: { name: 'Lluvia de ideas', desc: 'Ideas agrupadas, las más prometedoras primero', focus: 'Enfócate en capturar TODAS las ideas, agruparlas por tema y destacar las más prometedoras y por qué.' },
  uno: { name: '1:1 / seguimiento', desc: 'Avances, bloqueos y compromisos', focus: 'Enfócate en avances desde la última vez, bloqueos, feedback dado y compromisos de cada persona.' },
  obra: { group: 'rubro', name: 'Obra / construcción', desc: 'Avance, materiales, plazos y seguridad', focus: 'Es una reunión de obra o construcción en Chile. Enfócate en el avance por partida, atrasos y sus causas, materiales y cubicaciones, subcontratos, permisos (DOM), seguridad y prevención de riesgos, estados de pago y plazos comprometidos.', ficha: ['Obra o proyecto', 'Avance informado', 'Partidas atrasadas', 'Materiales por pedir', 'Estado de pago', 'Seguridad', 'Próxima visita'] },
  propiedades: { group: 'rubro', name: 'Corretaje / propiedades', desc: 'Propiedad, precio en UF, condiciones', focus: 'Es una reunión de corretaje o venta/arriendo de propiedades en Chile. Enfócate en la propiedad, precio (UF o pesos), gastos comunes, condiciones de pago, crédito hipotecario, documentos pedidos, objeciones del cliente y próxima visita o firma.', ficha: ['Propiedad', 'Operación', 'Precio', 'Gastos comunes', 'Financiamiento', 'Documentos pendientes', 'Próximo paso'] },
  pyme: { group: 'rubro', name: 'Pyme / proveedor', desc: 'Precios, entregas, pago y factura', focus: 'Es una reunión comercial de una pyme chilena con un proveedor o cliente. Enfócate en productos o servicios, precios netos o con IVA, volúmenes, plazos de entrega, condiciones de pago (contado, 30, 60 días), factura y despacho.', ficha: ['Contraparte', 'Producto o servicio', 'Precio acordado', 'Volumen', 'Plazo de entrega', 'Condición de pago', 'Facturación'] },
  salud: { group: 'rubro', name: 'Consulta / atención', desc: 'Motivo, indicaciones y controles', focus: 'Es una atención profesional (salud, kinesiología, nutrición, psicología u otra). Enfócate en el motivo de consulta, lo evaluado, las indicaciones dadas, los exámenes o documentos pedidos y la fecha de control. No agregues diagnósticos que no se dijeron.', ficha: ['Motivo de consulta', 'Indicaciones', 'Exámenes o documentos', 'Próximo control', 'Alertas a vigilar'] },
  legal: { group: 'rubro', name: 'Abogado / asesoría', desc: 'Hechos, plazos y documentos', focus: 'Es una asesoría legal, contable o tributaria en Chile. Enfócate en los hechos relatados, la estrategia propuesta, plazos legales o del SII, documentos requeridos, honorarios y próximos trámites. No inventes normas.', ficha: ['Materia', 'Hechos principales', 'Estrategia', 'Plazos clave', 'Documentos requeridos', 'Honorarios'] },
  apoderados: { group: 'rubro', name: 'Reunión de apoderados', desc: 'Acuerdos de curso, cuotas y fechas', focus: 'Es una reunión de apoderados de un colegio en Chile. Enfócate en acuerdos del curso, cuotas y montos, actividades y fechas, información del colegio o profesor jefe y quién se encarga de qué.', ficha: ['Curso', 'Acuerdos', 'Cuotas y montos', 'Fechas importantes', 'Encargados'] },
  comunidad: { group: 'rubro', name: 'Condominio / junta de vecinos', desc: 'Votaciones, gastos comunes y acuerdos', focus: 'Es una asamblea de condominio, comité o junta de vecinos en Chile. Enfócate en los acuerdos y votaciones (a favor, en contra), quórum si se mencionó, gastos comunes, mantenciones, cotizaciones y reclamos.', ficha: ['Comunidad', 'Asistentes o quórum', 'Acuerdos votados', 'Gastos comunes', 'Cotizaciones', 'Próxima asamblea'] },
  clase: { group: 'estudio', name: 'Clase / apuntes', desc: 'Apuntes, tarjetas y prueba de práctica', focus: 'Es una clase, charla o capacitación. Escribe el acta como un alumno destacado: enfócate en los conceptos enseñados, definiciones, fórmulas, ejemplos, lo que el profesor recalcó y lo que dijo que entra en la prueba. Las tareas son lecturas, trabajos y fechas de evaluaciones.', ficha: ['Asignatura', 'Unidad o tema', 'Evaluaciones y fechas', 'Lecturas o trabajos pedidos'] },
  equipo: { group: 'rubro', name: 'Equipo semanal', desc: 'Estado por persona y bloqueos', focus: 'Es la reunión semanal de un equipo de trabajo. Enfócate en el estado de cada persona o área, metas de la semana, bloqueos, ayudas pedidas y compromisos con fecha.', ficha: ['Metas de la semana', 'Bloqueos', 'Ayuda pedida', 'Indicadores mencionados'] }
};
const TPL_GROUPS = [['', 'General'], ['estudio', 'Estudio'], ['rubro', 'Por rubro']];
const tplName = m => m.template === 'auto' ? (TEMPLATES[m.analysis?.detected]?.name || 'Automático') : (TEMPLATES[m.template] || TEMPLATES.general).name;
const tplOptions = sel => TPL_GROUPS.map(([g, l]) => `<optgroup label="${l}">${Object.entries(TEMPLATES).filter(([, t]) => (t.group || '') === g).map(([k, t]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${t.name}</option>`).join('')}</optgroup>`).join('');
const KP_ICONS = ['target', 'money', 'people', 'time', 'tech', 'design', 'legal', 'growth', 'idea', 'risk'];
const CLAUDE_MODELS = [['claude-sonnet-5-5', 'Claude Sonnet 5.5 — recomendado'], ['claude-opus-5-5', 'Claude Opus 5.5 — máximo detalle'], ['claude-haiku-5-5', 'Claude Haiku 5.5 — más rápido y económico']];
const STT_MODELS = [['gpt-4o-transcribe-diarize', 'Con hablantes (recomendado)'], ['whisper-1', 'Whisper — con marcas de tiempo, sin hablantes'], ['gpt-4o-transcribe', 'Solo texto']];
const MAX_UPLOAD = 25 * 1024 * 1024;
const APP_VERSION = '4.0.1';
const PART_SEC = 5 * 60; /* recordings are saved in 5-minute pieces so they can be transcribed in parallel */

/* =========================================================
   Settings (localStorage — only this device)
   ========================================================= */
const DEFAULTS = { anthropicKey: '', openaiKey: '', claudeModel: 'claude-sonnet-5-5', sttModel: 'gpt-4o-transcribe-diarize', language: 'es', theme: 'system', captions: false, bitrate: 32000, followAudio: true, vocab: '', lockOn: false, lockCred: '', lockPin: '', lockSalt: '', lockAfter: 60, myName: '', brandName: '', brandColor: '', brandLogo: '', signature: '', folioNext: 1, admin: null, viewAsClient: false, adminPin: '', adminSalt: '', planName: 'Plan Pro', planMinutes: 600, planRenewDay: 1, profileOrg: '', lastBackup: 0, backupSnooze: 0 };
/* Customer view vs administrator view: customers never see keys, models or dollar balances */
const isAdmin = () => Settings.v.admin === true;
const adminView = () => isAdmin() && !Settings.v.viewAsClient;
function applyMode() { document.body.classList.toggle('admin', adminView()); }
const vocabList = () => String(Settings.v.vocab || '').split(/[\n,;]+/).map(x => x.trim()).filter(Boolean).slice(0, 120);
const Settings = {
  v: { ...DEFAULTS },
  load() { try { Object.assign(this.v, JSON.parse(localStorage.getItem('acta:settings') || '{}')); } catch {} return this; },
  set(patch) { Object.assign(this.v, patch); try { localStorage.setItem('acta:settings', JSON.stringify(this.v)); if ('theme' in patch) localStorage.setItem('acta:theme', this.v.theme); } catch {} if ('theme' in patch) applyTheme(); this.mirror(); },
  /* Second copy in IndexedDB: if the phone clears one storage, the keys come back from the other */
  mirror() { clearTimeout(this._mt); this._mt = setTimeout(() => { try { DB.put('kv', { ...this.v, savedAt: Date.now() }, 'settings').catch(() => {}); } catch {} }, 300); },
  async restore() {
    let saved = null; try { saved = await DB.get('kv', 'settings'); } catch {}
    const has = o => !!(o && (o.anthropicKey || o.openaiKey));
    if (!has(this.v) && has(saved)) { const { savedAt, ...rest } = saved; Object.assign(this.v, rest); try { localStorage.setItem('acta:settings', JSON.stringify(this.v)); } catch {} this.restored = true; return true; }
    if (has(this.v)) this.mirror();
    return false;
  }
}.load();
async function keepStorage() { try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch {} }
function applyTheme() { document.documentElement.setAttribute('data-theme', 'dark'); }
applyTheme();

/* =========================================================
   Storage (IndexedDB)
   ========================================================= */
const DB = {
  _p: null,
  open() {
    if (this._p) return this._p;
    this._p = new Promise((res, rej) => {
      const r = indexedDB.open('acta', 2);
      r.onupgradeneeded = () => {
        const d = r.result; const has = n => d.objectStoreNames.contains(n);
        if (!has('meetings')) d.createObjectStore('meetings', { keyPath: 'id' });
        if (!has('transcripts')) d.createObjectStore('transcripts');
        if (!has('audio')) d.createObjectStore('audio');
        if (!has('chunks')) { const c = d.createObjectStore('chunks', { autoIncrement: true }); c.createIndex('rec', 'recId'); }
        if (!has('kv')) d.createObjectStore('kv');
        if (!has('photos')) d.createObjectStore('photos');
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
  put(store, val, key) { if (store === 'transcripts' && typeof S !== 'undefined') S.txIndex = null; return this.tx(store, 'readwrite', st => this.req(key === undefined ? st.put(val) : st.put(val, key))); },
  del(store, key) { return this.tx(store, 'readwrite', st => this.req(st.delete(key))); },
  all(store) { return this.tx(store, 'readonly', st => this.req(st.getAll())); },
  keys(store) { return this.tx(store, 'readonly', st => this.req(st.getAllKeys())); },
  async chunksFor(recId) { return this.tx('chunks', 'readonly', st => this.req(st.index('rec').getAll(recId))); },
  async delChunks(recId) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction('chunks', 'readwrite'); const idx = t.objectStore('chunks').index('rec'); const c = idx.openKeyCursor(IDBKeyRange.only(recId)); c.onsuccess = () => { const cur = c.result; if (cur) { t.objectStore('chunks').delete(cur.primaryKey); cur.continue(); } }; t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  async clearAll() { for (const s of ['meetings', 'transcripts', 'audio', 'chunks', 'kv', 'photos']) await this.tx(s, 'readwrite', st => this.req(st.clear())); }
};

/* =========================================================
   App state
   ========================================================= */
const S = { meetings: [], loaded: false, route: { view: 'library' }, q: '', trq: '', chats: {}, progress: {}, running: new Set(), recovery: null, taskFilter: 'pending', ownerFilter: '', txIndex: null, weekOff: 0 };
const projectsList = () => [...new Set(S.meetings.map(m => (m.project || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const meetingById = id => S.meetings.find(m => m.id === id);
async function loadMeetings() { S.meetings = (await DB.all('meetings')).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); S.loaded = true; }
async function saveMeeting(m) { await DB.put('meetings', m); const i = S.meetings.findIndex(x => x.id === m.id); if (i >= 0) S.meetings[i] = m; else { S.meetings.unshift(m); S.meetings.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); } return m; }
async function patchMeeting(id, patch) { const m = meetingById(id) || await DB.get('meetings', id); if (!m) return; Object.assign(m, patch); return saveMeeting(m); }
async function getSegments(id) { const t = await DB.get('transcripts', id); return (t && t.segments) || []; }
async function deleteMeeting(id) {
  const m = meetingById(id);
  await DB.del('meetings', id); await DB.del('transcripts', id).catch(() => {});
  for (const p of (m?.audioParts || [])) await DB.del('audio', p.key).catch(() => {});
  for (const p of (m?.photos || [])) await DB.del('photos', p.key).catch(() => {});
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
    const vocab = vocabList();
    if (vocab.length && model !== 'gpt-4o-transcribe-diarize') fd.append('prompt', 'Vocabulario: ' + vocab.join(', ') + '.');
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
  {
    let sec = 0;
    if (Array.isArray(j.segments) && j.segments.length) sec = Math.max(...j.segments.map(x => +x.end || 0));
    if (!sec && j.duration) sec = +j.duration;
    if (!sec && j.usage?.seconds) sec = +j.usage.seconds;
    if (!sec) sec = blob.size * 8 / (Settings.v.bitrate || 32000);
    Usage.add('openai', sec / 60 * STT_PER_MIN, 'transcripcion');
  }
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
async function claude({ system, messages, tools, tool_choice, max_tokens = 16000, onText, onProgress, signal, kind = 'otro' }) {
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
  let buf = '', text = '', json = '', stop = null, chars = 0, usage = {}, outTok = 0;
  const bill = () => { const pr = PRICES[Settings.v.claudeModel] || PRICES['claude-sonnet-5-5']; const cost = ((usage.input_tokens || 0) * pr.in + (usage.cache_creation_input_tokens || 0) * pr.in * 1.25 + (usage.cache_read_input_tokens || 0) * pr.in * .1 + outTok * pr.out) / 1e6; Usage.add('anthropic', cost, kind); };
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
      } else if (o.type === 'message_start') { usage = o.message?.usage || {}; outTok = usage.output_tokens || 0; }
      else if (o.type === 'message_delta') { stop = o.delta?.stop_reason || stop; if (o.usage?.output_tokens != null) outTok = o.usage.output_tokens; }
      else if (o.type === 'error') { bill(); throw { code: 'stream', message: 'Claude interrumpió la respuesta: ' + (o.error?.message || 'error') }; }
    }
  }
  bill();
  let toolInput = null;
  if (json) { try { toolInput = JSON.parse(json); } catch { throw { code: 'bad_json', message: stop === 'max_tokens' ? 'La reunión es muy larga para un solo análisis con este modelo. Prueba con Claude Opus o divide la transcripción.' : 'Claude devolvió un resultado incompleto. Reintenta.' }; } }
  return { text, toolInput, stop };
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Título corto y específico (máx. 8 palabras)' },
    detected: { type: 'string', enum: Object.keys(TEMPLATES).filter(k => k !== 'auto'), description: 'Tipo de conversación detectado (general = reunión de trabajo)' },
    tldr: { type: 'string', description: 'Resumen de 2-3 frases con lo esencial y el resultado' },
    mood: { type: 'object', properties: { label: { type: 'string' }, score: { type: 'integer', minimum: 0, maximum: 100 }, note: { type: 'string' } }, required: ['label', 'score', 'note'] },
    tags: { type: 'array', items: { type: 'string' } },
    speakers: { type: 'array', description: 'Para cada etiqueta de hablante de la transcripción, el nombre real si se deduce con seguridad del contexto; si no, deja name vacío', items: { type: 'object', properties: { label: { type: 'string' }, name: { type: 'string' } }, required: ['label', 'name'] } },
    participants: { type: 'array', items: { type: 'string' } },
    keyPoints: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' }, icon: { type: 'string', enum: KP_ICONS } }, required: ['title', 'detail', 'icon'] } },
    topics: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, start: { type: 'number' }, end: { type: 'number' }, summary: { type: 'string' } }, required: ['name', 'start', 'end', 'summary'] } },
    decisions: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, why: { type: 'string' } }, required: ['text'] } },
    actions: { type: 'array', items: { type: 'object', properties: { task: { type: 'string' }, owner: { type: 'string' }, due: { type: 'string', description: 'Plazo tal como se dijo' }, dueDate: { type: 'string', description: 'Fecha del plazo en formato AAAA-MM-DD calculada desde la fecha de la reunión; vacío si no se dijo plazo' }, t: { type: 'number', description: 'Segundo de la grabación en que la persona se comprometió' }, quote: { type: 'string', description: 'Frase textual y breve con la que la persona se comprometió, copiada de la transcripción' }, priority: { type: 'string', enum: ['alta', 'media', 'baja'] } }, required: ['task', 'owner', 'priority'] } },
    ficha: { type: 'array', description: 'Ficha del rubro: un valor por cada campo pedido, solo con lo que se dijo; si un campo no se mencionó, value = "No se mencionó"', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } }, required: ['label', 'value'] } },
    followUp: { type: 'object', description: 'Mensaje de seguimiento listo para enviar a los participantes, escrito en primera persona por quien grabó', properties: { whatsapp: { type: 'string', description: 'Versión corta para WhatsApp: saludo, 3 a 6 líneas con acuerdos y tareas con responsable y plazo, cierre cordial. Puede usar *negritas* de WhatsApp. Sin emojis excesivos.' }, emailSubject: { type: 'string' }, emailBody: { type: 'string', description: 'Correo formal y breve: saludo, resumen, acuerdos, tareas con responsable y plazo, próxima reunión si se mencionó, despedida. Texto plano.' } }, required: ['whatsapp', 'emailSubject', 'emailBody'] },
    corrections: { type: 'array', description: 'Palabras que la transcripción escribió mal y que corresponden al vocabulario del usuario o a nombres claros por contexto', items: { type: 'object', properties: { wrong: { type: 'string' }, right: { type: 'string' } }, required: ['wrong', 'right'] } },
    previousTasks: { type: 'array', description: 'Solo si se entregaron tareas pendientes de reuniones anteriores del proyecto: el estado de cada una según lo conversado hoy', items: { type: 'object', properties: { ref: { type: 'string' }, status: { type: 'string', enum: ['hecha', 'en curso', 'sin novedad'] }, note: { type: 'string' } }, required: ['ref', 'status'] } },
    study: { type: 'object', description: 'SOLO para clases (tipo Clase); en otras reuniones omítelo', properties: {
      notes: { type: 'string', description: 'Apuntes completos en Markdown, como los de un alumno destacado: ## por tema en orden, definiciones en **negrita**, fórmulas, ejemplos y explicaciones claras' },
      exam: { type: 'array', description: 'Lo que el profesor dijo que entra en la prueba o recalcó como importante, más los momentos marcados "Entra en la prueba"', items: { type: 'object', properties: { text: { type: 'string' }, t: { type: 'number' } }, required: ['text'] } },
      glossary: { type: 'array', description: '8 a 20 conceptos con definición breve', items: { type: 'object', properties: { term: { type: 'string' }, def: { type: 'string' } }, required: ['term', 'def'] } },
      flashcards: { type: 'array', description: '15 a 25 tarjetas de memoria: pregunta breve y respuesta corta', items: { type: 'object', properties: { q: { type: 'string' }, a: { type: 'string' } }, required: ['q', 'a'] } },
      quiz: { type: 'array', description: '8 a 10 preguntas de alternativas tipo prueba', items: { type: 'object', properties: { q: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, answer: { type: 'integer', description: 'Índice 0-3 de la correcta' }, why: { type: 'string' } }, required: ['q', 'options', 'answer'] } }
    } },
    continuity: { type: 'string', description: 'Solo si hay reuniones anteriores del proyecto: 1-3 frases sobre qué avanzó, qué cambió y qué sigue trabado respecto a la vez anterior' },
    ideas: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, note: { type: 'string' } }, required: ['text'] } },
    risks: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, severity: { type: 'string', enum: ['alta', 'media', 'baja'] } }, required: ['text', 'severity'] } },
    questions: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
    numbers: { type: 'array', items: { type: 'object', properties: { value: { type: 'string' }, label: { type: 'string' } }, required: ['value', 'label'] } },
    quotes: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, who: { type: 'string' }, t: { type: 'number' } }, required: ['text', 'who'] } },
    mindmap: { type: 'object', properties: { center: { type: 'string' }, branches: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, children: { type: 'array', items: { type: 'string' } } }, required: ['label', 'children'] } } }, required: ['center', 'branches'] },
    nextSteps: { type: 'array', items: { type: 'string' } },
    brief: { type: 'string', description: 'Documento Markdown (# título, ## secciones, listas con -) que sirva de materia prima para arrancar o continuar el proyecto: Contexto, Objetivo, Alcance, Requisitos y detalles, Decisiones tomadas, Pendientes y preguntas, Plan inicial. Concreto, sin relleno.' }
  },
  required: ['title', 'tldr', 'mood', 'tags', 'speakers', 'participants', 'keyPoints', 'topics', 'decisions', 'actions', 'ideas', 'risks', 'questions', 'numbers', 'quotes', 'mindmap', 'nextSteps', 'brief', 'followUp']
};
const transcriptText = (m, segs) => segs.map(x => `[${fmtT(x.t)}] ${x.s ? (m?.speakers?.[x.s] ? `${m.speakers[x.s]} (${x.s})` : x.s) + ': ' : ''}${x.text}`).join('\n');
async function analyze(m, segs, template, onProgress) {
  const tpl = TEMPLATES[template] || TEMPLATES.general;
  const labels = speakerLabels(segs);
  const notes = [m.notes, ...(m.notesLog || []).map(n => `[${fmtT(n.t)}] ${n.text}`)].filter(Boolean).join('\n');
  const marks = [...(m.marks || []).map(k => `[${fmtT(k.t)}] ${k.label || 'Momento marcado'}${k.text ? ': ' + k.text : ''}`), ...(m.photos || []).filter(p => p.t != null).map(p => `[${fmtT(p.t)}] El usuario tomó una foto (pizarra, documento o lámina)`)].join('\n');
  const vocab = vocabList();
  const prevCtx = projectContext(m);
  const wd = (() => { try { return new Date(m.date + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long' }); } catch { return ''; } })();
  const system =`Eres un analista de reuniones de primer nivel. Produces actas visuales precisas y útiles para trabajar.
Reglas:
- Escribe en español de Chile, claro y profesional.
- No inventes nada: usa solo lo que se dijo. Si una sección no aplica, devuelve un arreglo vacío.
- Los tiempos de la transcripción están como [m:ss] o [h:mm:ss]; en tu respuesta exprésalos en segundos.
- Los temas (topics) cubren la reunión en orden, sin solaparse, de 2 a 7.
- keyPoints: 3 a 6. mindmap: 3 a 6 ramas con 2 a 4 hojas.
- Las notas y momentos marcados por el usuario son prioridad: los anotó porque le importan. En una clase, los momentos marcados suelen ser lo que entra en la prueba.
- Tareas: empieza con verbo; owner es la persona responsable si se dijo, si no "Sin asignar"; due solo si se mencionó un plazo.
- quotes: frases textuales cortas y memorables.
- speakers: ${labels.length ? `etiquetas presentes: ${labels.join(', ')}. Deduce el nombre de cada una solo si es claro (alguien la nombra, se presenta o coincide con un participante); si no, deja name vacío. Las etiquetas con sufijo ·2, ·3… vienen de partes posteriores de la misma reunión (la grabación se reanudó): si por el contexto son la misma persona que otra etiqueta, dales el mismo nombre; si no se puede saber, usa "Persona A", "Persona B" coherentes entre partes.` : 'no hay etiquetas de hablante; devuelve un arreglo vacío.'}
- Tareas con plazo: además de due (como se dijo), calcula dueDate en AAAA-MM-DD desde la fecha de la reunión (por ejemplo "el viernes" = el próximo viernes).
- En cada tarea agrega t (segundo en que el responsable se comprometió) y quote (sus palabras textuales y breves al comprometerse), copiadas de la transcripción.
- followUp: mensaje para enviar después de la reunión, con los acuerdos y tareas reales; no inventes fechas ni nombres.
- Enfoque de esta reunión: ${tpl.focus}
- detected: el tipo de conversación que mejor la describe.
${template === 'auto' ? `- Tipo elegido: "Que Acta lo decida". Si es una clase, charla o capacitación, completa study (obligatorio en ese caso). Si es de un rubro, llena ficha con sus campos: ${Object.entries(TEMPLATES).filter(([, t]) => t.ficha).map(([k, t]) => `${k}: ${t.ficha.join(', ')}`).join(' | ')}. Si no aplica, ficha vacía.` : ''}
- study: ${template === 'auto' ? 'solo si es una clase (ver arriba).' : template === 'clase' ? 'OBLIGATORIO: completa apuntes, entra en la prueba, glosario, tarjetas y prueba de práctica, todo basado en lo que se enseñó.' : 'omítelo.'}
${Settings.v.about ? `- Sobre quien graba (úsalo para el tono, el enfoque y los nombres): ${Settings.v.about}` : ''}
- ficha: ${template === 'auto' ? 'ver arriba.' : tpl.ficha ? `completa estos campos en este orden: ${tpl.ficha.join(' · ')}.` : 'devuelve un arreglo vacío.'}
${vocab.length ? `- Vocabulario del usuario (así se escriben estos nombres, marcas y términos): ${vocab.join(', ')}. Escríbelos así en el acta y agrega a corrections cada palabra que la transcripción escribió mal (solo si estás seguro).` : '- corrections: solo nombres propios claramente mal escritos; si no hay, arreglo vacío.'}
${prevCtx ? '- Esta reunión continúa un proyecto con reuniones anteriores (ver abajo). Llena continuity y, para cada tarea pendiente entregada, previousTasks con su ref y su estado según lo conversado hoy. No repitas en actions una tarea anterior salvo que se haya reasignado o cambiado.' : '- previousTasks: arreglo vacío. continuity: vacío.'}`;
  const user = `Datos de la reunión
- Título provisional: ${m.titleHint || '(sin título, propón uno)'}
- Fecha: ${m.date}${wd ? ` (${wd})` : ''}${m.project ? `\n- Proyecto: ${m.project}` : ''}
- Duración: ${fmtT(m.durationSec)}
- Participantes declarados: ${(m.participants || []).join(', ') || '(no indicados)'}
- Contexto: ${m.context || '(no indicado)'}
${notes ? `\nNotas del usuario durante la reunión:\n${notes}\n` : ''}${marks ? `\nMomentos que el usuario marcó como importantes:\n${marks}\n` : ''}${prevCtx ? `\n${prevCtx}\n` : ''}
Transcripción:
${transcriptText(m, segs)}

Genera el acta llamando a la herramienta guardar_acta una sola vez, con todos los campos completos. No escribas texto fuera de la herramienta.`;
  const r = await claude({ system, messages: [{ role: 'user', content: user }], tools: [{ name: 'guardar_acta', description: 'Guarda el acta estructurada de la reunión', input_schema: ANALYSIS_SCHEMA }], tool_choice: { type: 'auto' }, max_tokens: 32000, onProgress, kind: 'acta' });
  let input = r.toolInput;
  if (!input && r.text) { try { let t = r.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, ''); const a0 = t.indexOf('{'), b0 = t.lastIndexOf('}'); input = JSON.parse(t.slice(a0, b0 + 1)); } catch {} }
  if (!input) throw { code: 'bad_json', message: r.stop === 'max_tokens' ? 'La reunión es muy larga para un solo análisis. Prueba con Claude Opus en Ajustes.' : 'Claude no devolvió el acta. Toca Reintentar.' };
  return normalize(input, m.durationSec || segDuration(segs), m.titleHint);
}
/* Earlier meetings of the same project, sent as short context (summaries only, never transcripts) */
function projectMeetings(project, exceptId) { const p = fold(project).trim(); if (!p) return []; return S.meetings.filter(x => x.id !== exceptId && fold(x.project).trim() === p).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || 0) - (b.createdAt || 0)); }
function projectContext(m) {
  if (!m.project) return '';
  const before = projectMeetings(m.project, m.id).filter(x => x.analysis && ((x.date || '') < (m.date || '') || ((x.date || '') === (m.date || '') && (x.createdAt || 0) < (m.createdAt || 0))));
  if (!before.length) return '';
  const L = [`Reuniones anteriores del proyecto "${m.project}" (resumen, de la más antigua a la más reciente):`];
  before.slice(-3).forEach(x => { const a = x.analysis; L.push(`• ${x.date} — ${a.title}: ${a.tldr}`); (a.decisions || []).slice(0, 6).forEach(d => L.push(`   - Decisión: ${d.text}`)); });
  const pend = []; before.forEach(x => (x.analysis.actions || []).forEach((t, i) => { if (!t.done) pend.push(`   ref ${x.id}|${i}: ${t.task} — ${t.owner}${t.due ? ' · ' + t.due : ''} (de ${x.date})`); }));
  if (pend.length) { L.push('Tareas pendientes de esas reuniones:'); L.push(...pend.slice(-25)); }
  return L.join('\n');
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
    ficha: arr(a.ficha).filter(x => x && x.label).map(x => ({ label: String(x.label), value: String(x.value ?? '') })),
    followUp: a.followUp && typeof a.followUp === 'object' ? { whatsapp: a.followUp.whatsapp || '', emailSubject: a.followUp.emailSubject || '', emailBody: a.followUp.emailBody || '' } : null,
    corrections: arr(a.corrections).filter(x => x && x.wrong && x.right && x.wrong !== x.right).slice(0, 40).map(x => ({ wrong: String(x.wrong), right: String(x.right) })),
    previousTasks: arr(a.previousTasks).filter(x => x && x.ref).map(x => ({ ref: String(x.ref), status: ['hecha', 'en curso', 'sin novedad'].includes(x.status) ? x.status : 'sin novedad', note: x.note || '' })),
    continuity: a.continuity || '', detected: TEMPLATES[a.detected] && a.detected !== 'auto' ? a.detected : '',
    study: a.study && typeof a.study === 'object' && (a.study.notes || a.study.flashcards?.length) ? { notes: a.study.notes || '', exam: arr(a.study.exam).filter(x => x && x.text).map(x => ({ text: String(x.text), t: Number.isFinite(+x.t) && x.t != null ? +x.t : null })), glossary: arr(a.study.glossary).filter(g => g && g.term).map(g => ({ term: String(g.term), def: String(g.def || '') })), flashcards: arr(a.study.flashcards).filter(c => c && c.q && c.a).map(c => ({ q: String(c.q), a: String(c.a) })), quiz: arr(a.study.quiz).filter(q => q && q.q && Array.isArray(q.options) && q.options.length >= 2).map(q => ({ q: String(q.q), options: q.options.slice(0, 4).map(String), answer: Math.max(0, Math.min(q.options.length - 1, +q.answer || 0)), why: q.why || '' })) } : null,
    actions: arr(a.actions).map(x => ({ id: uid(), task: x.task || String(x), owner: x.owner || 'Sin asignar', due: x.due || '', dueDate: /^\d{4}-\d{2}-\d{2}$/.test(x.dueDate || '') ? x.dueDate : '', t: Number.isFinite(+x.t) && x.t !== '' && x.t != null ? +x.t : null, quote: x.quote ? String(x.quote) : '', priority: ['alta', 'media', 'baja'].includes(x.priority) ? x.priority : 'media', done: false })),
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
function setProgress(id, text, pct) {
  S.progress[id] = text; S.progressPct = S.progressPct || {}; if (pct !== undefined) S.progressPct[id] = pct;
  if (S.route.view !== 'meeting' || S.route.id !== id) return;
  const el = $('#proc-detail'); if (el) el.textContent = text;
  const bar = $('#proc-bar'); if (bar && S.progressPct[id] != null) { bar.hidden = false; bar.firstElementChild.style.width = Math.round(S.progressPct[id] * 100) + '%'; }
}
/* Long audio: cut into ~5 min pieces at quiet moments and transcribe them at the same time (same cost, much faster) */
const CHUNK_SEC = 300, PARALLEL = 4;
const MAX_SPLIT_SEC = (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) ? 40 * 60 : 150 * 60;
async function splitAudio(blob) {
  const SR = 16000; const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC) return null;
  const ctx = new OAC(1, SR, SR); const ab = await blob.arrayBuffer();
  const buf = await new Promise((res, rej) => { try { const pr = ctx.decodeAudioData(ab, res, rej); if (pr && pr.then) pr.then(res, rej); } catch (e) { rej(e); } });
  const sr = buf.sampleRate; const n = buf.length; const total = n / sr; if (total < CHUNK_SEC * 1.3) return null;
  let data = buf.getChannelData(0);
  if (buf.numberOfChannels > 1) { const mix = new Float32Array(n); for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) mix[i] += d[i] / buf.numberOfChannels; } data = mix; }
  const win = Math.floor(sr * .1); const energy = (a) => { let e = 0; for (let i = a; i < Math.min(n, a + win); i++) e += data[i] * data[i]; return e; };
  const cuts = [0];
  for (let t = CHUNK_SEC; t < total - 60; t += CHUNK_SEC) { let best = Math.floor(t * sr), be = Infinity; for (let s0 = Math.floor((t - 12) * sr); s0 < Math.floor((t + 12) * sr); s0 += win) { const e = energy(s0); if (e < be) { be = e; best = s0; } } cuts.push(best + Math.floor(win / 2)); }
  cuts.push(n);
  const out = [];
  for (let k = 0; k < cuts.length - 1; k++) out.push({ start: cuts[k] / sr, blob: new Blob([wavBytes(data.subarray(cuts[k], cuts[k + 1]), sr)], { type: 'audio/wav' }) });
  return out;
}
async function pool(items, limit, fn) { const res = new Array(items.length); let next = 0; const run = async () => { while (next < items.length) { const i = next++; res[i] = await fn(items[i], i); } }; await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run)); return res; }
async function processMeeting(id, { template } = {}) {
  if (S.running.has(id)) return; S.running.add(id);
  let m = meetingById(id) || await DB.get('meetings', id);
  if (!navigator.onLine) { await patchMeeting(id, { status: 'waiting', error: null, template: template || m.template }); S.running.delete(id); render(); return; }
  try {
    let segs = await getSegments(id);
    if (!segs.length) {
      if (!Settings.v.openaiKey) {
        if (m.liveSegments?.length) { segs = m.liveSegments; await DB.put('transcripts', { segments: segs }, id); }
        else throw { code: 'no_openai', message: 'Para transcribir el audio agrega tu clave de OpenAI en Ajustes. También puedes pegar una transcripción.' };
      } else {
        if (!m.audioParts?.length) throw { code: 'no_audio', message: 'Esta reunión no tiene audio ni transcripción.' };
        m = await patchMeeting(id, { status: 'transcribing', error: null }); render();
        const jobs = [];
        for (let p = 0; p < m.audioParts.length; p++) {
          const part = m.audioParts[p]; const blob = await DB.get('audio', part.key);
          if (!blob) throw { code: 'no_audio', message: 'No encuentro el audio de esta reunión en el dispositivo.' };
          const next = m.audioParts[p + 1]; const partDur = (next ? next.offset : (m.durationSec || 0)) - (part.offset || 0);
          let pieces = null;
          if (partDur > CHUNK_SEC * 1.3 && partDur <= MAX_SPLIT_SEC) { setProgress(id, 'Preparando el audio para transcribir más rápido…', 0); try { pieces = await splitAudio(blob); } catch (e) { console.warn('split', e); } }
          if (pieces) pieces.forEach(pc => jobs.push({ blob: pc.blob, offset: (part.offset || 0) + pc.start, dur: 0 }));
          else jobs.push({ blob, offset: part.offset || 0, dur: partDur });
        }
        jobs.forEach((j, i) => { const nx = jobs[i + 1]; j.dur = j.dur || ((nx ? nx.offset : (m.durationSec || j.offset + CHUNK_SEC)) - j.offset); });
        const t0 = Date.now(); let doneN = 0;
        const label = () => { if (jobs.length === 1) return `Transcribiendo ${fmtT(m.durationSec)} de audio…`; const el = (Date.now() - t0) / 1000; const rem = doneN ? Math.max(5, el / doneN * (jobs.length - doneN)) : null; return `Transcribiendo en ${jobs.length} trozos a la vez · ${doneN} de ${jobs.length} listos${rem ? ` · falta ~${rem < 60 ? Math.round(rem) + ' s' : Math.ceil(rem / 60) + ' min'}` : ''}`; };
        setProgress(id, label(), jobs.length > 1 ? .03 : null);
        const tick = jobs.length === 1 ? setInterval(() => { const el = (Date.now() - t0) / 1000; const est = Math.max(30, (m.durationSec || 60) * .45); setProgress(id, `Transcribiendo ${fmtT(m.durationSec)} de audio · ${Math.round(el)} s`, Math.min(.95, el / est)); }, 1000) : null;
        let results;
        try {
          results = await pool(jobs, PARALLEL, async (j, i) => {
            let r; try { r = await openaiTranscribe(j.blob, j.offset, i); } catch (e) { if (/bad_openai_key|network/.test(e.code || '')) throw e; await sleep(1500); r = await openaiTranscribe(j.blob, j.offset, i); }
            doneN++; setProgress(id, label(), doneN / jobs.length); return r;
          });
        } finally { clearInterval(tick); }
        const all = results.flat();
        segs = mergeSegments(all);
        if (!segs.length) throw { code: 'empty', message: 'No se detectó voz en la grabación. Revisa que el micrófono haya captado audio.' };
        await DB.put('transcripts', { segments: segs }, id);
        if (!m.durationSec) m.durationSec = segDuration(segs);
      }
    }
    setProgress(id, '', null);
    m = await patchMeeting(id, { status: 'analyzing', error: null, hasTranscript: true, words: wordCount(segs), durationSec: m.durationSec || segDuration(segs) }); render();
    setProgress(id, `Claude está leyendo ${nf(wordCount(segs))} palabras…`);
    const tpl = template || m.template || 'general';
    const analysis = await analyze(m, segs, tpl, n => setProgress(id, `Escribiendo el acta… ${nf(n)} caracteres`));
    const speakers = { ...(m.speakers || {}) };
    analysis.speakers.forEach(sp => { if (sp.name && !m.speakersEdited?.[sp.label]) speakers[sp.label] = sp.name; });
    const prev = m.analysis?.actions || [];
    analysis.actions.forEach(a => { const old = prev.find(p => p.task === a.task); if (old) a.done = old.done; });
    if (analysis.corrections.length) { const fixed = applyCorrections(segs, analysis.corrections); if (fixed) await DB.put('transcripts', { segments: segs }, id); }
    let closed = 0;
    for (const pt of analysis.previousTasks) {
      if (pt.status !== 'hecha') continue; const [mid, i] = pt.ref.split('|'); const pm = meetingById(mid); const t = pm?.analysis?.actions?.[+i];
      if (t && !t.done) { t.done = true; t.closedBy = id; await saveMeeting(pm); closed++; }
    }
    await patchMeeting(id, { status: 'ready', error: null, analysis, template: tpl, speakers, analyzedAt: Date.now() });
    toast(closed ? `Acta lista · ${closed} ${closed === 1 ? 'tarea anterior marcada' : 'tareas anteriores marcadas'} como hecha${closed === 1 ? '' : 's'}` : `Acta lista: ${analysis.title}`, 4500);
    try { if (navigator.vibrate) navigator.vibrate([90, 70, 90]); } catch {}
    try { if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') { const reg = await navigator.serviceWorker?.ready; reg?.showNotification('Tu acta está lista', { body: analysis.title, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'acta-' + id, data: { url: './#m/' + id } }); } } catch {}
  } catch (e) {
    console.error(e);
    if (e.code === 'network' || !navigator.onLine) await patchMeeting(id, { status: 'waiting', error: null });
    else await patchMeeting(id, { status: 'error', error: { code: e.code || 'error', message: e.message || 'No se pudo completar el proceso.' } });
  } finally { S.running.delete(id); delete S.progress[id]; if (S.progressPct) delete S.progressPct[id]; render(); }
}

function applyCorrections(segs, corr) {
  let n = 0;
  const rules = corr.map(c => ({ rx: new RegExp('(^|[^\\p{L}\\p{N}])(' + c.wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?=$|[^\\p{L}\\p{N}])', 'giu'), right: c.right }));
  segs.forEach(x => rules.forEach(r => { const before = x.text; x.text = x.text.replace(r.rx, (_, pre) => pre + r.right); if (x.text !== before) n++; }));
  return n;
}
/* Offline: meetings wait for the connection and process themselves when it returns */
function processWaiting() { if (!navigator.onLine) return; for (const m of S.meetings) if (['waiting', 'queued'].includes(m.status) && !S.running.has(m.id)) processMeeting(m.id); }
window.addEventListener('online', () => { document.body.classList.remove('offline'); const w = S.meetings.filter(m => m.status === 'waiting').length; if (w) toast(`Volvió internet: procesando ${w} ${w === 1 ? 'reunión' : 'reuniones'}`); processWaiting(); });
window.addEventListener('offline', () => { document.body.classList.add('offline'); render(); });

/* =========================================================
   Recorder
   ========================================================= */
/* App nativa de iPhone (Capacitor): la grabadora nativa sigue grabando con la pantalla bloqueada o en otra app */
const NAT = (() => { try { const C = window.Capacitor; return C && C.isNativePlatform && C.isNativePlatform() && C.getPlatform() === 'ios' && C.isPluginAvailable && C.isPluginAvailable('ActaRecorder') ? C : null; } catch { return null; } })();
if (NAT) document.documentElement.classList.add('native');
const natCall = (method, opts = {}) => NAT.nativePromise('ActaRecorder', method, opts);
const Rec = {
  native: !!NAT, nElapsed: 0, nLevel: 0, nSubs: [],
  state: 'idle', stream: null, mr: null, ctx: null, analyser: null, mime: '', recId: null,
  activeMs: 0, lastStart: 0, part: 0, partStartSec: 0, seq: 0, parts: [], marks: [], notesLog: [], live: [], photos: [], capturing: false, wake: null, raf: 0, tick: 0, sr: null, interim: '',
  isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  elapsed() { if (this.native) return this.nElapsed * 1000; return this.activeMs + (this.state === 'recording' ? performance.now() - this.lastStart : 0); },
  pickMime() { const c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac']; for (const t of c) if (window.MediaRecorder && MediaRecorder.isTypeSupported?.(t)) return t; return ''; },
  async start(meta) {
    if (this.native) return this.startNative(meta);
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw { message: 'Este navegador no permite grabar audio. Usa Chrome (Android) o Safari (iPhone) actualizados.' };
    try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }); }
    catch (e) { throw { message: e.name === 'NotAllowedError' ? 'Acta necesita permiso para usar el micrófono. Actívalo en los permisos del sitio y vuelve a intentarlo.' : 'No se pudo acceder al micrófono: ' + e.message }; }
    this.mime = this.pickMime(); this.recId = uid(); this.startedAt = Date.now(); this.pending = new Set(); this.activeMs = 0; this.part = 0; this.seq = 0; this.parts = [{ part: 0, offset: 0 }]; this.marks = []; this.notesLog = []; this.live = []; this.photos = []; this.meta = meta;
    this.attachAnalyser(); this.watchTracks();
    this.startPart(0);
    this.state = 'recording'; this.lastStart = performance.now();
    this.saveActive(); this.lockScreen(); if (Settings.v.captions || !Settings.v.openaiKey) this.startCaptions();
    window.addEventListener('beforeunload', this.guard); document.addEventListener('visibilitychange', this.onHide); window.addEventListener('pagehide', this.onHide);
    document.removeEventListener('visibilitychange', this.onVis); document.addEventListener('visibilitychange', this.onVis); window.addEventListener('pageshow', this.onVis);
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch {}
    this.tick = setInterval(() => { if (this.state === 'recording' && this.elapsed() / 1000 - this.partStartSec >= PART_SEC) this.rotate(); this.saveActive(); }, 5000);
  },
  async startNative(meta) {
    this.mime = 'audio/mp4'; this.recId = uid(); this.startedAt = Date.now(); this.pending = new Set(); this.activeMs = 0; this.nElapsed = 0; this.part = 0; this.seq = 0; this.parts = []; this.marks = []; this.notesLog = []; this.live = []; this.photos = []; this.meta = meta;
    this.nSubs = [
      NAT.addListener('ActaRecorder', 'level', d => { this.nLevel = d.level || 0; this.nElapsed = d.elapsed || 0; if (d.state === 'recording' && this.state === 'interrupted') this.nativeResumed(); }),
      NAT.addListener('ActaRecorder', 'partSaved', d => this.storeNativePart(d)),
      NAT.addListener('ActaRecorder', 'interrupted', d => { if (this.state !== 'recording') return; this.nElapsed = d.at || this.nElapsed; this.state = 'interrupted'; this.marks.push({ t: Math.round(this.nElapsed), label: 'Pausa automática · ' + (d.reason || 'micrófono ocupado'), auto: true }); this.saveActive(); if (S.route.view === 'record') render(); }),
      NAT.addListener('ActaRecorder', 'resumed', () => this.nativeResumed())
    ];
    try { await natCall('start', { id: this.recId, partSec: PART_SEC, bitrate: +Settings.v.bitrate || 32000 }); }
    catch (e) { this.nSubs.forEach(x => x.remove()); this.nSubs = []; throw { message: e.message || 'No se pudo iniciar la grabación' }; }
    this.state = 'recording'; this.lastStart = performance.now();
    this.analyser = { getByteTimeDomainData: a => { const l = this.nLevel; for (let i = 0; i < a.length; i++) a[i] = 128 + Math.round(Math.sin(i * .35 + performance.now() / 90) * l * 28); }, getByteFrequencyData: a => { const l = this.nLevel; for (let i = 0; i < a.length; i++) a[i] = Math.max(0, Math.min(255, Math.round(l * 255 * (1 - i / a.length) * (.7 + .3 * Math.sin(i * .9 + performance.now() / 120))))); } };
    this.saveActive();
    window.addEventListener('beforeunload', this.guard);
    this.tick = setInterval(() => this.saveActive(), 5000);
  },
  nativeResumed() { if (this.state !== 'interrupted') return; this.state = 'recording'; this.marks.push({ t: Math.round(this.nElapsed), label: 'Grabación retomada', auto: true }); this.saveActive(); if (S.route.view === 'record') render(); toast('Grabación retomada'); },
  storeNativePart(d) {
    if (!this.recId || d == null) return; const recId = this.recId;
    if (!this.parts.some(x => x.part === d.part)) this.parts.push({ part: d.part, offset: d.offset || 0 });
    const pr = fetch(NAT.convertFileSrc(d.path)).then(r => r.blob()).then(b => DB.put('chunks', { recId, part: d.part, seq: this.seq++, blob: new Blob([b], { type: 'audio/mp4' }), type: 'audio/mp4' })).catch(() => {});
    this.pending.add(pr); pr.finally(() => this.pending.delete(pr)); this.saveActive();
  },
  startPart(p) {
    const opts = { audioBitsPerSecond: +Settings.v.bitrate || 32000 }; if (this.mime) opts.mimeType = this.mime;
    const mr = new MediaRecorder(this.stream, opts); this.mime = mr.mimeType || this.mime;
    const recId = this.recId;
    mr.ondataavailable = e => { if (e.data && e.data.size) { const pr = DB.put('chunks', { recId, part: p, seq: this.seq++, blob: e.data, type: mr.mimeType }).catch(() => {}); this.pending.add(pr); pr.finally(() => this.pending.delete(pr)); } };
    mr.start(4000); this.mr = mr; this.part = p; this.partStartSec = this.elapsed() / 1000;
  },
  attachAnalyser() { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); const src = this.ctx.createMediaStreamSource(this.stream); this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 1024; this.analyser.smoothingTimeConstant = .7; src.connect(this.analyser); } catch {} },
  watchTracks() { this.stream?.getAudioTracks().forEach(t => {
    t.addEventListener('ended', () => { if (this.state === 'recording' && this.stream && this.stream.getAudioTracks().includes(t)) this.interrupt('Otra app ocupó el micrófono'); });
    /* Android: WhatsApp (audio o llamada) toma el micrófono y la pista queda "muda"; marcamos el hueco y seguimos solos al soltarlo */
    t.addEventListener('mute', () => { if (this.state === 'recording' && this.stream?.getAudioTracks().includes(t)) { this.muteAt = Math.round(this.elapsed() / 1000); this.marks.push({ t: this.muteAt, label: 'Micrófono ocupado por otra app', auto: true }); this.saveActive(); this.notifyPause(); } });
    t.addEventListener('unmute', () => { if (this.muteAt != null && this.stream?.getAudioTracks().includes(t)) { this.marks.push({ t: Math.round(this.elapsed() / 1000), label: 'Micrófono recuperado', auto: true }); this.muteAt = null; this.saveActive(); this.clearPauseNote(); } });
  }); },
  async notifyPause() { try { if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') { const reg = await navigator.serviceWorker?.ready; reg?.showNotification('Acta: grabación en pausa', { body: 'Otra app usó el micrófono. Vuelve a Acta y la grabación sigue sola.', icon: 'icon-192.png', badge: 'icon-192.png', tag: 'acta-rec', renotify: true, requireInteraction: true, data: { url: './#record' } }); } } catch {} },
  async clearPauseNote() { try { const reg = await navigator.serviceWorker?.getRegistration(); (await reg?.getNotifications({ tag: 'acta-rec' }) || []).forEach(n => n.close()); } catch {} },
  async autoContinue() {
    if (this.state !== 'interrupted' || this.resuming) return; this.resuming = true;
    for (let i = 0; i < 6 && this.state === 'interrupted'; i++) {
      try { await this.continueAfter(); this.clearPauseNote(); if (navigator.vibrate) navigator.vibrate(80); toast('Grabación reanudada sola · lo anterior está guardado'); if (S.route.view === 'record') render(); break; }
      catch { await sleep(1500); } /* el micrófono puede seguir ocupado unos segundos (p. ej. al cortar una llamada) */
    }
    this.resuming = false; if (this.state === 'interrupted' && S.route.view === 'record') render();
  },
  onHide: e => { const hidden = document.visibilityState === 'hidden' || (e && e.type === 'pagehide'); if (hidden && Rec.state === 'recording' && Rec.isIOS && !Rec.capturing) Rec.interrupt('Pantalla bloqueada o app en segundo plano'); },
  interrupt(reason) {
    if (this.state !== 'recording') return;
    this.activeMs = this.elapsed(); this.state = 'interrupted';
    const mr = this.mr; try { mr.requestData(); } catch {} try { mr.stop(); } catch {}
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    try { this.ctx?.close(); } catch {} this.ctx = null; this.analyser = null;
    this.stopCaptions();
    this.marks.push({ t: Math.round(this.activeMs / 1000), label: 'Pausa automática · ' + reason, auto: true });
    this.saveActive();
    try { Pocket.off(); } catch {}
    this.notifyPause();
    if (S.route.view === 'record') render();
    if (document.visibilityState === 'visible') setTimeout(() => this.autoContinue(), 1200);
  },
  async continueAfter() {
    if (this.state !== 'interrupted') return;
    if (this.native) { try { await natCall('resume'); } catch (e) { throw { message: e.message || 'El micrófono sigue ocupado. Intenta en unos segundos.' }; } this.nativeResumed(); return; }
    let s;
    try { s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }); }
    catch (e) { throw { message: e.name === 'NotAllowedError' ? 'Acta necesita permiso para usar el micrófono. Actívalo y toca Continuar otra vez.' : 'No se pudo reactivar el micrófono: ' + e.message }; }
    this.stream = s; this.attachAnalyser(); this.watchTracks();
    const next = this.part + 1; const off = this.activeMs / 1000;
    this.parts.push({ part: next, offset: off });
    this.lastStart = performance.now(); this.state = 'recording';
    this.startPart(next); this.partStartSec = off;
    this.lockScreen(); if (Settings.v.captions || !Settings.v.openaiKey) this.startCaptions();
    this.saveActive();
  },
  rotate() { const old = this.mr; const next = this.part + 1; const off = this.elapsed() / 1000; this.parts.push({ part: next, offset: off });
    try { this.startPart(next); setTimeout(() => { try { old.requestData(); } catch {} try { old.stop(); } catch {} }, 250); }
    catch { try { old.stop(); } catch {} this.startPart(next); }
    this.partStartSec = off; },
  pause() { if (this.native) { if (this.state === 'recording') { this.state = 'paused'; natCall('pause').catch(() => {}); this.saveActive(); } return; } if (this.state !== 'recording') return; this.activeMs = this.elapsed(); this.state = 'paused'; try { this.mr.pause(); } catch {} this.saveActive(); },
  resume() { if (this.native) { if (this.state === 'paused') { this.state = 'recording'; natCall('resume').catch(e => toast(e.message || 'No se pudo retomar')); } return; } if (this.state !== 'paused') return; this.lastStart = performance.now(); this.state = 'recording'; try { this.mr.resume(); } catch {} },
  addMark(label) { const t = Math.round(this.elapsed() / 1000); this.marks.push({ t, label: label || '' }); this.saveActive(); return t; },
  addNote(text) { const t = Math.round(this.elapsed() / 1000); this.notesLog.push({ t, text }); this.saveActive(); return t; },
  saveActive() { if (!this.recId) return; DB.put('kv', { recId: this.recId, mime: this.mime, startedAt: this.startedAt || (this.startedAt = Date.now()), elapsed: Math.round(this.elapsed() / 1000), parts: this.parts, marks: this.marks, notesLog: this.notesLog, live: this.live, photos: this.photos, meta: this.meta }, 'activeRec').catch(() => {}); },
  async stop() {
    if (this.state === 'idle') return null;
    if (this.native) {
      this.state = 'stopping'; let r = {};
      try { r = await natCall('stop'); } catch {}
      (r.parts || []).forEach(d => { if (!this.parts.some(x => x.part === d.part)) this.storeNativePart(d); });
      await Promise.all([...this.pending]);
      const dur = Math.round(r.duration || this.nElapsed);
      this.cleanup();
      const info = { recId: this.recId, mime: this.mime, parts: this.parts.sort((a, b) => a.part - b.part), marks: this.marks, notesLog: this.notesLog, live: this.live, photos: this.photos, meta: this.meta, durationSec: dur, nativeId: this.recId };
      this.state = 'idle'; this.recId = null;
      return info;
    }
    const dur = Math.round(this.elapsed() / 1000);
    this.activeMs = this.elapsed(); this.state = 'stopping';
    await new Promise(res => { const mr = this.mr; if (!mr || mr.state === 'inactive') return res(); mr.addEventListener('stop', () => setTimeout(res, 120), { once: true }); try { mr.stop(); } catch { res(); } });
    await Promise.all([...this.pending]);
    this.cleanup();
    const info = { recId: this.recId, mime: this.mime, parts: this.parts, marks: this.marks, notesLog: this.notesLog, live: this.live, photos: this.photos, meta: this.meta, durationSec: dur };
    this.state = 'idle'; this.recId = null;
    return info;
  },
  async discard() { const id = this.recId; if (this.native) { try { await natCall('stop'); } catch {} if (id) natCall('deleteRecording', { id }).catch(() => {}); } if (this.mr && this.mr.state !== 'inactive') try { this.mr.stop(); } catch {} this.cleanup(); this.state = 'idle'; this.recId = null; await sleep(300); if (id) await DB.delChunks(id); await DB.del('kv', 'activeRec'); },
  cleanup() {
    this.nSubs.forEach(x => { try { x.remove(); } catch {} }); this.nSubs = []; this.nLevel = 0; if (this.native) this.analyser = null;
    clearInterval(this.tick); cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    try { this.ctx?.close(); } catch {} this.ctx = null; this.analyser = null;
    this.stopCaptions(); this.wake?.release?.().catch(() => {}); this.wake = null;
    window.removeEventListener('beforeunload', this.guard); document.removeEventListener('visibilitychange', this.onVis); document.removeEventListener('visibilitychange', this.onHide); window.removeEventListener('pagehide', this.onHide); window.removeEventListener('pageshow', this.onVis); this.clearPauseNote();
  },
  guard(e) { e.preventDefault(); e.returnValue = ''; },
  async lockScreen() { try { if ('wakeLock' in navigator && (!this.wake || this.wake.released)) { this.wake = await navigator.wakeLock.request('screen'); document.removeEventListener('visibilitychange', this.onVis); document.addEventListener('visibilitychange', this.onVis); } } catch {} },
  onVis: async () => { if (document.visibilityState === 'visible' && Rec.state !== 'idle' && (!Rec.wake || Rec.wake.released)) { try { Rec.wake = await navigator.wakeLock.request('screen'); } catch {} } if (document.visibilityState === 'visible' && Rec.state === 'interrupted') { render(); Rec.autoContinue(); } },
  startCaptions() {
    if (this.native) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
    const sr = new SR(); sr.lang = Settings.v.language && Settings.v.language !== 'auto' ? (Settings.v.language === 'es' ? 'es-CL' : Settings.v.language) : 'es-CL'; sr.continuous = true; sr.interimResults = true;
    sr.onresult = e => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) { const text = r[0].transcript.trim(); if (text) this.live.push({ t: Math.max(0, Math.round(this.elapsed() / 1000 - wordsOf(text) / 2.5)), text }); } else interim += r[0].transcript; } this.interim = interim; updateCaption(); };
    sr.onend = () => { if (this.sr === sr && this.state === 'recording') { setTimeout(() => { try { sr.start(); } catch {} }, 250); } };
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
  const m = { id, createdAt: Date.now(), date: today(), durationSec: info.durationSec || info.elapsed || 0, titleHint: meta.title || '', participants: meta.participants || [], template: meta.template || 'general', context: meta.context || '', project: meta.project || '', notes: '', notesLog: info.notesLog || [], marks: info.marks || [], photos: info.photos || [], audioParts: parts, liveSegments: live, speakers: {}, status: parts.length ? 'queued' : 'error', source: 'record', ...extra };
  if (!parts.length) m.error = { code: 'no_audio', message: 'No se guardó audio de esta grabación.' };
  await saveMeeting(m);
  await DB.delChunks(info.recId); await DB.del('kv', 'activeRec');
  if (NAT && (info.nativeId || info.recId)) natCall('deleteRecording', { id: info.nativeId || info.recId }).catch(() => {});
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
  const [a, b, c] = location.hash.slice(1).split('/').map(x => { try { return decodeURIComponent(x); } catch { return x; } });
  if (a === 'm' && b) return { view: 'meeting', id: b, tab: c || 'resumen' };
  if (a === 'p' && b) return { view: 'project', id: b };
  if (a === 'per' && b) return { view: 'person', id: b };
  if (a === 'rep' && b && c) return { view: 'review', kind: b, id: c };
  if (a === 'prep' && b && c) return { view: 'prep', kind: b, id: c };
  if (['record', 'import', 'settings', 'tasks', 'week', 'projects', 'people'].includes(a)) return { view: a };
  return { view: 'library' };
}
function go(hash) { if (location.hash.slice(1) === hash) { onRoute(); return; } location.hash = hash; }
function onRoute() {
  const prev = S.route; S.route = parseHash();
  if (Rec.state !== 'idle' && S.route.view !== 'record') { S.route = { view: 'record' }; history.replaceState(null, '', '#record'); toast('Estás grabando. Detén la grabación para salir.'); }
  if (prev.view !== S.route.view || prev.id !== S.route.id || prev.kind !== S.route.kind) { S.trq = ''; window.scrollTo(0, 0); closeSheet(); }
  if (S.trqNext) { S.trq = S.trqNext; S.trqNext = null; }
  render();
}
window.addEventListener('hashchange', onRoute);
document.addEventListener('click', e => { const b = e.target.closest('[data-nav]'); if (!b) return; const v = b.dataset.nav; go(v === 'library' ? '' : v); });
let qT; $('#q').addEventListener('input', e => { S.q = e.target.value.trim(); clearTimeout(qT); qT = setTimeout(() => { if (S.route.view !== 'library') go(''); else render(); }, 160); });

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
  if (v === 'week') return renderWeek(app);
  if (v === 'projects') return renderProjects(app);
  if (v === 'project') return renderProject(app, S.route.id);
  if (v === 'people') return renderPeople(app);
  if (v === 'review') return renderReview(app, S.route.kind, S.route.id);
  if (v === 'person') return renderPerson(app, S.route.id);
  if (v === 'prep') return renderPrep(app, S.route.kind, S.route.id);
  if (v === 'meeting') { const m = meetingById(S.route.id); if (m) return renderMeeting(app, m); if (S.loaded) { app.innerHTML = `<div class="empty"><h3>No encuentro esta reunión</h3><p>Puede que se haya eliminado.</p><button class="btn" data-nav="library">Volver a reuniones</button></div>`; return; } }
  renderLibrary(app);
}

/* =========================================================
   Library (home)
   ========================================================= */
const AV_COLORS = ['#FF9A6B', '#7FE0FF', '#5FEBC4', '#C3A6FF', '#FFD27A', '#FF85A8'];
function initials(n) { const p = String(n || '').trim().split(/\s+/).filter(Boolean); return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '·'; }
function avatarsHTML(names, max = 4) { const list = names.filter(Boolean).slice(0, max); return `<div class="avatars">${list.map((n, i) => `<span class="av" style="background:${AV_COLORS[i % 6]}" title="${esc(n)}">${esc(initials(n))}</span>`).join('')}${names.length > max ? `<span class="av" style="background:#2A2F3E;color:#fff">+${names.length - max}</span>` : ''}</div>`; }
function ringSVG(pct, color, size = 42, stroke = 5) { const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct)); return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><circle class="bgc" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/><circle class="fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke="${color}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/></svg>`; }
function greeting() { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'; }
function miniTopicBar(m) {
  const t = m.analysis?.topics || []; if (!t.length) return '';
  const tot = t.reduce((a, x) => a + Math.max(1, x.end - x.start), 0);
  return `<div class="topicbar" aria-hidden="true">${t.map((x, i) => `<i style="width:${Math.max(1, x.end - x.start) / tot * 100}%;background:${tc(i)}"></i>`).join('')}</div>`;
}
const STATUS_TXT = { waiting: 'Esperando internet', queued: 'En cola', transcribing: 'Transcribiendo', analyzing: 'Analizando', error: 'Requiere atención' };
function budgetHTML() {
  const la = Usage.left('anthropic'), lo = Usage.left('openai');
  const ba = Usage.v.anthropic.balance || 1, bo = Usage.v.openai.balance || 1;
  const hours = lo / (STT_PER_MIN * 60), actas = la / Usage.avg('anthropic', 'acta', 0.1);
  const col = (l, b) => l / b < .2 ? 'var(--risk)' : 'var(--g-cool)';
  return `<button class="budget" data-nav="settings" aria-label="Ver saldo estimado">
    <span class="bi">${icon('money', 2)}</span>
    <div class="bud"><div class="top"><span>Claude · actas</span><b data-left="anthropic">${money(la)}</b></div><div class="bar-meter"><i style="width:${Math.min(100, la / ba * 100)}%;background:${col(la, ba)}"></i></div></div>
    <div class="bud"><div class="top"><span>OpenAI · transcripción</span><b data-left="openai">${money(lo)}</b></div><div class="bar-meter"><i style="width:${Math.min(100, lo / bo * 100)}%;background:${col(lo, bo)}"></i></div></div>
    <div class="est">Alcanza para <b>≈ ${hours >= 10 ? Math.floor(hours) : hours.toFixed(1).replace('.', ',')} h</b> de grabación <br>y <b>≈ ${Math.floor(actas)} actas</b></div>
  </button>`;
}
function renderLibrary(app) {
  const q = S.q; const fq = fold(q);
  const list = S.meetings.filter(m => !q || fold([m.analysis?.title, m.titleHint, m.analysis?.tldr, m.project, (m.analysis?.tags || []).join(' '), (m.participants || []).join(' '), Object.values(m.speakers || {}).join(' ')].join(' ')).includes(fq));
  const allActs = S.meetings.flatMap(m => m.analysis?.actions || []);
  const pending = allActs.filter(x => !x.done).length, doneN = allActs.length - pending;
  const now = new Date(); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const thisMonth = S.meetings.filter(m => (m.createdAt || 0) >= monthStart);
  const hours = S.meetings.reduce((a, m) => a + (m.durationSec || 0), 0) / 3600;
  const decisions = S.meetings.reduce((a, m) => a + (m.analysis?.decisions?.length || 0), 0);
  const needsKeys = adminView() && (!Settings.v.anthropicKey || !Settings.v.openaiKey);
  const notActive = !isAdmin() && (!Settings.v.anthropicKey || !Settings.v.openaiKey);
  const low = adminView() && Settings.v.anthropicKey && (Usage.left('anthropic') < 1 || (Settings.v.openaiKey && Usage.left('openai') < 1));
  app.innerHTML = `
  ${S.recovery ? `<div class="notice" style="margin-bottom:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span style="flex:1;min-width:220px"><b>Hay una grabación sin terminar</b> de ${fmtT(S.recovery.elapsed)}. La app se cerró mientras grababas, pero el audio quedó guardado.</span><button class="btn sm primary" id="rec-recover">Recuperar y procesar</button><button class="btn sm ghost danger" id="rec-discard">Descartar</button></div>` : ''}
  ${notActive && S.loaded ? `<div class="notice info" style="margin-bottom:14px"><b>Tu cuenta aún no está activada.</b> Puedes grabar y tus reuniones quedan guardadas; las actas se crearán apenas se active tu plan.</div>` : ''}
  ${S.moveNotice ? `<div class="notice info" style="margin-bottom:14px"><b>Acta ahora vive en ${S.moveNotice}/app.</b> Para llevar tus reuniones: toca <b>Respaldar ahora</b> (respaldo completo), abre <b>${S.moveNotice}/app</b> en Safari o Chrome, agrégala a la pantalla de inicio y en Ajustes usa <b>Importar respaldo</b>. Luego vuelve a pegar tus claves. <button class="btn sm primary" id="mv-bk" style="margin-top:8px">Respaldar ahora</button></div>` : ''}
  ${backupDue() ? `<div class="notice" style="margin-bottom:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span style="flex:1;min-width:220px"><b>${Settings.v.lastBackup ? 'Hace más de una semana que no respaldas.' : 'Aún no tienes respaldo de tus reuniones.'}</b> Si cambias o pierdes el teléfono, el respaldo es la única copia.</span><button class="btn sm primary" id="bk-now">${icon('download')}Respaldar ahora</button><button class="btn sm ghost" id="bk-later">Después</button></div>` : ''}
  ${needsKeys && S.loaded ? `<div class="notice info" style="margin-bottom:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span style="flex:1;min-width:220px">${S.meetings.some(m => !String(m.id).startsWith('ejemplo-')) || !IS_STANDALONE ? `<b>Faltan tus claves en esta pantalla.</b> ${IS_STANDALONE ? 'Pégalas de nuevo en Ajustes; desde ahora quedan con respaldo.' : 'Estás en el navegador, no en la app instalada: Safari, el ícono de inicio y los links de WhatsApp guardan sus datos por separado. Abre Acta desde el ícono de tu pantalla de inicio.'}` : '<b>Configura Acta en 2 minutos.</b> Agrega tus claves de Claude y OpenAI para transcribir con hablantes y crear las actas.'}</span><button class="btn sm primary" data-nav="settings">${icon('key')}Ir a Ajustes</button></div>` : ''}
  ${low ? `<div class="notice" style="margin-bottom:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span style="flex:1;min-width:220px"><b>Te queda poco saldo.</b> Recarga en la consola del proveedor para no quedarte sin actas en medio de una reunión.</span><button class="btn sm" data-nav="settings">Ver saldo</button></div>` : ''}
  ${q ? '' : `<section class="home-hero rise">
    <span class="aura a1"></span><span class="aura a2"></span><span class="aura a3"></span>
    <div class="hh-grid">
      <div>
        <div class="eyebrow">${greeting()} · ${esc(now.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
        <h1>Cada conversación,<br><span class="grad">convertida en trabajo.</span></h1>
        <p class="sub">Graba, y Acta separa quién dijo qué, detecta decisiones y tareas, y te entrega un informe listo para compartir.</p>
      </div>
      <button class="orb-btn" data-nav="record" aria-label="Grabar ahora"><span class="halo"></span><span class="halo h2"></span><span class="core">${icon('mic', 2)}</span><span class="lbl">GRABAR AHORA</span></button>
    </div>
    <div class="hh-stats">
      <div class="hstat">${ringSVG(Math.min(1, thisMonth.length / 20), '#FF7A45')}<div><b>${thisMonth.length}</b><span>Reuniones este mes</span></div></div>
      <div class="hstat">${ringSVG(Math.min(1, hours / 20), '#5AD8FF')}<div><b>${hours >= 10 ? Math.round(hours) : hours.toFixed(1).replace('.', ',')}<small style="font-size:14px;color:var(--muted)"> h</small></b><span>Conversación analizada</span></div></div>
      <div class="hstat">${ringSVG(allActs.length ? doneN / allActs.length : 0, '#33E3B4')}<div><b>${pending}</b><span>Tareas pendientes</span></div></div>
      <div class="hstat">${ringSVG(Math.min(1, decisions / 30), '#A47BFF')}<div><b>${decisions}</b><span>Decisiones registradas</span></div></div>
    </div>
  </section>
  ${adminView() ? (Settings.v.anthropicKey ? budgetHTML() : '') : planHTML(true)}
  ${S.meetings.length ? reviewCardHTML() + owedCardHTML() + weekCardHTML() : ''}
  ${peopleRowHTML()}
  ${projectsRowHTML()}`}
  ${q ? searchHitsHTML(q) : ''}
  <div class="sec-title"><h2>${q ? 'Reuniones que coinciden' : 'Reuniones recientes'}</h2><span class="muted" style="font-size:12.5px">${list.length} ${list.length === 1 ? 'reunión' : 'reuniones'}</span></div>
  ${!S.loaded ? `<div class="empty"><p>Cargando…</p></div>` :
    list.length ? `<div class="grid-lib">${list.map((m, i) => cardHTML(m, i)).join('')}</div>`
    : q ? `<div class="empty-li" style="padding:14px 0">Ningún título o resumen coincide con “${esc(q)}”.</div>`
    : `<div class="empty">${icon('doc', 1.6, 34)}<h3>Aún no hay actas</h3><p style="max-width:48ch">Graba tu próxima conversación o importa un audio o una transcripción que ya tengas.</p><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="btn primary" data-nav="record">${icon('mic')}Grabar</button><button class="btn" data-nav="import">${icon('upload')}Importar</button><button class="btn ghost" id="load-demo">Ver un ejemplo</button></div></div>`}
  <p class="status-line">Todo se guarda solo en este dispositivo${S.meetings.length ? ' · respáldalo desde Ajustes' : ''}</p>`;
  $$('[data-open]', app).forEach(b => b.onclick = () => go('m/' + b.dataset.open));
  const rr = $('#rec-recover'); if (rr) rr.onclick = recoverRecording;
  const bn = $('#bk-now'); if (bn) bn.onclick = exportBackup;
  const mv = $('#mv-bk'); if (mv) mv.onclick = exportBackup;
  const bl = $('#bk-later'); if (bl) bl.onclick = () => { Settings.set({ backupSnooze: Date.now() + 3 * 864e5 }); render(); };
  const rd = $('#rec-discard'); if (rd) rd.onclick = async () => { const r = S.recovery; S.recovery = null; await DB.delChunks(r.recId); await DB.del('kv', 'activeRec'); render(); toast('Grabación descartada'); };
  const ld = $('#load-demo'); if (ld) ld.onclick = loadDemo;
  $$('[data-hit]', app).forEach(b => b.onclick = () => { const [id, tab, t] = b.dataset.hit.split('|'); if (tab === 'transcripcion') { S.jump = +t; S.trqNext = S.q; } go('m/' + id + '/' + tab); });
  $$('[data-proj]', app).forEach(b => b.onclick = () => go('p/' + encodeURIComponent(b.dataset.proj)));
  $$('[data-per]', app).forEach(b => b.onclick = () => go('per/' + encodeURIComponent(b.dataset.per)));
  const hr = $('#home-rep'); if (hr) hr.onclick = () => { const ms = S.meetings.filter(m => m.analysis?.study && cardsOf(m).some(cardDue)); const pj = [...new Set(ms.map(m => m.project).filter(Boolean))]; go(ms.length === 1 ? 'rep/m/' + ms[0].id : pj.length === 1 && ms.every(m => m.project === pj[0]) ? 'rep/j/' + encodeURIComponent(pj[0]) : 'rep/m/' + ms[0].id); };
  if (q && !S.txIndex && !S.txBuilding) buildTxIndex().then(() => { if (S.route.view === 'library' && S.q) render(); });
}
function cardHTML(m, i = 0) {
  const a = m.analysis || {}; const acts = a.actions || []; const done = acts.filter(x => x.done).length;
  const st = m.status && m.status !== 'ready' ? `<span class="chip ${m.status === 'error' ? 'err' : 'proc'}">${STATUS_TXT[m.status] || 'Procesando'}</span>` : '';
  const topics = a.topics || []; const tot = topics.reduce((s, x) => s + Math.max(1, x.end - x.start), 0) || 1;
  const band = topics.length ? topics.map((x, k) => `<i style="flex:${Math.max(1, x.end - x.start) / tot * 100};background:${tc(k)}"></i>`).join('') : `<i style="flex:1;background:var(--g-brand)"></i>`;
  const people = (a.participants?.length ? a.participants : m.participants) || [];
  return `<button class="mcard rise" style="animation-delay:${Math.min(i, 8) * 40}ms" data-open="${esc(m.id)}">
    <div class="mc-band">${band}</div>
    <div class="mc-body">
      <div class="mcard-meta"><span class="mono">${esc(fmtDate(m.date))}</span>${m.durationSec ? `<span class="mono">${esc(fmtT(m.durationSec))}</span>` : ''}${(a.tags || []).includes('ejemplo') ? '<span class="chip ex">Ejemplo</span>' : ''}${st}</div>
      <h3>${esc(a.title || m.titleHint || 'Reunión del ' + fmtDate(m.date))}</h3>
      ${a.tldr ? `<p class="tl">${esc(a.tldr)}</p>` : `<p class="tl">${esc(m.status === 'error' ? (m.error?.message || '') : 'El acta se está preparando…')}</p>`}
      <div class="mc-foot">${people.length ? avatarsHTML(people) : '<span></span>'}${m.analysis ? `<div class="mc-kpis"><span style="color:var(--dec)">${icon('flag', 2)}<b>${(a.decisions || []).length}</b></span><span style="color:var(--act)">${icon('check', 2.4)}<b>${done}/${acts.length}</b></span><span style="color:var(--idea)">${icon('idea', 2)}<b>${(a.ideas || []).length}</b></span></div>` : ''}</div>
    </div>
  </button>`;
}
async function recoverRecording() {
  const r = S.recovery; S.recovery = null;
  toast('Recuperando la grabación…');
  const m = await finishRecording({ recId: r.recId, mime: r.mime, parts: r.parts || [{ part: 0, offset: 0 }], marks: r.marks, notesLog: r.notesLog, live: r.live, photos: r.photos, meta: r.meta, durationSec: r.elapsed });
  go('m/' + m.id); if (m.status === 'queued') processMeeting(m.id);
}

/* =========================================================
   Record view
   ========================================================= */
let recMeta = null;
function renderRecord(app) {
  const st = Rec.state; const on = st !== 'idle'; const intr = st === 'interrupted';
  recMeta = recMeta || { title: '', participants: '', template: 'auto', context: '', project: '' };
  const liveCls = st === 'recording' ? 'on' : (st === 'paused' || intr) ? 'warn' : '';
  const liveTxt = st === 'recording' ? 'Grabando' : st === 'paused' ? 'En pausa' : intr ? 'Grabación en pausa' : 'Listo para grabar';
  app.innerHTML = `
  <div class="rec-grid">
    <section class="stage" aria-label="Grabadora">
      <div class="stage-top">
        <span class="live ${liveCls}" id="live"><i></i><span id="live-txt">${liveTxt}</span></span>
        <span class="rec-size" id="rec-size">${on ? '' : (Settings.v.openaiKey ? 'Hablantes · alta precisión' : 'Dictado del teléfono')}</span>
      </div>
      <div class="orb-wrap"><canvas id="orb" aria-hidden="true"></canvas><div class="orb-center"><div class="timer" id="timer">${fmtClock(Rec.elapsed())}</div><div class="timer-sub" id="timer-sub">${intr ? 'Toca continuar para seguir' : on ? (st === 'paused' ? 'Pausado' : 'Escuchando') : 'Toca el botón para empezar'}</div></div></div>
      ${intr ? `<div class="interrupt"><b>${Rec.resuming ? 'Retomando la grabación…' : 'La grabación se pausó'}</b><span>${Rec.native ? 'Una llamada o un audio de WhatsApp ocupó el micrófono; Acta retoma sola apenas se libera.' : Rec.isIOS ? 'El iPhone no deja que una app web use el micrófono mientras estás en otra app (WhatsApp, llamadas) o con la pantalla bloqueada.' : 'Otra app (WhatsApp, una llamada) tomó el micrófono.'} Lo grabado está a salvo y al volver a Acta sigue sola en la misma reunión. Si no sigue, toca <b>Continuar</b>.</span></div>` : ''}
      <div class="controls">
        <div class="cbtn-lbl"><button class="cbtn" id="r-mark" ${st === 'recording' ? '' : 'disabled'} aria-label="Marcar momento importante">${icon('bookmark', 1.9)}</button>Marcar</div>
        <div class="cbtn-lbl"><button class="bigrec ${on && !intr ? 'on' : ''} ${intr ? 'resume' : ''}" id="r-main" aria-label="${intr ? 'Continuar grabando' : on ? 'Terminar y procesar' : 'Empezar a grabar'}"><span></span></button>${intr ? 'Continuar' : on ? 'Terminar' : 'Grabar'}</div>
        <div class="cbtn-lbl"><button class="cbtn" id="r-pause" ${st === 'recording' || st === 'paused' ? '' : 'disabled'} aria-label="${st === 'paused' ? 'Reanudar' : 'Pausar'}">${icon(st === 'paused' ? 'play' : 'pause', 2)}</button><span id="pause-lbl">${st === 'paused' ? 'Seguir' : 'Pausa'}</span></div>
      </div>
      ${on && !intr ? `<div class="pill-row"><button class="pill cool" id="r-pocket">${icon('lock', 2)}Modo bolsillo</button><button class="pill" id="r-photo">${icon('camera', 2)}Foto</button>${recMeta.template === 'clase' ? `<button class="pill hot" id="r-exam">${icon('flag', 2)}Entra en la prueba</button>` : ''}<input type="file" id="r-photo-in" accept="image/*" capture="environment" hidden></div>` : ''}
      ${on ? '' : `<div class="pill-row"><button class="pill" id="r-consent">${icon('users', 2)}Aviso de grabación</button></div><p class="rec-room" id="rec-room"></p>`}
      ${intr ? `<div class="pill-row"><button class="pill" id="r-end-now">${icon('stop', 2)}Terminar aquí y crear el acta</button></div>` : ''}
      <div class="marks" id="marks">${Rec.marks.map(k => `<span class="mark ${k.auto ? 'auto' : ''} ${k.label === 'Entra en la prueba' ? 'exam' : ''}"><b>${fmtT(k.t)}</b>${esc(k.label || 'Momento importante')}</span>`).join('')}${Rec.photos.map(p => `<span class="mark photo"><b>${fmtT(p.t)}</b>${icon('camera', 2, 13)}Foto</span>`).join('')}</div>
      <div class="caption" id="caption" ${on && Rec.sr ? '' : 'hidden'}></div>
      ${on ? `<div style="display:flex;justify-content:center"><button class="btn sm ghost" id="r-discard">Descartar grabación</button></div><div id="discard-confirm"></div>` : ''}
    </section>
    <aside style="display:grid;gap:14px">
      ${Rec.isIOS ? `<div class="tipbox">${icon('lock', 2)}<span><b>No bloquees el iPhone mientras grabas.</b> Usa <b>Modo bolsillo</b>: deja la pantalla en negro, evita toques accidentales y la grabación sigue. Si una reunión será muy larga, conecta el cargador.</span></div>` : `<div class="tipbox">${icon('lock', 2)}<span><b>Puedes apagar la pantalla.</b> En Android la grabación sigue con la pantalla bloqueada. Si prefieres, usa <b>Modo bolsillo</b>.</span></div>`}
      <section class="panel">
        <div class="eyebrow">Notas en vivo</div>
        <p class="muted" style="font-size:13px;margin:6px 0 12px">Cada nota queda con su minuto. Claude les da prioridad en el acta.</p>
        <div class="notes-log" id="notes-log">${Rec.notesLog.map(n => `<div><b>${fmtT(n.t)}</b><span>${esc(n.text)}</span></div>`).join('') || '<span class="muted" style="font-size:13px">Aún no hay notas.</span>'}</div>
        <form class="note-in field" id="note-f" style="margin-top:12px;display:flex"><input id="note-in" placeholder="${on ? 'Escribe y presiona Enter' : 'Disponible al grabar'}" ${on ? '' : 'disabled'} aria-label="Nota"><button class="btn" ${on ? '' : 'disabled'}>Añadir</button></form>
      </section>
      <details class="panel more-det" ${recMeta.title || recMeta.participants || recMeta.context ? 'open' : ''}>
        <summary><span class="eyebrow">Más detalles</span><span class="muted">Opcional · título, participantes, contexto</span></summary>
        <div class="form" style="margin-top:12px;gap:14px">
          <div class="field"><label for="r-title">Título</label><input id="r-title" value="${esc(recMeta.title)}" placeholder="Claude propone uno"></div>
          <div class="field"><label for="r-people">Participantes</label><input id="r-people" value="${esc(recMeta.participants)}" placeholder="Camila, Diego, yo"><span class="hint">Ayuda a ponerle nombre a cada voz.</span></div>
          <div class="field"><label for="r-ctx">Contexto</label><textarea id="r-ctx" rows="2" placeholder="¿De qué se trata?">${esc(recMeta.context)}</textarea></div>
        </div>
        <p class="hint" style="margin-top:10px">El tipo (reunión, clase, obra…) y el proyecto los eliges al terminar.</p>
      </details>
    </aside>
  </div>`;
  const syncMeta = () => { recMeta = { ...recMeta, title: $('#r-title').value, participants: $('#r-people').value, context: $('#r-ctx').value }; if (Rec.state !== 'idle') { Rec.meta = metaFromForm(); Rec.saveActive(); } };
  $$('#r-title,#r-people,#r-ctx').forEach(el => el.addEventListener('input', syncMeta));
  const rcs = $('#r-consent'); if (rcs) rcs.onclick = consentSheet;
  const rr = $('#rec-room'); if (rr) hoursLeft().then(h => { if (h != null && $('#rec-room')) rr.textContent = h > 999 ? 'Espacio para cientos de horas de grabación' : `Espacio para unas ${Math.floor(h)} horas de grabación en este teléfono`; });
  const rex = $('#r-exam'); if (rex) rex.onclick = () => { const t = Rec.addMark('Entra en la prueba'); $('#marks').insertAdjacentHTML('beforeend', `<span class="mark exam"><b>${fmtT(t)}</b>Entra en la prueba</span>`); if (navigator.vibrate) navigator.vibrate(30); toast('Marcado: entra en la prueba'); };
  const rpp = $('#r-prep'); if (rpp) rpp.onclick = () => {
    const pj = $('#r-proj').value.trim(); const ppl = $('#r-people').value.split(',').map(x => x.trim()).filter(x => x && !isMe(x));
    if (pj && projectMeetings(pj).some(m => m.analysis)) return go('prep/j/' + encodeURIComponent(pj));
    const pi = peopleIndex(); const k = ppl.map(personKey).find(k => pi.has(k));
    if (k) return go('prep/p/' + encodeURIComponent(k));
    toast('Escribe un proyecto o participantes con reuniones anteriores', 4000);
  };
  const rph = $('#r-photo'), rpi = $('#r-photo-in');
  if (rph) {
    let guard = 0; const release = () => { clearTimeout(guard); guard = setTimeout(() => { Rec.capturing = false; }, 1500); };
    rph.onclick = () => { Rec.capturing = true; clearTimeout(guard); guard = setTimeout(() => { Rec.capturing = false; }, 90000); rpi.value = ''; rpi.click(); };
    rpi.addEventListener('cancel', release);
    rpi.onchange = async () => {
      release(); const f = rpi.files[0]; if (!f || Rec.state === 'idle') return;
      const t = Math.round(Rec.elapsed() / 1000);
      try { const ph = await savePhoto(f, Rec.recId, t); Rec.photos.push(ph); Rec.saveActive(); $('#marks').insertAdjacentHTML('beforeend', `<span class="mark photo"><b>${fmtT(t)}</b>${icon('camera', 2, 13)}Foto</span>`); toast('Foto guardada en el minuto ' + fmtT(t)); }
      catch (e) { toast('No se pudo guardar la foto', 4000); }
    };
  }
  const finish = async () => {
    const btn = $('#r-main'); if (btn) btn.disabled = true; const ts = $('#timer-sub'); if (ts) ts.textContent = 'Guardando audio…';
    Rec.meta = metaFromForm(); Pocket.off();
    const info = await Rec.stop();
    const pre = { ...recMeta };
    const m = await finishRecording(info);
    recMeta = null; document.body.classList.remove('recording'); render();
    if (m.status !== 'queued') { go('m/' + m.id); return; }
    whatSheet(m, pre);
  };
  $('#r-main').onclick = async () => {
    if (Rec.state === 'idle') {
      try { await Rec.start(metaFromForm()); render(); toast('Grabando'); }
      catch (e) { toast(e.message || 'No se pudo iniciar la grabación', 5000); }
    } else if (Rec.state === 'interrupted') {
      try { await Rec.continueAfter(); render(); toast('Grabación reanudada'); }
      catch (e) { toast(e.message || 'No se pudo reanudar', 5000); }
    } else finish();
  };
  const en = $('#r-end-now'); if (en) en.onclick = finish;
  $('#r-pause').onclick = () => { if (Rec.state === 'recording') Rec.pause(); else Rec.resume(); render(); };
  $('#r-mark').onclick = () => { const t = Rec.addMark(''); $('#marks').insertAdjacentHTML('beforeend', `<span class="mark"><b>${fmtT(t)}</b>Momento importante</span>`); if (navigator.vibrate) navigator.vibrate(30); };
  const pk = $('#r-pocket'); if (pk) pk.onclick = () => Pocket.on();
  $('#note-f').onsubmit = e => { e.preventDefault(); const v = $('#note-in').value.trim(); if (!v || Rec.state === 'idle') return; const t = Rec.addNote(v); $('#note-in').value = ''; const log = $('#notes-log'); if (Rec.notesLog.length === 1) log.innerHTML = ''; log.insertAdjacentHTML('beforeend', `<div><b>${fmtT(t)}</b><span>${esc(v)}</span></div>`); log.scrollTop = log.scrollHeight; };
  const rd = $('#r-discard'); if (rd) rd.onclick = () => { $('#discard-confirm').innerHTML = `<div class="confirm" style="justify-content:center;margin-top:8px">¿Descartar todo el audio grabado?<button class="btn sm solid-danger" id="dc-yes">Descartar</button><button class="btn sm" id="dc-no">Seguir</button></div>`; $('#dc-yes').onclick = async () => { Pocket.off(); await Rec.discard(); recMeta = null; document.body.classList.remove('recording'); go(''); toast('Grabación descartada'); }; $('#dc-no').onclick = () => $('#discard-confirm').innerHTML = ''; };
  startOrb();
  updateCaption();
}
/* After recording: one clear question, "¿Qué grabaste?" */
const WHAT_MAIN = [['auto', 'spark', 'Que Acta lo decida', 'Detecta solo qué fue'], ['general', 'users', 'Reunión de trabajo', 'Acuerdos y tareas'], ['clase', 'idea', 'Clase', 'Apuntes, tarjetas y prueba'], ['cliente', 'money', 'Cliente o venta', 'Necesidades y cierre'], ['proyecto', 'target', 'Proyecto / kickoff', 'Alcance y plazos'], ['uno', 'chat', '1:1 o seguimiento', 'Avances y bloqueos']];
function whatSheet(m, pre = {}) {
  let tpl = pre.template && TEMPLATES[pre.template] ? pre.template : 'auto'; let done = false;
  const recent = projectsList().slice(0, 8);
  const rubros = Object.entries(TEMPLATES).filter(([, t]) => t.group === 'rubro');
  sheet(`<div class="eyebrow">Grabación guardada · ${fmtT(m.durationSec)}</div><h3>¿Qué grabaste?</h3><p class="muted">Así Acta sabe qué hacer con ella. Lo puedes cambiar después.</p>
    <div class="what-grid">${WHAT_MAIN.map(([k, ic, n, d]) => `<button class="what ${k === 'auto' ? 'auto' : ''}" data-what="${k}" aria-pressed="${tpl === k}"><span class="w-ic">${icon(ic, 2)}</span><b>${n}</b><small>${d}</small></button>`).join('')}</div>
    <details class="what-more" ${TEMPLATES[tpl]?.group === 'rubro' ? 'open' : ''}><summary>Más tipos: obra, propiedades, pyme, consulta, ideas…</summary><div class="what-chips">${[...rubros, ['ideas', TEMPLATES.ideas]].map(([k, t]) => `<button class="chip ${tpl === k ? 'on' : ''}" data-what="${k}">${esc(t.name)}</button>`).join('')}</div></details>
    <div class="field" style="margin-top:14px"><label for="w-proj" id="w-proj-l">Proyecto, cliente o ramo <span class="muted" style="font-weight:400">· opcional</span></label><input id="w-proj" list="w-proj-list" value="${esc(pre.project || '')}" placeholder="Ej.: Obra Totihue, Hidráulica, Cliente Pérez" autocomplete="off"><datalist id="w-proj-list">${projectsList().map(p => `<option value="${esc(p)}">`).join('')}</datalist>
      ${recent.length ? `<div class="pj-chips">${recent.map(p => `<button class="chip" data-wp="${esc(p)}">${icon('folder', 2)}${esc(p)}</button>`).join('')}</div>` : ''}<span class="hint">Une esta grabación con las anteriores del mismo proyecto o ramo.</span></div>
    <div class="sheet-actions"><button class="btn primary lg" id="w-go">${icon('spark', 2)}Crear acta</button></div>`, el => {
    const mark = () => $$('[data-what]', el).forEach(b => { const on = b.dataset.what === tpl; b.setAttribute('aria-pressed', on); b.classList.toggle('on', on); });
    $$('[data-what]', el).forEach(b => b.onclick = () => { tpl = b.dataset.what; mark(); $('#w-proj-l', el).firstChild.textContent = tpl === 'clase' ? 'Ramo o asignatura ' : 'Proyecto, cliente o ramo '; });
    $$('[data-wp]', el).forEach(b => b.onclick = () => { $('#w-proj', el).value = b.dataset.wp; });
    const finishIt = async () => { if (done) return; done = true; const project = ($('#w-proj', el)?.value || '').trim(); await patchMeeting(m.id, { template: tpl, project: project || m.project || '' }); closeSheet(); go('m/' + m.id); processMeeting(m.id); };
    $('#w-go', el).onclick = finishIt;
    $('.sheet-bg')?.addEventListener('closing', () => { if (!done) { done = true; const project = ($('#w-proj', el)?.value || '').trim(); patchMeeting(m.id, { template: tpl, project: project || m.project || '' }).then(() => { go('m/' + m.id); processMeeting(m.id); }); } });
  }, 'what');
}
function metaFromForm() { const g = id => ($(id)?.value || '').trim(); return { title: g('#r-title'), participants: g('#r-people').split(',').map(x => x.trim()).filter(Boolean), template: recMeta?.template || 'auto', context: g('#r-ctx'), project: recMeta?.project || '' }; }
/* Photos: compressed on the phone, stored next to the meeting, never sent to any AI */
async function savePhoto(file, owner, t) {
  let bmp, w, h;
  try { bmp = await createImageBitmap(file); w = bmp.width; h = bmp.height; }
  catch { bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(file); }); w = bmp.naturalWidth; h = bmp.naturalHeight; }
  const k = Math.min(1, 1600 / Math.max(w, h)); const cw = Math.round(w * k), ch = Math.round(h * k);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch; c.getContext('2d').drawImage(bmp, 0, 0, cw, ch);
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', .82)) || file;
  const key = 'ph:' + owner + ':' + uid(); await DB.put('photos', blob, key);
  return { key, t, w: cw, h: ch };
}
const photoURLs = {};
async function photoURL(key) { if (!photoURLs[key]) { const b = await DB.get('photos', key); if (!b) return ''; photoURLs[key] = URL.createObjectURL(b); } return photoURLs[key]; }
async function hydratePhotos(root) { for (const img of $$('img[data-photo]', root)) { const u = await photoURL(img.dataset.photo); if (u) img.src = u; } }
function updateCaption() { const c = $('#caption'); if (!c) return; const last = Rec.live.slice(-2).map(x => esc(x.text)).join(' '); c.hidden = !(Rec.state !== 'idle' && Rec.sr); c.innerHTML = `${last}${Rec.interim ? ` <em>${esc(Rec.interim)}</em>` : ''}` || 'Escuchando…'; }

/* Orb visualizer: radial spectrum around a glowing core */
const Orb = { raf: 0, lvl: 0, hist: new Float32Array(96), t0: performance.now(), sizeTick: 0 };
function startOrb() {
  cancelAnimationFrame(Orb.raf);
  const freq = new Uint8Array(512), time = new Uint8Array(1024);
  const frame = () => {
    const c = $('#orb');
    if (!c) { Orb.raf = 0; return; }
    const dpr = Math.min(2, window.devicePixelRatio || 1); const w = c.clientWidth;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(w * dpr); }
    const g = c.getContext('2d'); const W = c.width, cx = W / 2, cy = W / 2;
    const recording = Rec.state === 'recording';
    let level = 0;
    if (Rec.analyser && recording) {
      Rec.analyser.getByteTimeDomainData(time); let sum = 0; for (let i = 0; i < time.length; i++) { const v = (time[i] - 128) / 128; sum += v * v; } level = Math.min(1, Math.sqrt(sum / time.length) * 4.5);
      Rec.analyser.getByteFrequencyData(freq);
    } else freq.fill(0);
    Orb.lvl += (level - Orb.lvl) * .25;
    const tt = (performance.now() - Orb.t0) / 1000;
    g.clearRect(0, 0, W, W);
    const R = W * .30;
    // outer glow
    const glow = g.createRadialGradient(cx, cy, R * .4, cx, cy, W * .5);
    const ga = recording ? .30 + Orb.lvl * .5 : Rec.state === 'idle' ? .16 : .10;
    glow.addColorStop(0, `rgba(255,90,90,${ga})`); glow.addColorStop(.55, `rgba(180,80,255,${ga * .45})`); glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, W);
    // radial bars
    const N = 96; const grad = g.createLinearGradient(0, 0, W, W);
    grad.addColorStop(0, '#FFB06B'); grad.addColorStop(.5, '#FF4D7A'); grad.addColorStop(1, '#A66BFF');
    g.strokeStyle = grad; g.lineCap = 'round'; g.lineWidth = Math.max(2, W / 150);
    for (let i = 0; i < N; i++) {
      const fi = Math.floor(Math.pow(i / N, 1.6) * 180) + 2;
      const target = recording ? (freq[fi] / 255) : (Rec.state === 'idle' ? (Math.sin(tt * 1.6 + i * .26) * .5 + .5) * .12 : .03);
      Orb.hist[i] += (target - Orb.hist[i]) * .3;
      const len = R * .08 + Orb.hist[i] * R * .62;
      const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
      const r0 = R * 1.06;
      g.globalAlpha = .35 + Orb.hist[i] * .65;
      g.beginPath(); g.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); g.lineTo(cx + Math.cos(ang) * (r0 + len), cy + Math.sin(ang) * (r0 + len)); g.stroke();
    }
    g.globalAlpha = 1;
    // core ring
    const breathe = recording ? Orb.lvl * .08 : Math.sin(tt * 1.4) * .012;
    g.beginPath(); g.arc(cx, cy, R * (1 + breathe), 0, Math.PI * 2);
    const core = g.createRadialGradient(cx, cy - R * .3, R * .1, cx, cy, R * 1.05);
    core.addColorStop(0, 'rgba(40,24,40,.95)'); core.addColorStop(1, 'rgba(12,10,18,.98)');
    g.fillStyle = core; g.fill();
    g.lineWidth = Math.max(1.5, W / 220); g.strokeStyle = recording ? 'rgba(255,120,110,.75)' : 'rgba(255,255,255,.14)'; g.stroke();
    // progress arc of current minute
    if (Rec.state !== 'idle') {
      const sec = (Rec.elapsed() / 1000) % 60;
      g.beginPath(); g.arc(cx, cy, R * .9, -Math.PI / 2, -Math.PI / 2 + (sec / 60) * Math.PI * 2);
      g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = Math.max(1.5, W / 260); g.stroke();
    }
    const t = $('#timer'); if (t) t.textContent = fmtClock(Rec.elapsed());
    if (++Orb.sizeTick % 60 === 0) { const el = $('#rec-size'); if (el && Rec.state !== 'idle') { const est = Rec.elapsed() / 1000 * (+Settings.v.bitrate || 32000) / 8; el.textContent = `≈ ${fmtBytes(est)} · ${(Rec.mime.split(';')[0].replace('audio/', '') || 'audio').toUpperCase()}`; } }
    Pocket.level(Orb.lvl);
    Orb.raf = requestAnimationFrame(frame);
  };
  Orb.raf = requestAnimationFrame(frame);
}

/* Pocket mode: black screen, touch shield, hold to exit */
const Pocket = {
  timer: 0, hold: 0,
  on() {
    const el = $('#pocket'); el.hidden = false; document.body.classList.add('pocket');
    try { el.requestFullscreen?.().catch(() => {}); } catch {}
    this.tick(); clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 500);
  },
  off() {
    const el = $('#pocket'); if (!el || el.hidden) return; el.hidden = true; document.body.classList.remove('pocket'); clearInterval(this.timer);
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}
  },
  tick() { const t = $('#pocket-time'); if (t) t.textContent = fmtClock(Rec.elapsed()); const s = $('#pocket-state'); if (s) s.textContent = Rec.state === 'recording' ? 'Grabando' : Rec.state === 'paused' ? 'En pausa' : 'Detenida'; if (Rec.state === 'idle' || Rec.state === 'interrupted') this.off(); },
  level(v) { const l = $('#pocket-lvl'); if (l && !$('#pocket').hidden) l.style.width = Math.round(v * 100) + '%'; }
};
(() => {
  const el = $('#pocket'), h = $('#pocket-hold');
  ['touchmove', 'touchstart', 'wheel'].forEach(ev => el.addEventListener(ev, e => { if (!e.target.closest('#pocket-hold')) e.preventDefault(); }, { passive: false }));
  el.addEventListener('contextmenu', e => e.preventDefault());
  const start = e => { e.preventDefault(); h.classList.add('holding'); clearTimeout(Pocket.hold); Pocket.hold = setTimeout(() => { h.classList.remove('holding'); Pocket.off(); if (navigator.vibrate) navigator.vibrate(20); }, 1000); };
  const cancel = () => { h.classList.remove('holding'); clearTimeout(Pocket.hold); };
  h.addEventListener('pointerdown', start); ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => h.addEventListener(ev, cancel));
})();

/* =========================================================
   Import view
   ========================================================= */
let impDraft = null;
function renderImport(app) {
  const d = impDraft || (impDraft = { mode: S.meetings.some(m => m.audioParts?.length) ? 'mine' : 'audio', title: '', date: today(), participants: '', template: 'auto', context: '', notes: '', transcript: '', file: null, duration: '' });
  app.innerHTML = `
  <div class="page-head"><div><div class="eyebrow">Importar</div><h1>Trae una conversación que ya tienes</h1><p>Una grabación que ya hiciste en Acta, un audio de otra app, o la transcripción de Meet, Zoom, Teams o las notas de voz.</p></div></div>
  <section class="panel" style="max-width:860px">
    <div class="seg-ctl" role="group" aria-label="Qué vas a importar"><button data-mode="mine" aria-pressed="${d.mode === 'mine'}">Grabado en Acta</button><button data-mode="audio" aria-pressed="${d.mode === 'audio'}">Archivo de audio</button><button data-mode="text" aria-pressed="${d.mode === 'text'}">Transcripción en texto</button></div>
    <form class="form" id="imp-f" novalidate>
      ${d.mode === 'mine' ? mineAudiosHTML(d) : d.mode === 'audio' ? `
      <div class="field"><span class="lbl">Audio</span>
        <div class="drop" id="drop"><span class="btn sm filebtn">${icon('upload')}Elegir audio<input id="i-file" type="file" accept="audio/*,video/mp4,.m4a,.mp3,.wav,.webm,.ogg,.mp4"></span><span id="i-fname">${d.file ? `${esc(d.file.name)} · ${fmtBytes(d.file.size)}` : 'M4A, MP3, WAV, WEBM u OGG · hasta 25 MB'}</span></div>
        ${Settings.v.openaiKey ? '' : '<p class="notice" style="margin-top:8px">Para transcribir audio necesitas tu clave de OpenAI en Ajustes.</p>'}
      </div>` : `
      <div class="field"><label for="i-tx">Transcripción</label>
        <div class="drop" id="drop"><span class="btn sm filebtn">${icon('upload')}Subir archivo<input id="i-txfile" type="file" accept=".txt,.md,.srt,.vtt,text/plain"></span><span>o pega el texto · .txt, .srt, .vtt</span></div>
        <textarea id="i-tx" class="mono-area" rows="12" placeholder="[0:00] Ana: Partamos por el alcance…&#10;[0:15] Diego: Yo propongo…">${esc(d.transcript)}</textarea><span class="hint" id="tx-info"></span>
      </div>`}
      <div class="field"><span class="lbl">Tipo de reunión</span><div class="tpls" role="group">${Object.entries(TEMPLATES).filter(([, t]) => !t.group || t.group === 'estudio').map(([k, t]) => `<button type="button" class="tpl" data-tpl="${k}" aria-pressed="${d.template === k}"><b>${t.name}</b><span>${t.desc}</span></button>`).join('')}</div>
        <span class="lbl" style="margin-top:6px">Por rubro <span class="muted" style="font-weight:400">· con ficha de datos del rubro</span></span><div class="tpls" role="group">${Object.entries(TEMPLATES).filter(([, t]) => t.group === 'rubro').map(([k, t]) => `<button type="button" class="tpl" data-tpl="${k}" aria-pressed="${d.template === k}"><b>${t.name}</b><span>${t.desc}</span></button>`).join('')}</div></div>
      <div class="row">
        <div class="field"><label for="i-title">Título</label><input id="i-title" value="${esc(d.title)}" placeholder="Claude propone uno"></div>
        <div class="field"><label for="i-date">Fecha</label><input id="i-date" type="date" value="${esc(d.date)}"></div>
        <div class="field"><label for="i-people">Participantes</label><input id="i-people" value="${esc(d.participants)}" placeholder="Camila, Diego, yo"></div>
        <div class="field"><label for="i-proj">Proyecto o cliente</label><input id="i-proj" list="proj-list" value="${esc(d.project || '')}" placeholder="Opcional" autocomplete="off"><datalist id="proj-list">${projectsList().map(p => `<option value="${esc(p)}">`).join('')}</datalist></div>
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
  const sync = () => { d.project = $('#i-proj').value; d.title = $('#i-title').value; d.date = $('#i-date').value; d.participants = $('#i-people').value; d.context = $('#i-ctx').value; d.notes = $('#i-notes').value; if ($('#i-tx')) { d.transcript = $('#i-tx').value; const p = parseTranscript(d.transcript); $('#tx-info').textContent = p.segments.length ? `${nf(p.segments.length)} intervenciones · ${nf(wordCount(p.segments))} palabras${p.estimated ? ' · sin marcas de tiempo: se estimarán' : ''}` : ''; } };
  $$('input,textarea', $('#imp-f')).forEach(el => el.addEventListener('input', sync)); sync();
  $$('[data-mode]').forEach(b => b.onclick = () => { sync(); d.mode = b.dataset.mode; renderImport(app); });
  $$('[data-tpl]').forEach(b => b.onclick = () => { d.template = b.dataset.tpl; $$('[data-tpl]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  $$('[data-src]', app).forEach(b => b.onclick = () => { d.srcId = b.dataset.src; const src = meetingById(d.srcId); $$('[data-src]', app).forEach(x => x.setAttribute('aria-pressed', x === b)); if (!$('#i-title').value && src) { $('#i-title').value = (src.analysis?.title || src.titleHint || '') ; sync(); } });
  const takeAudio = f => { if (!f) return; d.file = f; $('#i-fname').textContent = `${f.name} · ${fmtBytes(f.size)}${f.size > MAX_UPLOAD ? ' · supera 25 MB' : ''}`; if (!$('#i-title').value) { $('#i-title').value = f.name.replace(/\.[^.]+$/, ''); sync(); } };
  const takeText = f => { if (!f) return; const r = new FileReader(); r.onload = () => { $('#i-tx').value = r.result; if (!$('#i-title').value) $('#i-title').value = f.name.replace(/\.[^.]+$/, ''); sync(); }; r.readAsText(f); };
  const fi = $('#i-file'); if (fi) fi.onchange = e => takeAudio(e.target.files[0]);
  const ft = $('#i-txfile'); if (ft) ft.onchange = e => takeText(e.target.files[0]);
  const drop = $('#drop');
  if (drop) drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  if (drop) drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  if (drop) drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; d.mode === 'audio' ? takeAudio(f) : takeText(f); });
  const ex = $('#i-example'); if (ex) ex.onclick = () => { $('#i-tx').value = EXAMPLE_TX; if (!$('#i-people').value) $('#i-people').value = 'Camila, Diego, Tú'; if (!$('#i-ctx').value) $('#i-ctx').value = 'Primera reunión para definir la app de reservas de una peluquería.'; sync(); };
  $('#imp-f').onsubmit = async e => {
    e.preventDefault(); sync(); const st = $('#imp-status');
    const base = { id: uid(), createdAt: Date.now(), date: d.date || today(), titleHint: d.title.trim(), participants: d.participants.split(',').map(x => x.trim()).filter(Boolean), template: d.template, context: d.context.trim(), project: (d.project || '').trim(), notes: d.notes.trim(), notesLog: [], marks: [], photos: [], speakers: {}, status: 'queued', source: 'import' };
    if (d.mode === 'mine') {
      const src = meetingById(d.srcId);
      if (!src?.audioParts?.length) { st.innerHTML = '<p class="err">Elige una de tus grabaciones.</p>'; return; }
      base.audioParts = [];
      for (const pt of src.audioParts) { const b = await DB.get('audio', pt.key); if (!b) continue; const key = base.id + ':' + pt.part; await DB.put('audio', b, key); base.audioParts.push({ ...pt, key }); }
      if (!base.audioParts.length) { st.innerHTML = '<p class="err">No encuentro ese audio en el teléfono.</p>'; return; }
      base.durationSec = src.durationSec || 0; base.marks = (src.marks || []).slice(); base.notesLog = (src.notesLog || []).slice(); base.photos = []; base.speakers = { ...(src.speakers || {}) }; base.source = 'reuse';
      if (!base.participants.length) base.participants = src.participants || [];
      if (!base.project && src.project) base.project = src.project;
      const tx = await DB.get('transcripts', src.id);
      if (tx?.segments?.length) { await DB.put('transcripts', { segments: tx.segments }, base.id); base.hasTranscript = true; base.words = wordCount(tx.segments); }
    } else if (d.mode === 'audio') {
      if (!d.file) { st.innerHTML = '<p class="err">Elige el archivo de audio de la reunión.</p>'; return; }
      const dur = await audioDuration(d.file);
      if (d.file.size > MAX_UPLOAD && !(dur > CHUNK_SEC && dur <= MAX_SPLIT_SEC)) { st.innerHTML = `<p class="err">El archivo pesa ${fmtBytes(d.file.size)}${dur ? ` y dura ${fmtT(dur)}` : ''}. ${dur > MAX_SPLIT_SEC ? `En este teléfono Acta puede partir audios de hasta ${MAX_SPLIT_SEC / 60} minutos; recórtalo en dos.` : 'El límite es 25 MB: compártelo como M4A o MP3 desde la app de grabación.'}</p>`; return; }
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
function mineAudiosHTML(d) {
  const list = S.meetings.filter(m => m.audioParts?.length).slice(0, 30);
  if (!list.length) return `<div class="empty-li" style="padding:12px 0">Aún no tienes grabaciones hechas con Acta. Graba una reunión y aparecerá aquí.</div>`;
  return `<div class="field"><span class="lbl">Elige una grabación</span><span class="hint">Crea un acta nueva con otro tipo, título o proyecto. Si ya estaba transcrita, se reusa la transcripción y no se vuelve a cobrar.</span>
    <div class="mine-list">${list.map(m => { const st = m.status && m.status !== 'ready' ? (STATUS_TXT[m.status] || '') : ''; return `<button type="button" class="mine-a" data-src="${esc(m.id)}" aria-pressed="${d.srcId === m.id}"><span class="mi-ic">${icon('mic', 2)}</span><span class="mi-tx"><b>${esc(m.analysis?.title || m.titleHint || 'Grabación sin título')}</b><small>${esc(fmtDate(m.date))} · ${fmtT(m.durationSec)} · ${fmtBytes(m.audioParts.reduce((a, p) => a + (p.size || 0), 0))}${m.hasTranscript || m.analysis ? ' · ya transcrita' : ''}${st ? ' · ' + esc(st) : ''}</small></span></button>`; }).join('')}</div></div>`;
}
async function exportAudio(m) {
  const parts = m.audioParts || []; if (!parts.length) { toast('Esta reunión no tiene audio guardado'); return; }
  const files = [];
  for (const p of parts) { const b = await DB.get('audio', p.key); if (b) files.push(new File([b], `${slug(m.analysis?.title || m.titleHint || 'reunion')}${parts.length > 1 ? '-parte-' + (p.part + 1) : ''}.${extFor(b.type)}`, { type: b.type || 'audio/webm' })); }
  if (!files.length) { toast('No encuentro el audio en este teléfono'); return; }
  if (files.length === 1) return deliverFile(files[0], 'Audio de la reunión');
  sheet(`<div class="eyebrow">Audio de la reunión</div><h3>La grabación tiene ${files.length} partes</h3><p class="muted">El teléfono la dividió al reanudar o por largo. Comparte cada parte por separado.</p><div class="sheet-actions" style="flex-direction:column">${files.map((f, i) => `<button class="btn" data-part="${i}">${icon('download')}Parte ${i + 1} · ${fmtBytes(f.size)}</button>`).join('')}</div>`, el => {
    $$('[data-part]', el).forEach(b => b.onclick = () => deliverFile(files[+b.dataset.part], 'Audio · parte ' + (+b.dataset.part + 1)));
  });
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
  const tabs = [['resumen', 'Resumen', 'spark'], ...(a.study ? [['estudiar', 'Estudiar', 'idea']] : []), ['informe', 'Informe', 'report'], ['mapa', 'Mapa mental', 'mind'], ['brief', 'Brief', 'doc'], ['transcripcion', 'Transcripción', 'text'], ['preguntar', 'Preguntar', 'chat']];
  const people = (a.participants?.length ? a.participants : m.participants) || [];
  app.innerHTML = `
  <button class="btn ghost sm back" data-nav="library">${icon('back')}Reuniones</button>
  <section class="m-hero rise"><span class="aura a1"></span><span class="aura a2"></span>
  <header class="m-head">
    <div class="m-meta">
      <span>${icon('cal')}${esc(fmtDate(m.date))}</span>
      ${m.durationSec ? `<span class="mono">${icon('time')}${esc(fmtT(m.durationSec))}${m.estimatedTimes ? ' aprox.' : ''}</span>` : ''}
      ${people.length ? `<span class="m-people">${icon('users')}${people.map((n, i) => `<b class="pw">${isMe(n) || isNobody(n) ? esc(n) : `<button class="tlink pl" data-per="${esc(personKey(n))}">${esc(n)}</button>`}${i < people.length - 1 ? ',' : ''}</b>`).join('')}</span>` : ''}
      <span class="chip">${esc(tplName(m))}</span>
      ${m.seal ? `<button class="chip seal" id="m-seal-chip">${icon('lock', 2)}Acta ${folioTxt(m.seal.folio)}</button>` : ''}
      <span id="proj-slot">${m.project ? `<button class="chip proj" id="m-proj-open" data-proj="${esc(m.project)}">${icon('folder', 2)}${esc(m.project)}</button><button class="chip ghosty" id="m-proj" aria-label="Cambiar proyecto">${icon('edit', 2)}</button>` : `<button class="chip ghosty" id="m-proj">${icon('folder', 2)}Asignar proyecto</button>`}</span>
    </div>
    <h1 id="m-title" contenteditable="true" spellcheck="false" title="Toca para cambiar el título">${esc(a.title)}</h1>
    ${(a.tags || []).length ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${a.tags.map(t => `<span class="chip ${t === 'ejemplo' ? 'ex' : ''}">#${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="m-actions">
      <button class="btn sm primary" id="m-report">${icon('report', 2)}Informe</button>
      <button class="btn sm" id="m-share">${icon('share')}Compartir</button>
      <span class="menu-wrap"><button class="btn sm" id="m-exp" aria-haspopup="true" aria-expanded="false">${icon('download')}Exportar</button>
        <span class="menu" id="m-exp-menu" hidden>
          <button data-exp="all">${icon('download', 2)}<span><b>Todo de una vez (.zip)</b><small>Informes PDF, Word, resumen, brief, transcripción, audio y fotos</small></span></button>
          <button data-exp="docx">${icon('word', 2)}<span><b>Word (.docx)</b><small>Acta completa para editar</small></span></button>
          <button data-exp="pdf">${icon('doc', 2)}<span><b>PDF</b><small>Informe infográfico</small></span></button>
          ${a.mindmap?.branches?.length ? `<button data-exp="mm">${icon('mind', 2)}<span><b>Mapa mental (PDF)</b><small>El mapa dibujado, en hoja horizontal</small></span></button>` : ''}
          <button data-exp="ics">${icon('cal', 2)}<span><b>Tareas al calendario</b><small>Archivo .ics con los plazos</small></span></button>
          ${m.audioParts?.length ? `<button data-exp="audio">${icon('mic', 2)}<span><b>Audio original</b><small>El archivo de la grabación</small></span></button>` : ''}
          <button data-exp="md">${icon('text', 2)}<span><b>Markdown (.md)</b><small>Para Notion, Obsidian o Docs</small></span></button>
          <button data-exp="seal">${icon('lock', 2)}<span><b>${m.seal ? 'Ver sello ' + folioTxt(m.seal.folio) : 'Sellar acta'}</b><small>Folio, huella digital y firmas</small></span></button>
        </span></span>
      <button class="btn sm" id="m-copy">${icon('copy')}Copiar resumen</button>
      <button class="btn sm" id="m-photo">${icon('camera')}Foto</button><input type="file" id="m-photo-in" accept="image/*" hidden>
      <span style="display:inline-flex;gap:6px;align-items:center"><select id="re-tpl" class="btn sm" aria-label="Tipo de análisis">${tplOptions(m.template)}</select><button class="btn sm" id="re-run">${icon('refresh')}Re-analizar</button></span>
      <span id="del-slot"><button class="btn sm ghost danger" id="m-del">${icon('trash')}Eliminar</button></span>
    </div>
  </header></section>
  <nav class="tabs" role="tablist">${tabs.map(([k, l, ic]) => `<button class="tab" role="tab" data-tab="${k}" aria-selected="${tab === k}">${icon(ic, 2)}${l}</button>`).join('')}</nav>
  <section id="tab-body"></section>`;
  $$('[data-tab]').forEach(b => b.onclick = () => { history.replaceState(null, '', '#m/' + m.id + '/' + b.dataset.tab); S.route.tab = b.dataset.tab; $$('[data-tab]').forEach(x => x.setAttribute('aria-selected', x === b)); renderTab(m); });
  const h1 = $('#m-title');
  h1.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); h1.blur(); } });
  h1.addEventListener('blur', async () => { const v = h1.textContent.trim(); if (v && v !== a.title) { a.title = v; await saveMeeting(m); toast('Título actualizado'); } else h1.textContent = a.title; });
  $('#m-share').onclick = () => shareMeeting(m);
  $('#m-report').onclick = () => { const b = $('[data-tab="informe"]'); if (b) { b.click(); b.scrollIntoView({ block: 'nearest', inline: 'center' }); } };
  const expBtn = $('#m-exp'), expMenu = $('#m-exp-menu');
  /* Exportar abre una hoja desde abajo con todas las opciones a la vista (sin menú que haya que desplazar) */
  expBtn.onclick = e => {
    e.stopPropagation(); expMenu.hidden = true;
    sheet(`<div class="eyebrow">Exportar</div><h3>${esc(a.title || 'Reunión')}</h3><div class="exp-list">${expMenu.innerHTML}</div>`, el => {
      $$('[data-exp]', el).forEach(b => b.onclick = () => { closeSheet(); runExp(b.dataset.exp); });
    });
  };
  const runExp = async k => {
    if (k === 'md') downloadText(slug(a.title) + '.md', await fullMd(m));
    if (k === 'docx') { await Busy.show('Preparando el Word', 'Armando el acta…'); try { const f = await meetingDocx(m); Busy.hide(); deliverFile(f, 'Acta en Word'); } catch (e) { Busy.hide(); toast('No se pudo crear el Word: ' + (e.message || 'error'), 5000); } }
    if (k === 'ics') exportTasksICS([m]);
    if (k === 'seal') sealSheet(m);
    if (k === 'audio') exportAudio(m);
    if (k === 'all') exportEverything(m);
    if (k === 'mm') exportMindmap(m);
    if (k === 'pdf') { const t = $('[data-tab="informe"]'); if (t) t.click(); setTimeout(async () => exportReport(m, a, await getSegments(m.id), 'pdf'), 400); }
  };
  $('#m-proj').onclick = () => editProject(m);
  $$('.m-people [data-per]').forEach(b => b.onclick = () => go('per/' + encodeURIComponent(b.dataset.per)));
  const sc = $('#m-seal-chip'); if (sc) { sc.onclick = () => sealSheet(m); sealStatus(m).then(st => { if (st === 'changed') { sc.classList.add('bad'); sc.lastChild.textContent = 'Modificada tras el sello'; } }); }
  const po = $('#m-proj-open'); if (po) po.onclick = () => go('p/' + encodeURIComponent(m.project));
  $('#m-photo').onclick = () => { S.picking = true; setTimeout(() => { S.picking = false; }, 60000); $('#m-photo-in').value = ''; $('#m-photo-in').click(); };
  $('#m-photo-in').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const ph = await savePhoto(f, m.id, null); m.photos = [...(m.photos || []), ph]; await saveMeeting(m); toast('Foto agregada a la reunión'); if ((S.route.tab || 'resumen') === 'resumen') renderTab(m); } catch { toast('No se pudo guardar la foto'); } };
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
  steps.push({ k: 'an', t: adminView() ? 'Crear el acta con Claude' : 'Crear el acta', d: '', s: st === 'analyzing' ? 'run' : 'todo' });
  if (st === 'error') { const fail = steps.find(s => s.s === 'todo' || s.s === 'run'); if (fail) fail.s = 'fail'; }
  if (st === 'waiting') { const nx = steps.find(s => s.s === 'todo'); if (nx) nx.d = 'Se hará solo al volver la conexión'; }
  const err = m.error && !adminView() && /key|no_openai|no_anthropic|openai_|anthropic_|429|saldo/i.test((m.error.code || '') + ' ' + (m.error.message || '')) ? { ...m.error, message: 'El servicio no está disponible en este momento. Tu grabación está a salvo: toca Reintentar más tarde o escribe a soporte.' } : m.error;
  app.innerHTML = `
  <button class="btn ghost sm back" data-nav="library">${icon('back')}Reuniones</button>
  <section class="m-hero"><span class="aura a1"></span><span class="aura a2"></span><div class="m-head"><div class="m-meta"><span>${icon('cal')}${esc(fmtDate(m.date))}</span>${m.durationSec ? `<span class="mono">${icon('time')}${fmtT(m.durationSec)}</span>` : ''}</div><h1>${esc(m.analysis?.title || m.titleHint || 'Nueva reunión')}</h1></div></section>
  <section class="panel" style="max-width:720px">
    <h2>${st === 'error' ? 'El acta necesita tu atención' : st === 'waiting' ? 'Esperando internet' : 'Preparando el acta'}</h2>
    ${st === 'waiting' ? `<div class="notice cool" style="margin-top:12px;display:flex;gap:10px;align-items:flex-start">${icon('wifioff', 2, 18)}<span><b>Grabaste sin conexión y está todo a salvo.</b> Acta transcribe y crea el acta sola apenas vuelva internet, aunque estés en otra pantalla.</span></div>` : ''}
    <div class="stepper">${steps.map(s => `<div class="pstep ${s.s}"><span class="dot">${s.s === 'done' ? icon('check', 3) : s.s === 'fail' ? '!' : ''}</span><div><b>${s.t}</b><small ${s.s === 'run' ? 'id="proc-detail"' : ''}>${esc(s.s === 'run' ? (S.progress[m.id] || 'Trabajando…') : s.s === 'fail' ? (err?.message || '') : s.d)}</small></div></div>`).join('')}</div>
    <div class="pbar" id="proc-bar" ${S.progressPct?.[m.id] != null && st === 'transcribing' ? '' : 'hidden'}><i style="width:${Math.round((S.progressPct?.[m.id] || 0) * 100)}%"></i></div>
    ${running && 'Notification' in window && Notification.permission === 'default' ? `<button class="btn sm ghost" id="p-notify" style="margin-top:10px">${icon('time')}Avisarme cuando esté lista</button>` : ''}
    ${st === 'error' ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
      <button class="btn primary" id="p-retry">${icon('refresh')}Reintentar</button>
      ${adminView() && /key|no_openai|no_anthropic/.test(err?.code || '') ? `<button class="btn" data-nav="settings">${icon('key')}Ir a Ajustes</button>` : ''}
      ${hasAudio ? `<button class="btn ghost" id="p-paste">Pegar transcripción</button>` : ''}
      <button class="btn ghost danger" id="p-del">${icon('trash')}Eliminar</button></div>
      <div id="p-paste-box"></div>` : st === 'waiting' ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn" id="p-retry">${icon('refresh')}Probar ahora</button></div>` : `<p class="muted" style="font-size:13px;margin-top:12px">${running ? 'Puedes revisar otras reuniones mientras tanto; mantén la app abierta hasta que termine.' : 'En cola…'}</p>`}
    ${hasAudio ? `<div style="margin-top:16px"><audio controls preload="metadata" id="p-audio" style="width:100%"></audio></div>` : ''}
  </section>
  ${(m.marks?.length || m.notesLog?.length) ? `<section class="panel" style="max-width:720px;margin-top:16px"><div class="eyebrow">Lo que marcaste</div><div class="notes-log" style="margin-top:10px">${[...(m.marks || []).map(k => ({ t: k.t, text: '★ ' + (k.label || 'Momento importante') })), ...(m.notesLog || [])].sort((a, b) => a.t - b.t).map(n => `<div><b>${fmtT(n.t)}</b><span>${esc(n.text)}</span></div>`).join('')}</div></section>` : ''}`;
  if (hasAudio) DB.get('audio', m.audioParts[0].key).then(b => { const el = $('#p-audio'); if (b && el) el.src = URL.createObjectURL(b); });
  const pn = $('#p-notify'); if (pn) pn.onclick = async () => { try { const ok = await Notification.requestPermission(); toast(ok === 'granted' ? 'Te avisaremos cuando el acta esté lista' : 'No se activaron los avisos'); } catch {} pn.remove(); };
  const r = $('#p-retry'); if (r) r.onclick = () => { if (!navigator.onLine) { toast('Todavía no hay conexión. Se procesará sola cuando vuelva.'); return; } processMeeting(m.id); };
  const pd = $('#p-del'); if (pd) pd.onclick = async () => { await deleteMeeting(m.id); go(''); toast('Reunión eliminada'); };
  const pp = $('#p-paste'); if (pp) pp.onclick = () => { $('#p-paste-box').innerHTML = `<div class="field" style="margin-top:14px"><label for="pp-tx">Transcripción</label><textarea id="pp-tx" class="mono-area" rows="8" placeholder="Pega aquí el texto de la reunión"></textarea><button class="btn primary" id="pp-go" style="justify-self:start">Usar este texto</button></div>`; $('#pp-go').onclick = async () => { const p = parseTranscript($('#pp-tx').value, m.durationSec ? m.durationSec / 60 : null); if (p.segments.length < 2) { toast('Pega la transcripción completa'); return; } await DB.put('transcripts', { segments: p.segments }, m.id); processMeeting(m.id); }; };
  if (st === 'queued' && !running) processMeeting(m.id);
}

async function renderTab(m) {
  const body = $('#tab-body'); const a = m.analysis || {};
  { const nav = $('.tabs'), sel = nav && $('.tabs [aria-selected="true"]'); if (nav && sel) nav.scrollLeft = Math.max(0, sel.offsetLeft - (nav.clientWidth - sel.offsetWidth) / 2); }
  const segs = await getSegments(m.id); S._segCache = S._segCache || {}; S._segCache[m.id] = segs; m._labels = speakerLabels(segs);
  if (!$('#tab-body')) return;
  const tab = S.route.tab || 'resumen';
  if (tab === 'resumen') return renderSummary(body, m, a, segs);
  if (tab === 'informe') return renderReport(body, m, a, segs);
  if (tab === 'mapa') { requestAnimationFrame(() => { const w = $('.mm-wrap'); if (w && w.scrollWidth > w.clientWidth) w.scrollLeft = (w.scrollWidth - w.clientWidth) / 2; }); body.innerHTML = `<div class="mm-wrap">${mindmapSVG(a.mindmap)}</div>${a.mindmap?.branches?.length ? `<div class="mm-tools"><button class="btn primary sm" id="mm-pdf">${icon('doc', 2)}Descargar mapa en PDF</button></div>` : ''}<p class="mm-note">En el celular, desliza hacia el lado para recorrer el mapa.</p>`; const b = $('#mm-pdf'); if (b) b.onclick = () => exportMindmap(m); return; }
  if (tab === 'brief') {
    body.innerHTML = `<div class="tools-row"><button class="btn sm" id="b-copy">${icon('copy')}Copiar brief</button><button class="btn sm" id="b-dl">${icon('download')}Descargar .md</button><button class="btn sm" id="b-share">${icon('share')}Compartir</button></div><article class="brief">${md(a.brief || '_Sin brief para esta reunión._')}</article>`;
    $('#b-copy').onclick = () => copyText(a.brief || '', 'Brief copiado');
    $('#b-dl').onclick = () => downloadText(slug(a.title) + '-brief.md', a.brief || '');
    $('#b-share').onclick = () => shareText(a.title + ' — brief', a.brief || '');
    return;
  }
  if (tab === 'transcripcion') return renderTranscript(body, m, a, segs);
  if (tab === 'estudiar' && a.study) { body.innerHTML = studyTabHTML(m, a); return bindStudy(body, m, a, segs); }
  if (tab === 'preguntar') return renderAsk(body, m, a, segs);
}

function box(title, color, soft, ic, items, n) { return `<div class="box"><div class="box-h"><span class="ic" style="background:${soft};color:${color}">${icon(ic, 2)}</span><h3>${title}</h3><span class="n">${n ?? ''}</span></div>${items || '<div class="empty-li">Nada registrado.</div>'}</div>`; }
function talkTime(m, segs) {
  const rows = speakerShares(m, segs);
  if (rows.length < 2) return '';
  return `<div class="sec"><div class="sec-h"><h2>Quién habló</h2><span class="count">Proporción de palabras</span></div><div class="panel talk">${donutSVG(rows.map((r, i) => ({ pct: r.pct, color: tc(i) })), { size: 150, thick: 18, label: String(rows.length), sub: 'VOCES' })}<div class="talk-list">${rows.map((r, i) => `<div class="talk-row"><span class="nm"><i style="background:${tc(i)}"></i>${esc(r.name)}</span><span class="tb"><i style="width:${(r.pct * 100).toFixed(1)}%;background:${tc(i)}"></i></span><span>${Math.round(r.pct * 100)}%</span></div>`).join('')}</div></div></div>`;
}
function renderSummary(body, m, a, segs) {
  const acts = a.actions || []; const done = acts.filter(x => x.done).length;
  const dur = m.durationSec || segDuration(segs);
  const sevC = s => s === 'alta' ? 'var(--risk)' : s === 'media' ? 'var(--idea)' : 'var(--muted)';
  const sevS = s => s === 'alta' ? 'var(--risk-soft)' : s === 'media' ? 'var(--idea-soft)' : 'var(--glass-2)';
  const marks = m.marks || [];
  body.innerHTML = `
  <div class="tldr"><div class="eyebrow tl-row">En pocas palabras<button class="btn sm ghost say" id="s-say">${icon('play', 2)}Escuchar</button></div><p>${esc(a.tldr)}</p>
    ${a.mood ? `<div class="mood"><b>${esc(a.mood.label)}</b><span class="track"><i style="width:${a.mood.score}%"></i></span><span>${esc(a.mood.note)}</span></div>` : ''}</div>
  ${continuityHTML(m, a)}
  <div class="stats">
    <div class="stat"><span class="si" style="background:var(--accent-soft);color:var(--ember)">${icon('time', 2)}</span><b class="mono">${dur ? fmtT(dur) : '—'}</b><span>Duración${m.estimatedTimes ? ' aprox.' : ''}</span></div>
    <div class="stat"><span class="si" style="background:var(--q-soft);color:var(--q)">${icon('text', 2)}</span><b>${nf(m.words || wordCount(segs))}</b><span>Palabras</span></div>
    <div class="stat"><span class="si" style="background:var(--dec-soft);color:var(--dec)">${icon('flag', 2)}</span><b>${(a.decisions || []).length}</b><span>Decisiones</span></div>
    <div class="stat"><span class="si" style="background:var(--act-soft);color:var(--act)">${icon('check', 2.4)}</span><b>${done}<span style="font-size:17px;color:var(--muted)">/${acts.length}</span></b><span>Tareas hechas</span></div>
    <div class="stat"><span class="si" style="background:var(--idea-soft);color:var(--idea)">${icon('chart', 2)}</span><b>${(a.topics || []).length}</b><span>Temas</span></div>
  </div>
  ${(a.topics || []).length ? `<div class="sec"><div class="sec-h"><h2>Recorrido de la conversación</h2><span class="count">Toca un tema para ir a ese momento</span></div>
    <div class="timeline">${timelineHTML(a.topics, dur)}<svg class="density" id="dens" preserveAspectRatio="none" aria-hidden="true"></svg>
    ${marks.length ? `<div class="tl-marks">${marks.map(k => `<button data-jump="${k.t}" style="left:${Math.min(100, k.t / dur * 100)}%" title="${esc(k.label || 'Momento marcado')} · ${fmtT(k.t)}">${icon('bookmark', 2)}</button>`).join('')}</div>` : ''}
    <div class="tl-axis mono"><span>0:00</span><span>${fmtT(dur / 2)}</span><span>${fmtT(dur)}</span></div>
    <div class="tl-legend">${a.topics.map((t, i) => `<span><i style="background:${tc(i)}"></i>${esc(t.name)} <em>${fmtT(t.start)}</em></span>`).join('')}${marks.length ? `<span>${icon('bookmark', 2, 12)}Tus marcas</span>` : ''}</div></div></div>` : ''}
  ${fichaHTML(m, a)}
  ${(a.keyPoints || []).length ? `<div class="sec"><div class="sec-h"><h2>Puntos clave</h2></div><div class="g3">${a.keyPoints.map((k, i) => `<div class="kp" style="--kc:${tc(i)}"><span class="kp-ic">${icon(k.icon, 2)}</span><h4>${esc(k.title)}</h4><p>${esc(k.detail)}</p></div>`).join('')}</div></div>` : ''}
  <div class="sec g2">
    ${box('Decisiones', 'var(--dec)', 'var(--dec-soft)', 'flag', (a.decisions || []).map(d => `<div class="li"><span class="mk" style="background:var(--dec)"></span><div>${esc(d.text)}${d.why ? `<small>${esc(d.why)}</small>` : ''}</div></div>`).join(''), (a.decisions || []).length)}
    <div class="box"><div class="box-h"><span class="ic" style="background:var(--act-soft);color:var(--act)">${icon('check', 2.2)}</span><h3>Tareas</h3><span class="n">${done} de ${acts.length} hechas</span></div>
      ${acts.length ? acts.map((t, i) => taskHTML(t, `${m.id}|${i}`)).join('') : '<div class="empty-li">Nada registrado.</div>'}
      ${acts.some(t => !t.done) ? `<div class="box-foot"><button class="btn sm" id="s-ics">${icon('cal')}Pasar tareas al calendario</button></div>` : ''}</div>
  </div>
  ${(m.marks || []).some(k => k.hl) ? `<div class="sec"><div class="sec-h"><h2>Tus destacados</h2><span class="count">Marcados en la transcripción</span></div><div class="box">${m.marks.filter(k => k.hl).map(k => `<div class="li"><span class="mk" style="background:var(--idea)"></span><div>${esc(k.text || k.label)} <button class="tlink" data-jump="${k.t}">${fmtT(k.t)}</button></div></div>`).join('')}</div></div>` : ''}
  ${followHTML(m, a)}
  <div class="sec g3">
    ${box('Ideas', 'var(--idea)', 'var(--idea-soft)', 'idea', (a.ideas || []).map(d => `<div class="li"><span class="mk" style="background:var(--idea)"></span><div>${esc(d.text)}${d.note ? `<small>${esc(d.note)}</small>` : ''}</div></div>`).join(''), (a.ideas || []).length)}
    ${box('Riesgos', 'var(--risk)', 'var(--risk-soft)', 'risk', (a.risks || []).map(d => `<div class="li"><span class="mk" style="background:${sevC(d.severity)}"></span><div>${esc(d.text)}<span class="sev" style="background:${sevS(d.severity)};color:${sevC(d.severity)}">${d.severity}</span></div></div>`).join(''), (a.risks || []).length)}
    ${box('Preguntas abiertas', 'var(--q)', 'var(--q-soft)', 'question', (a.questions || []).map(d => `<div class="li"><span class="mk" style="background:var(--q)"></span><div>${esc(d.text)}</div></div>`).join(''), (a.questions || []).length)}
  </div>
  ${photosHTML(m)}
  ${talkTime(m, segs)}
  ${(a.numbers || []).length ? `<div class="sec"><div class="sec-h"><h2>Cifras mencionadas</h2></div><div class="nums">${a.numbers.map(n => `<div class="num"><b>${esc(n.value)}</b><span>${esc(n.label)}</span></div>`).join('')}</div></div>` : ''}
  ${(a.quotes || []).length ? `<div class="sec"><div class="sec-h"><h2>Frases para recordar</h2></div><div class="quotes">${a.quotes.map(q => `<figure class="quote"><p>“${esc(q.text)}”</p><small>${esc(q.who)}${q.t != null ? ` · <button class="tlink" data-jump="${q.t}">${fmtT(q.t)}</button>${m.audioParts?.length ? ` · <button class="tlink" data-clipq="${q.t}">${icon('scissors', 2, 12)} clip de audio</button>` : ''}` : ''}</small></figure>`).join('')}</div></div>` : ''}
  ${(a.nextSteps || []).length ? `<div class="sec"><div class="sec-h"><h2>Próximos pasos</h2></div><div class="steps">${a.nextSteps.map(s => `<div class="step"><span>${esc(s)}</span></div>`).join('')}</div></div>` : ''}`;
  drawDensity(m, segs, dur);
  bindTasks(body);
  bindSummaryExtras(body, m, a, segs);
  $('#s-say').onclick = () => Speak.toggle(summarySpeech(m), $('#s-say'));
  $$('[data-topic],[data-jump]', body).forEach(b => b.onclick = () => { S.jump = +(b.dataset.topic ?? b.dataset.jump); S.route.tab = 'transcripcion'; history.replaceState(null, '', '#m/' + m.id + '/transcripcion'); $$('[data-tab]').forEach(x => x.setAttribute('aria-selected', x.dataset.tab === 'transcripcion')); renderTab(m); });
}
function taskHTML(t, ref, extra = '') {
  const [mid] = ref.split('|'); const m = meetingById(mid); const d = m ? taskDate(t, m) : '';
  return `<div class="task ${t.done ? 'done' : ''}"><input type="checkbox" data-task="${esc(ref)}" ${t.done ? 'checked' : ''} aria-label="Marcar como hecha"><div><div class="tx">${esc(t.task)}</div><div class="sub"><span>${icon('users')} ${esc(t.owner)}</span>${t.due || d ? `<span>${icon('cal')} ${d && dueRedundant(t.due) ? '' : esc(t.due || '')}${d ? ` <em class="mono">${esc(shortDate(d))}</em>` : ''}</span>` : ''}${t.closedBy ? `<span class="closed">${icon('check', 2.4)} cerrada en otra reunión</span>` : ''}${extra}</div></div><div class="task-side"><span class="prio ${t.priority}">${t.priority}</span>${t.done ? '' : `<button class="calbtn" data-cal="${esc(ref)}" aria-label="Agregar al calendario">${icon('cal', 2)}</button>`}</div></div>`;
}
function bindTasks(root) {
  $$('[data-cal]', root).forEach(b => b.onclick = e => { e.preventDefault(); const [id, i] = b.dataset.cal.split('|'); const m = meetingById(id); const t = m?.analysis?.actions?.[+i]; if (t) calendarSheet(m, t); });
  $$('.task .tx', root).forEach(el => el.onclick = () => { const cb = el.closest('.task').querySelector('[data-task]'); cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); });
  $$('[data-task]', root).forEach(cb => cb.onchange = async () => {
    const [id, i] = cb.dataset.task.split('|'); const m = meetingById(id); if (!m?.analysis) return;
    const tk = m.analysis.actions[+i]; tk.done = cb.checked; tk.doneAt = cb.checked ? Date.now() : null; cb.closest('.task,.cm')?.classList.toggle('done', cb.checked);
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
function mindmapSVG(mm, k = 1) {  /* k > 1: letras más grandes para imprimir */
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
      nodes.push({ x: lx, y: ly, text: c, col, leaf: true, right: Math.cos(a2) >= -0.05, bx, by });
    });
    nodes.push({ x: bx, y: by, text: b.label, col, leaf: false });
  });
  const txt = (lines, x, y, size, weight, fill, fam = 'IBM Plex Sans, system-ui, sans-serif') => `<text x="${x}" y="${y - (lines.length - 1) * size * .6}" text-anchor="middle" font-family="${fam}" font-size="${size}" font-weight="${weight}" fill="${fill}">${lines.map((l, i) => `<tspan x="${x}" dy="${i ? size * 1.2 : 0}">${esc(l)}</tspan>`).join('')}</text>`;
  /* Recuadros de las hojas: se calculan primero y se separan si se montan entre sí */
  const leaves = nodes.filter(x => x.leaf); leaves.forEach(nd => { nd.lines = wrapLabel(nd.text, 20); nd.tw = Math.max(...nd.lines.map(l => l.length)) * 7.4 * k + 20; nd.th = nd.lines.length * 16 * k + 12; nd.x0 = Math.max(6, Math.min(W - nd.tw - 6, nd.right ? nd.x : nd.x - nd.tw)); });
  for (let it = 0; it < 80; it++) { let moved = false;
    for (let a1 = 0; a1 < leaves.length; a1++) for (let b1 = a1 + 1; b1 < leaves.length; b1++) { const p = leaves[a1], q = leaves[b1];
      const ox = Math.min(p.x0 + p.tw, q.x0 + q.tw) - Math.max(p.x0, q.x0), oy = Math.min(p.y + p.th / 2, q.y + q.th / 2) - Math.max(p.y - p.th / 2, q.y - q.th / 2);
      if (ox > -6 && oy > -6) { const d = (oy + 6) / 2 + .5, up = p.y <= q.y ? p : q, dn = up === p ? q : p; up.y -= d; dn.y += d; moved = true; } }
    leaves.forEach(nd => { nd.y = Math.max(nd.th / 2 + 6, Math.min(H - nd.th / 2 - 6, nd.y)); }); if (!moved) break; }
  leaves.forEach(nd => { const lx = nd.right ? nd.x0 : nd.x0 + nd.tw; out += `<path d="M${nd.bx} ${nd.by} Q ${(nd.bx + lx) / 2} ${nd.by}, ${lx} ${nd.y}" fill="none" stroke="${nd.col}" stroke-width="1.5" opacity=".45"/>`; });
  leaves.forEach(nd => { const lines = nd.lines, tw = nd.tw, th = nd.th, x0 = nd.x0; out += `<rect x="${x0}" y="${nd.y - th / 2}" width="${tw}" height="${th}" rx="8" fill="var(--surface)" stroke="${nd.col}" stroke-opacity=".55"/>` + txt(lines, x0 + tw / 2, nd.y + 4.5 * k, 13 * k, k > 1 ? 500 : 400, 'var(--ink)'); });
  nodes.filter(x => !x.leaf).forEach(nd => { const lines = wrapLabel(nd.text, 16); const tw = Math.max(...lines.map(l => l.length)) * 8.6 * k + 28; const th = lines.length * 18 * k + 16; out += `<rect x="${nd.x - tw / 2}" y="${nd.y - th / 2}" width="${tw}" height="${th}" rx="10" fill="${nd.col}"/>` + txt(lines, nd.x, nd.y + 5 * k, 14.5 * k, 600, k > 1 ? '#10121A' : 'var(--bg)'); });
  const cl = wrapLabel(mm.center, 16); const cw = Math.max(...cl.map(l => l.length)) * 11 * k + 44, ch = cl.length * 24 * k + 26;
  out += `<rect x="${cx - cw / 2}" y="${cy - ch / 2}" width="${cw}" height="${ch}" rx="14" fill="var(--ink)"/>` + txt(cl, cx, cy + 7 * k, 20 * k, 700, 'var(--bg)', 'Bricolage Grotesque, system-ui, sans-serif');
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
  <label class="switch" style="align-items:center"><input type="checkbox" id="tr-clean" ${S.cleanTx ? 'checked' : ''}><span style="font-size:13px">Texto limpio</span></label>
  <button class="btn sm" id="tr-copy" style="margin-left:auto">${icon('copy')}Copiar texto</button></div>
  <div class="tr" id="tr"></div>`;
  const marks = [...(m.marks || []).map(k => ({ t: k.t, text: k.label || 'Momento marcado', kind: 'mark' })), ...(m.notesLog || []).map(n => ({ t: n.t, text: n.text, kind: 'note' })), ...(m.photos || []).filter(p => p.t != null).map(p => ({ t: p.t, key: p.key, kind: 'photo' }))].sort((x, y) => x.t - y.t);
  const draw = () => {
    const q = S.trq.trim().toLowerCase(); let html = '', ti = -1, hits = 0, mi = 0; const hlSet = new Set((m.marks || []).filter(k => k.hl).map(k => Math.round(k.t)));
    const rx = q ? new RegExp(esc(S.trq.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') : null;
    segs.forEach((x, k) => {
      if (!q) {
        const idx = topics.findIndex(t => x.t >= t.start && x.t < t.end);
        if (idx !== ti && idx >= 0) { ti = idx; html += `<div class="seg-topic" style="color:${tc(idx)}"><i style="background:${tc(idx)}"></i>${esc(topics[idx].name)}</div>`; }
        while (mi < marks.length && marks[mi].t <= x.t) { const mk = marks[mi++]; if (mk.kind === 'photo') { html += `<button class="seg-photo" data-ph="${esc(mk.key)}"><img data-photo="${esc(mk.key)}" alt="Foto del minuto ${fmtT(mk.t)}"><span class="mono">${icon('camera', 2, 12)} ${fmtT(mk.t)}</span></button>`; continue; } html += `<div class="seg-mark">${icon(mk.kind === 'mark' ? 'bookmark' : 'edit', 2)}<span class="mono" style="font-size:12px">${fmtT(mk.t)}</span><span>${esc(mk.text)}</span></div>`; }
      } else if (!x.text.toLowerCase().includes(q) && !spkName(m, x.s).toLowerCase().includes(q)) return;
      hits++;
      let t = esc(S.cleanTx ? cleanText(x.text) : x.text); if (rx) t = t.replace(rx, s => `<mark>${s}</mark>`);
      html += `<div class="seg ${hlSet.has(Math.round(x.t)) ? 'hl' : ''}" id="seg-${k}" data-t="${x.t}"><div class="seg-t"><button class="tlink" data-play="${x.t}">${fmtT(x.t)}</button>${hasAudio ? `<button class="clipbtn" data-clip="${k}" aria-label="Crear clip de audio desde ${fmtT(x.t)}" title="Clip de audio">${icon('scissors', 2)}</button>` : ''}<button class="clipbtn hlbtn ${hlSet.has(Math.round(x.t)) ? 'on' : ''}" data-hl="${k}" aria-label="Destacar frase" title="Destacar">${icon('bookmark', 2)}</button></div><div>${x.s ? `<span class="who" style="color:${tc(spkIndex(m, x.s))}">${esc(spkName(m, x.s))}</span>` : ''}${t}</div></div>`;
    });
    $('#tr').innerHTML = html || '<div class="empty-li">Sin coincidencias.</div>';
    $('#tr-count').textContent = q ? `${hits} ${hits === 1 ? 'coincidencia' : 'coincidencias'}` : `${segs.length} intervenciones`;
    $$('[data-play]').forEach(b => b.onclick = () => { if (hasAudio) Player.seek(+b.dataset.play); else toast('Esta reunión no tiene audio guardado.'); });
    $$('[data-clip]').forEach(b => b.onclick = () => { const k = +b.dataset.clip; const x = segs[k]; let end = x.end || (segs[k + 1]?.t ?? x.t + 15); end = Math.max(x.t + 6, Math.min(x.t + 90, end + .5)); Player.el?.pause(); clipSheet(m, Math.max(0, x.t - .5), end); });
    $$('[data-ph]', $('#tr')).forEach(b => b.onclick = () => photoSheet(m, b.dataset.ph));
    $$('[data-hl]', $('#tr')).forEach(b => b.onclick = async () => { const x = segs[+b.dataset.hl]; const tt = Math.round(x.t); m.marks = m.marks || []; const ex = m.marks.findIndex(k => k.hl && Math.round(k.t) === tt); if (ex >= 0) { m.marks.splice(ex, 1); toast('Destacado quitado'); } else { m.marks.push({ t: tt, label: 'Destacado', text: (x.s ? spkName(m, x.s) + ': ' : '') + x.text, hl: true }); toast('Frase destacada · aparece en el resumen'); } await saveMeeting(m); draw(); });
    hydratePhotos($('#tr'));
  };
  draw();
  $('#trq').addEventListener('input', e => { S.trq = e.target.value; draw(); });
  $('#tr-copy').onclick = () => copyText(segs.map(x => `[${fmtT(x.t)}] ${x.s ? spkName(m, x.s) + ': ' : ''}${S.cleanTx ? cleanText(x.text) : x.text}`).join('\n'), 'Transcripción copiada');
  $('#tr-clean').onchange = e => { S.cleanTx = e.target.checked; draw(); toast(S.cleanTx ? 'Sin muletillas · el original no se modifica' : 'Texto original'); };
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
    ${savedAsks().length ? `<div class="sugs saved"><span class="eyebrow" style="width:100%">Mis preguntas guardadas</span>${savedAsks().map((s, i) => `<span class="sug-wrap"><button class="sug mine" data-sug="${esc(s)}">${icon('bookmark', 2, 12)} ${esc(s)}</button><button class="sug-x" data-unsave="${i}" aria-label="Quitar">×</button></span>`).join('')}</div>` : ''}
    ${chat.length ? '' : `<p class="muted">Pregúntale a esta reunión lo que necesites. Claude responde con la transcripción completa y el acta.</p><div class="sugs">${sugs.map(s => `<button class="sug" data-sug="${esc(s)}">${esc(s)}</button>`).join('')}</div>`}
    <div class="msgs" id="msgs">${chat.map((c, i) => `<div class="msg ${c.role === 'user' ? 'u' : 'a'}">${esc(c.content)}</div>${c.role === 'assistant' ? `<div class="msg-tools"><button class="btn sm ghost" data-cp="${i}">${icon('copy')}Copiar</button>${i > 0 && !savedAsks().includes(chat[i - 1].content) ? `<button class="btn sm ghost" data-save="${i - 1}">${icon('bookmark', 2)}Guardar pregunta</button>` : ''}</div>` : ''}`).join('')}</div>
    <form class="ask-in" id="ask-f"><textarea id="ask-q" rows="1" placeholder="Escribe tu pregunta…" aria-label="Tu pregunta"></textarea><button class="btn primary" ${Settings.v.anthropicKey ? '' : 'disabled'}>Preguntar</button></form>
    ${Settings.v.anthropicKey ? '' : `<p class="notice">Agrega tu clave de Claude en <button class="btn sm" data-nav="settings">Ajustes</button> para preguntar.</p>`}
  </div>`;
  $$('[data-cp]', body).forEach(b => b.onclick = () => copyText(chat[+b.dataset.cp].content, 'Respuesta copiada'));
  $$('[data-save]', body).forEach(b => b.onclick = () => { Settings.set({ savedAsks: [...savedAsks(), chat[+b.dataset.save].content].slice(-12) }); toast('Pregunta guardada para todas tus reuniones'); renderAsk(body, m, a, segs); });
  $$('[data-unsave]', body).forEach(b => b.onclick = () => { const l = savedAsks().slice(); l.splice(+b.dataset.unsave, 1); Settings.set({ savedAsks: l }); renderAsk(body, m, a, segs); });
  let busy = false;
  const ask = async q => {
    if (!q.trim() || busy || !Settings.v.anthropicKey) return; busy = true;
    chat.push({ role: 'user', content: q.trim() }); renderAsk(body, m, a, segs);
    const box = document.createElement('div'); box.className = 'msg a'; box.textContent = 'Pensando…'; $('#msgs').appendChild(box); box.scrollIntoView({ block: 'end', behavior: 'smooth' });
    const ctx = `Eres el asistente de esta reunión. Responde en español de Chile, directo y útil, en texto plano (listas con guiones si ayudan, sin markdown pesado). Basa tus respuestas en la reunión; si algo no se dijo, acláralo. Puedes proponer ideas propias si te las piden, separándolas de lo conversado.\n\nActa:\n${JSON.stringify({ ...a, brief: undefined, speakers: undefined })}\n\nTranscripción:\n${transcriptText(m, segs)}`;
    try {
      const r = await claude({ system: [{ type: 'text', text: ctx, cache_control: { type: 'ephemeral' } }], messages: chat.map(c => ({ role: c.role, content: c.content })), max_tokens: 4000, kind: 'pregunta', onText: t => { box.textContent = t; } });
      chat.push({ role: 'assistant', content: r.text || '(sin respuesta)' });
    } catch (e) { chat.pop(); toast(e.message || 'No se pudo responder', 5000); }
    busy = false; if (S.route.view === 'meeting' && S.route.id === m.id && S.route.tab === 'preguntar') renderAsk(body, m, a, segs);
  };
  $$('[data-sug]', body).forEach(b => b.onclick = () => ask(b.dataset.sug));
  $('#ask-f').onsubmit = e => { e.preventDefault(); ask($('#ask-q').value); };
  $('#ask-q').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(e.target.value); } });
}

/* =========================================================
   Modo Clase: apuntes, tarjetas con repaso espaciado y prueba de práctica
   ========================================================= */
const BOX_DAYS = [0, 1, 2, 4, 7, 15];
function cardsOf(m) { return (m.analysis?.study?.flashcards || []).map((c, i) => ({ m, c, i, key: m.id + '|' + i })); }
function cardDue(c) { const s = c.c; return !s.due || s.due <= today(); }
function dueCards(ms) { return ms.flatMap(cardsOf).filter(cardDue); }
function studyTabHTML(m, a) {
  const st = a.study; const cards = st.flashcards || []; const due = cards.filter(c => !c.due || c.due <= today()).length; const best = st.bestScore;
  return `<div class="study">
    <div class="study-hero"><div><div class="eyebrow">Modo clase</div><h2>${esc(a.title)}</h2><p class="muted">${cards.length} tarjetas · ${(st.quiz || []).length} preguntas de práctica${best != null ? ` · tu mejor puntaje ${best}%` : ''}</p></div>
      <div class="study-cta"><button class="btn primary" id="st-rep" ${cards.length ? '' : 'disabled'}>${icon('refresh', 2)}Repasar tarjetas${due ? ` · ${due}` : ''}</button><button class="btn" id="st-quiz" ${(st.quiz || []).length ? '' : 'disabled'}>${icon('check', 2.2)}Prueba de práctica</button><button class="btn" id="st-say">${icon('play', 2)}Escuchar apuntes</button></div></div>
    ${(st.exam || []).length ? `<div class="sec"><div class="sec-h"><h2>${icon('flag', 2, 18)} Entra en la prueba</h2><span class="count">Lo que se recalcó en clase</span></div><div class="box exam">${st.exam.map(x => `<div class="li"><span class="mk" style="background:var(--risk)"></span><div>${esc(x.text)}${x.t != null ? ` <button class="tlink" data-jump="${x.t}">${fmtT(x.t)}</button>` : ''}</div></div>`).join('')}</div></div>` : ''}
    ${st.notes ? `<div class="sec"><div class="sec-h"><h2>Apuntes</h2><span class="count"><button class="btn sm ghost" id="st-copy">${icon('copy')}Copiar</button></span></div><article class="brief notes">${md(st.notes)}</article></div>` : ''}
    ${(st.glossary || []).length ? `<div class="sec"><div class="sec-h"><h2>Glosario</h2><span class="count">${st.glossary.length} conceptos</span></div><div class="gloss">${st.glossary.map(g => `<div class="gl"><b>${esc(g.term)}</b><span>${esc(g.def)}</span></div>`).join('')}</div></div>` : ''}
  </div>`;
}
function bindStudy(body, m, a, segs) {
  const st = a.study;
  $('#st-rep').onclick = () => go('rep/m/' + m.id);
  $('#st-quiz').onclick = () => quizSheet(m);
  $('#st-say').onclick = () => Speak.toggle(studySpeech(m), $('#st-say'));
  const cp = $('#st-copy'); if (cp) cp.onclick = () => copyText(st.notes, 'Apuntes copiados');
  $$('[data-jump]', body).forEach(b => b.onclick = () => { S.jump = +b.dataset.jump; S.route.tab = 'transcripcion'; history.replaceState(null, '', '#m/' + m.id + '/transcripcion'); $$('[data-tab]').forEach(x => x.setAttribute('aria-selected', x.dataset.tab === 'transcripcion')); renderTab(m); });
}
function studySpeech(m) {
  const a = m.analysis; const st = a.study || {};
  const plain = s => String(s || '').replace(/[#*_`>|-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return [a.title + '.', (st.exam || []).length ? 'Lo que entra en la prueba: ' + st.exam.map(x => x.text).join('. ') + '.' : '', plain(st.notes) || a.tldr].filter(Boolean).join(' ');
}
function summarySpeech(m) {
  const a = m.analysis;
  return [a.title + '.', a.tldr, (a.decisions || []).length ? 'Decisiones: ' + a.decisions.map(d => d.text).join('. ') + '.' : '', (a.actions || []).filter(t => !t.done).length ? 'Tareas: ' + a.actions.filter(t => !t.done).map(t => `${t.task}, a cargo de ${t.owner}${t.due ? ', ' + t.due : ''}`).join('. ') + '.' : ''].filter(Boolean).join(' ');
}
/* Read aloud with the phone's own voice (free, on device) */
const Speak = {
  btn: null, on: false,
  voice() { const vs = speechSynthesis.getVoices(); return vs.find(v => /es[-_]CL/i.test(v.lang)) || vs.find(v => /es[-_](419|MX|US|AR|CO)/i.test(v.lang)) || vs.find(v => /^es/i.test(v.lang)); },
  toggle(text, btn) {
    if (!('speechSynthesis' in window)) { toast('Este teléfono no permite leer en voz alta'); return; }
    if (this.on) { this.stop(); return; }
    this.btn = btn; this.on = true; if (btn) { btn.dataset.lbl = btn.lastChild.textContent; btn.lastChild.textContent = 'Detener'; btn.classList.add('speaking'); }
    const parts = String(text).match(/[^.!?]+[.!?]*/g) || [text]; const v = this.voice();
    parts.forEach((p, i) => { const u = new SpeechSynthesisUtterance(p.trim()); u.lang = v?.lang || 'es-CL'; if (v) u.voice = v; u.rate = 1.02; if (i === parts.length - 1) u.onend = () => this.stop(); speechSynthesis.speak(u); });
  },
  stop() { try { speechSynthesis.cancel(); } catch {} this.on = false; const b = this.btn; if (b && b.dataset.lbl) { b.lastChild.textContent = b.dataset.lbl; b.classList.remove('speaking'); } this.btn = null; }
};
window.addEventListener('hashchange', () => Speak.on && Speak.stop());

/* Review session (Leitner boxes) for one class or a whole subject */
function renderReview(app, kind, id) {
  const ms = kind === 'm' ? [meetingById(id)].filter(Boolean) : projectMeetings(id).filter(m => m.analysis?.study);
  const all = ms.flatMap(cardsOf); let queue = all.filter(cardDue); if (!queue.length) queue = all.slice();
  queue.sort(() => Math.random() - .5);
  const title = kind === 'm' ? ms[0]?.analysis?.title : id;
  let i = 0, flipped = false, ok = 0, bad = 0;
  const draw = () => {
    if (!all.length) { app.innerHTML = `<div class="empty"><h3>No hay tarjetas</h3><p>Graba una clase con el tipo “Clase” para que Acta las cree.</p><button class="btn" data-nav="library">Volver</button></div>`; return; }
    if (i >= queue.length) {
      app.innerHTML = `<button class="btn ghost sm back" id="rv-back">${icon('back')}Volver</button><section class="review done-rv"><div class="eyebrow">Repaso terminado</div><h1>${ok} de ${queue.length} las sabías</h1><p class="muted">${bad ? `Las ${bad} que fallaste vuelven mañana. Las que sabías vuelven en unos días.` : '¡Perfecto! Vuelven en unos días para que no se olviden.'}</p><div class="tools-row" style="justify-content:center;margin-top:18px"><button class="btn primary" id="rv-again">${icon('refresh', 2)}Repasar otra vez</button><button class="btn" id="rv-back2">Listo</button></div></section>`;
      $('#rv-again').onclick = () => { i = 0; ok = 0; bad = 0; flipped = false; queue = all.slice().sort(() => Math.random() - .5); draw(); };
      $('#rv-back').onclick = $('#rv-back2').onclick = () => history.length > 1 ? history.back() : go('');
      return;
    }
    const c = queue[i];
    app.innerHTML = `<button class="btn ghost sm back" id="rv-back">${icon('back')}Volver</button>
    <section class="review"><div class="rv-top"><span class="eyebrow">${esc(title || 'Repaso')}</span><span class="mono">${i + 1} / ${queue.length}</span></div><div class="rv-bar"><i style="width:${i / queue.length * 100}%"></i></div>
      <button class="flash ${flipped ? 'flipped' : ''}" id="rv-card"><span class="fq">${esc(c.c.q)}</span>${flipped ? `<span class="fa">${esc(c.c.a)}</span>` : '<span class="fhint">Toca para ver la respuesta</span>'}</button>
      ${flipped ? `<div class="rv-grade"><button class="btn" data-g="0">No la sabía</button><button class="btn" data-g="1">Más o menos</button><button class="btn cool" data-g="2">La sabía</button></div>` : `<div class="rv-grade"><button class="btn sm ghost" id="rv-say">${icon('play', 2)}Escuchar</button></div>`}
    </section>`;
    $('#rv-back').onclick = () => history.length > 1 ? history.back() : go('');
    $('#rv-card').onclick = () => { flipped = !flipped; draw(); };
    const sy = $('#rv-say'); if (sy) sy.onclick = () => Speak.toggle(c.c.q, sy);
    $$('[data-g]', app).forEach(b => b.onclick = async () => {
      const g = +b.dataset.g; const s = c.c; let box = s.box || 1;
      if (g === 0) { box = 1; bad++; } else if (g === 2) { box = Math.min(5, box + 1); ok++; } else ok += 0;
      const d = new Date(); d.setDate(d.getDate() + (g === 0 ? 1 : g === 1 ? 1 : BOX_DAYS[box])); s.box = box; s.due = isoD(d);
      await saveMeeting(c.m); i++; flipped = false; draw();
    });
  };
  draw();
}
function quizSheet(m) {
  const qs = (m.analysis.study.quiz || []).slice(); let i = 0, score = 0, picked = null;
  sheet(`<div id="qz"></div>`, el => {
    const box = $('#qz', el);
    const draw = () => {
      if (i >= qs.length) {
        const pct = Math.round(score / qs.length * 100); const st = m.analysis.study; if (st.bestScore == null || pct > st.bestScore) { st.bestScore = pct; saveMeeting(m); }
        box.innerHTML = `<div class="eyebrow">Prueba de práctica</div><h3>${score} de ${qs.length} correctas · ${pct}%</h3><p class="muted">${pct >= 80 ? 'Vas muy bien preparado.' : pct >= 50 ? 'Repasa las tarjetas y vuelve a intentarlo.' : 'Conviene repasar los apuntes y las tarjetas.'}</p><div class="sheet-actions"><button class="btn primary" id="qz-again">Hacerla de nuevo</button><button class="btn" id="qz-rep">Repasar tarjetas</button></div>`;
        $('#qz-again', el).onclick = () => { i = 0; score = 0; picked = null; qs.sort(() => Math.random() - .5); draw(); };
        $('#qz-rep', el).onclick = () => { closeSheet(); go('rep/m/' + m.id); };
        return;
      }
      const q = qs[i];
      box.innerHTML = `<div class="eyebrow">Pregunta ${i + 1} de ${qs.length}</div><h3>${esc(q.q)}</h3><div class="qz-opts">${q.options.map((o, k) => `<button class="qz-o ${picked == null ? '' : k === q.answer ? 'right' : k === picked ? 'wrong' : ''}" data-o="${k}" ${picked != null ? 'disabled' : ''}><b>${'ABCD'[k]}</b>${esc(o)}</button>`).join('')}</div>${picked != null ? `<p class="qz-why">${picked === q.answer ? '✓ Correcto. ' : '✗ La respuesta es ' + 'ABCD'[q.answer] + '. '}${esc(q.why || '')}</p><div class="sheet-actions"><button class="btn primary" id="qz-next">${i + 1 < qs.length ? 'Siguiente' : 'Ver resultado'}</button></div>` : ''}`;
      $$('[data-o]', el).forEach(b => b.onclick = () => { picked = +b.dataset.o; if (picked === q.answer) score++; draw(); });
      const nx = $('#qz-next', el); if (nx) nx.onclick = () => { i++; picked = null; draw(); };
    };
    draw();
  }, 'quiz');
}
function reviewCardHTML() {
  const ms = S.meetings.filter(m => m.analysis?.study); if (!ms.length) return '';
  const due = dueCards(ms).length; if (!due) return '';
  const subj = [...new Set(ms.filter(m => cardsOf(m).some(cardDue)).map(m => m.project || m.analysis.title))];
  return `<button class="studycard rise" id="home-rep"><span class="oc-n"><b>${due}</b><small>tarjetas</small></span><span class="oc-tx"><b>Repaso de hoy</b><span>${esc(subj.slice(0, 3).join(' · '))}${subj.length > 3 ? '…' : ''}</span></span><span class="wk-go">Repasar ${icon('back', 2)}</span></button>`;
}
function subjectStudyHTML(name) {
  const ms = projectMeetings(name).filter(m => m.analysis?.study); if (!ms.length) return '';
  const gl = new Map(); ms.forEach(m => (m.analysis.study.glossary || []).forEach(g => { const k = fold(g.term); if (!gl.has(k)) gl.set(k, { ...g, m }); }));
  const cards = ms.flatMap(cardsOf); const due = cards.filter(cardDue).length;
  const exam = ms.flatMap(m => (m.analysis.study.exam || []).map(x => ({ m, x })));
  return `<div class="sec study-subj"><div class="sec-h"><h2>${icon('idea', 2, 18)} Ramo: material de estudio</h2><span class="count">${ms.length} ${ms.length === 1 ? 'clase' : 'clases'}</span></div>
    <div class="tools-row"><button class="btn primary sm" id="subj-rep">${icon('refresh', 2)}Repasar todo el ramo · ${due || cards.length} tarjetas</button></div>
    ${exam.length ? `<div class="box exam" style="margin-bottom:12px"><div class="box-h"><span class="ic" style="background:var(--risk-soft);color:var(--risk)">${icon('flag', 2)}</span><h3>Entra en la prueba</h3><span class="n">${exam.length}</span></div>${exam.map(({ m, x }) => `<div class="li"><span class="mk" style="background:var(--risk)"></span><div>${esc(x.text)}<small>${esc(shortDate(m.date))} · ${esc(m.analysis.title)}</small></div></div>`).join('')}</div>` : ''}
    ${gl.size ? `<div class="gloss">${[...gl.values()].sort((a, b) => a.term.localeCompare(b.term, 'es')).map(g => `<div class="gl"><b>${esc(g.term)}</b><span>${esc(g.def)}</span></div>`).join('')}</div>` : ''}</div>`;
}

/* =========================================================
   Pequeños detalles: texto limpio, aviso de grabación, preguntas guardadas, horas disponibles
   ========================================================= */
const FILLERS = /(^|[\s,¿¡(])(e+h+|e+m+|m{2,}|ehm+|a+h+|cachai|¿cachai\?)(?=[\s,.!?;:)]|$)[,]?/gi;
function cleanText(t) {
  return String(t).replace(FILLERS, '$1').replace(/\b(\p{L}+)(\s+\1\b)+/giu, '$1').replace(/\bo sea,\s*/gi, '').replace(/\s{2,}/g, ' ').replace(/\s+([,.!?;:])/g, '$1').replace(/^[,\s]+/, '').replace(/^\p{Ll}/u, c => c.toUpperCase()).trim();
}
function consentSheet() {
  const isClass = (recMeta?.template || '') === 'clase';
  const txt = isClass ? 'Profe, ¿le molesta si grabo la clase? Es solo para estudiar: el audio queda en mi teléfono y no lo comparto.' : 'Antes de empezar: voy a grabar esta reunión para tomar el acta y no perder ningún acuerdo. El audio queda guardado solo en mi teléfono y les comparto el resumen después. ¿Les parece bien?';
  sheet(`<div class="eyebrow">Aviso de grabación</div><h3>Pide permiso en 10 segundos</h3><p class="muted">Es lo correcto y en Chile la ley de datos personales lo exige para datos de terceros. Léelo en voz alta o envíalo antes de empezar.</p><div class="consent-txt" id="cs-txt">${esc(txt)}</div><div class="sheet-actions"><button class="btn primary" id="cs-wa">${icon('chat', 2)}Enviar por WhatsApp</button><button class="btn" id="cs-copy">${icon('copy')}Copiar</button><button class="btn" id="cs-say">${icon('play', 2)}Leer en voz alta</button></div>`, el => {
    $('#cs-wa', el).onclick = () => waOpen(txt); $('#cs-copy', el).onclick = () => copyText(txt, 'Aviso copiado'); $('#cs-say', el).onclick = () => Speak.toggle(txt, $('#cs-say', el));
  });
}
function savedAsks() { return Array.isArray(Settings.v.savedAsks) ? Settings.v.savedAsks : []; }
async function hoursLeft() { try { const e = await navigator.storage.estimate(); const free = Math.max(0, (e.quota || 0) - (e.usage || 0)); return free * 8 / (+Settings.v.bitrate || 32000) / 3600; } catch { return null; } }

/* =========================================================
   Summary extras: continuity, sector card, follow-up message, photos
   ========================================================= */
const DOW = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const isoD = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const shortDate = iso => { try { return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }); } catch { return iso; } };
function parseDue(text, base) {
  const s = fold(text).replace(/setiembre/g, 'septiembre'); if (!s.trim()) return '';
  const b = new Date((base || today()) + 'T12:00:00'); if (isNaN(b)) return '';
  const add = n => { const d = new Date(b); d.setDate(d.getDate() + n); return isoD(d); };
  const words = { un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, diez: 10, quince: 15 };
  let r;
  if (/\bhoy\b|esta tarde|esta noche/.test(s)) return isoD(b);
  if (/pasado manana/.test(s)) return add(2);
  if (/\bmanana\b/.test(s)) return add(1);
  if ((r = s.match(/en (\d+|un|una|dos|tres|cuatro|cinco|seis|siete|diez|quince) (dia|dias|semana|semanas|mes|meses)\b/))) { const n = +r[1] || words[r[1]] || 1; return add(n * (/semana/.test(r[2]) ? 7 : /mes/.test(r[2]) ? 30 : 1)); }
  if ((r = s.match(/(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?: de (\d{4}))?/))) { let y = +r[3] || b.getFullYear(); let d = new Date(y, MONTHS.indexOf(r[2]), +r[1], 12); if (!r[3] && d < b - 864e5 * 2) d = new Date(y + 1, MONTHS.indexOf(r[2]), +r[1], 12); return isoD(d); }
  if ((r = s.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/))) { let y = r[3] ? (+r[3] < 100 ? 2000 + +r[3] : +r[3]) : b.getFullYear(); let d = new Date(y, +r[2] - 1, +r[1], 12); if (!r[3] && d < b - 864e5 * 2) d = new Date(y + 1, +r[2] - 1, +r[1], 12); if (!isNaN(d) && +r[2] <= 12) return isoD(d); }
  if (/fin(es)? de mes|final de mes|fin del mes/.test(s)) { const d = new Date(b.getFullYear(), b.getMonth() + 1, 0, 12); return isoD(d); }
  if (/proxima semana|semana que viene|siguiente semana/.test(s)) return add(((8 - b.getDay()) % 7) || 7);
  if (/fin de semana/.test(s)) return add(((6 - b.getDay()) + 7) % 7 || 7);
  for (let i = 0; i < 7; i++) if (new RegExp('\\b' + DOW[i] + '\\b').test(s)) { let diff = (i - b.getDay() + 7) % 7 || 7; if (/proximo|siguiente|que viene/.test(s) && diff < 7 && /semana/.test(s)) diff += 7; return add(diff); }
  return '';
}
/* Si el plazo dicho ya es solo un día o una fecha, basta con mostrar la fecha calculada */
const dueRedundant = due => !due || /^(el\s+)?(hoy|mañana|pasado mañana|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)(\s+\d{1,2})?(\s+de\s+\w+)?$/i.test(String(due).trim()) || /^\d{1,2}(\s+de)?\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)$/i.test(String(due).trim());
const taskDate = (t, m) => t.dueDate || parseDue(t.due, m.date);

function continuityHTML(m, a) {
  const prev = a.previousTasks || [];
  if (!a.continuity && !prev.length && !m.project) return '';
  const all = m.project ? projectMeetings(m.project) : [];
  const pos = all.findIndex(x => x.id === m.id);
  const st = { hecha: ['var(--act)', 'var(--act-soft)', 'Hecha'], 'en curso': ['var(--q)', 'var(--q-soft)', 'En curso'], 'sin novedad': ['var(--muted)', 'var(--glass-2)', 'Sin novedad'] };
  const rows = prev.map(p => { const [mid, i] = p.ref.split('|'); const pm = meetingById(mid); const t = pm?.analysis?.actions?.[+i]; if (!t) return ''; const c = st[p.status] || st['sin novedad']; return `<div class="li"><span class="mk" style="background:${c[0]}"></span><div>${esc(t.task)} <span class="sev" style="background:${c[1]};color:${c[0]}">${c[2]}</span><small>${esc(t.owner)} · de <button class="tlink" data-open="${esc(pm.id)}">${esc(pm.analysis.title)}</button>${p.note ? ' · ' + esc(p.note) : ''}</small></div></div>`; }).join('');
  if (!a.continuity && !rows) return m.project && all.length > 1 ? `<div class="cont slim"><span class="cont-ic">${icon('folder', 2)}</span><span>Reunión ${pos + 1} de ${all.length} del proyecto <button class="tlink" data-proj="${esc(m.project)}">${esc(m.project)}</button></span></div>` : '';
  return `<div class="sec cont"><div class="cont-h"><span class="cont-ic">${icon('folder', 2)}</span><div><div class="eyebrow">Desde la reunión anterior${m.project ? ` · <button class="tlink" data-proj="${esc(m.project)}">${esc(m.project)}</button>` : ''}${pos >= 0 && all.length > 1 ? ` · ${pos + 1} de ${all.length}` : ''}</div>${a.continuity ? `<p>${esc(a.continuity)}</p>` : ''}</div></div>${rows ? `<div class="box">${rows}</div>` : ''}</div>`;
}
function fichaHTML(m, a) {
  const f = a.ficha || []; if (!f.length) return '';
  const tpl = TEMPLATES[m.template];
  return `<div class="sec"><div class="sec-h"><h2>Ficha ${tpl?.group ? '· ' + esc(tpl.name) : ''}</h2><button class="btn sm ghost" id="ficha-copy">${icon('copy')}Copiar</button></div><div class="ficha">${f.map(x => { const none = /^no se mencion/i.test(x.value); return `<div class="fi ${none ? 'none' : ''}"><span>${esc(x.label)}</span><b>${esc(x.value)}</b></div>`; }).join('')}</div></div>`;
}
function localFollow(m, a) {
  const acts = (a.actions || []).filter(t => !t.done); const dec = a.decisions || [];
  const wa = [`Hola, les comparto lo que acordamos en *${a.title}* (${fmtDate(m.date)}):`, ''];
  if (dec.length) { wa.push('*Acuerdos*'); dec.slice(0, 6).forEach(d => wa.push('• ' + d.text)); wa.push(''); }
  if (acts.length) { wa.push('*Tareas*'); acts.slice(0, 8).forEach(t => wa.push(`• ${t.task} — ${t.owner}${t.due ? ' (' + t.due + ')' : ''}`)); wa.push(''); }
  wa.push('Si algo no quedó bien reflejado, me avisan. ¡Gracias!');
  const em = ['Hola:', '', `Les envío el resumen de la reunión "${a.title}" del ${fmtDate(m.date)}.`, '', a.tldr, ''];
  if (dec.length) { em.push('Acuerdos:'); dec.forEach(d => em.push('- ' + d.text)); em.push(''); }
  if (acts.length) { em.push('Tareas:'); acts.forEach(t => em.push(`- ${t.task} — ${t.owner}${t.due ? ' · ' + t.due : ''}`)); em.push(''); }
  if (a.nextSteps?.length) { em.push('Próximos pasos:'); a.nextSteps.forEach((x, i) => em.push(`${i + 1}. ${x}`)); em.push(''); }
  em.push('Quedo atento a cualquier comentario.', '', 'Saludos.');
  return { whatsapp: wa.join('\n'), emailSubject: 'Resumen y acuerdos: ' + a.title, emailBody: em.join('\n') };
}
function followHTML(m, a) {
  const f = a.followUp || localFollow(m, a); const mode = S.followMode || 'whatsapp';
  return `<div class="sec follow"><div class="sec-h"><h2>Mensaje de seguimiento</h2><span class="count">Listo para enviar · puedes editarlo</span></div>
    <div class="panel fu"><div class="fu-top"><div class="seg-ctl" role="group" aria-label="Formato"><button data-fu="whatsapp" aria-pressed="${mode === 'whatsapp'}">${icon('chat', 2, 14)} WhatsApp</button><button data-fu="email" aria-pressed="${mode === 'email'}">${icon('mail', 2, 14)} Correo</button></div></div>
    ${mode === 'email' ? `<input class="fu-subj" id="fu-subj" value="${esc(f.emailSubject)}" aria-label="Asunto">` : ''}
    <textarea class="fu-text" id="fu-text" rows="${mode === 'email' ? 12 : 9}" aria-label="Mensaje">${esc(mode === 'email' ? f.emailBody : f.whatsapp)}</textarea>
    <div class="fu-actions">${mode === 'whatsapp' ? `<button class="btn primary sm" id="fu-send">${icon('send', 2)}Enviar por WhatsApp</button>` : `<button class="btn primary sm" id="fu-send">${icon('mail', 2)}Abrir en el correo</button>`}<button class="btn sm" id="fu-copy">${icon('copy')}Copiar</button>${a.followUp ? '' : '<span class="hint">Mensaje armado con el acta. Las próximas actas lo traerán redactado por Claude.</span>'}</div></div></div>`;
}
function photosHTML(m) {
  const ph = (m.photos || []); if (!ph.length) return '';
  return `<div class="sec"><div class="sec-h"><h2>Fotos de la reunión</h2><span class="count">${ph.length} · toca para ver</span></div><div class="photos">${ph.map(p => `<button class="ph" data-ph="${esc(p.key)}"><img data-photo="${esc(p.key)}" alt="Foto${p.t != null ? ' del minuto ' + fmtT(p.t) : ''}">${p.t != null ? `<span class="mono">${fmtT(p.t)}</span>` : ''}</button>`).join('')}</div></div>`;
}
function bindSummaryExtras(body, m, a, segs) {
  $$('[data-open]', body).forEach(b => b.onclick = () => go('m/' + b.dataset.open));
  $$('[data-proj]', body).forEach(b => b.onclick = () => go('p/' + encodeURIComponent(b.dataset.proj)));
  const fc = $('#ficha-copy'); if (fc) fc.onclick = () => copyText((a.ficha || []).map(x => `${x.label}: ${x.value}`).join('\n'), 'Ficha copiada');
  const ics = $('#s-ics'); if (ics) ics.onclick = () => exportTasksICS([m]);
  $$('[data-fu]', body).forEach(b => b.onclick = () => { S.followMode = b.dataset.fu; renderSummary(body, m, a, segs); $('.follow')?.scrollIntoView({ block: 'nearest' }); });
  const txt = $('#fu-text');
  if (txt) {
    const mode = S.followMode || 'whatsapp';
    const save = async () => { a.followUp = a.followUp || localFollow(m, a); if (mode === 'email') { a.followUp.emailBody = txt.value; a.followUp.emailSubject = $('#fu-subj').value; } else a.followUp.whatsapp = txt.value; await saveMeeting(m); };
    txt.addEventListener('change', save); $('#fu-subj')?.addEventListener('change', save);
    $('#fu-copy').onclick = () => copyText((mode === 'email' ? $('#fu-subj').value + '\n\n' : '') + txt.value, 'Mensaje copiado');
    $('#fu-send').onclick = () => { if (mode === 'email') location.href = `mailto:?subject=${encodeURIComponent($('#fu-subj').value)}&body=${encodeURIComponent(txt.value)}`; else window.open('https://wa.me/?text=' + encodeURIComponent(txt.value), '_blank', 'noopener'); };
  }
  $$('[data-clipq]', body).forEach(b => b.onclick = () => { const t = +b.dataset.clipq; const seg = segs.find(x => x.t >= t - 1) || {}; clipSheet(m, Math.max(0, t - 1), Math.max(t + 8, Math.min(t + 45, seg.end || t + 15))); });
  $$('[data-ph]', body).forEach(b => b.onclick = () => photoSheet(m, b.dataset.ph));
  hydratePhotos(body);
}

/* =========================================================
   Bottom sheet
   ========================================================= */
function sheet(html, onMount, cls = '') {
  closeSheet();
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet ${cls}" role="dialog" aria-modal="true"><button class="sheet-x" aria-label="Cerrar">${icon('back', 2)}</button>${html}</div>`;
  document.body.appendChild(bg); requestAnimationFrame(() => bg.classList.add('in'));
  bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('.sheet-x')) closeSheet(); });
  onMount && onMount(bg.firstElementChild);
  return bg.firstElementChild;
}
function closeSheet() { const b = $('.sheet-bg'); if (!b) return; b.dispatchEvent(new Event('closing')); b.remove(); }
/* Files: iPhone only lets a page share or save a file right after a tap, and an installed web app
   cannot use normal downloads. So the file is prepared first and then offered with its own button. */
const IS_STANDALONE = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const canShareFile = f => { try { return !!(navigator.canShare && navigator.canShare({ files: [f] })); } catch { return false; } };
function plainDownload(file) { const url = URL.createObjectURL(file); const l = document.createElement('a'); l.href = url; l.download = file.name; document.body.appendChild(l); l.click(); setTimeout(() => { URL.revokeObjectURL(url); l.remove(); }, 4000); }
function deliverFile(file, title) {
  const share = canShareFile(file); const isTouch = matchMedia('(pointer:coarse)').matches;
  if (!share && !isTouch) { plainDownload(file); toast('Archivo descargado: ' + file.name); return; }
  const ext = (file.name.split('.').pop() || '').toUpperCase();
  const url = URL.createObjectURL(file);
  sheet(`<div class="eyebrow">Archivo listo</div><h3>${esc(title || file.name)}</h3>
    <div class="file-ready"><span class="fr-ic">${icon(/PNG|JPG/.test(ext) ? 'image' : ext === 'DOCX' ? 'word' : ext === 'ICS' ? 'cal' : 'doc', 2)}</span><span><b>${esc(file.name)}</b><small>${ext} · ${fmtBytes(file.size)}</small></span></div>
    <div class="sheet-actions">${share ? `<button class="btn primary lg" id="fr-share">${icon('share', 2)}Compartir o guardar</button>` : ''}<a class="btn ${share ? '' : 'primary lg'}" id="fr-open" href="${url}" target="_blank" rel="noopener" ${share ? '' : `download="${esc(file.name)}"`}>${icon(share ? 'doc' : 'download', 2)}${share ? 'Abrir' : 'Descargar'}</a></div>
    <p class="hint">${share ? 'En el menú elige WhatsApp, Correo, o <b>Guardar en Archivos</b> para dejarlo en tu teléfono.' : 'Si no se descarga, toca Abrir y usa el botón compartir del navegador.'}</p>`, el => {
    const b = $('#fr-share', el);
    if (b) b.onclick = async () => { try { await navigator.share({ files: [file] }); closeSheet(); } catch (e) { if (e.name !== 'AbortError') { try { await navigator.share({ files: [file], title: title || file.name }); closeSheet(); } catch (e2) { if (e2.name !== 'AbortError') toast('No se pudo compartir. Prueba con Abrir.', 4500); } } } };
  });
  $('.sheet-bg')?.addEventListener('closing', () => setTimeout(() => URL.revokeObjectURL(url), 60000));
}

/* =========================================================
   Calendar (.ics and Google Calendar link)
   ========================================================= */
function buildICS(evts) {
  const e2 = t => String(t || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\;');
  const fl = line => { let out = ''; while (line.length > 72) { out += line.slice(0, 72) + '\r\n '; line = line.slice(72); } return out + line; };
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const next = iso => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + 1); return isoD(d).replace(/-/g, ''); };
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Acta//Reuniones//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Tareas de Acta'];
  evts.forEach(e => L.push('BEGIN:VEVENT', 'UID:' + e.uid + '@acta.app', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + e.date.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + next(e.date), 'SUMMARY:' + e2(e.title), 'DESCRIPTION:' + e2(e.desc), 'TRANSP:TRANSPARENT', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + e2(e.title), 'TRIGGER:PT9H', 'END:VALARM', 'END:VEVENT'));
  L.push('END:VCALENDAR');
  return L.map(fl).join('\r\n') + '\r\n';
}
const taskEvent = (m, t, date) => ({ uid: (t.id || uid()) + '-' + m.id, date, title: t.task + (t.owner && t.owner !== 'Sin asignar' ? ' · ' + t.owner : ''), desc: `Tarea de la reunión "${m.analysis?.title || ''}" (${fmtDate(m.date)}).${t.due ? ' Plazo dicho: ' + t.due + '.' : ''} Prioridad ${t.priority}.` });
const gcalURL = ev => { const d0 = ev.date.replace(/-/g, ''); const d = new Date(ev.date + 'T12:00:00'); d.setDate(d.getDate() + 1); return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(ev.title) + '&dates=' + d0 + '/' + isoD(d).replace(/-/g, '') + '&details=' + encodeURIComponent(ev.desc); };
function exportTasksICS(meetings) {
  const evs = []; let undated = 0;
  meetings.forEach(m => (m.analysis?.actions || []).forEach(t => { if (t.done) return; const d = taskDate(t, m); if (d) evs.push(taskEvent(m, t, d)); else undated++; }));
  if (!evs.length) { toast(undated ? 'Ninguna tarea pendiente tiene fecha. Toca el ícono de calendario en una tarea para elegirla.' : 'No hay tareas pendientes.', 5000); return; }
  deliverFile(new File([buildICS(evs)], 'tareas-acta.ics', { type: 'text/calendar' }), 'Tareas');
  if (undated) setTimeout(() => toast(`${evs.length} con fecha al calendario · ${undated} sin fecha quedaron fuera`, 4500), 400);
}
function calendarSheet(m, t) {
  const d0 = taskDate(t, m) || (() => { const d = new Date(); d.setDate(d.getDate() + 1); return isoD(d); })();
  sheet(`<div class="eyebrow">Agregar al calendario</div><h3>${esc(t.task)}</h3><p class="muted">${esc(t.owner)}${t.due ? ' · plazo dicho: ' + esc(t.due) : ''}</p>
    <div class="field" style="margin-top:14px"><label for="cal-d">Fecha</label><input type="date" id="cal-d" value="${d0}"></div>
    <div class="sheet-actions"><a class="btn primary" id="cal-g" target="_blank" rel="noopener">${icon('cal', 2)}Google Calendar</a><button class="btn" id="cal-i">${icon('download')}Calendario del teléfono (.ics)</button></div>
    <p class="hint">El evento dura todo el día y te avisa a las 9:00.</p>`, el => {
    const upd = () => { $('#cal-g', el).href = gcalURL(taskEvent(m, t, $('#cal-d', el).value || d0)); };
    upd(); $('#cal-d', el).addEventListener('change', async () => { upd(); t.dueDate = $('#cal-d', el).value; await saveMeeting(m); });
    $('#cal-g', el).addEventListener('click', () => setTimeout(closeSheet, 300));
    $('#cal-i', el).onclick = () => { deliverFile(new File([buildICS([taskEvent(m, t, $('#cal-d', el).value || d0)])], slug(t.task).slice(0, 40) + '.ics', { type: 'text/calendar' }), t.task); closeSheet(); };
  });
}

/* =========================================================
   Audio clips (cut on the phone, nothing is uploaded)
   ========================================================= */
function wavBytes(samples, sr) {
  const n = samples.length; const buf = new ArrayBuffer(44 + n * 2); const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0, o = 44; i < n; i++, o += 2) { const x = Math.max(-1, Math.min(1, samples[i])); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7FFF, true); }
  return buf;
}
async function decodeClip(blob, off, dur) {
  const SR = 22050; const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC) throw new Error('sin OfflineAudioContext');
  const ctx = new OAC(1, SR, SR); const ab = await blob.arrayBuffer();
  const buf = await new Promise((res, rej) => { try { const pr = ctx.decodeAudioData(ab, res, rej); if (pr && pr.then) pr.then(res, rej); } catch (e) { rej(e); } });
  const sr = buf.sampleRate; const a = Math.max(0, Math.floor(off * sr)), b = Math.min(buf.length, Math.floor((off + dur) * sr));
  if (b - a < sr * .5) throw new Error('El audio de ese tramo está vacío');
  const ch = buf.numberOfChannels; const out = new Float32Array(b - a);
  for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let k = a; k < b; k++) out[k - a] += d[k] / ch; }
  const fade = Math.min(out.length / 2, Math.floor(sr * .04)); for (let i = 0; i < fade; i++) { out[i] *= i / fade; out[out.length - 1 - i] *= i / fade; }
  return new Blob([wavBytes(out, sr)], { type: 'audio/wav' });
}
async function liveClip(blob, off, dur, onStatus) {
  const url = URL.createObjectURL(blob); const el = new Audio(); el.preload = 'auto'; el.src = url;
  const AC = window.AudioContext || window.webkitAudioContext; const ctx = new AC();
  try {
    const src = ctx.createMediaElementSource(el); const dest = ctx.createMediaStreamDestination(); src.connect(dest);
    await new Promise((res, rej) => { el.onloadedmetadata = res; el.onerror = () => rej(new Error('No se pudo leer el audio')); setTimeout(res, 5000); });
    el.currentTime = off; await new Promise(r => { el.onseeked = r; setTimeout(r, 5000); });
    const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
    const rec = new MediaRecorder(dest.stream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined); const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise(r => { rec.onstop = r; });
    await ctx.resume(); await el.play(); rec.start(500); const t0 = performance.now();
    await new Promise(r => { const iv = setInterval(() => { const e = (performance.now() - t0) / 1000; onStatus && onStatus(`Preparando el clip… ${Math.min(dur, e).toFixed(0)} de ${Math.round(dur)} s`); if (e >= dur || el.ended) { clearInterval(iv); r(); } }, 250); });
    rec.stop(); el.pause(); await done;
    return new Blob(chunks, { type: (rec.mimeType || mime || 'audio/webm').split(';')[0] });
  } finally { try { ctx.close(); } catch {} URL.revokeObjectURL(url); }
}
async function cutAudio(m, start, end, onStatus) {
  const parts = m.audioParts || []; if (!parts.length) throw new Error('Esta reunión no tiene audio guardado');
  let i = 0; parts.forEach((p, k) => { if (p.offset <= start + .01) i = k; });
  const p = parts[i]; const pEnd = parts[i + 1] ? parts[i + 1].offset : (m.durationSec || end); end = Math.min(end, pEnd);
  const blob = await DB.get('audio', p.key); if (!blob) throw new Error('No encuentro el audio en este dispositivo');
  const off = start - (p.offset || 0), dur = Math.max(1, end - start);
  if (pEnd - p.offset <= 1800) { try { onStatus && onStatus('Cortando el audio…'); return await decodeClip(blob, off, dur); } catch (e) { console.warn('decode clip', e); } }
  return liveClip(blob, off, dur, onStatus);
}
function clipSheet(m, start, end) {
  const total = m.durationSec || end; let s0 = Math.max(0, Math.round(start)), e0 = Math.min(total, Math.round(end)); if (e0 - s0 < 3) e0 = Math.min(total, s0 + 10);
  let prev = null;
  sheet(`<div class="eyebrow">Clip de audio</div><h3>Comparte el momento exacto</h3><p class="muted">Se corta aquí en el teléfono y lo mandas por WhatsApp, correo o donde quieras.</p>
    <div class="clip-range">
      <div><span>Desde</span><b class="mono" id="c-s"></b><div class="nudge"><button data-cs="-5">−5 s</button><button data-cs="5">+5 s</button></div></div>
      <div><span>Hasta</span><b class="mono" id="c-e"></b><div class="nudge"><button data-ce="-5">−5 s</button><button data-ce="5">+5 s</button><button data-ce="15">+15 s</button></div></div>
    </div>
    <p class="hint" id="c-len"></p>
    <div class="sheet-actions"><button class="btn" id="c-play">${icon('play', 2)}Escuchar</button><button class="btn primary" id="c-share">${icon('share', 2)}Compartir clip</button></div>
    <p class="hint" id="c-st"></p>`, el => {
    const upd = () => { $('#c-s', el).textContent = fmtT(s0); $('#c-e', el).textContent = fmtT(e0); $('#c-len', el).textContent = `Duración ${e0 - s0} s · máximo 2 minutos`; };
    upd();
    $$('[data-cs]', el).forEach(b => b.onclick = () => { s0 = Math.max(0, Math.min(e0 - 2, s0 + +b.dataset.cs)); if (e0 - s0 > 120) e0 = s0 + 120; upd(); });
    $$('[data-ce]', el).forEach(b => b.onclick = () => { e0 = Math.min(total, Math.max(s0 + 2, e0 + +b.dataset.ce)); if (e0 - s0 > 120) s0 = e0 - 120; upd(); });
    $('#c-play', el).onclick = async () => {
      if (prev && !prev.paused) { prev.pause(); return; }
      const parts = m.audioParts; let i = 0; parts.forEach((p, k) => { if (p.offset <= s0 + .01) i = k; });
      const u = await Player.url(parts[i].key); prev = new Audio(u); const off = s0 - parts[i].offset;
      prev.addEventListener('loadedmetadata', () => { prev.currentTime = off; prev.play().catch(() => {}); }, { once: true });
      prev.addEventListener('timeupdate', () => { if (prev.currentTime >= off + (e0 - s0)) prev.pause(); });
    };
    $('#c-share', el).onclick = async () => {
      const btn = $('#c-share', el); btn.disabled = true; const st = $('#c-st', el);
      try {
        const blob = await cutAudio(m, s0, e0, t => { st.textContent = t; });
        const ext = blob.type.includes('wav') ? 'wav' : extFor(blob.type);
        const file = new File([blob], `clip-${slug(m.analysis?.title || 'reunion').slice(0, 30)}-${fmtT(s0).replace(/:/g, 'm')}.${ext}`, { type: blob.type });
        st.textContent = `Clip listo · ${fmtBytes(file.size)}`;
        deliverFile(file, 'Clip ' + fmtT(s0) + '–' + fmtT(e0));
      } catch (e) { st.textContent = 'No se pudo crear el clip: ' + (e.message || 'error'); }
      finally { btn.disabled = false; }
    };
  });
  $('.sheet-bg')?.addEventListener('closing', () => { try { prev?.pause(); } catch {} });
}

/* =========================================================
   Photo viewer and project editor
   ========================================================= */
async function photoSheet(m, key) {
  const p = (m.photos || []).find(x => x.key === key); if (!p) return;
  const u = await photoURL(key);
  sheet(`<img class="ph-big" src="${u}" alt="Foto de la reunión"><div class="sheet-actions">${p.t != null && m.analysis ? `<button class="btn sm" id="ph-go">${icon('time')}Ir al minuto ${fmtT(p.t)}</button>` : ''}<button class="btn sm" id="ph-share">${icon('share')}Compartir</button><button class="btn sm ghost danger" id="ph-del">${icon('trash')}Eliminar</button></div>`, el => {
    const g = $('#ph-go', el); if (g) g.onclick = () => { closeSheet(); S.jump = p.t; go('m/' + m.id + '/transcripcion'); };
    $('#ph-share', el).onclick = async () => { const b = await DB.get('photos', key); deliverFile(new File([b], `foto-${slug(m.analysis?.title)}-${p.t != null ? fmtT(p.t).replace(/:/g, 'm') : 'extra'}.jpg`, { type: 'image/jpeg' }), 'Foto'); };
    $('#ph-del', el).onclick = async () => { m.photos = m.photos.filter(x => x.key !== key); await DB.del('photos', key); await saveMeeting(m); closeSheet(); render(); toast('Foto eliminada'); };
  }, 'photo');
}
function editProject(m) {
  const list = projectsList();
  sheet(`<div class="eyebrow">Proyecto o cliente</div><h3>¿A qué proyecto pertenece esta reunión?</h3><p class="muted">Las reuniones del mismo proyecto se conectan: Acta revisa qué tareas anteriores se cumplieron y te muestra el historial completo.</p>
    <div class="field" style="margin-top:12px"><input id="pj-in" list="pj-list" value="${esc(m.project || '')}" placeholder="Ej.: Peluquería Camila" autocomplete="off"><datalist id="pj-list">${list.map(p => `<option value="${esc(p)}">`).join('')}</datalist></div>
    ${list.length ? `<div class="pj-chips">${list.map(p => `<button class="chip" data-pj="${esc(p)}">${icon('folder', 2)}${esc(p)}</button>`).join('')}</div>` : ''}
    <div class="sheet-actions"><button class="btn primary" id="pj-save">Guardar</button>${m.project ? '<button class="btn ghost" id="pj-clear">Quitar del proyecto</button>' : ''}</div>`, el => {
    $$('[data-pj]', el).forEach(b => b.onclick = () => { $('#pj-in', el).value = b.dataset.pj; });
    const save = async v => { const before = m.project || ''; m.project = v.trim(); await saveMeeting(m); closeSheet(); render(); if (m.project && m.project !== before && m.analysis) { const prev = projectMeetings(m.project, m.id).filter(x => x.analysis && (x.date || '') <= (m.date || '')).length; toast(prev ? 'Guardado. Toca Re-analizar para conectar las tareas de reuniones anteriores.' : 'Proyecto guardado', 5000); } else toast(m.project ? 'Proyecto guardado' : 'Reunión sin proyecto'); };
    $('#pj-save', el).onclick = () => save($('#pj-in', el).value);
    const c = $('#pj-clear', el); if (c) c.onclick = () => save('');
    $('#pj-in', el).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(e.target.value); } });
  });
}

/* =========================================================
   Global search (titles, acta, notes and every transcript, all on the phone)
   ========================================================= */
async function buildTxIndex() {
  S.txBuilding = true;
  try { const idx = {}; for (const m of S.meetings) { const t = await DB.get('transcripts', m.id); idx[m.id] = (t && t.segments) || []; } S.txIndex = idx; }
  finally { S.txBuilding = false; }
}
function snippet(text, fq, q) {
  const f = fold(text); const i = f.indexOf(fq); if (i < 0) return esc(text.slice(0, 120));
  const a = Math.max(0, i - 50), b = Math.min(text.length, i + fq.length + 70);
  return (a ? '…' : '') + esc(text.slice(a, i)) + '<mark>' + esc(text.slice(i, i + fq.length)) + '</mark>' + esc(text.slice(i + fq.length, b)) + (b < text.length ? '…' : '');
}
function searchHitsHTML(q) {
  const fq = fold(q); if (fq.length < 2) return '';
  const hits = [];
  for (const m of S.meetings) {
    const a = m.analysis || {}; const title = a.title || m.titleHint || 'Reunión';
    const push = (kind, text, tab, t) => { if (text && fold(text).includes(fq)) hits.push({ m, title, kind, text: String(text), tab, t: t ?? '' }); };
    (a.decisions || []).forEach(d => push('Decisión', d.text, 'resumen'));
    (a.actions || []).forEach(x => push('Tarea', `${x.task} — ${x.owner}`, 'resumen'));
    (a.keyPoints || []).forEach(k => push('Punto clave', `${k.title}: ${k.detail}`, 'resumen'));
    (a.ideas || []).forEach(d => push('Idea', d.text, 'resumen'));
    (a.questions || []).forEach(d => push('Pregunta', d.text, 'resumen'));
    (a.ficha || []).forEach(d => push('Ficha', `${d.label}: ${d.value}`, 'resumen'));
    (m.notesLog || []).forEach(n => push('Tu nota', n.text, 'transcripcion', n.t));
    if (m.notes) push('Tu nota', m.notes, 'resumen');
    const segs = S.txIndex?.[m.id] || [];
    segs.forEach(x => { if (fold(x.text).includes(fq)) hits.push({ m, title, kind: x.s ? spkName(m, x.s) : 'Transcripción', text: x.text, tab: 'transcripcion', t: x.t, tx: true }); });
  }
  const shown = hits.slice(0, 60);
  return `<section class="sec hits"><div class="sec-title"><h2>Dentro de tus reuniones</h2><span class="muted" style="font-size:12.5px">${!S.txIndex ? 'Buscando en las transcripciones…' : `${hits.length} ${hits.length === 1 ? 'coincidencia' : 'coincidencias'}${hits.length > 60 ? ' · se muestran 60' : ''}`}</span></div>
    ${shown.length ? `<div class="hitlist">${shown.map(h => `<button class="hit" data-hit="${esc(h.m.id)}|${h.tab}|${h.t}"><span class="hk ${h.tx ? 'tx' : ''}">${esc(h.kind)}</span><span class="ht">${snippet(h.text, fq, q)}</span><span class="hm">${esc(h.title)} · ${esc(fmtDate(h.m.date))}${h.t !== '' ? ` · <b class="mono">${fmtT(h.t)}</b>` : ''}</span></button>`).join('')}</div>` : S.txIndex ? `<div class="empty-li" style="padding:6px 0 4px">Nadie dijo “${esc(q)}” en tus reuniones.</div>` : ''}
  </section>`;
}

/* =========================================================
   Weekly summary (computed on the phone, no AI)
   ========================================================= */
function weekRange(off = 0) { const d = new Date(); d.setHours(12, 0, 0, 0); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow + off * 7); const e = new Date(d); e.setDate(e.getDate() + 6); return { start: isoD(d), end: isoD(e), s: d, e }; }
function weekData(off = 0) {
  const r = weekRange(off);
  const ms = S.meetings.filter(m => m.date >= r.start && m.date <= r.end).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const ready = ms.filter(m => m.analysis);
  const acts = ready.flatMap(m => (m.analysis.actions || []).map(t => ({ m, t })));
  const decisions = ready.flatMap(m => (m.analysis.decisions || []).map(d => ({ m, d })));
  const secs = ms.reduce((a, m) => a + (m.durationSec || 0), 0);
  const perDay = [0, 0, 0, 0, 0, 0, 0]; ms.forEach(m => { const k = (new Date(m.date + 'T12:00:00').getDay() + 6) % 7; perDay[k] += (m.durationSec || 0) / 60; });
  const people = new Map(); ready.forEach(m => ((m.analysis.participants?.length ? m.analysis.participants : m.participants) || []).forEach(p => { if (!/^(t[uú]|yo)$/i.test(p.trim())) people.set(p, (people.get(p) || 0) + 1); }));
  const due = S.meetings.filter(m => m.analysis).flatMap(m => (m.analysis.actions || []).map((t, i) => ({ m, t, i, d: taskDate(t, m) }))).filter(x => !x.t.done && x.d && x.d <= r.end).sort((a, b) => a.d.localeCompare(b.d));
  const projects = [...new Set(ms.map(m => m.project).filter(Boolean))];
  return { r, ms, ready, acts, decisions, secs, perDay, people: [...people.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6), due, projects };
}
function weekLabel(r) { const f = d => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }); return `${f(r.s)} – ${f(r.e)}`; }
function weekCardHTML() {
  const w = weekData(0); const pend = w.acts.filter(x => !x.t.done).length;
  return `<button class="weekcard rise" data-nav="week"><span class="wk-ic">${icon('week', 2)}</span><span class="wk-tx"><b>Tu semana</b><span>${w.ms.length} ${w.ms.length === 1 ? 'reunión' : 'reuniones'} · ${w.decisions.length} ${w.decisions.length === 1 ? 'decisión' : 'decisiones'} · ${pend} ${pend === 1 ? 'tarea abierta' : 'tareas abiertas'}${w.due.length ? ` · <em>${w.due.length} con plazo vencido o esta semana</em>` : ''}</span></span><span class="wk-go">Ver resumen ${icon('back', 2)}</span></button>`;
}
function weekText(w) {
  const L = [`Resumen de mi semana (${weekLabel(w.r)})`, `${w.ms.length} reuniones · ${(w.secs / 3600).toFixed(1).replace('.', ',')} h · ${w.decisions.length} decisiones · ${w.acts.length} tareas nuevas (${w.acts.filter(x => x.t.done).length} hechas)`, ''];
  if (w.decisions.length) { L.push('Decisiones:'); w.decisions.forEach(x => L.push(`- ${x.d.text} (${x.m.analysis.title})`)); L.push(''); }
  if (w.due.length) { L.push('Tareas con plazo:'); w.due.forEach(x => L.push(`- ${shortDate(x.d)}: ${x.t.task} — ${x.t.owner}`)); L.push(''); }
  const open = w.acts.filter(x => !x.t.done); if (open.length) { L.push('Pendientes de la semana:'); open.forEach(x => L.push(`- ${x.t.task} — ${x.t.owner}`)); }
  return L.join('\n').trim();
}
function renderWeek(app) {
  const w = weekData(S.weekOff); const max = Math.max(...w.perDay, 1); const days = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const done = w.acts.filter(x => x.t.done).length; const today0 = today();
  app.innerHTML = `
  <div class="page-head"><div><div class="eyebrow">Resumen semanal</div><h1>${S.weekOff === 0 ? 'Tu semana' : S.weekOff === -1 ? 'La semana pasada' : 'Semana del ' + esc(weekLabel(w.r))}</h1><p>${esc(weekLabel(w.r))} · se calcula en tu teléfono con tus actas, sin costo.</p></div>
    <div class="seg-ctl"><button id="wk-prev" aria-label="Semana anterior">‹ Anterior</button><button id="wk-next" ${S.weekOff >= 0 ? 'disabled' : ''} aria-label="Semana siguiente">Siguiente ›</button></div></div>
  <div class="tools-row"><button class="btn sm primary" id="wk-share">${icon('share')}Compartir</button><button class="btn sm" id="wk-copy">${icon('copy')}Copiar texto</button><button class="btn sm" id="wk-img">${icon('image', 2)}Guardar imagen</button>${w.due.length ? `<button class="btn sm" id="wk-ics">${icon('cal')}Plazos al calendario</button>` : ''}</div>
  <section class="weekboard" id="weekboard">
    <div class="wb-head"><div><div class="eyebrow">Acta · resumen semanal</div><h2>${esc(weekLabel(w.r))}</h2></div><span class="brand-mark sm"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/></svg></span></div>
    <div class="stats s4">
      <div class="stat"><span class="si" style="background:var(--accent-soft);color:var(--ember)">${icon('mic', 2)}</span><b>${w.ms.length}</b><span>Reuniones</span></div>
      <div class="stat"><span class="si" style="background:var(--q-soft);color:var(--q)">${icon('time', 2)}</span><b>${w.secs < 3600 ? Math.round(w.secs / 60) : (w.secs / 3600).toFixed(1).replace('.', ',')}<small style="font-size:15px;color:var(--muted)"> ${w.secs < 3600 ? 'min' : 'h'}</small></b><span>Conversadas</span></div>
      <div class="stat"><span class="si" style="background:var(--dec-soft);color:var(--dec)">${icon('flag', 2)}</span><b>${w.decisions.length}</b><span>Decisiones</span></div>
      <div class="stat"><span class="si" style="background:var(--act-soft);color:var(--act)">${icon('check', 2.4)}</span><b>${done}<span style="font-size:17px;color:var(--muted)">/${w.acts.length}</span></b><span>Tareas hechas</span></div>
    </div>
    <div class="wb-grid">
      <div class="panel wb-days"><div class="eyebrow">Minutos por día</div><div class="days">${w.perDay.map((v, i) => `<div class="day"><i style="height:${Math.max(3, v / max * 100)}%;${v ? '' : 'opacity:.25'}"></i><span>${days[i]}</span><em class="mono">${v ? Math.round(v) : ''}</em></div>`).join('')}</div></div>
      <div class="panel"><div class="eyebrow">Con quién te reuniste</div>${w.people.length ? `<div class="wb-people">${w.people.map(([n, c], i) => `<span><span class="av" style="background:${AV_COLORS[i % 6]}">${esc(initials(n))}</span>${esc(n)} <em>${c}</em></span>`).join('')}</div>` : '<p class="muted" style="font-size:13px;margin-top:10px">Sin participantes registrados.</p>'}
        ${w.projects.length ? `<div class="eyebrow" style="margin-top:16px">Proyectos</div><div class="pj-chips">${w.projects.map(p => `<button class="chip" data-proj="${esc(p)}">${icon('folder', 2)}${esc(p)}</button>`).join('')}</div>` : ''}</div>
    </div>
    ${w.due.length ? `<div class="sec"><div class="sec-h"><h2>Plazos vencidos o de esta semana</h2><span class="count">${w.due.length}</span></div><div class="box">${w.due.map(x => `<div class="li"><span class="mk" style="background:${x.d < today0 ? 'var(--risk)' : 'var(--idea)'}"></span><div>${esc(x.t.task)}<small>${esc(x.t.owner)} · <b class="${x.d < today0 ? 'late' : ''}">${x.d < today0 ? 'venció ' : ''}${esc(shortDate(x.d))}</b> · <button class="tlink" data-open="${esc(x.m.id)}">${esc(x.m.analysis.title)}</button></small></div></div>`).join('')}</div></div>` : ''}
    <div class="sec g2">
      ${box('Decisiones de la semana', 'var(--dec)', 'var(--dec-soft)', 'flag', w.decisions.map(x => `<div class="li"><span class="mk" style="background:var(--dec)"></span><div>${esc(x.d.text)}<small>${esc(x.m.analysis.title)} · ${esc(shortDate(x.m.date))}</small></div></div>`).join(''), w.decisions.length)}
      ${box('Tareas nuevas', 'var(--act)', 'var(--act-soft)', 'check', w.acts.map(x => `<div class="li"><span class="mk" style="background:${x.t.done ? 'var(--act)' : 'var(--faint)'}"></span><div style="${x.t.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(x.t.task)}<small>${esc(x.t.owner)}${x.t.due ? ' · ' + esc(x.t.due) : ''}</small></div></div>`).join(''), `${done}/${w.acts.length}`)}
    </div>
    <div class="sec"><div class="sec-h"><h2>Reuniones</h2></div>${w.ms.length ? `<div class="wb-meets">${w.ms.map(m => `<button class="wb-m" data-open="${esc(m.id)}"><span class="mono">${esc(shortDate(m.date))}</span><b>${esc(m.analysis?.title || m.titleHint || 'Reunión')}</b><span>${m.analysis ? esc(m.analysis.tldr) : esc(STATUS_TXT[m.status] || '')}</span></button>`).join('')}</div>` : `<div class="empty-li">No hubo reuniones esta semana.</div>`}</div>
  </section>`;
  $('#wk-prev').onclick = () => { S.weekOff--; render(); };
  $('#wk-next').onclick = () => { if (S.weekOff < 0) { S.weekOff++; render(); } };
  $('#wk-copy').onclick = () => copyText(weekText(w), 'Resumen copiado');
  $('#wk-share').onclick = () => shareText('Mi semana', weekText(w));
  $('#wk-img').onclick = async () => {
    const b = $('#wk-img'); b.disabled = true;
    try { const lib = await loadH2I(); const node = $('#weekboard'); const opts = { pixelRatio: 2, backgroundColor: '#07080D', width: Math.min(900, node.offsetWidth) };
      let blob; try { blob = await lib.toBlob(node, opts); } catch { blob = await lib.toBlob(node, { ...opts, skipFonts: true }); }
      deliverFile(new File([blob], `semana-${w.r.start}.png`, { type: 'image/png' }), 'Mi semana'); }
    catch (e) { toast('No se pudo crear la imagen', 4000); } finally { b.disabled = false; }
  };
  const ic = $('#wk-ics'); if (ic) ic.onclick = () => { const evs = w.due.map(x => taskEvent(x.m, x.t, x.d)); deliverFile(new File([buildICS(evs)], `plazos-${w.r.start}.ics`, { type: 'text/calendar' }), 'Plazos'); };
  $$('[data-open]', app).forEach(b => b.onclick = () => go('m/' + b.dataset.open));
  $$('[data-proj]', app).forEach(b => b.onclick = () => go('p/' + encodeURIComponent(b.dataset.proj)));
}

/* =========================================================
   Projects (meetings linked over time)
   ========================================================= */
function projectStats(name) {
  const ms = projectMeetings(name); const ready = ms.filter(m => m.analysis);
  const acts = ready.flatMap(m => (m.analysis.actions || []).map((t, i) => ({ m, t, i })));
  return { ms, ready, acts, open: acts.filter(x => !x.t.done), decisions: ready.flatMap(m => (m.analysis.decisions || []).map(d => ({ m, d }))), last: ms[ms.length - 1], secs: ms.reduce((a, m) => a + (m.durationSec || 0), 0) };
}
function projectsRowHTML() {
  const ps = projectsList(); if (!ps.length) return '';
  return `<div class="sec-title" style="margin-top:22px"><h2>Proyectos</h2><button class="btn sm ghost" data-nav="projects">Ver todos</button></div><div class="pj-row">${ps.slice(0, 12).map(p => { const st = projectStats(p); return `<button class="pj" data-proj="${esc(p)}"><span class="pj-ic">${icon('folder', 2)}</span><b>${esc(p)}</b><span>${st.ms.length} ${st.ms.length === 1 ? 'reunión' : 'reuniones'} · ${st.open.length} abiertas</span></button>`; }).join('')}</div>`;
}
function renderProjects(app) {
  const ps = projectsList();
  app.innerHTML = `<button class="btn ghost sm back" data-nav="library">${icon('back')}Inicio</button>
  <div class="page-head"><div><div class="eyebrow">Continuidad</div><h1>Proyectos</h1><p>Cada proyecto junta sus reuniones en orden. En la siguiente reunión, Acta revisa qué tareas se cumplieron.</p></div></div>
  ${ps.length ? `<div class="grid-lib">${ps.map(p => { const st = projectStats(p); return `<button class="mcard pjcard" data-proj="${esc(p)}"><div class="mc-band"><i style="flex:1;background:var(--g-cool)"></i></div><div class="mc-body"><div class="mcard-meta"><span class="mono">${st.last ? esc(fmtDate(st.last.date)) : ''}</span></div><h3>${icon('folder', 2, 18)} ${esc(p)}</h3><p class="tl">${st.ms.length} ${st.ms.length === 1 ? 'reunión' : 'reuniones'} · ${(st.secs / 3600).toFixed(1).replace('.', ',')} h · ${st.decisions.length} decisiones</p><div class="mc-foot"><span></span><div class="mc-kpis"><span style="color:var(--act)">${icon('check', 2.4)}<b>${st.acts.length - st.open.length}/${st.acts.length}</b></span></div></div></div></button>`; }).join('')}</div>`
    : `<div class="empty">${icon('folder', 1.6, 34)}<h3>Aún no hay proyectos</h3><p style="max-width:52ch">Al grabar, escribe el proyecto o cliente en “Detalles de la reunión”. También puedes asignarlo desde cualquier acta con <b>Asignar proyecto</b>.</p></div>`}`;
  $$('[data-proj]', app).forEach(b => b.onclick = () => go('p/' + encodeURIComponent(b.dataset.proj)));
}
function projectText(name, st) {
  const L = [`Estado del proyecto ${name} — ${fmtDate(today())}`, `${st.ms.length} reuniones · ${st.decisions.length} decisiones · ${st.open.length} tareas abiertas`, ''];
  if (st.last?.analysis) L.push(`Última reunión (${fmtDate(st.last.date)}): ${st.last.analysis.tldr}`, '');
  if (st.decisions.length) { L.push('Decisiones:'); st.decisions.forEach(x => L.push(`- ${x.d.text} (${shortDate(x.m.date)})`)); L.push(''); }
  if (st.open.length) { L.push('Tareas abiertas:'); st.open.forEach(x => L.push(`- ${x.t.task} — ${x.t.owner}${x.t.due ? ' · ' + x.t.due : ''}`)); }
  return L.join('\n').trim();
}
function renderProject(app, name) {
  const st = projectStats(name);
  if (!st.ms.length) { app.innerHTML = `<div class="empty"><h3>Proyecto sin reuniones</h3><p>Puede que se haya renombrado.</p><button class="btn" data-nav="projects">Ver proyectos</button></div>`; return; }
  const doneN = st.acts.length - st.open.length;
  app.innerHTML = `<button class="btn ghost sm back" data-nav="projects">${icon('back')}Proyectos</button>
  <section class="m-hero rise"><span class="aura a1"></span><span class="aura a2"></span><header class="m-head">
    <div class="m-meta"><span>${icon('folder')}Proyecto</span><span>${icon('cal')}Desde ${esc(fmtDate(st.ms[0].date))}</span></div>
    <h1>${esc(name)}</h1>
    <div class="m-actions"><button class="btn sm primary" id="pj-rec">${icon('mic', 2)}Grabar reunión de este proyecto</button><button class="btn sm" id="pj-prep">${icon('spark', 2)}Prepárame</button><button class="btn sm" id="pj-share">${icon('share')}Compartir estado</button>${st.open.length ? `<button class="btn sm" id="pj-ics">${icon('cal')}Tareas al calendario</button>` : ''}<button class="btn sm ghost" id="pj-ren">${icon('edit')}Renombrar</button></div>
  </header></section>
  <div class="stats s4">
    <div class="stat"><span class="si" style="background:var(--accent-soft);color:var(--ember)">${icon('mic', 2)}</span><b>${st.ms.length}</b><span>Reuniones</span></div>
    <div class="stat"><span class="si" style="background:var(--q-soft);color:var(--q)">${icon('time', 2)}</span><b>${st.secs < 3600 ? Math.round(st.secs / 60) : (st.secs / 3600).toFixed(1).replace('.', ',')}<small style="font-size:15px;color:var(--muted)"> ${st.secs < 3600 ? 'min' : 'h'}</small></b><span>Conversadas</span></div>
    <div class="stat"><span class="si" style="background:var(--dec-soft);color:var(--dec)">${icon('flag', 2)}</span><b>${st.decisions.length}</b><span>Decisiones</span></div>
    <div class="stat"><span class="si" style="background:var(--act-soft);color:var(--act)">${icon('check', 2.4)}</span><b>${doneN}<span style="font-size:17px;color:var(--muted)">/${st.acts.length}</span></b><span>Tareas hechas</span></div>
  </div>
  ${subjectStudyHTML(name)}
  <div class="sec"><div class="sec-h"><h2>Línea de tiempo</h2><span class="count">De la primera a la última reunión</span></div>
    <div class="pj-tl">${st.ms.map((m, k) => `<button class="pj-step" data-open="${esc(m.id)}"><span class="dot">${k + 1}</span><span class="mono">${esc(fmtDate(m.date))}</span><b>${esc(m.analysis?.title || m.titleHint || 'Reunión')}</b>${m.analysis?.continuity ? `<em>${esc(m.analysis.continuity)}</em>` : ''}<span class="muted">${m.analysis ? esc(m.analysis.tldr) : esc(STATUS_TXT[m.status] || '')}</span></button>`).join('')}</div></div>
  <div class="sec g2">
    <div class="box"><div class="box-h"><span class="ic" style="background:var(--act-soft);color:var(--act)">${icon('check', 2.2)}</span><h3>Tareas abiertas del proyecto</h3><span class="n">${st.open.length}</span></div>${st.open.length ? st.open.map(x => taskHTML(x.t, `${x.m.id}|${x.i}`, `<span>${esc(shortDate(x.m.date))}</span>`)).join('') : '<div class="empty-li">Todo al día.</div>'}</div>
    ${box('Decisiones en orden', 'var(--dec)', 'var(--dec-soft)', 'flag', st.decisions.map(x => `<div class="li"><span class="mk" style="background:var(--dec)"></span><div>${esc(x.d.text)}<small>${esc(shortDate(x.m.date))} · ${esc(x.m.analysis.title)}</small></div></div>`).join(''), st.decisions.length)}
  </div>`;
  $$('[data-open]', app).forEach(b => b.onclick = () => go('m/' + b.dataset.open));
  bindTasks(app);
  $('#pj-rec').onclick = () => { recMeta = { title: '', participants: '', template: st.last?.template || 'general', context: '', project: name }; go('record'); };
  $('#pj-share').onclick = () => shareText('Proyecto ' + name, projectText(name, st));
  $('#pj-prep').onclick = () => go('prep/j/' + encodeURIComponent(name));
  const sr = $('#subj-rep'); if (sr) sr.onclick = () => go('rep/j/' + encodeURIComponent(name));
  const ic = $('#pj-ics'); if (ic) ic.onclick = () => exportTasksICS(st.ready);
  $('#pj-ren').onclick = () => sheet(`<div class="eyebrow">Renombrar proyecto</div><h3>${esc(name)}</h3><div class="field" style="margin-top:12px"><input id="rn-in" value="${esc(name)}"></div><div class="sheet-actions"><button class="btn primary" id="rn-ok">Guardar</button></div>`, el => {
    $('#rn-ok', el).onclick = async () => { const v = $('#rn-in', el).value.trim(); if (!v) return; for (const m of st.ms) { m.project = v; await saveMeeting(m); } closeSheet(); go('p/' + encodeURIComponent(v)); toast('Proyecto renombrado'); };
  });
}

/* =========================================================
   Word export: a real .docx built on the phone (tiny zip writer)
   ========================================================= */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipStore(files) {
  const enc = new TextEncoder(); const chunks = []; const central = []; let off = 0;
  const d = new Date(); const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1); const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const [name, data] of files) {
    const nb = enc.encode(name); const body = typeof data === 'string' ? enc.encode(data) : data; const crc = crc32(body);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true); h.setUint32(18, body.length, true); h.setUint32(22, body.length, true); h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
    chunks.push(new Uint8Array(h.buffer), nb, body);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, body.length, true); c.setUint32(24, body.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nb); off += 30 + nb.length + body.length;
  }
  const csize = central.reduce((a, x) => a + x.length, 0);
  const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...chunks, ...central, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
async function meetingDocx(m) {
  const a = m.analysis || {}; const segs = await getSegments(m.id);
  const x = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const run = (t, o = {}) => `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.c ? `<w:color w:val="${o.c}"/>` : ''}${o.sz ? `<w:sz w:val="${o.sz}"/>` : ''}</w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r>`;
  const rich = t => String(t).replace(/^\s*>\s?/, '').replace(/\^\(([^)]{1,14})\)/g, '^$1').split(/(\*\*[^*]+\*\*|(?<![*\w])\*(?![\s*])[^*\n]+?\*(?![*\w]))/).map(s => /^\*\*.+\*\*$/.test(s) ? run(s.slice(2, -2), { b: true }) : /^\*[^*].*\*$/.test(s) ? run(s.slice(1, -1), { i: true }) : run(s)).join('');
  const P = (content, style, extra = '') => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr>${content}</w:p>`;
  const para = (t, style) => P(rich(t), style);
  const bullet = (t, sub) => P(run('•  ', { c: 'E2553A' }) + rich(t) + (sub ? run('  — ' + sub, { c: '6B7280' }) : ''), 'Lista');
  const H1 = t => para(t, 'Heading1'), H2 = t => para(t, 'Heading2');
  const cell = (t, o = {}) => `<w:tc><w:tcPr>${o.w ? `<w:tcW w:w="${o.w}" w:type="dxa"/>` : ''}${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}</w:tcPr><w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr>${run(t, { b: o.b, c: o.c, sz: 20 })}</w:p></w:tc>`;
  const table = (head, rows, widths) => `<w:tbl><w:tblPr><w:tblStyle w:val="Tabla"/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D9DCE3"/><w:bottom w:val="single" w:sz="4" w:color="D9DCE3"/><w:insideH w:val="single" w:sz="4" w:color="E6E8EE"/></w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>
    <w:tr><w:trPr><w:tblHeader/></w:trPr>${head.map((h, i) => cell(h, { b: true, fill: 'F3F4F7', w: widths[i] })).join('')}</w:tr>${rows.map(r => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c, i) => cell(c, { w: widths[i] })).join('')}</w:tr>`).join('')}</w:tbl>${P('', '')}`;
  const people = (a.participants?.length ? a.participants : m.participants) || [];
  const B = [];
  if (Settings.v.brandName || m.seal) B.push(P(run([Settings.v.brandName, m.seal ? 'ACTA ' + folioTxt(m.seal.folio) : ''].filter(Boolean).join('   ·   '), { b: true, c: (Settings.v.brandColor || '#FF6A3D').replace('#', '').toUpperCase(), sz: 18 }), ''));
  B.push(para(a.title || 'Acta de reunión', 'Title'));
  B.push(P(run([fmtDate(m.date), m.durationSec ? 'Duración ' + fmtT(m.durationSec) : '', people.length ? people.join(', ') : '', m.project ? 'Proyecto: ' + m.project : ''].filter(Boolean).join('   ·   '), { c: '6B7280' }), ''));
  B.push(H1('Resumen'), para(a.tldr || ''));
  if (a.continuity) B.push(H2('Desde la reunión anterior'), para(a.continuity));
  if (a.ficha?.length) { B.push(H1('Ficha')); B.push(table(['Campo', 'Detalle'], a.ficha.map(f => [f.label, f.value]), [2800, 6200])); }
  if (a.keyPoints?.length) { B.push(H1('Puntos clave')); a.keyPoints.forEach(k => B.push(bullet(`**${k.title}:** ${k.detail}`))); }
  if (a.decisions?.length) { B.push(H1('Decisiones')); a.decisions.forEach(d => B.push(bullet(d.text, d.why))); }
  if (a.actions?.length) { B.push(H1('Tareas')); B.push(table(['Tarea', 'Responsable', 'Plazo', 'Prioridad', 'Estado'], a.actions.map(t => [t.task, t.owner, t.due || (taskDate(t, m) ? shortDate(taskDate(t, m)) : '—'), t.priority, t.done ? 'Hecha' : 'Pendiente']), [3900, 1700, 1400, 1000, 1000])); }
  if (a.topics?.length) { B.push(H1('Temas tratados')); a.topics.forEach(t => B.push(bullet(`**${t.name}** (${fmtT(t.start)})`, t.summary))); }
  if (a.ideas?.length) { B.push(H1('Ideas')); a.ideas.forEach(d => B.push(bullet(d.text, d.note))); }
  if (a.risks?.length) { B.push(H1('Riesgos')); a.risks.forEach(d => B.push(bullet(d.text, 'severidad ' + d.severity))); }
  if (a.questions?.length) { B.push(H1('Preguntas abiertas')); a.questions.forEach(d => B.push(bullet(d.text))); }
  if (a.numbers?.length) { B.push(H1('Cifras mencionadas')); a.numbers.forEach(n => B.push(bullet(`**${n.value}** ${n.label}`))); }
  if (a.quotes?.length) { B.push(H1('Frases para recordar')); a.quotes.forEach(q => B.push(P(run('“' + q.text + '”', { i: true }) + run('  — ' + q.who, { c: '6B7280' }), 'Lista'))); }
  if (a.nextSteps?.length) { B.push(H1('Próximos pasos')); a.nextSteps.forEach((s2, i) => B.push(P(run(`${i + 1}.  `, { b: true, c: 'E2553A' }) + rich(s2), 'Lista'))); }
  if (a.extended) {
    const x = a.extended; B.push(P('', '', '<w:pageBreakBefore/>'), para('Informe extendido', 'Title'));
    B.push(H1('Resumen ejecutivo')); String(x.executive || '').split('\n').filter(l => l.trim()).forEach(l => B.push(para(l.replace(/^[-*]\s+/, '• '))));
    if (x.context) { B.push(H2('Contexto y objetivo')); B.push(para(x.context)); }
    (x.topics || []).forEach((t, i) => { B.push(H1(`${i + 1}. ${t.name} (${fmtT(t.start || 0)}–${fmtT(t.end || 0)})`)); String(t.summary || '').split('\n').filter(l => l.trim()).forEach(l => B.push(para(l))); (t.points || []).forEach(pt => B.push(bullet(pt))); (t.voices || []).forEach(v => B.push(bullet(`**${v.who}:** ${v.said}`))); });
    if (x.decisions?.length) { B.push(H1('Registro de decisiones')); B.push(table(['Decisión', 'Contexto', 'Propuso'], x.decisions.map(d => [d.text, d.context || '', d.proposedBy || '']), [3200, 4200, 1600])); }
    if (x.actions?.length) { B.push(H1('Plan de acción detallado')); B.push(table(['Tarea', 'Responsable', 'Plazo', 'Detalle'], x.actions.map(t => [t.task, t.owner || '', t.due || '', t.detail || '']), [2800, 1500, 1200, 3500])); }
    if (x.risks?.length) { B.push(H1('Riesgos y mitigación')); B.push(table(['Riesgo', 'Impacto', 'Mitigación'], x.risks.map(r => [r.text, r.impact || '', r.mitigation || '']), [3000, 2400, 3600])); }
    if (x.positions?.length) { B.push(H1('Postura de cada participante')); x.positions.forEach(p => B.push(bullet(`**${p.person}:** ${p.stance}`))); }
    if (x.pending?.length) { B.push(H1('Temas pendientes')); x.pending.forEach(p => B.push(bullet(p.text, p.suggestion ? 'sugerencia: ' + p.suggestion : ''))); }
    if (x.chronology?.length) { B.push(H1('Minuta cronológica')); x.chronology.forEach(c => B.push(P(run(fmtT(c.t || 0) + '   ', { c: '9AA0AE', sz: 18 }) + run(c.text), 'Lista'))); }
    if (x.conclusions) { B.push(H1('Conclusiones')); B.push(para(x.conclusions)); }
  }
  if (a.study) {
    const st = a.study;
    if (st.exam?.length) { B.push(H1('Entra en la prueba')); st.exam.forEach(x => B.push(bullet(x.text))); }
    if (st.notes) { B.push(H1('Apuntes')); st.notes.split('\n').forEach(l => { const h = l.match(/^(#{1,3})\s+(.*)$/); const li = l.match(/^\s*[-*]\s+(.*)$/); if (h) B.push(para(h[2], 'Heading2')); else if (li) B.push(bullet(li[1])); else if (l.trim()) B.push(para(l)); }); }
    if (st.glossary?.length) { B.push(H1('Glosario')); B.push(table(['Concepto', 'Definición'], st.glossary.map(g => [g.term, g.def]), [2800, 6200])); }
    if (st.flashcards?.length) { B.push(H1('Tarjetas de repaso')); B.push(table(['Pregunta', 'Respuesta'], st.flashcards.map(c => [c.q, c.a]), [4500, 4500])); }
    if (st.quiz?.length) { B.push(H1('Prueba de práctica')); st.quiz.forEach((q, i) => { B.push(P(rich(`**${i + 1}. ${q.q}**`), '', '<w:keepNext/>')); q.options.forEach((o, k) => B.push(P(run(`${'ABCD'[k]})  ${o}`), 'Lista', k < q.options.length - 1 ? '<w:keepNext/>' : ''))); }); B.push(H2('Respuestas')); st.quiz.forEach((q, i) => B.push(bullet(`${i + 1}: ${'ABCD'[q.answer]}${q.why ? ' — ' + q.why : ''}`))); }
  }
  const f = a.followUp; if (f?.emailBody) { B.push(H1('Mensaje de seguimiento')); B.push(para('Asunto: ' + f.emailSubject)); f.emailBody.split('\n').forEach(l => { const li = l.match(/^\s*[-*•]\s+(.*)$/); if (li) B.push(bullet(li[1])); else if (l.trim()) B.push(para(l)); }); }
  if (a.brief) { B.push(P('', '', '<w:pageBreakBefore/>')); a.brief.split('\n').forEach(l => { const h = l.match(/^(#{1,3})\s+(.*)$/); const li = l.match(/^\s*[-*]\s+(.*)$/); if (h) B.push(para(h[2], h[1].length === 1 ? 'Heading1' : 'Heading2')); else if (li) B.push(bullet(li[1])); else if (l.trim()) B.push(para(l)); }); }
  if (segs.length) { B.push(P('', '', '<w:pageBreakBefore/>'), H1('Transcripción')); segs.forEach(sg => B.push(P(run(fmtT(sg.t), { c: '9AA0AE', sz: 18 }) + '<w:r><w:tab/></w:r>' + (sg.s ? run(spkName(m, sg.s) + ': ', { b: true }) : '') + run(sg.text), 'Transcripcion'))); }
  if (m.seal) {
    B.push(H1('Firmas'));
    const sn = [...new Set(people.filter(Boolean))].slice(0, 8);
    if (sn.length) B.push(table(['Nombre', 'Firma'], sn.map(n => [isMe(n) && Settings.v.myName ? Settings.v.myName : n, '\n\n']), [3600, 5400]));
    B.push(P(run(`Acta ${folioTxt(m.seal.folio)} · sello de integridad ${sealCode(m.seal.hash)} · sellada el ${new Date(m.seal.at).toLocaleString('es-CL')}`, { b: true, sz: 18 }), ''));
    B.push(P(run('SHA-256: ' + m.seal.hash, { c: '6B7280', sz: 16 }), ''));
  }
  B.push(P(run((Settings.v.brandName ? Settings.v.brandName + ' · ' : '') + 'Documento generado con Acta · reunión del ' + fmtDate(m.date), { c: '9AA0AE', sz: 16 }), ''));
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${B.join('')}<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="es-CL"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="288" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:color w:val="1F2430"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="48"/><w:color w:val="12141B"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="100"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="FF7A45"/></w:pBdr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="12141B"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="25"/><w:color w:val="7C5CFF"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Lista"><w:name w:val="Lista Acta"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/><w:ind w:left="360" w:hanging="260"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Transcripcion"><w:name w:val="Transcripción"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/><w:tabs><w:tab w:val="left" w:pos="900"/></w:tabs><w:ind w:left="900" w:hanging="900"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="Tabla"><w:name w:val="Tabla Acta"/><w:tblPr><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(a.title || 'Acta')}</dc:title><dc:creator>Acta</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+/, '')}</dcterms:created></cp:coreProperties>`],
    ['word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>'],
    ['word/document.xml', doc], ['word/styles.xml', styles],
    ['word/footer1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="E1E3EA"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="9972"/></w:tabs><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:color w:val="8A90A0"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">${x((a.title || 'Acta').slice(0, 90))}</w:t></w:r><w:r><w:rPr><w:color w:val="8A90A0"/><w:sz w:val="16"/></w:rPr><w:tab/><w:t xml:space="preserve">Página </w:t></w:r><w:r><w:rPr><w:color w:val="8A90A0"/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:color w:val="8A90A0"/><w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:color w:val="8A90A0"/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:color w:val="8A90A0"/><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:color w:val="8A90A0"/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r><w:r><w:rPr><w:color w:val="8A90A0"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve"> de </w:t></w:r><w:r><w:rPr><w:color w:val="8A90A0"/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:color w:val="8A90A0"/><w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r><w:rPr><w:color w:val="8A90A0"/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:color w:val="8A90A0"/><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:color w:val="8A90A0"/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`]
  ];
  return new File([zipStore(files)], slug(a.title) + '.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* =========================================================
   App lock: Face ID / huella (WebAuthn on this device) with a PIN as backup
   ========================================================= */
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const Lock = {
  locked: false, hiddenAt: 0, after: null, pin: '',
  enabled() { return !!(Settings.v.lockOn && Settings.v.lockPin); },
  async bioAvailable() { try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch { return false; } },
  async hash(pin, salt) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin)); return b64u(d); },
  async register() {
    const cred = await navigator.credentials.create({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: 'Acta', id: location.hostname }, user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'Acta en este teléfono', displayName: 'Acta' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000, attestation: 'none' } });
    return b64u(cred.rawId);
  },
  async bio() {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const a = await navigator.credentials.get({ publicKey: { challenge, rpId: location.hostname, allowCredentials: [{ type: 'public-key', id: unb64u(Settings.v.lockCred), transports: ['internal'] }], userVerification: 'required', timeout: 60000 } });
    const cd = JSON.parse(new TextDecoder().decode(a.response.clientDataJSON)); const flags = new Uint8Array(a.response.authenticatorData)[32];
    return cd.type === 'webauthn.get' && cd.challenge === b64u(challenge) && !!(flags & 4);
  },
  show(after) {
    if (after) this.after = after; this.locked = true; this.pin = '';
    const el = $('#lock'); const bio = !!Settings.v.lockCred;
    el.innerHTML = `<div class="lock-in"><span class="brand-mark lg"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/></svg></span><h2>${after ? 'Confirma que eres tú' : 'Acta está bloqueada'}</h2><p>${bio ? 'Usa Face ID o tu huella, o escribe tu PIN.' : 'Escribe tu PIN.'}</p>
      ${bio ? `<button class="btn primary lg" id="lk-bio">${icon('face', 2)}Desbloquear</button>` : ''}
      <div class="pin-dots" id="lk-dots">${'<i></i>'.repeat(4)}</div><p class="lk-err" id="lk-err"></p>
      <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button data-k="${k}">${k}</button>`).join('')}</div>${after ? '<button class="btn ghost sm" id="lk-cancel">Cancelar</button>' : ''}</div>`;
    el.hidden = false; document.body.classList.add('locked');
    const b = $('#lk-bio'); if (b) b.onclick = () => this.tryBio();
    const c = $('#lk-cancel'); if (c) c.onclick = () => { this.after = null; this.hide(); };
    $$('[data-k]', el).forEach(k => k.onclick = () => this.key(k.dataset.k));
  },
  async tryBio() { try { if (await this.bio()) this.unlock(); else $('#lk-err').textContent = 'No se pudo verificar. Usa tu PIN.'; } catch (e) { $('#lk-err').textContent = e.name === 'NotAllowedError' ? 'Cancelado. Puedes usar tu PIN.' : 'Face ID no disponible ahora. Usa tu PIN.'; } },
  async key(k) {
    if (k === '⌫') this.pin = this.pin.slice(0, -1); else if (this.pin.length < 4) this.pin += k;
    $$('#lk-dots i').forEach((d, i) => d.classList.toggle('on', i < this.pin.length)); $('#lk-err').textContent = '';
    if (this.pin.length === 4) { const ok = (await this.hash(this.pin, Settings.v.lockSalt)) === Settings.v.lockPin; if (ok) this.unlock(); else { this.pin = ''; const d = $('#lk-dots'); d.classList.add('shake'); setTimeout(() => { d.classList.remove('shake'); $$('#lk-dots i').forEach(x => x.classList.remove('on')); }, 420); $('#lk-err').textContent = 'PIN incorrecto'; if (navigator.vibrate) navigator.vibrate(80); } }
  },
  unlock() { const fn = this.after; this.after = null; this.hide(); if (fn) fn(); },
  hide() { this.locked = false; const el = $('#lock'); el.hidden = true; el.innerHTML = ''; document.body.classList.remove('locked'); }
};
document.addEventListener('visibilitychange', () => {
  if (!Lock.enabled()) return;
  if (document.visibilityState === 'hidden') { if (!Rec.capturing && !S.picking) Lock.hiddenAt = Date.now(); }
  else if (Lock.hiddenAt && !Lock.locked && Date.now() - Lock.hiddenAt >= Math.max(5, +Settings.v.lockAfter || 0) * 1000) { Lock.hiddenAt = 0; Lock.show(); }
  else Lock.hiddenAt = 0;
});
function pinSheet(onDone) {
  let first = '', cur = '';
  sheet(`<div class="eyebrow">Bloqueo</div><h3 id="ps-t">Crea un PIN de 4 dígitos</h3><p class="muted" id="ps-s">Sirve de respaldo si Face ID o la huella no funcionan.</p><div class="pin-dots" id="ps-dots">${'<i></i>'.repeat(4)}</div><p class="lk-err" id="ps-err"></p><div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button data-pk="${k}">${k}</button>`).join('')}</div>`, el => {
    const dots = () => $$('#ps-dots i', el).forEach((d, i) => d.classList.toggle('on', i < cur.length));
    $$('[data-pk]', el).forEach(b => b.onclick = async () => {
      const k = b.dataset.pk; if (k === '⌫') cur = cur.slice(0, -1); else if (cur.length < 4) cur += k; dots(); $('#ps-err', el).textContent = '';
      if (cur.length < 4) return;
      if (!first) { first = cur; cur = ''; setTimeout(dots, 150); $('#ps-t', el).textContent = 'Repite el PIN'; $('#ps-s', el).textContent = 'Para confirmar.'; return; }
      if (cur !== first) { first = ''; cur = ''; setTimeout(dots, 150); $('#ps-t', el).textContent = 'Crea un PIN de 4 dígitos'; $('#ps-err', el).textContent = 'No coincidían. Inténtalo de nuevo.'; return; }
      const salt = b64u(crypto.getRandomValues(new Uint8Array(12))); Settings.set({ lockSalt: salt, lockPin: await Lock.hash(cur, salt) }); closeSheet(); onDone && onDone();
    });
  }, 'pinsheet');
}

/* =========================================================
   Memoria de compromisos: Te deben / Debes, fichas de personas y Prepárame
   Todo se calcula en el teléfono con las actas existentes (sin IA ni servidor)
   ========================================================= */
const ME_WORDS = /^(t[uú]|yo|m[ií]|usuario|el usuario|quien graba|anfitri[oó]n)$/;
function isMe(n) {
  const f = fold(n).trim(); if (!f) return false; if (ME_WORDS.test(f)) return true;
  const me = fold(Settings.v.myName).trim(); if (!me) return false;
  return f === me || f.split(/\s+/)[0] === me.split(/\s+/)[0];
}
const isNobody = n => !String(n || '').trim() || /^sin asignar|^nadie|^todos|^equipo$|^por definir/i.test(String(n).trim());
const personKey = n => fold(n).trim().split(/\s+/)[0] || '';
const dayMs = 864e5;
function dueState(c) {
  if (c.t.done) return 'done';
  if (!c.date) return 'nodate';
  const td = today(); if (c.date < td) return 'late'; if (c.date === td) return 'today';
  return (new Date(c.date + 'T12:00:00') - new Date(td + 'T12:00:00')) / dayMs <= 7 ? 'soon' : 'later';
}
const DUE_TXT = { late: 'Vencida', today: 'Vence hoy', soon: 'Esta semana', later: 'Más adelante', nodate: 'Sin fecha', done: 'Cumplida' };
function allCommitments() {
  const out = [];
  for (const m of S.meetings) {
    if (!m.analysis) continue;
    (m.analysis.actions || []).forEach((t, i) => {
      const c = { m, t, i, ref: m.id + '|' + i, owner: t.owner || 'Sin asignar', date: taskDate(t, m) };
      c.me = isMe(c.owner); c.nobody = isNobody(c.owner); c.key = c.me || c.nobody ? '' : personKey(c.owner); c.state = dueState(c);
      out.push(c);
    });
  }
  const rank = { late: 0, today: 1, soon: 2, later: 3, nodate: 4, done: 5 };
  return out.sort((a, b) => rank[a.state] - rank[b.state] || (a.date || '9999').localeCompare(b.date || '9999') || (b.m.date || '').localeCompare(a.m.date || ''));
}
/* The moment someone committed: from the acta (t, quote) or found in the transcript */
function commitMoment(c) {
  if (c.t.t != null || c.t.quote) return { t: c.t.t ?? null, text: c.t.quote || '' };
  const segs = S.txIndex?.[c.m.id]; if (!segs?.length) return null;
  const stem = w => w.slice(0, 5);
  const words = new Set(fold(c.t.task).split(/[^a-z0-9ñ]+/).filter(w => w.length > 3).map(stem));
  const who = personKey(c.owner); let best = null, bs = 0;
  segs.forEach(x => {
    const ws = fold(x.text).split(/[^a-z0-9ñ]+/).filter(w => w.length > 3).map(stem); let sc = 0; ws.forEach(w => { if (words.has(w)) sc++; });
    const sp = personKey(spkName(c.m, x.s)); if (sc && who && sp === who) sc += 1.5; if (sc && c.me && (sp === 'tu' || sp === 'yo')) sc += 1;
    if (/\b(yo|me encargo|lo mando|lo envio|te mando|te envio|quedo|me comprometo|lo hago|el (lunes|martes|miercoles|jueves|viernes))\b/.test(fold(x.text))) sc += .5;
    if (sc > bs) { bs = sc; best = x; }
  });
  return bs >= 2 ? { t: best.t, text: best.text } : null;
}
function remindText(name, items) {
  const first = String(name || '').split(/\s+/)[0];
  if (items.length === 1) { const c = items[0]; const mo = commitMoment(c); return `Hola ${first}, ¿cómo vas con esto? En nuestra reunión del ${fmtDate(c.m.date)} quedamos en: *${c.t.task}*${c.t.due ? ` (${c.t.due})` : ''}.${mo?.text ? `\n\nTus palabras: “${mo.text.length > 160 ? mo.text.slice(0, 157) + '…' : mo.text}”` : ''}\n\nQuedo atento. ¡Gracias!`; }
  return `Hola ${first}, te comparto lo que tenemos pendiente de nuestras reuniones:\n\n${items.map(c => `• ${c.t.task}${c.t.due ? ` (${c.t.due})` : ''} — ${shortDate(c.m.date)}`).join('\n')}\n\n¿Me cuentas cómo vas? ¡Gracias!`;
}
const waOpen = text => window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');

function commitCardHTML(c, opts = {}) {
  const mo = commitMoment(c); const st = c.state;
  return `<div class="cm ${st}" data-ref="${esc(c.ref)}">
    <div class="cm-top"><input type="checkbox" data-task="${esc(c.ref)}" ${c.t.done ? 'checked' : ''} aria-label="Marcar como cumplida"><div class="cm-tx"><b>${esc(c.t.task)}</b>
      <div class="cm-meta"><span class="due ${st}">${DUE_TXT[st]}${c.date ? ' · ' + esc(shortDate(c.date)) : ''}</span>${opts.showOwner ? `<span>${icon('users')} ${esc(c.owner)}</span>` : ''}<button class="tlink" data-open="${esc(c.m.id)}">${esc(c.m.analysis.title)} · ${esc(shortDate(c.m.date))}</button></div></div></div>
    ${mo ? `<button class="cm-quote" data-listen="${esc(c.ref)}" ${mo.t == null ? 'disabled' : ''}><span class="cm-play">${icon('play', 2)}</span><span>“${esc(mo.text.length > 220 ? mo.text.slice(0, 217) + '…' : mo.text)}”</span>${mo.t != null ? `<em class="mono">${fmtT(mo.t)}</em>` : ''}</button>` : ''}
    ${c.t.done ? '' : `<div class="cm-actions">${opts.remind !== false && !c.me ? `<button class="btn sm" data-remind="${esc(c.ref)}">${icon('chat', 2)}Recordar</button>` : ''}${mo?.t != null && c.m.audioParts?.length ? `<button class="btn sm" data-cclip="${esc(c.ref)}">${icon('scissors', 2)}Con su voz</button>` : ''}<button class="btn sm ghost" data-cal="${esc(c.ref)}">${icon('cal', 2)}Calendario</button></div>`}
  </div>`;
}
function bindCommitments(root, list) {
  const byRef = Object.fromEntries(list.map(c => [c.ref, c]));
  bindTasks(root);
  $$('.cm [data-task]', root).forEach(cb => cb.addEventListener('change', () => { if (cb.checked) toast('Compromiso cumplido ✓'); setTimeout(render, 450); }));
  $$('[data-open]', root).forEach(b => b.onclick = () => go('m/' + b.dataset.open));
  $$('[data-remind]', root).forEach(b => b.onclick = () => { const c = byRef[b.dataset.remind]; waOpen(remindText(c.owner, [c])); });
  $$('[data-remind-all]', root).forEach(b => b.onclick = () => { const items = list.filter(c => c.key === b.dataset.remindAll && !c.t.done && !c.me); waOpen(remindText(items[0]?.owner, items)); });
  $$('[data-cclip]', root).forEach(b => b.onclick = () => { const c = byRef[b.dataset.cclip]; const mo = commitMoment(c); const seg = S.txIndex?.[c.m.id]?.find(x => x.t >= mo.t - .5); clipSheet(c.m, Math.max(0, mo.t - 1), Math.max(mo.t + 6, Math.min(mo.t + 40, (seg?.end || mo.t + 12) + .5))); });
  $$('[data-listen]', root).forEach(b => b.onclick = async () => {
    const c = byRef[b.dataset.listen]; const mo = commitMoment(c); if (mo?.t == null) return;
    if (!c.m.audioParts?.length) { S.jump = mo.t; go('m/' + c.m.id + '/transcripcion'); return; }
    if (S.listenEl && !S.listenEl.paused) { S.listenEl.pause(); $$('.cm-quote.playing').forEach(x => x.classList.remove('playing')); if (S.listenRef === c.ref) return; }
    const parts = c.m.audioParts; let k = 0; parts.forEach((p, j) => { if (p.offset <= mo.t + .01) k = j; });
    const u = await Player.url(parts[k].key); const el = new Audio(u); S.listenEl = el; S.listenRef = c.ref; const off = Math.max(0, mo.t - 1 - parts[k].offset);
    b.classList.add('playing');
    el.addEventListener('loadedmetadata', () => { el.currentTime = off; el.play().catch(() => {}); }, { once: true });
    el.addEventListener('timeupdate', () => { if (el.currentTime > off + 20) el.pause(); });
    el.addEventListener('pause', () => b.classList.remove('playing'));
  });
  $$('[data-cal]', root).forEach(b => b.onclick = e => { e.preventDefault(); const c = byRef[b.dataset.cal]; if (c) calendarSheet(c.m, c.t); });
}
function myNameAsk() {
  return Settings.v.myName ? '' : `<div class="notice info me-ask"><span><b>¿Cómo te llamas en tus reuniones?</b> Así Acta separa lo que te deben de lo que tú debes.</span><form id="me-f" class="me-f"><input id="me-in" placeholder="Tu nombre, ej.: Mario" autocomplete="given-name"><button class="btn sm primary">Guardar</button></form></div>`;
}
function bindMyName(app) { const f = $('#me-f', app); if (f) f.onsubmit = e => { e.preventDefault(); const v = $('#me-in').value.trim(); if (!v) return; Settings.set({ myName: v }); toast('Listo, ' + v.split(' ')[0]); render(); }; }

/* ---------- Compromisos (replaces the plain tasks list) ---------- */
function renderTasks(app) {
  const tab = S.cmTab || 'owed';
  if (tab === 'all') return renderAllTasks(app);
  if (!S.txIndex && !S.txBuilding) buildTxIndex().then(() => { if (S.route.view === 'tasks') render(); });
  const all = allCommitments();
  const owed = all.filter(c => c.key && !c.t.done), mine = all.filter(c => c.me && !c.t.done), loose = all.filter(c => c.nobody && !c.t.done);
  const lateOwed = owed.filter(c => c.state === 'late').length, lateMine = mine.filter(c => c.state === 'late').length;
  const groups = new Map(); owed.forEach(c => { if (!groups.has(c.key)) groups.set(c.key, []); groups.get(c.key).push(c); });
  const pidx = peopleIndex();
  app.innerHTML = `
  <div class="page-head"><div><div class="eyebrow">Memoria de compromisos</div><h1>${tab === 'owed' ? 'Te deben' : 'Debes'}</h1><p>${tab === 'owed' ? 'Todo lo que otras personas prometieron en tus reuniones, con la frase exacta en que lo dijeron.' : 'Lo que tú prometiste. Que no se te pase nada.'}</p></div></div>
  ${myNameAsk()}
  <div class="cm-tabs">
    <button data-cmt="owed" aria-pressed="${tab === 'owed'}"><b>${owed.length}</b><span>Te deben</span>${lateOwed ? `<em>${lateOwed} ${lateOwed === 1 ? 'vencida' : 'vencidas'}</em>` : ''}</button>
    <button data-cmt="mine" aria-pressed="${tab === 'mine'}"><b>${mine.length}</b><span>Debes</span>${lateMine ? `<em>${lateMine} ${lateMine === 1 ? 'vencida' : 'vencidas'}</em>` : ''}</button>
    <button data-cmt="all" aria-pressed="false"><b>${all.length}</b><span>Todas</span></button>
  </div>
  ${tab === 'owed' ? (groups.size ? [...groups.entries()].map(([k, items]) => { const p = pidx.get(k); const name = p?.name || items[0].owner; const late = items.filter(c => c.state === 'late').length; return `<section class="cm-group">
      <div class="cm-gh"><button class="cm-person" data-per="${esc(k)}"><span class="av lg" style="background:${avColor(k)}">${esc(initials(name))}</span><span><b>${esc(name)}</b><small>${items.length} ${items.length === 1 ? 'pendiente' : 'pendientes'}${late ? ` · <em>${late} vencida${late === 1 ? '' : 's'}</em>` : ''}${p ? ` · cumple ${p.rateTxt}` : ''}</small></span></button>${items.length > 1 ? `<button class="btn sm" data-remind-all="${esc(k)}">${icon('chat', 2)}Recordar todo</button>` : ''}</div>
      ${items.map(c => commitCardHTML(c)).join('')}</section>`; }).join('') : `<div class="empty">${icon('check', 1.6, 34)}<h3>Nadie te debe nada</h3><p>Cuando alguien se comprometa a algo en una reunión, aparecerá aquí con sus palabras exactas.</p></div>`)
    : (mine.length ? `<section class="cm-group">${mine.map(c => commitCardHTML(c, { remind: false })).join('')}</section>` : `<div class="empty">${icon('check', 1.6, 34)}<h3>Estás al día</h3><p>No tienes compromisos pendientes${Settings.v.myName ? '' : '. Si ves tareas tuyas en “Te deben”, escribe tu nombre arriba'}.</p></div>`)
      + (loose.length ? `<section class="cm-group"><div class="cm-gh"><span class="cm-person"><span class="av lg" style="background:#2A2F3E">?</span><span><b>Sin responsable</b><small>Nadie quedó a cargo. Asígnalas o recuérdalas en la próxima reunión.</small></span></span></div>${loose.map(c => commitCardHTML(c, { remind: false })).join('')}</section>` : '')}`;
  $$('[data-cmt]', app).forEach(b => b.onclick = () => { S.cmTab = b.dataset.cmt; render(); });
  $$('[data-per]', app).forEach(b => b.onclick = () => go('per/' + encodeURIComponent(b.dataset.per)));
  bindMyName(app); bindCommitments(app, all);
}

/* ---------- Personas ---------- */
function avColor(k) { let h = 0; for (const ch of String(k)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; }
function peopleIndex() {
  const idx = new Map(); const td = today();
  const get = (raw) => { const k = personKey(raw); if (!k || isMe(raw) || isNobody(raw)) return null; if (!idx.has(k)) idx.set(k, { key: k, names: new Map(), meetings: new Map(), owned: [], quotes: [], topics: new Map(), secs: 0 }); const p = idx.get(k); p.names.set(raw.trim(), (p.names.get(raw.trim()) || 0) + 1); return p; };
  for (const m of S.meetings) {
    const a = m.analysis; if (!a) continue;
    const names = new Set([...(a.participants || []), ...(m.participants || []), ...Object.values(m.speakers || {})].map(x => String(x || '').trim()).filter(Boolean));
    const here = new Set();
    names.forEach(n => { const p = get(n); if (p) here.add(p); });
    (a.actions || []).forEach((t, i) => { const p = get(t.owner || ''); if (p) { here.add(p); p.owned.push({ m, t, i, ref: m.id + '|' + i, owner: t.owner, date: taskDate(t, m), me: false, nobody: false, key: p.key }); } });
    (a.quotes || []).forEach(q => { const p = get(q.who || ''); if (p) { here.add(p); p.quotes.push({ m, q }); } });
    here.forEach(p => { p.meetings.set(m.id, m); p.secs += m.durationSec || 0; [...(a.topics || []).map(t => t.name), ...(a.tags || []).filter(t => t !== 'ejemplo')].forEach(t => p.topics.set(t, (p.topics.get(t) || 0) + 1)); });
  }
  idx.forEach(p => {
    p.name = [...p.names.entries()].sort((a, b) => b[0].split(' ').length - a[0].split(' ').length || b[1] - a[1])[0][0];
    p.owned.forEach(c => { c.state = dueState(c); });
    const due = p.owned.filter(c => c.t.done || (c.date && c.date < td));
    const done = due.filter(c => c.t.done); const onTime = done.filter(c => !c.date || !c.t.doneAt || isoD(new Date(c.t.doneAt)) <= c.date);
    p.rate = due.length ? done.length / due.length : null; p.onTime = done.length ? onTime.length / done.length : null;
    p.rateTxt = p.rate == null ? 'sin historial' : `${Math.round(p.rate * 100)}%`;
    p.open = p.owned.filter(c => !c.t.done); p.late = p.open.filter(c => c.state === 'late');
    p.list = [...p.meetings.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    p.last = p.list[0];
  });
  return idx;
}
function peopleRowHTML() {
  const ps = [...peopleIndex().values()].filter(p => p.meetings.size).sort((a, b) => (b.last?.date || '').localeCompare(a.last?.date || '') || b.meetings.size - a.meetings.size);
  if (!ps.length) return '';
  return `<div class="sec-title" style="margin-top:22px"><h2>Personas</h2><button class="btn sm ghost" data-nav="people">Ver todas</button></div><div class="pp-row">${ps.slice(0, 14).map(p => `<button class="pp" data-per="${esc(p.key)}"><span class="av lg" style="background:${avColor(p.key)}">${esc(initials(p.name))}</span><b>${esc(p.name.split(' ')[0])}</b><small>${p.open.length ? (p.late.length ? `<em>${p.late.length} ${p.late.length === 1 ? 'vencida' : 'vencidas'}</em>` : `${p.open.length} ${p.open.length === 1 ? 'pendiente' : 'pendientes'}`) : `${p.meetings.size} ${p.meetings.size === 1 ? 'reunión' : 'reuniones'}`}</small></button>`).join('')}</div>`;
}
function owedCardHTML() {
  const all = allCommitments(); const owed = all.filter(c => c.key && !c.t.done); const mine = all.filter(c => c.me && !c.t.done);
  if (!owed.length && !mine.length) return '';
  const late = owed.filter(c => c.state === 'late').length;
  return `<button class="owedcard rise" data-nav="tasks"><span class="oc-n"><b>${owed.length}</b><small>te deben</small></span><span class="oc-tx"><b>${late ? `${late} ${late === 1 ? 'compromiso vencido' : 'compromisos vencidos'} con otras personas` : 'Compromisos que te deben'}</b><span>${mine.length} tuyos pendientes · con la frase exacta de quién lo prometió</span></span><span class="wk-go">Ver ${icon('back', 2)}</span></button>`;
}
function renderPeople(app) {
  const ps = [...peopleIndex().values()].sort((a, b) => b.open.length - a.open.length || (b.last?.date || '').localeCompare(a.last?.date || ''));
  app.innerHTML = `<button class="btn ghost sm back" data-nav="library">${icon('back')}Inicio</button>
  <div class="page-head"><div><div class="eyebrow">Tu red</div><h1>Personas</h1><p>Cada persona con la que te reúnes: qué ha prometido, cuánto cumple y de qué hablan siempre.</p></div></div>
  ${myNameAsk()}
  ${ps.length ? `<div class="pp-grid">${ps.map(p => `<button class="pcard" data-per="${esc(p.key)}"><span class="av xl" style="background:${avColor(p.key)}">${esc(initials(p.name))}</span><div><b>${esc(p.name)}</b><small>${p.meetings.size} ${p.meetings.size === 1 ? 'reunión' : 'reuniones'} · última ${esc(shortDate(p.last.date))}</small><div class="pc-k"><span>${ringSVG(p.rate ?? 0, p.rate == null ? '#3A4052' : p.rate >= .8 ? '#33E3B4' : p.rate >= .5 ? '#FFC24A' : '#FF6B6B', 30, 4)}<em>Cumple ${p.rateTxt}</em></span>${p.open.length ? `<span class="pc-owe">${p.open.length} te debe</span>` : ''}</div></div></button>`).join('')}</div>`
    : `<div class="empty">${icon('users', 1.6, 34)}<h3>Aún no hay personas</h3><p>Aparecen solas cuando Acta identifica participantes y responsables en tus reuniones.</p></div>`}`;
  $$('[data-per]', app).forEach(b => b.onclick = () => go('per/' + encodeURIComponent(b.dataset.per)));
  bindMyName(app);
}
function renderPerson(app, key) {
  if (!S.txIndex && !S.txBuilding) buildTxIndex().then(() => { if (S.route.view === 'person') render(); });
  const p = peopleIndex().get(key);
  if (!p) { app.innerHTML = `<div class="empty"><h3>No encuentro a esta persona</h3><button class="btn" data-nav="people">Ver personas</button></div>`; return; }
  const mine = allCommitments().filter(c => c.me && !c.t.done && p.meetings.has(c.m.id));
  const topics = [...p.topics.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const days = p.last ? Math.round((new Date(today() + 'T12:00:00') - new Date(p.last.date + 'T12:00:00')) / dayMs) : 0;
  const rc2 = p.rate == null ? '#5E6577' : p.rate >= .8 ? '#33E3B4' : p.rate >= .5 ? '#FFC24A' : '#FF6B6B';
  app.innerHTML = `<button class="btn ghost sm back" data-nav="people">${icon('back')}Personas</button>
  <section class="m-hero rise per-hero"><span class="aura a1"></span><span class="aura a2"></span><header class="m-head">
    <div class="per-id"><span class="av xxl" style="background:${avColor(p.key)}">${esc(initials(p.name))}</span><div><div class="eyebrow">Ficha de persona</div><h1>${esc(p.name)}</h1><p class="muted">${p.meetings.size} ${p.meetings.size === 1 ? 'reunión' : 'reuniones'} · ${(p.secs / 3600).toFixed(1).replace('.', ',')} h juntos · última ${days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`}</p></div></div>
    <div class="m-actions"><button class="btn sm primary" id="per-prep">${icon('spark', 2)}Prepárame para reunirme con ${esc(p.name.split(' ')[0])}</button>${p.open.length ? `<button class="btn sm" id="per-remind">${icon('chat', 2)}Recordarle sus pendientes</button>` : ''}<button class="btn sm" id="per-rec">${icon('mic', 2)}Grabar reunión con ${esc(p.name.split(' ')[0])}</button></div>
  </header></section>
  <div class="per-kpis">
    <div class="pk big"><div class="pk-ring">${ringSVG(p.rate ?? 0, rc2, 88, 9)}<b>${p.rate == null ? '—' : Math.round(p.rate * 100) + '%'}</b></div><div><span class="eyebrow">Cumplimiento</span><p>${p.rate == null ? 'Todavía no hay plazos vencidos para medir.' : `Cumplió ${p.owned.filter(c => c.t.done).length} de ${p.owned.filter(c => c.t.done || (c.date && c.date < today())).length} compromisos con plazo cumplido${p.onTime != null ? ` · ${Math.round(p.onTime * 100)}% a tiempo` : ''}.`}</p></div></div>
    <div class="pk"><b>${p.open.length}</b><span>Te debe</span></div>
    <div class="pk ${p.late.length ? 'warn' : ''}"><b>${p.late.length}</b><span>Vencidos</span></div>
    <div class="pk"><b>${mine.length}</b><span>Le debes</span></div>
  </div>
  ${topics.length ? `<div class="sec"><div class="sec-h"><h2>De qué hablan siempre</h2></div><div class="topic-cloud">${topics.map(([t, n], i) => `<span style="--tc:${tc(i)};font-size:${Math.min(18, 12.5 + n * 1.4)}px">${esc(t)}${n > 1 ? ` <em>×${n}</em>` : ''}</span>`).join('')}</div></div>` : ''}
  <div class="sec"><div class="sec-h"><h2>Lo que ${esc(p.name.split(' ')[0])} te debe</h2><span class="count">${p.open.length}</span></div>${p.open.length ? p.open.map(c => commitCardHTML(c)).join('') : '<div class="empty-li">Nada pendiente.</div>'}</div>
  ${mine.length ? `<div class="sec"><div class="sec-h"><h2>Lo que tú le debes</h2><span class="count">${mine.length}</span></div>${mine.map(c => commitCardHTML(c, { remind: false })).join('')}</div>` : ''}
  ${p.quotes.length ? `<div class="sec"><div class="sec-h"><h2>Frases de ${esc(p.name.split(' ')[0])}</h2></div><div class="quotes">${p.quotes.slice(0, 6).map(({ m, q }) => `<figure class="quote"><p>“${esc(q.text)}”</p><small>${esc(shortDate(m.date))} · <button class="tlink" data-open="${esc(m.id)}">${esc(m.analysis.title)}</button></small></figure>`).join('')}</div></div>` : ''}
  <div class="sec"><div class="sec-h"><h2>Reuniones juntos</h2></div><div class="wb-meets">${p.list.map(m => `<button class="wb-m" data-open="${esc(m.id)}"><span class="mono">${esc(shortDate(m.date))}</span><b>${esc(m.analysis.title)}</b><span>${esc(m.analysis.tldr)}</span></button>`).join('')}</div></div>
  ${p.owned.filter(c => c.t.done).length ? `<div class="sec"><div class="sec-h"><h2>Cumplidos</h2><span class="count">${p.owned.filter(c => c.t.done).length}</span></div>${p.owned.filter(c => c.t.done).map(c => commitCardHTML(c)).join('')}</div>` : ''}`;
  bindCommitments(app, [...p.owned, ...mine]);
  $('#per-prep').onclick = () => go('prep/p/' + encodeURIComponent(p.key));
  const pr = $('#per-remind'); if (pr) pr.onclick = () => waOpen(remindText(p.name, p.open));
  $('#per-rec').onclick = () => { recMeta = { title: '', participants: p.name + (Settings.v.myName ? ', ' + Settings.v.myName : ', yo'), template: p.last?.template || 'general', context: '', project: p.last?.project || '' }; go('record'); };
}

/* ---------- Prepárame ---------- */
function prepData(kind, id) {
  let ms = [], title = '', who = null;
  if (kind === 'p') { const p = peopleIndex().get(id); if (!p) return null; who = p; ms = p.list; title = 'tu reunión con ' + p.name; }
  else { ms = projectMeetings(id).filter(m => m.analysis).reverse(); title = 'la próxima reunión de ' + id; }
  if (!ms.length) return null;
  const ids = new Set(ms.map(m => m.id)); const all = allCommitments().filter(c => ids.has(c.m.id) && !c.t.done);
  const owed = kind === 'p' ? who.open : all.filter(c => c.key); const mine = all.filter(c => c.me); const loose = all.filter(c => c.nobody);
  const recent = ms.slice(0, 3);
  return { kind, id, title, who, ms, last: ms[0], owed, mine, loose, questions: recent.flatMap(m => (m.analysis.questions || []).map(q => ({ m, text: q.text }))), decisions: ms.slice(0, 4).flatMap(m => (m.analysis.decisions || []).map(d => ({ m, text: d.text }))).slice(0, 8), risks: recent.flatMap(m => (m.analysis.risks || []).filter(r => r.severity !== 'baja').map(r => ({ m, text: r.text }))).slice(0, 5), next: ms[0].analysis.nextSteps || [] };
}
function prepText(d) {
  const L = [`Preparación para ${d.title} — ${fmtDate(today())}`, '', `Última vez (${fmtDate(d.last.date)}): ${d.last.analysis.tldr}`, ''];
  const sec = (t, arr, f) => { if (arr.length) { L.push(t); arr.forEach(x => L.push('- ' + f(x))); L.push(''); } };
  sec('Te deben:', d.owed, c => `${c.t.task} — ${c.owner}${c.date ? ' · ' + shortDate(c.date) : ''}${c.state === 'late' ? ' (VENCIDA)' : ''}`);
  sec('Debes:', d.mine, c => `${c.t.task}${c.date ? ' · ' + shortDate(c.date) : ''}`);
  sec('Preguntas sin responder:', d.questions, x => x.text);
  sec('Decisiones vigentes:', d.decisions, x => x.text);
  sec('Riesgos a revisar:', d.risks, x => x.text);
  return L.join('\n').trim();
}
function renderPrep(app, kind, id) {
  if (!S.txIndex && !S.txBuilding) buildTxIndex().then(() => { if (S.route.view === 'prep') render(); });
  const d = prepData(kind, id);
  if (!d) { app.innerHTML = `<div class="empty"><h3>Todavía no hay reuniones anteriores</h3><p>Prepárame se arma con lo que ya conversaron.</p><button class="btn" data-nav="library">Volver</button></div>`; return; }
  const lateN = d.owed.filter(c => c.state === 'late').length;
  const li = (arr, f, color) => arr.length ? `<div class="box">${arr.map(x => `<div class="li"><span class="mk" style="background:${color}"></span><div>${f(x)}</div></div>`).join('')}</div>` : '<div class="empty-li">Nada.</div>';
  app.innerHTML = `<button class="btn ghost sm back" id="prep-back">${icon('back')}Volver</button>
  <section class="prep rise">
    <div class="prep-head"><div class="eyebrow">Prepárame · ${esc(fmtDate(today()))}</div><h1>Para ${esc(d.title)}</h1>
      <div class="prep-pills">${d.owed.length ? `<span class="pp-pill hot">${d.owed.length} te deben${lateN ? ` · ${lateN} ${lateN === 1 ? 'vencida' : 'vencidas'}` : ''}</span>` : ''}${d.mine.length ? `<span class="pp-pill">${d.mine.length} debes tú</span>` : ''}${d.questions.length ? `<span class="pp-pill">${d.questions.length} preguntas abiertas</span>` : ''}<span class="pp-pill">${d.ms.length} ${d.ms.length === 1 ? 'reunión previa' : 'reuniones previas'}</span></div></div>
    <div class="prep-last"><span class="eyebrow">La última vez · ${esc(shortDate(d.last.date))}</span><p>${esc(d.last.analysis.tldr)}</p><button class="tlink" data-open="${esc(d.last.id)}">Abrir el acta</button></div>
    <div class="sec"><div class="sec-h"><h2>${icon('flag', 2, 18)} Pide cuentas de esto</h2><span class="count">${d.owed.length}</span></div>${d.owed.length ? d.owed.map(c => commitCardHTML(c, { showOwner: kind !== 'p' })).join('') : '<div class="empty-li">Nadie te debe nada aquí.</div>'}</div>
    ${d.mine.length ? `<div class="sec"><div class="sec-h"><h2>Llega con esto listo</h2><span class="count">${d.mine.length}</span></div>${d.mine.map(c => commitCardHTML(c, { remind: false })).join('')}</div>` : ''}
    <div class="sec g2">
      <div><div class="sec-h"><h2>Preguntas sin responder</h2></div>${li(d.questions, x => esc(x.text) + `<small>${esc(shortDate(x.m.date))}</small>`, 'var(--q)')}</div>
      <div><div class="sec-h"><h2>Decisiones vigentes</h2></div>${li(d.decisions, x => esc(x.text) + `<small>${esc(shortDate(x.m.date))}</small>`, 'var(--dec)')}</div>
    </div>
    ${d.risks.length ? `<div class="sec"><div class="sec-h"><h2>Riesgos a mencionar</h2></div>${li(d.risks, x => esc(x.text), 'var(--risk)')}</div>` : ''}
    ${d.next.length ? `<div class="sec"><div class="sec-h"><h2>Lo que se dijo que venía</h2></div><div class="steps">${d.next.map(s => `<div class="step"><span>${esc(s)}</span></div>`).join('')}</div></div>` : ''}
  </section>
  <div class="tools-row prep-tools"><button class="btn primary" id="prep-rec">${icon('mic', 2)}Grabar la reunión ahora</button><button class="btn" id="prep-copy">${icon('copy')}Copiar como nota</button><button class="btn" id="prep-share">${icon('share')}Compartir</button></div>`;
  bindCommitments(app, [...d.owed, ...d.mine]);
  $('#prep-back').onclick = () => history.length > 1 ? history.back() : go('');
  $('#prep-copy').onclick = () => copyText(prepText(d), 'Preparación copiada');
  $('#prep-share').onclick = () => shareText('Preparación', prepText(d));
  $('#prep-rec').onclick = () => { const lm = d.last; recMeta = { title: '', participants: kind === 'p' ? d.who.name + (Settings.v.myName ? ', ' + Settings.v.myName : ', yo') : ((lm.analysis.participants || lm.participants || []).join(', ')), template: lm.template || 'general', context: '', project: kind === 'j' ? id : (lm.project || '') }; go('record'); };
}

/* =========================================================
   Marca propia, firma y Acta verificada (sello de integridad)
   ========================================================= */
async function sealHash(m) {
  const a = m.analysis || {}; const segs = await getSegments(m.id);
  const canon = JSON.stringify({ t: a.title, d: m.date, dur: m.durationSec || 0, p: a.participants || m.participants || [], s: a.tldr, dec: (a.decisions || []).map(x => x.text), act: (a.actions || []).map(x => [x.task, x.owner, x.due || '']), tx: segs.map(x => [Math.round(x.t), x.s || '', x.text]) });
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canon));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}
const sealCode = h => h.slice(0, 16).match(/.{4}/g).join('-');
const folioTxt = n => 'N° ' + String(n).padStart(4, '0');
async function sealMeeting(m) {
  const hash = await sealHash(m); const n = +Settings.v.folioNext || 1;
  m.seal = { folio: n, hash, at: Date.now() }; Settings.set({ folioNext: n + 1 }); await saveMeeting(m);
  return m.seal;
}
async function sealStatus(m) { if (!m.seal) return null; return (await sealHash(m)) === m.seal.hash ? 'ok' : 'changed'; }
function sealSheet(m) {
  const s = m.seal;
  sheet(`<div class="eyebrow">Acta verificada</div><h3>${s ? 'Acta ' + folioTxt(s.folio) : 'Sellar esta acta'}</h3>
    <p class="muted">${s ? 'Esta acta tiene un sello de integridad: una huella digital única calculada con su contenido y la transcripción. Si alguien cambia una coma, la huella deja de coincidir.' : 'Le asigna un número de folio y una huella digital única (SHA-256) calculada con el contenido y la transcripción. Queda impresa en el informe, el PDF y el Word, junto a las líneas de firma. Si después alguien cambia el acta, Acta lo detecta.'}</p>
    ${s ? `<div class="seal-box" id="seal-box"><span class="seal-ic">${icon('lock', 2)}</span><div><b class="mono">${sealCode(s.hash)}</b><small>Sellada el ${esc(new Date(s.at).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }))}</small><small class="mono seal-full">${s.hash}</small></div></div><p class="hint" id="seal-st">Verificando…</p>` : ''}
    <div class="sheet-actions">${s ? `<button class="btn" id="seal-re">${icon('refresh')}Volver a sellar con los cambios</button>` : `<button class="btn primary lg" id="seal-go">${icon('lock', 2)}Sellar acta</button>`}</div>`, async el => {
    const go2 = $('#seal-go', el); if (go2) go2.onclick = async () => { await sealMeeting(m); toast('Acta sellada ' + folioTxt(m.seal.folio)); sealSheet(m); render(); };
    const re = $('#seal-re', el); if (re) re.onclick = async () => { const f = m.seal.folio; m.seal.hash = await sealHash(m); m.seal.at = Date.now(); m.seal.folio = f; await saveMeeting(m); toast('Sello actualizado'); sealSheet(m); render(); };
    if (s) { const st = await sealStatus(m); const p = $('#seal-st', el); if (p) { p.innerHTML = st === 'ok' ? `<span class="ok-badge">${icon('check', 2.4, 14)}Íntegra: el contenido coincide con el sello</span>` : `<span class="ok-badge bad">El acta cambió después de sellarla</span>`; } }
  });
}
function signaturesHTML(m, a) {
  const people = (a.participants?.length ? a.participants : m.participants) || [];
  const names = [...new Set(people.filter(Boolean))].slice(0, 8); if (!names.length) return '';
  const sig = Settings.v.signature;
  return `<section class="rp-sec rp-sign"><h2>Firmas</h2><div class="rp-signs">${names.map(n => `<div class="rp-sg">${isMe(n) && sig ? `<img src="${sig}" alt="Firma">` : '<span class="blank"></span>'}<i></i><b>${esc(isMe(n) && Settings.v.myName ? Settings.v.myName : n)}</b></div>`).join('')}</div></section>`;
}
function brandSettingsHTML() {
  const v = Settings.v;
  return `<h2>Tu marca y tu firma</h2><p class="muted" style="font-size:13.5px;margin-top:6px">Tus informes, PDF y Word salen con tu logo, tu color y tu firma. Se ve como un documento de tu empresa, no de una app.</p>
    <div class="form">
      <div class="row two"><div class="field"><label for="b-name">Marca en los informes</label><input id="b-name" value="${esc(v.brandName || '')}" placeholder="Pinto Consultores"></div></div>
      <div class="row two"><div class="field"><span class="lbl">Logo</span><div class="brand-logo">${v.brandLogo ? `<img src="${v.brandLogo}" alt="Logo">` : `<span class="muted" style="font-size:13px">Sin logo</span>`}<span class="btn sm filebtn">${icon('upload')}${v.brandLogo ? 'Cambiar' : 'Subir logo'}<input type="file" id="b-logo" accept="image/*"></span>${v.brandLogo ? '<button class="btn sm ghost danger" id="b-logo-x">Quitar</button>' : ''}</div></div>
      <div class="field"><label for="b-color">Color principal</label><div class="brand-color"><input type="color" id="b-color" value="${esc(v.brandColor || '#FF6A3D')}"><span class="muted" style="font-size:13px">Banda y acentos del informe</span>${v.brandColor ? '<button class="btn sm ghost" id="b-color-x">Usar el de Acta</button>' : ''}</div></div></div>
      <div class="field"><span class="lbl">Tu firma</span><div class="brand-sig">${v.signature ? `<img src="${v.signature}" alt="Tu firma">` : '<span class="muted" style="font-size:13px">Aparece sobre tu nombre en las actas selladas.</span>'}<button class="btn sm" id="b-sig">${icon('edit')}${v.signature ? 'Firmar de nuevo' : 'Dibujar mi firma'}</button></div></div>
      <div class="field"><label for="b-folio">Próximo número de folio</label><input id="b-folio" type="number" min="1" value="${+v.folioNext || 1}" style="max-width:160px"><span class="hint">Las actas selladas se numeran en orden: N° 0001, 0002…</span></div>
    </div>`;
}
function bindBrandSettings(app) {
  const re = () => { const p = $('#brand-panel'); if (p) { p.innerHTML = brandSettingsHTML(); bindBrandSettings(app); } };

  $('#b-name').addEventListener('change', e => { Settings.set({ brandName: e.target.value.trim() }); toast('Marca guardada'); });
  $('#b-color').addEventListener('change', e => { Settings.set({ brandColor: e.target.value }); toast('Color guardado'); re(); });
  const cx = $('#b-color-x'); if (cx) cx.onclick = () => { Settings.set({ brandColor: '' }); re(); };
  $('#b-folio').addEventListener('change', e => Settings.set({ folioNext: Math.max(1, +e.target.value || 1) }));
  $('#b-logo').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { Settings.set({ brandLogo: await shrinkImage(f, 360) }); toast('Logo guardado'); re(); } catch { toast('No se pudo leer la imagen'); } };
  const lx = $('#b-logo-x'); if (lx) lx.onclick = () => { Settings.set({ brandLogo: '' }); re(); };
  $('#b-sig').onclick = () => signaturePad(re);
}
async function shrinkImage(file, max) {
  const bmp = await createImageBitmap(file); const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
function signaturePad(done) {
  sheet(`<div class="eyebrow">Tu firma</div><h3>Firma con el dedo</h3><p class="muted">Queda guardada solo en este teléfono.</p><canvas id="sig-c" class="sig-c"></canvas><div class="sheet-actions"><button class="btn primary" id="sig-ok">Guardar firma</button><button class="btn ghost" id="sig-clear">Borrar</button></div>`, el => {
    const c = $('#sig-c', el); const r = c.getBoundingClientRect(); const dpr = 2; c.width = r.width * dpr; c.height = r.height * dpr; const g = c.getContext('2d'); g.scale(dpr, dpr); g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#12141B';
    let drawing = false, any = false, last = null;
    const pt = e => { const b = c.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    c.addEventListener('pointerdown', e => { drawing = true; last = pt(e); c.setPointerCapture(e.pointerId); e.preventDefault(); });
    c.addEventListener('pointermove', e => { if (!drawing) return; const p = pt(e); g.beginPath(); g.moveTo(...last); g.lineTo(...p); g.stroke(); last = p; any = true; e.preventDefault(); });
    ['pointerup', 'pointercancel'].forEach(ev => c.addEventListener(ev, () => { drawing = false; }));
    c.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    $('#sig-clear', el).onclick = () => { g.clearRect(0, 0, c.width, c.height); any = false; };
    $('#sig-ok', el).onclick = () => { if (!any) { toast('Dibuja tu firma primero'); return; } Settings.set({ signature: c.toDataURL('image/png') }); closeSheet(); toast('Firma guardada'); done && done(); };
  });
}

/* =========================================================
   Tasks view (all meetings)
   ========================================================= */
function renderAllTasks(app) {
  const ready = S.meetings.filter(m => m.analysis?.actions?.length);
  const owners = [...new Set(ready.flatMap(m => m.analysis.actions.map(t => t.owner)))].sort();
  const pend = ready.reduce((a, m) => a + m.analysis.actions.filter(t => !t.done).length, 0);
  const groups = ready.map(m => ({ m, items: m.analysis.actions.map((t, i) => ({ t, i })).filter(({ t }) => (S.taskFilter === 'all' || !t.done) && (!S.ownerFilter || t.owner === S.ownerFilter)) })).filter(g => g.items.length);
  app.innerHTML = `
  <div class="page-head"><div><div class="eyebrow">Memoria de compromisos</div><h1>Todas las tareas</h1><p>${pend} ${pend === 1 ? 'pendiente' : 'pendientes'} en ${ready.length} ${ready.length === 1 ? 'reunión' : 'reuniones'}.</p></div></div>
  <div class="tools-row">
    <div class="seg-ctl" role="group" aria-label="Filtro"><button data-tf="pending" aria-pressed="${S.taskFilter === 'pending'}">Pendientes</button><button data-tf="all" aria-pressed="${S.taskFilter === 'all'}">Todas</button></div>
    ${owners.length ? `<select id="t-owner" class="btn sm" aria-label="Responsable"><option value="">Todos los responsables</option>${owners.map(o => `<option ${S.ownerFilter === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : ''}
    ${pend ? `<button class="btn sm" id="t-ics">${icon('cal')}Pendientes al calendario</button>` : ''}
  </div>
  ${groups.length ? groups.map(({ m, items }) => `<section class="tgroup"><h3><button data-open="${esc(m.id)}">${esc(m.analysis.title)}</button><small>${esc(fmtDate(m.date))}</small></h3><div class="box">${items.map(({ t, i }) => taskHTML(t, `${m.id}|${i}`)).join('')}</div></section>`).join('')
    : `<div class="empty">${icon('check', 1.6, 34)}<h3>${ready.length ? 'Todo al día' : 'Sin tareas todavía'}</h3><p>${ready.length ? 'No hay tareas pendientes con este filtro.' : 'Las tareas aparecen aquí cuando Acta procesa tus reuniones.'}</p></div>`}`;
  app.querySelector('.page-head').insertAdjacentHTML('afterend', `<div class="cm-tabs"><button data-cmt="owed" aria-pressed="false"><b>${allCommitments().filter(c => c.key && !c.t.done).length}</b><span>Te deben</span></button><button data-cmt="mine" aria-pressed="false"><b>${allCommitments().filter(c => c.me && !c.t.done).length}</b><span>Debes</span></button><button data-cmt="all" aria-pressed="true"><b>${ready.reduce((a, m) => a + m.analysis.actions.length, 0)}</b><span>Todas</span></button></div>`);
  $$('[data-cmt]', app).forEach(b => b.onclick = () => { S.cmTab = b.dataset.cmt; render(); });
  $$('[data-tf]').forEach(b => b.onclick = () => { S.taskFilter = b.dataset.tf; render(); });
  const so = $('#t-owner'); if (so) so.onchange = e => { S.ownerFilter = e.target.value; render(); };
  const ti = $('#t-ics'); if (ti) ti.onclick = () => exportTasksICS(ready);
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
  const bioOK = await Lock.bioAvailable();
  if (S.route.view !== 'settings') return;
  app.innerHTML = `
  <div class="page-head"><div><div class="eyebrow">Ajustes</div><h1>${adminView() ? 'Configura Acta' : 'Tu cuenta'}</h1><p>Tus reuniones y datos quedan guardados en este teléfono.</p></div></div>
  <div class="set-grid">
    <section class="panel profile" id="profile-panel">${profileHTML()}</section>
    <section class="panel" id="plan-panel">${planHTML(false)}</section>
    ${adminView() ? `<section class="panel adm-box" id="admin-panel">${adminPanelHTML()}</section>` : ''}
    <section class="panel adm-only" id="budget">
      <h2>Saldo estimado</h2>
      <p class="muted" style="font-size:13.5px;margin-top:6px">Acta calcula cuánto gasta cada reunión con los precios oficiales y lo descuenta de lo que cargaste. Puede diferir por centavos; si quieres exactitud, copia el saldo real de la consola y toca <b>Ajustar saldo</b>.</p>
      <div class="wallet">${walletHTML('anthropic')}${walletHTML('openai')}</div>
    </section>
    ${standalone ? '' : `<section class="panel howto"><h2>Instálala en tu celular</h2><ol style="margin-top:10px"><li><b>iPhone (Safari):</b> botón Compartir → <b>Agregar a pantalla de inicio</b>.</li><li><b>Android (Chrome):</b> menú ⋮ → <b>Instalar aplicación</b>.</li></ol><p class="muted" style="font-size:13px;margin-top:10px">Así se abre a pantalla completa, funciona sin conexión para revisar tus actas y aparece junto a tus otras apps.</p></section>`}
    <section class="panel adm-only">
      <h2>Claves de servicio</h2>
      <p class="muted" style="font-size:13.5px;margin-top:6px">Acta usa tu propia cuenta: pagas solo lo que usas, directo al proveedor. Las claves no salen de este dispositivo salvo para llamar a cada servicio. Se guardan dos veces en el teléfono por seguridad. Al tocar <b>Probar y guardar</b>, el iPhone puede ofrecer guardarlas en tus Contraseñas para rellenarlas con Face ID si algún día se borran.</p><p class="notice cool" style="margin-top:10px;font-size:13px">Abre Acta siempre desde el <b>ícono de tu pantalla de inicio</b>. Safari y los links que abres desde WhatsApp guardan sus datos aparte, por eso ahí no aparecen tus claves ni tus reuniones.</p>
      <div class="form">
        <div class="field"><label for="k-anthropic">Claude (Anthropic) — análisis y preguntas</label>
          <form class="key-row" autocomplete="on" onsubmit="return false"><input type="text" name="username" autocomplete="username" value="Acta · Claude" hidden readonly><input id="k-anthropic" name="password" type="password" autocomplete="current-password" spellcheck="false" placeholder="sk-ant-…" value="${esc(v.anthropicKey)}"><button class="btn" id="t-anthropic" type="submit">Probar y guardar</button></form>
          <span class="hint" id="r-anthropic">Créala en console.anthropic.com → API Keys.</span></div>
        <div class="field"><label for="k-openai">OpenAI — transcripción con hablantes</label>
          <form class="key-row" autocomplete="on" onsubmit="return false"><input type="text" name="username" autocomplete="username" value="Acta · OpenAI" hidden readonly><input id="k-openai" name="password" type="password" autocomplete="current-password" spellcheck="false" placeholder="sk-…" value="${esc(v.openaiKey)}"><button class="btn" id="t-openai" type="submit">Probar y guardar</button></form>
          <span class="hint" id="r-openai">Créala en platform.openai.com → API keys. Sin esta clave, Acta usa el dictado del teléfono (menos preciso y sin hablantes).</span></div>
      </div>
    </section>
    <section class="panel">
      <h2>Preferencias</h2>
      <div class="form">
        <div class="row two adm-only">
          <div class="field"><label for="s-claude">Modelo de Claude</label><select id="s-claude">${CLAUDE_MODELS.map(([k, l]) => `<option value="${k}" ${v.claudeModel === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label for="s-stt">Transcripción</label><select id="s-stt">${STT_MODELS.map(([k, l]) => `<option value="${k}" ${v.sttModel === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
        <div class="row two">
          <div class="field"><label for="s-lang">Idioma de las reuniones</label><select id="s-lang"><option value="es" ${v.language === 'es' ? 'selected' : ''}>Español</option><option value="en" ${v.language === 'en' ? 'selected' : ''}>Inglés</option><option value="pt" ${v.language === 'pt' ? 'selected' : ''}>Portugués</option><option value="auto" ${v.language === 'auto' ? 'selected' : ''}>Detectar automáticamente</option></select></div>
          <div class="field"><label for="s-br">Calidad de grabación</label><select id="s-br"><option value="32000" ${+v.bitrate === 32000 ? 'selected' : ''}>Estándar · voz clara, ~14 MB por hora</option><option value="64000" ${+v.bitrate === 64000 ? 'selected' : ''}>Alta · ~29 MB por hora</option></select></div>
        </div>
        <div class="field adm-only-x"><label for="s-about">Sobre ti</label><textarea id="s-about" rows="3" placeholder="Ej.: Soy jefe de propuestas en una constructora de obras hidráulicas. Quiero actas breves, con montos en UF y plazos claros.">${esc(v.about || '')}</textarea><span class="hint">Tu rol, tu rubro y cómo quieres las actas. Claude lo tiene en cuenta en cada análisis.</span></div>
        <div class="field"><label for="s-vocab">Vocabulario de tu trabajo</label><textarea id="s-vocab" rows="3" placeholder="Nombres, marcas, clientes y términos que usas. Ej.: Camila Rojas, Peluquería Lumière, Transbank, UF, Bsale">${esc(v.vocab || '')}</textarea><span class="hint">Acta corrige estas palabras en la transcripción y en el acta. Sepáralas con comas.</span></div>
        <label class="switch"><input type="checkbox" id="s-cap" ${v.captions ? 'checked' : ''}><span><b>Subtítulos en vivo</b><small>Muestra el texto mientras grabas, usando el dictado del teléfono. En algunos Android puede interferir con el micrófono.</small></span></label>
      </div>
    </section>
    <section class="panel howto"><h2>Grabar con el teléfono bloqueado</h2><ol style="margin-top:10px">
      <li><b>iPhone:</b> Apple no deja que las apps web sigan usando el micrófono con la pantalla bloqueada. Usa <b>Modo bolsillo</b> mientras grabas: pantalla negra, sin toques accidentales y la grabación sigue.</li>
      <li>Si igual se bloquea, Acta guarda todo lo grabado y te ofrece <b>Continuar</b> en la misma reunión.</li>
      <li>Para que no se apague sola: Ajustes del iPhone → Pantalla y brillo → <b>Bloqueo automático</b> → un tiempo largo durante tus reuniones.</li>
      <li><b>Android:</b> la grabación sigue con la pantalla apagada.</li></ol></section>
    <section class="panel" id="brand-panel">${brandSettingsHTML()}</section>
    <section class="panel" id="lock-panel">${lockPanelHTML(bioOK)}</section>
    <section class="panel">
      <h2>Almacenamiento y respaldo</h2>
      ${est ? `<div style="margin-top:12px;display:grid;gap:8px"><div class="store-bar"><i style="width:${Math.min(100, est.usage / est.quota * 100).toFixed(1)}%"></i></div><span class="muted" style="font-size:13px">${fmtBytes(est.usage)} usados de ${fmtBytes(est.quota)} disponibles · caben unas <b>${Math.floor(Math.max(0, est.quota - est.usage) * 8 / (+v.bitrate || 32000) / 3600).toLocaleString('es-CL')} horas</b> más de grabación${persisted ? ' · protegido contra borrado automático' : ''}</span></div>` : ''}
      <div class="tools-row" style="margin-top:14px">
        ${persisted ? '' : `<button class="btn sm" id="s-persist">${icon('lock')}Proteger mis datos</button>`}
        <button class="btn sm" id="s-export">${icon('download')}Exportar respaldo</button>
        <span class="btn sm filebtn">${icon('upload')}Importar respaldo<input type="file" id="s-import" accept="application/json,.json,application/zip,.zip"></span>
      </div>
      <p class="muted" style="font-size:12.5px">El respaldo completo trae actas, transcripciones, tareas, audio y fotos en un solo archivo. ${Settings.v.lastBackup ? 'Último respaldo: ' + esc(new Date(Settings.v.lastBackup).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })) + '.' : 'Aún no has hecho un respaldo.'}</p>
      <div style="margin-top:14px" id="wipe-slot"><button class="btn sm ghost danger" id="s-wipe">${icon('trash')}Borrar todo</button></div>
    </section>
    <section class="panel howto"><h2>Privacidad</h2><ol style="margin-top:10px">
      <li>Tus reuniones, audios y actas viven en este dispositivo.</li>
      <li>El audio se envía a OpenAI solo para transcribirlo; el texto se envía a Anthropic solo para crear el acta y responder preguntas.</li>
      <li>Avísales a los participantes que estás grabando.</li></ol><a class="btn sm" href="privacidad.html" target="_blank" rel="noopener" style="margin-top:12px">${icon('doc')}Política de privacidad</a></section>
    <p class="status-line" id="ver-line">Acta ${APP_VERSION}${isAdmin() ? (adminView() ? ' · administrador' : ' · vista cliente') : ''}</p>
  </div>`;
  const keyIn = (id, k) => { const el = $(id); el.addEventListener('input', e => Settings.set({ [k]: e.target.value.trim() })); el.addEventListener('change', e => { Settings.set({ [k]: e.target.value.trim() }); keepStorage(); toast('Clave guardada en este teléfono'); }); };
  keyIn('#k-anthropic', 'anthropicKey'); keyIn('#k-openai', 'openaiKey');
  $('#t-anthropic').onclick = async () => {
    Settings.set({ anthropicKey: $('#k-anthropic').value.trim() }); keepStorage(); const r = $('#r-anthropic'); r.textContent = 'Probando…';
    try { await claude({ messages: [{ role: 'user', content: 'Responde solo: ok' }], max_tokens: 5, kind: 'prueba' }); r.innerHTML = `<span class="ok-badge">${icon('check', 2.4, 14)}Conectado con ${esc(Settings.v.claudeModel)}</span>`; }
    catch (e) { r.innerHTML = `<span class="ok-badge bad">${esc(e.message || 'No funcionó')}</span>`; }
  };
  $('#t-openai').onclick = async () => {
    Settings.set({ openaiKey: $('#k-openai').value.trim() }); keepStorage(); const r = $('#r-openai'); r.textContent = 'Probando…';
    try { const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer ' + Settings.v.openaiKey } }); if (!res.ok) throw new Error(res.status === 401 ? 'La clave no es válida' : 'Error ' + res.status); r.innerHTML = `<span class="ok-badge">${icon('check', 2.4, 14)}Conectado</span>`; }
    catch (e) { r.innerHTML = `<span class="ok-badge bad">${esc(e.message === 'Failed to fetch' ? 'Sin conexión con OpenAI' : e.message)}</span>`; }
  };
  $('#s-claude').onchange = e => Settings.set({ claudeModel: e.target.value });
  $('#s-stt').onchange = e => Settings.set({ sttModel: e.target.value });
  $('#s-lang').onchange = e => Settings.set({ language: e.target.value });
  $('#s-br').onchange = e => Settings.set({ bitrate: +e.target.value });
  $('#s-cap').onchange = e => Settings.set({ captions: e.target.checked });
  $('#s-about').addEventListener('change', e => { Settings.set({ about: e.target.value.trim() }); toast('Guardado: Claude lo usará en las próximas actas'); });
  $('#s-vocab').addEventListener('change', e => { Settings.set({ vocab: e.target.value }); toast(`Vocabulario guardado · ${vocabList().length} palabras`); });
  bindLockSettings(app); bindBrandSettings(app); bindProfile(app);
  $$('[data-wset]').forEach(b => b.onclick = () => { const p = b.dataset.wset; const v = parseFloat(($('#w-' + p + '-val').value || '').replace(',', '.')); if (!(v >= 0)) { toast('Escribe el saldo en dólares, por ejemplo 4.85'); return; } Usage.set(p, v); toast('Saldo ajustado'); renderSettings(app); });
  $$('[data-wtop]').forEach(b => b.onclick = () => { const p = b.dataset.wtop; const v = parseFloat(($('#w-' + p + '-top').value || '').replace(',', '.')); if (!(v > 0)) { toast('Escribe el monto que recargaste, por ejemplo 5'); return; } Usage.topup(p, v); toast('Recarga sumada'); renderSettings(app); });
  const sp = $('#s-persist'); if (sp) sp.onclick = async () => { let ok = false; try { ok = await navigator.storage.persist(); } catch {} toast(ok ? 'Tus datos quedaron protegidos' : 'El navegador no lo permitió. Instalar la app suele habilitarlo.'); renderSettings(app); };
  $('#s-export').onclick = exportBackup;
  $('#s-import').onchange = e => importBackup(e.target.files[0]);
  $('#s-wipe').onclick = () => { $('#wipe-slot').innerHTML = `<span class="confirm">Se borrarán todas las reuniones, audios y actas de este dispositivo.<button class="btn sm solid-danger" id="w-yes">Borrar todo</button><button class="btn sm" id="w-no">Cancelar</button></span>`; $('#w-yes').onclick = async () => { await DB.clearAll(); S.meetings = []; toast('Datos borrados'); renderSettings(app); }; $('#w-no').onclick = () => renderSettings(app); };
}
function lockPanelHTML(bioOK) {
  const v = Settings.v; const on = Lock.enabled();
  return `<h2>Bloqueo con Face ID</h2><p class="muted" style="font-size:13.5px;margin-top:6px">Pide Face ID, huella o PIN para abrir Acta. Evita que alguien que tome tu teléfono desbloqueado lea tus reuniones. La grabación sigue aunque la app esté bloqueada.</p>
    ${on ? `<div class="lock-state">${icon('lock', 2)}<span><b>Activado</b> · ${v.lockCred ? 'Face ID o huella, y PIN de respaldo' : 'con PIN'}</span></div>
      <div class="field" style="margin-top:12px"><label for="s-lockafter">Bloquear al salir de la app</label><select id="s-lockafter"><option value="5" ${+v.lockAfter <= 5 ? 'selected' : ''}>De inmediato</option><option value="60" ${+v.lockAfter === 60 ? 'selected' : ''}>Después de 1 minuto</option><option value="300" ${+v.lockAfter === 300 ? 'selected' : ''}>Después de 5 minutos</option><option value="900" ${+v.lockAfter === 900 ? 'selected' : ''}>Después de 15 minutos</option></select></div>
      <div class="tools-row" style="margin-top:12px">${!v.lockCred && bioOK ? `<button class="btn sm primary" id="lk-addbio">${icon('face', 2)}Agregar Face ID</button>` : ''}<button class="btn sm" id="lk-test">Probar bloqueo</button><button class="btn sm" id="lk-pin">Cambiar PIN</button><button class="btn sm ghost danger" id="lk-off">Desactivar</button></div>`
    : `<div class="tools-row" style="margin-top:14px"><button class="btn primary" id="lk-on">${icon(bioOK ? 'face' : 'lock', 2)}${bioOK ? 'Activar Face ID / huella' : 'Activar con PIN'}</button></div>${bioOK ? '' : '<p class="hint" style="margin-top:6px">Este navegador no ofrece Face ID para apps web; se usará un PIN. En iPhone funciona mejor con la app instalada en la pantalla de inicio.</p>'}`}`;
}
function bindLockSettings(app) {
  const re = async () => { const p = $('#lock-panel'); if (p) { p.innerHTML = lockPanelHTML(await Lock.bioAvailable()); bindLockSettings(app); } };
  const addBio = async () => { try { const id = await Lock.register(); Settings.set({ lockCred: id }); toast('Face ID activado'); } catch (e) { toast(e.name === 'NotAllowedError' ? 'Se canceló Face ID. Queda activo el PIN.' : 'No se pudo activar Face ID aquí. Queda activo el PIN.', 5000); } re(); };
  const on = $('#lk-on'); if (on) on.onclick = async () => { const bio = await Lock.bioAvailable(); pinSheet(async () => { Settings.set({ lockOn: true, lockAfter: 60 }); if (bio) await addBio(); else { toast('Bloqueo con PIN activado'); re(); } }); };
  const ab = $('#lk-addbio'); if (ab) ab.onclick = addBio;
  const la = $('#s-lockafter'); if (la) la.onchange = e => { Settings.set({ lockAfter: +e.target.value }); toast('Guardado'); };
  const t = $('#lk-test'); if (t) t.onclick = () => Lock.show();
  const pc = $('#lk-pin'); if (pc) pc.onclick = () => Lock.show(() => pinSheet(() => toast('PIN cambiado')));
  const off = $('#lk-off'); if (off) off.onclick = () => Lock.show(() => { Settings.set({ lockOn: false, lockCred: '', lockPin: '', lockSalt: '' }); toast('Bloqueo desactivado'); re(); });
}
/* ---------- Perfil, plan y modo administrador ---------- */
function planUsage() {
  const v = Settings.v; const now = new Date(); const day = Math.min(28, Math.max(1, +v.planRenewDay || 1));
  let start = new Date(now.getFullYear(), now.getMonth(), day); if (start > now) start = new Date(now.getFullYear(), now.getMonth() - 1, day);
  const renew = new Date(start.getFullYear(), start.getMonth() + 1, day);
  const used = S.meetings.filter(m => (m.createdAt || 0) >= start.getTime() && m.source !== 'reuse' && (m.audioParts?.length || m.hasTranscript) && (m.hasTranscript || m.analysis)).reduce((a, m) => a + (m.durationSec || 0), 0) / 60;
  const total = Math.max(1, +v.planMinutes || 600);
  return { used, total, left: Math.max(0, total - used), pct: Math.min(1, used / total), renew };
}
const hm = min => { min = Math.round(min); const h = Math.floor(min / 60), mm = min % 60; return h ? `${h} h${mm ? ' ' + mm + ' min' : ''}` : `${mm} min`; };
function planHTML(compact) {
  const u = planUsage(); const warn = u.pct >= .85; const col = warn ? 'var(--risk)' : 'var(--g-cool)';
  const renewTxt = u.renew.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });
  if (compact) return `<button class="plan-mini" data-nav="settings"><span class="pm-top"><b>${esc(Settings.v.planName || 'Tu plan')}</b><span>${hm(u.left)} disponibles</span></span><span class="bar-meter"><i style="width:${u.pct > 0 ? Math.max(2, u.pct * 100) : 0}%;background:${col}"></i></span><small>Usaste ${hm(u.used)} de ${hm(u.total)} · se renueva el ${renewTxt}</small></button>`;
  return `<h2>Tu plan</h2><div class="plan-card"><div class="pc-top"><span class="pc-name">${esc(Settings.v.planName || 'Tu plan')}</span><span class="pc-left">${hm(u.left)} <small>disponibles</small></span></div>
    <div class="bar-meter big"><i style="width:${u.pct > 0 ? Math.max(2, u.pct * 100) : 0}%;background:${col}"></i></div>
    <p class="muted" style="font-size:13px;margin-top:8px">Usaste <b>${hm(u.used)}</b> de ${hm(u.total)} de grabación este mes · se renueva el <b>${renewTxt}</b>.</p>
    ${warn ? '<p class="notice" style="margin-top:10px;font-size:13px">Te queda poco tiempo de grabación este mes.</p>' : ''}</div>`;
}
function profileHTML() {
  const v = Settings.v; const name = v.myName || '';
  return `<div class="prof-head"><span class="av xl" style="background:${avColor(personKey(name) || 'yo')}">${esc(initials(name || 'Tú'))}</span><div><h2>${esc(name || 'Tu perfil')}</h2><p class="muted" style="font-size:13px">${esc(v.profileOrg || 'Agrega tu nombre para personalizar tus actas')}</p></div></div>
    <div class="form" style="margin-top:14px">
      <div class="row two"><div class="field"><label for="pf-name">Nombre</label><input id="pf-name" value="${esc(name)}" placeholder="Tu nombre y apellido" autocomplete="name"><span class="hint">Así Acta sabe qué tareas son tuyas y cuáles te deben.</span></div>
      <div class="field"><label for="pf-org">Empresa, institución o carrera</label><input id="pf-org" value="${esc(v.profileOrg || '')}" placeholder="Ej.: Constructora, Universidad de Talca" autocomplete="organization"></div></div>
    </div>`;
}
function adminPanelHTML() {
  const v = Settings.v;
  return `<h2>${icon('key', 2, 18)} Administrador</h2><p class="muted" style="font-size:13px;margin-top:6px">Solo tú ves esta sección. Tus clientes ven su perfil y su plan, sin claves, modelos ni costos.</p>
    <div class="form" style="margin-top:12px">
      <div class="row two"><div class="field"><label for="ad-plan">Nombre del plan</label><input id="ad-plan" value="${esc(v.planName || '')}" placeholder="Plan Pro"></div>
      <div class="field"><label for="ad-hours">Horas de grabación al mes</label><input id="ad-hours" type="number" min="1" step="1" value="${Math.round((+v.planMinutes || 600) / 60)}"></div></div>
      <div class="field"><label for="ad-day">Día de renovación</label><input id="ad-day" type="number" min="1" max="28" value="${+v.planRenewDay || 1}" style="max-width:120px"></div>
    </div>
    <div class="tools-row" style="margin-top:12px"><button class="btn sm" id="ad-client">${icon('users')}Ver como cliente</button><button class="btn sm ghost danger" id="ad-exit">Salir del modo administrador</button></div>`;
}
function bindProfile(app) {
  const nm = $('#pf-name'); if (nm) nm.addEventListener('change', e => { Settings.set({ myName: e.target.value.trim() }); toast('Perfil guardado'); const p = $('#profile-panel'); if (p) { p.innerHTML = profileHTML(); bindProfile(app); } });
  const og = $('#pf-org'); if (og) og.addEventListener('change', e => { Settings.set({ profileOrg: e.target.value.trim() }); toast('Perfil guardado'); const p = $('#profile-panel'); if (p) { p.innerHTML = profileHTML(); bindProfile(app); } });
  const ap = $('#ad-plan'); if (ap) ap.addEventListener('change', e => { Settings.set({ planName: e.target.value.trim() || 'Tu plan' }); renderSettings(app); });
  const ah = $('#ad-hours'); if (ah) ah.addEventListener('change', e => { Settings.set({ planMinutes: Math.max(1, +e.target.value || 10) * 60 }); renderSettings(app); });
  const ad = $('#ad-day'); if (ad) ad.addEventListener('change', e => { Settings.set({ planRenewDay: Math.min(28, Math.max(1, +e.target.value || 1)) }); renderSettings(app); });
  const ac = $('#ad-client'); if (ac) ac.onclick = () => { Settings.set({ viewAsClient: true }); applyMode(); renderSettings(app); toast('Vista cliente. Toca 7 veces la versión, abajo, para volver.', 5000); };
  const ax = $('#ad-exit'); if (ax) ax.onclick = () => { Settings.set({ admin: false, viewAsClient: false }); applyMode(); renderSettings(app); toast('Modo administrador desactivado'); };
  let taps = 0, tt = 0; const vl = $('#ver-line');
  if (vl) vl.onclick = () => { taps++; clearTimeout(tt); tt = setTimeout(() => { taps = 0; }, 2500); if (taps >= 7) { taps = 0; adminGate(app); } };
}
function adminGate(app) {
  if (isAdmin() && Settings.v.viewAsClient) { Settings.set({ viewAsClient: false }); applyMode(); renderSettings(app); toast('Modo administrador'); return; }
  const has = !!Settings.v.adminPin; let cur = '', first = '';
  sheet(`<div class="eyebrow">Modo administrador</div><h3 id="ag-t">${has ? 'Escribe el PIN de administrador' : 'Crea un PIN de administrador'}</h3><p class="muted" id="ag-s">${has ? '' : 'Lo pedirá cada vez que entres a la configuración avanzada.'}</p><div class="pin-dots" id="ag-dots">${'<i></i>'.repeat(4)}</div><p class="lk-err" id="ag-err"></p><div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button data-ak="${k}">${k}</button>`).join('')}</div>`, el => {
    const dots = () => $$('#ag-dots i', el).forEach((d, i) => d.classList.toggle('on', i < cur.length));
    const enter = async () => { Settings.set({ admin: true, viewAsClient: false }); applyMode(); closeSheet(); renderSettings(app); toast('Modo administrador activado'); };
    $$('[data-ak]', el).forEach(b => b.onclick = async () => {
      const k = b.dataset.ak; if (k === '⌫') cur = cur.slice(0, -1); else if (cur.length < 4) cur += k; dots(); $('#ag-err', el).textContent = '';
      if (cur.length < 4) return;
      if (has) { const ok = (await Lock.hash(cur, Settings.v.adminSalt)) === Settings.v.adminPin; if (ok) return enter(); cur = ''; setTimeout(dots, 150); $('#ag-err', el).textContent = 'PIN incorrecto'; return; }
      if (!first) { first = cur; cur = ''; setTimeout(dots, 150); $('#ag-t', el).textContent = 'Repite el PIN'; return; }
      if (cur !== first) { first = ''; cur = ''; setTimeout(dots, 150); $('#ag-t', el).textContent = 'Crea un PIN de administrador'; $('#ag-err', el).textContent = 'No coincidían'; return; }
      const salt = b64u(crypto.getRandomValues(new Uint8Array(12))); Settings.set({ adminSalt: salt, adminPin: await Lock.hash(cur, salt) }); enter();
    });
  }, 'pinsheet');
}
function backupDue() {
  if (!S.loaded) return false; const real = S.meetings.filter(m => !String(m.id).startsWith('ejemplo-'));
  if (!real.length || Date.now() < (Settings.v.backupSnooze || 0)) return false;
  const newest = Math.max(...real.map(m => m.createdAt || 0));
  return !Settings.v.lastBackup || (Date.now() - Settings.v.lastBackup > 7 * 864e5 && newest > Settings.v.lastBackup);
}
async function backupData() {
  const meetings = await DB.all('meetings'); const transcripts = {};
  for (const m of meetings) { const t = await DB.get('transcripts', m.id); if (t) transcripts[m.id] = t.segments; }
  return { meetings, transcripts };
}
/* Respaldo: completo (un .zip con actas, transcripciones, audio y fotos) o liviano (solo texto, .json) */
async function exportBackup() {
  const { meetings } = await backupData(); const real = meetings.filter(m => !String(m.id).startsWith('ejemplo-'));
  let audioBytes = 0; for (const m of real) for (const p of m.audioParts || []) audioBytes += p.size || 0;
  sheet(`<div class="eyebrow">Respaldo</div><h3>Guarda una copia fuera del teléfono</h3>
    <p class="muted">${real.length} ${real.length === 1 ? 'reunión' : 'reuniones'}. Mándatelo por WhatsApp o correo, o guárdalo en Archivos / Drive.</p>
    <div class="sheet-actions" style="flex-direction:column;align-items:stretch;gap:8px">
      <button class="btn primary" id="bk-full">${icon('download')}Respaldo completo, con audio${audioBytes ? ` (~${fmtBytes(audioBytes)})` : ''}</button>
      <button class="btn" id="bk-lite">${icon('doc')}Solo actas y transcripciones (liviano)</button>
    </div>`, el => {
    $('#bk-full', el).onclick = () => { closeSheet(); makeBackup(true); };
    $('#bk-lite', el).onclick = () => { closeSheet(); makeBackup(false); };
  });
}
async function makeBackup(full) {
  try {
    await Busy.show(full ? 'Armando el respaldo completo' : 'Armando el respaldo', 'Leyendo tus reuniones…');
    const { meetings, transcripts } = await backupData();
    const data = { app: 'acta', version: full ? 2 : 1, exportedAt: new Date().toISOString(), meetings: full ? meetings : meetings.map(m => ({ ...m, audioParts: [] })), transcripts };
    let file;
    if (full) {
      const files = [['respaldo.json', JSON.stringify(data)]];
      for (const [mi, m] of meetings.entries()) {
        await Busy.step(`Reunión ${mi + 1} de ${meetings.length}`, 5 + (mi / Math.max(1, meetings.length)) * 85);
        for (const p of m.audioParts || []) { const b = await DB.get('audio', p.key); if (b) files.push(['audio/' + encodeURIComponent(p.key), new Uint8Array(await b.arrayBuffer())]); }
        for (const ph of m.photos || []) { const b = ph.key && await DB.get('photos', ph.key); if (b) files.push(['fotos/' + encodeURIComponent(ph.key), new Uint8Array(await b.arrayBuffer())]); }
      }
      await Busy.step('Empaquetando', 93);
      file = new File([zipStore(files)], `acta-respaldo-completo-${today()}.zip`, { type: 'application/zip' });
    } else file = new File([JSON.stringify(data)], `acta-respaldo-${today()}.json`, { type: 'application/json' });
    Settings.set({ lastBackup: Date.now() }); Busy.hide();
    deliverFile(file, full ? 'Respaldo completo' : 'Respaldo de actas');
  } catch (e) { Busy.hide(); toast('No se pudo armar el respaldo: ' + (e.message || 'error'), 5000); }
}
/* Lee un .zip sin comprimir (como los que arma Acta) */
function unzipStore(buf) {
  const v = new DataView(buf), u = new Uint8Array(buf), dec = new TextDecoder(); const out = new Map();
  let e = buf.byteLength - 22; while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('El archivo no es un respaldo de Acta');
  const n = v.getUint16(e + 10, true); let c = v.getUint32(e + 16, true);
  for (let i = 0; i < n; i++) {
    if (v.getUint32(c, true) !== 0x02014b50) break;
    const method = v.getUint16(c + 10, true), size = v.getUint32(c + 20, true), nl = v.getUint16(c + 28, true), xl = v.getUint16(c + 30, true), cl = v.getUint16(c + 32, true), lo = v.getUint32(c + 42, true);
    const name = dec.decode(u.subarray(c + 46, c + 46 + nl));
    if (method !== 0) throw new Error('Este .zip fue comprimido de nuevo; usa el archivo original que entregó Acta');
    const start = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true);
    out.set(name, u.subarray(start, start + size)); c += 46 + nl + xl + cl;
  }
  return out;
}
async function importBackup(file) {
  if (!file) return;
  await Busy.show('Importando respaldo', 'Leyendo el archivo…');
  try {
    let data, zip = null;
    if (/\.zip$/i.test(file.name) || file.type.includes('zip')) { zip = unzipStore(await file.arrayBuffer()); const j = zip.get('respaldo.json'); if (!j) throw new Error(); data = JSON.parse(new TextDecoder().decode(j)); }
    else data = JSON.parse(await file.text());
    if (data.app !== 'acta' || !Array.isArray(data.meetings)) throw new Error();
    let n = 0, audios = 0;
    for (const m of data.meetings) {
      if (!m.id) continue; const exists = await DB.get('meetings', m.id);
      const parts = [];
      for (const p of m.audioParts || []) { const b = zip?.get(data.files?.[p.key] || 'audio/' + encodeURIComponent(p.key)); if (b) { if (!exists || !(exists.audioParts || []).length) await DB.put('audio', new Blob([b], { type: p.type || 'audio/webm' }), p.key); parts.push(p); } }
      if (exists) { if (parts.length && !(exists.audioParts || []).length) { exists.audioParts = parts; await DB.put('meetings', exists); audios++; } continue; }
      if (parts.length) audios++;
      m.audioParts = parts;
      for (const ph of m.photos || []) { const b = zip?.get(data.files?.[ph.key] || 'fotos/' + encodeURIComponent(ph.key)); if (b) await DB.put('photos', new Blob([b], { type: ph.type || 'image/jpeg' }), ph.key); }
      await DB.put('meetings', m); if (data.transcripts?.[m.id]) await DB.put('transcripts', { segments: data.transcripts[m.id] }, m.id); n++;
    }
    Busy.hide(); await loadMeetings(); toast(n ? `${n} ${n === 1 ? 'reunión importada' : 'reuniones importadas'}${audios ? ' con su audio' : ''}` : 'No había reuniones nuevas en el respaldo', 4000);
  } catch (e) { Busy.hide(); toast(/zip|respaldo/i.test(e?.message || '') ? e.message : 'Ese archivo no es un respaldo de Acta.', 5000); }
}

/* =========================================================
   Charts shared by app and report
   ========================================================= */
function speakerShares(m, segs) {
  const map = new Map(); let total = 0;
  segs.forEach(x => { if (!x.s) return; const w = wordsOf(x.text); map.set(x.s, (map.get(x.s) || 0) + w); total += w; });
  const byName = new Map();
  map.forEach((w, l) => { const n = spkName(m, l).replace(/ · parte \d+$/, ''); const cur = byName.get(n) || { label: l, name: n, w: 0, idx: spkIndex(m, l) }; cur.w += w; byName.set(n, cur); });
  return [...byName.values()].sort((a, b) => b.w - a.w).map(x => ({ label: x.label, name: x.name, pct: total ? x.w / total : 0, idx: x.idx }));
}
function donutSVG(items, { size = 130, thick = 16, track = 'rgba(255,255,255,.07)', label = '', sub = '', ink = '#F3F5FB', muted = '#A3AABD', cls = 'donut' } = {}) {
  const r = (size - thick) / 2, c = size / 2; let acc = 0;
  const arcs = items.map(it => { const len = it.pct * 100; const gap = items.length > 1 ? 1.2 : 0; const L = Math.max(0, len - gap); const s = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${it.color}" stroke-width="${thick}" pathLength="100" stroke-dasharray="${L} ${100 - L}" stroke-dashoffset="${-acc}" transform="rotate(-90 ${c} ${c})" stroke-linecap="butt"/>`; acc += len; return s; }).join('');
  return `<svg class="${cls}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(sub)}"><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${track}" stroke-width="${thick}"/>${arcs}<text x="${c}" y="${c + 4}" text-anchor="middle" font-size="${size * .2}" font-weight="700" fill="${ink}" font-family="Bricolage Grotesque, system-ui, sans-serif">${esc(label)}</text><text x="${c}" y="${c + size * .17}" text-anchor="middle" font-size="${size * .075}" fill="${muted}" font-family="IBM Plex Sans, system-ui, sans-serif" letter-spacing="1.2" font-weight="600">${esc(sub)}</text></svg>`;
}
function gaugeSVG(score) {
  const p = Math.max(0, Math.min(100, score || 0));
  const ang = Math.PI * (1 - p / 100); const nx = 75 + Math.cos(ang) * 52, ny = 78 - Math.sin(ang) * 52;
  return `<svg viewBox="0 0 150 86" aria-hidden="true"><defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#2F80ED"/><stop offset=".5" stop-color="#FF8A3D"/><stop offset="1" stop-color="#E8467C"/></linearGradient></defs>
    <path d="M15 78 A60 60 0 0 1 135 78" fill="none" stroke="#EEF0F4" stroke-width="12" stroke-linecap="round"/>
    <path d="M15 78 A60 60 0 0 1 135 78" fill="none" stroke="url(#gg)" stroke-width="12" stroke-linecap="round" pathLength="100" stroke-dasharray="${p} 100"/>
    <circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="6" fill="#fff" stroke="#12141B" stroke-width="3"/>
    <text x="75" y="72" text-anchor="middle" font-size="22" font-weight="750" fill="#12141B" font-family="Bricolage Grotesque, system-ui, sans-serif">${Math.round(p)}</text></svg>`;
}

/* =========================================================
   Infographic report (paper-white poster)
   ========================================================= */
const REP_COLORS = ['#FF6A3D', '#2F80ED', '#10B48C', '#7C5CFF', '#F2A100', '#E8467C'];
const rc = i => REP_COLORS[((i % 6) + 6) % 6];
/* El mismo color para cada persona en todo el informe: el de su parte en el gráfico de participación */
const personColors = shares => { const norm = x => String(x || '').trim().toLowerCase(); const memo = {}; let extra = shares.length; return name => { const k = norm(name); if (k in memo) return memo[k]; let i = shares.findIndex(s => norm(s.name) === k); if (i < 0) i = shares.findIndex(s => norm(s.name).split(' ')[0] === k.split(' ')[0]); return (memo[k] = rc(i >= 0 ? i : extra++)); }; };
function reportHTML(m, a, segs) {
  const dur = m.durationSec || segDuration(segs);
  const acts = a.actions || []; const done = acts.filter(x => x.done).length;
  const people = (a.participants?.length ? a.participants : m.participants) || [];
  const shares = speakerShares(m, segs);
  const topics = a.topics || []; const tot = topics.reduce((s, t) => s + Math.max(1, t.end - t.start), 0) || 1;
  const sevC = s => s === 'alta' ? '#D93A26' : s === 'media' ? '#B07400' : '#6A7183';
  const sevB = s => s === 'alta' ? '#FFE9E6' : s === 'media' ? '#FFF4DB' : '#EFF1F5';
  const kpi = (val, lbl, ic, c) => `<div class="rp-kpi" style="--kc:${c}">${icon(ic, 2)}<b>${val}</b><span>${lbl}</span></div>`;
  const sec = (title, inner) => `<section class="rp-sec"><h2>${title}</h2>${inner}</section>`;
  const listBox = (items, color) => items.length ? `<div class="rp-list">${items.map(x => `<div class="rp-li"><span class="d" style="background:${x.color || color}"></span><div>${x.html}</div></div>`).join('')}</div>` : `<div class="rp-list"><div class="rp-li"><span></span><div style="color:#9198A8">Nada registrado.</div></div></div>`;
  const pc = personColors(shares); const ownerColor = {}; acts.forEach(t => { ownerColor[t.owner] = pc(t.owner); });
  const bc = Settings.v.brandColor;
  return `<article class="rep"${bc ? ` style="--brand:${esc(bc)}"` : ''}>
  <div class="rp-band"${bc ? ` style="background:${esc(bc)}"` : ''}></div>
  <header class="rp-head">
    <div style="display:grid;gap:12px;position:relative;z-index:1">
      ${Settings.v.brandLogo || Settings.v.brandName ? `<div class="rp-brand own">${Settings.v.brandLogo ? `<img src="${Settings.v.brandLogo}" alt="">` : ''}${Settings.v.brandName ? `<span>${esc(Settings.v.brandName)}</span>` : ''}<em>${m.seal ? 'Acta ' + folioTxt(m.seal.folio) : 'Informe de reunión'}</em></div>` : `<div class="rp-brand"><i><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/></svg></i>${m.seal ? 'Acta ' + folioTxt(m.seal.folio) : 'Acta · Informe de reunión'}</div>`}
      <h1 class="rp-title">${esc(a.title)}</h1>
      <div class="rp-meta"><span>${icon('cal')}${esc(fmtDate(m.date))}</span>${dur ? `<span>${icon('time')}${fmtT(dur)}${m.estimatedTimes ? ' aprox.' : ''}</span>` : ''}${people.length ? `<span>${icon('users')}${esc(people.join(', '))}</span>` : ''}<span>${icon('doc')}${esc(tplName(m))}</span></div>
      ${(a.tags || []).filter(t => t !== 'ejemplo').length ? `<div class="rp-tags">${a.tags.filter(t => t !== 'ejemplo').map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
    </div>
    ${a.mood ? `<div class="rp-gauge">${gaugeSVG(a.mood.score)}<b>${esc(a.mood.label)}</b><small>Clima de la reunión</small></div>` : ''}
  </header>
  <div class="rp-body">
    <div class="rp-kpis">
      ${kpi(dur ? fmtT(dur) : '—', 'Duración', 'time', '#FF6A3D')}
      ${kpi(nf(m.words || wordCount(segs)), 'Palabras', 'text', '#2F80ED')}
      ${kpi((a.decisions || []).length, 'Decisiones', 'flag', '#7C5CFF')}
      ${kpi(`${done}/${acts.length}`, 'Tareas hechas', 'check', '#10B48C')}
      ${kpi(topics.length, 'Temas', 'chart', '#F2A100')}
    </div>
    <div class="rp-2 w73">
      ${sec('Resumen ejecutivo', `<div class="rp-sum">${esc(a.tldr)}</div>${a.mood?.note ? `<p class="rp-mood"><b>Clima:</b> ${esc(a.mood.note)}</p>` : ''}`)}
      ${shares.length >= 2 ? sec('Participación', `<div class="rp-spk">${donutSVG(shares.map((s, i) => ({ pct: s.pct, color: rc(i) })), { size: 130, thick: 18, track: '#EEF0F4', label: String(shares.length), sub: 'VOCES', ink: '#12141B', muted: '#5E6577', cls: '' })}<div class="rp-legend">${shares.map((s, i) => `<div><i style="background:${rc(i)}"></i><span>${esc(s.name)}</span><span>${Math.round(s.pct * 100)}%</span></div>`).join('')}</div></div>`)
        : sec('Participantes', `<div class="rp-legend">${(people.length ? people : ['Sin registrar']).map((p, i) => `<div><span class="rp-av" style="background:${rc(i)}">${esc(initials(p))}</span><span>${esc(p)}</span><span></span></div>`).join('')}</div>`)}
    </div>
    ${topics.length ? sec('Recorrido de la conversación', `<div class="rp-tl"><div class="rp-tlbar">${topics.map((t, i) => `<i style="flex:${Math.max(1, t.end - t.start) / tot * 100};background:${rc(i)}"></i>`).join('')}</div><div class="rp-tlaxis"><span>0:00</span><span>${fmtT(dur / 2)}</span><span>${fmtT(dur)}</span></div>
      <div class="rp-topics">${topics.map((t, i) => `<div class="rp-topic"><span class="sw" style="background:${rc(i)}"></span><div><b>${esc(t.name)}</b><em>${fmtT(t.start)}–${fmtT(t.end)} · ${Math.round(Math.max(1, t.end - t.start) / tot * 100)}%</em><small>${esc(t.summary)}</small></div></div>`).join('')}</div></div>`) : ''}
    ${(a.keyPoints || []).length ? sec('Puntos clave', `<div class="rp-kps">${a.keyPoints.map((k, i) => `<div class="rp-kp" style="--kc:${rc(i)}"><span class="n">${icon(k.icon, 2)}</span><div><b>${esc(k.title)}</b><p>${esc(k.detail)}</p></div></div>`).join('')}</div>`) : ''}
    <div class="rp-2">
      ${sec(`Decisiones · ${(a.decisions || []).length}`, listBox((a.decisions || []).map(d => ({ html: `${esc(d.text)}${d.why ? `<small>${esc(d.why)}</small>` : ''}` })), '#7C5CFF'))}
      ${sec(`Plan de acción · ${acts.length}`, acts.length ? `<div class="rp-tasks">${acts.map(t => `<div class="rp-task ${t.done ? 'done' : ''}"><span class="cb ${t.done ? 'on' : ''}"></span><div><div class="t">${esc(t.task)}</div><small><span class="rp-av" style="background:${ownerColor[t.owner]}">${esc(initials(t.owner))}</span>${esc(t.owner)}${t.due ? ` · ${esc(t.due)}` : ''}</small></div><span class="rp-prio ${t.priority}">${t.priority}</span></div>`).join('')}</div>` : listBox([], ''))}
    </div>
    <div class="rp-3">
      ${sec('Riesgos', listBox((a.risks || []).map(r => ({ color: sevC(r.severity), html: `${esc(r.text)}<span class="pill" style="background:${sevB(r.severity)};color:${sevC(r.severity)}">${r.severity}</span>` })), '#D93A26'))}
      ${sec('Ideas', listBox((a.ideas || []).map(d => ({ html: `${esc(d.text)}${d.note ? `<small>${esc(d.note)}</small>` : ''}` })), '#F2A100'))}
      ${sec('Preguntas abiertas', listBox((a.questions || []).map(q => ({ html: esc(q.text) })), '#2F80ED'))}
    </div>
    ${(a.numbers || []).length ? sec('Cifras clave', `<div class="rp-nums">${a.numbers.map(n => `<div class="rp-num"><b>${esc(n.value)}</b><span>${esc(n.label)}</span></div>`).join('')}</div>`) : ''}
    <div class="rp-2">
      ${(a.quotes || []).length ? sec('Frase destacada', `<div class="rp-quote"><p>“${esc(a.quotes[0].text)}”</p><small>${esc(a.quotes[0].who)}${a.quotes[0].t != null ? ` · ${fmtT(a.quotes[0].t)}` : ''}</small></div>`) : ''}
      ${(a.nextSteps || []).length ? sec('Próximos pasos', `<div class="rp-flow" style="grid-template-columns:1fr">${a.nextSteps.map((s, i) => `<div class="rp-step"><b>${i + 1}</b><span>${esc(s)}</span></div>`).join('')}</div>`) : ''}
    </div>
  </div>
  ${m.seal ? `<div class="rp-body rp-sealwrap">${signaturesHTML(m, a)}<div class="rp-seal"><span class="rp-seal-ic">${icon('lock', 2)}</span><div><b>Acta ${folioTxt(m.seal.folio)} · sello de integridad ${sealCode(m.seal.hash)}</b><small>Sellada el ${esc(new Date(m.seal.at).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' }))} · SHA-256 ${m.seal.hash}</small></div></div></div>` : ''}
  <footer class="rp-foot"><span>${Settings.v.brandName ? esc(Settings.v.brandName) + ' · ' : ''}${esc(new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }))}</span><span>${Settings.v.brandName ? 'Creado con Acta' : 'Generado con Acta · Transcripción con hablantes · Análisis con Claude'}</span></footer>
</article>`;
}
function renderReport(body, m, a, segs) {
  const mode = S.repMode || 'normal'; const busy = S.extBusy === m.id;
  const needGen = mode === 'extendido' && !a.extended;
  body.innerHTML = `<div class="rep-modes" role="group">${REP_MODES.map(([k, n, d]) => `<button data-rm="${k}" aria-pressed="${mode === k}"><b>${n}</b><small>${d}</small></button>`).join('')}</div>
  ${needGen ? `<div class="panel ext-gen">${busy ? `<div class="eyebrow">Escribiendo el informe extendido</div><h3>Analizando la transcripción completa…</h3><p class="muted" id="ext-prog">Esto toma 1 a 3 minutos. Puedes seguir usando la app.</p><div class="pbar"><i id="ext-bar" style="width:5%"></i></div>` : `<div class="eyebrow">Informe extendido</div><h3>Todo el detalle de la reunión</h3><p class="muted">Desarrollo tema por tema con quién dijo qué, registro de decisiones con su contexto, plan de acción detallado, riesgos con mitigación, postura de cada participante y minuta cronológica.</p><ul class="ext-list"><li>Se crea una sola vez y queda guardado.</li><li>Toma 1 a 3 minutos.</li>${adminView() ? `<li>Costo estimado: unos US$${(Math.max(.02, (m.words || 3000) * 1.4 / 1e6 * (PRICES[Settings.v.claudeModel]?.in || 2) + 7000 / 1e6 * (PRICES[Settings.v.claudeModel]?.out || 10))).toFixed(2)}.</li>` : ''}</ul><button class="btn primary lg" id="ext-go">${icon('spark', 2)}Crear informe extendido</button>`}</div>` : `<div class="rep-tools"><button class="btn primary sm" id="rp-png">${icon('image', 2)}Guardar como imagen</button><button class="btn sm" id="rp-pdf">${icon('doc')}Descargar PDF</button>${mode === 'extendido' ? `<button class="btn sm ghost" id="ext-redo">${icon('refresh')}Rehacer</button>` : ''}<span class="hint">${mode === 'compacto' ? 'Ideal para WhatsApp.' : mode === 'extendido' ? 'Ideal para archivar o enviar a quien no estuvo.' : 'Informe listo para enviar por WhatsApp o correo.'}</span></div><div class="rep-frame rise">${reportByMode(m, a, segs, mode)}</div>`}`;
  $$('[data-rm]', body).forEach(b => b.onclick = () => { S.repMode = b.dataset.rm; renderReport(body, m, a, segs); });
  const pg = $('#rp-png'); if (pg) pg.onclick = () => exportReport(m, a, segs, 'png');
  const pp = $('#rp-pdf'); if (pp) pp.onclick = () => exportReport(m, a, segs, 'pdf');
  const run = async () => {
    S.extBusy = m.id; renderReport(body, m, a, segs); const t0 = Date.now();
    try { await generateExtended(m, n => { const el = $('#ext-prog'); if (el) el.textContent = `Escribiendo… ${nf(n)} caracteres`; const b = $('#ext-bar'); if (b) b.style.width = Math.min(95, 5 + n / 260) + '%'; }); toast('Informe extendido listo'); try { navigator.vibrate?.([80, 60, 80]); } catch {} }
    catch (e) { toast(e.message || 'No se pudo crear el informe', 5000); }
    finally { S.extBusy = null; if ($('.rep-modes') && S.route.id === m.id) renderReport(body, m, a, segs); }
  };
  const eg = $('#ext-go'); if (eg) eg.onclick = run;
  const er = $('#ext-redo'); if (er) er.onclick = () => { a.extended = null; run(); };
}
/* =========================================================
   Tres informes: compacto, normal y extendido
   ========================================================= */
const REP_MODES = [['compacto', 'Compacto', 'Una página para enviar rápido'], ['normal', 'Normal', 'El informe visual completo'], ['extendido', 'Extendido', 'Con todo el detalle, tema por tema']];
function repHead(m, a, label) {
  const people = (a.participants?.length ? a.participants : m.participants) || []; const dur = m.durationSec;
  const bc = Settings.v.brandColor;
  return `<div class="rp-band"${bc ? ` style="background:${esc(bc)}"` : ''}></div>
  <header class="rp-head"><div style="display:grid;gap:12px;position:relative;z-index:1">
    ${Settings.v.brandLogo || Settings.v.brandName ? `<div class="rp-brand own">${Settings.v.brandLogo ? `<img src="${Settings.v.brandLogo}" alt="">` : ''}${Settings.v.brandName ? `<span>${esc(Settings.v.brandName)}</span>` : ''}<em>${esc(label)}</em></div>` : `<div class="rp-brand"><i><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/></svg></i>${esc(label)}</div>`}
    <h1 class="rp-title">${esc(a.title)}</h1>
    <div class="rp-meta"><span>${icon('cal')}${esc(fmtDate(m.date))}</span>${dur ? `<span>${icon('time')}${fmtT(dur)}</span>` : ''}${people.length ? `<span>${icon('users')}${esc(people.join(', '))}</span>` : ''}${m.project ? `<span>${icon('folder')}${esc(m.project)}</span>` : ''}</div>
  </div>${a.mood ? `<div class="rp-gauge">${gaugeSVG(a.mood.score)}<b>${esc(a.mood.label)}</b><small>Clima de la reunión</small></div>` : ''}</header>`;
}
function repFoot(m, a) {
  return `${m.seal ? `<div class="rp-body rp-sealwrap">${signaturesHTML(m, a)}<div class="rp-seal"><span class="rp-seal-ic">${icon('lock', 2)}</span><div><b>Acta ${folioTxt(m.seal.folio)} · sello de integridad ${sealCode(m.seal.hash)}</b><small>Sellada el ${esc(new Date(m.seal.at).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' }))} · SHA-256 ${m.seal.hash}</small></div></div></div>` : ''}
  <footer class="rp-foot"><span>${Settings.v.brandName ? esc(Settings.v.brandName) + ' · ' : ''}${esc(new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }))}</span><span>Creado con Acta</span></footer>`;
}
function compactReportHTML(m, a, segs) {
  const acts = a.actions || []; const dur = m.durationSec || segDuration(segs);
  const sec = (t, inner) => `<section class="rp-sec"><h2>${t}</h2>${inner}</section>`;
  const li = (items, color) => items.length ? `<div class="rp-list">${items.map(h => `<div class="rp-li"><span class="d" style="background:${color}"></span><div>${h}</div></div>`).join('')}</div>` : '';
  return `<article class="rep compact"${Settings.v.brandColor ? ` style="--brand:${esc(Settings.v.brandColor)}"` : ''}>${repHead(m, a, m.seal ? 'Acta ' + folioTxt(m.seal.folio) : 'Resumen de reunión')}
  <div class="rp-body">
    <div class="rp-kpis k3"><div class="rp-kpi" style="--kc:#FF6A3D">${icon('time', 2)}<b>${dur ? fmtT(dur) : '—'}</b><span>Duración</span></div><div class="rp-kpi" style="--kc:#7C5CFF">${icon('flag', 2)}<b>${(a.decisions || []).length}</b><span>Decisiones</span></div><div class="rp-kpi" style="--kc:#10B48C">${icon('check', 2)}<b>${acts.length}</b><span>Tareas</span></div></div>
    ${sec('En pocas palabras', `<div class="rp-sum">${esc(a.tldr)}</div>`)}
    ${(a.decisions || []).length ? sec('Decisiones', li(a.decisions.map(d => esc(d.text)), '#7C5CFF')) : ''}
    ${acts.length ? sec('Tareas', `<div class="rp-tasks">${acts.map(t => `<div class="rp-task ${t.done ? 'done' : ''}"><span class="cb ${t.done ? 'on' : ''}"></span><div><div class="t">${esc(t.task)}</div><small><b>${esc(t.owner)}</b>${t.due ? ' · ' + esc(t.due) : ''}</small></div></div>`).join('')}</div>`) : ''}
    ${(a.nextSteps || []).length ? sec('Próximos pasos', li(a.nextSteps.slice(0, 5).map(esc), '#2F80ED')) : ''}
  </div>${repFoot(m, a)}</article>`;
}
function extendedReportHTML(m, a, segs) {
  const x = a.extended; const dur = m.durationSec || segDuration(segs); const shares = speakerShares(m, segs); const pcx = personColors(shares);
  const sec = (t, inner, cls = '') => `<section class="rp-sec ${cls}"><h2>${t}</h2>${inner}</section>`;
  const topics = x.topics || []; const tot = topics.reduce((s, t) => s + Math.max(1, (t.end || 0) - (t.start || 0)), 0) || 1;
  return `<article class="rep extended"${Settings.v.brandColor ? ` style="--brand:${esc(Settings.v.brandColor)}"` : ''}>${repHead(m, a, (m.seal ? 'Acta ' + folioTxt(m.seal.folio) + ' · ' : '') + 'Informe extendido')}
  <div class="rp-body">
    <div class="rp-kpis">
      <div class="rp-kpi" style="--kc:#FF6A3D">${icon('time', 2)}<b>${dur ? fmtT(dur) : '—'}</b><span>Duración</span></div>
      <div class="rp-kpi" style="--kc:#2F80ED">${icon('chart', 2)}<b>${topics.length}</b><span>Temas</span></div>
      <div class="rp-kpi" style="--kc:#7C5CFF">${icon('flag', 2)}<b>${(x.decisions || []).length}</b><span>Decisiones</span></div>
      <div class="rp-kpi" style="--kc:#10B48C">${icon('check', 2)}<b>${(x.actions || []).length}</b><span>Tareas</span></div>
      <div class="rp-kpi" style="--kc:#E8467C">${icon('risk', 2)}<b>${(x.risks || []).length}</b><span>Riesgos</span></div>
    </div>
    ${sec('Resumen ejecutivo', `<div class="rp-prose lead">${md(x.executive || a.tldr)}</div>`)}
    ${x.context ? sec('Contexto y objetivo', `<div class="rp-prose">${md(x.context)}</div>`) : ''}
    <div class="rp-2 w73">
      ${topics.length ? sec('Distribución del tiempo', `<div class="rp-tl"><div class="rp-tlbar">${topics.map((t, i) => `<i style="flex:${Math.max(1, (t.end || 0) - (t.start || 0)) / tot * 100};background:${rc(i)}"></i>`).join('')}</div><div class="rp-legend" style="margin-top:12px">${topics.map((t, i) => `<div><i style="background:${rc(i)}"></i><span>${esc(t.name)}</span><span>${Math.round(Math.max(1, (t.end || 0) - (t.start || 0)) / tot * 100)}%</span></div>`).join('')}</div></div>`) : ''}
      ${shares.length >= 2 ? sec('Participación', `<div class="rp-spk">${donutSVG(shares.map((s, i) => ({ pct: s.pct, color: rc(i) })), { size: 120, thick: 16, track: '#EEF0F4', label: String(shares.length), sub: 'VOCES', ink: '#12141B', muted: '#5E6577', cls: '' })}<div class="rp-legend">${shares.map((s, i) => `<div><i style="background:${rc(i)}"></i><span>${esc(s.name)}</span><span>${Math.round(s.pct * 100)}%</span></div>`).join('')}</div></div>`) : ''}
    </div>
    ${topics.length ? sec('Desarrollo tema por tema', topics.map((t, i) => `<div class="rp-topicx" style="--kc:${rc(i)}"><div class="tx-h"><span class="n">${i + 1}</span><div><b>${esc(t.name)}</b><em>${fmtT(t.start || 0)}–${fmtT(t.end || 0)}</em></div></div>
      <div class="rp-prose">${md(t.summary || '')}</div>
      ${(t.points || []).length ? `<ul class="tx-pts">${t.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      ${(t.voices || []).length ? `<div class="tx-voices">${t.voices.map(v => `<div><span class="rp-av" style="background:${pcx(v.who)}">${esc(initials(v.who))}</span><p><b>${esc(v.who)}:</b> ${esc(v.said)}</p></div>`).join('')}</div>` : ''}
      ${(t.numbers || []).length ? `<div class="tx-nums">${t.numbers.map(n => `<span><b>${esc(n.value)}</b> ${esc(n.label)}</span>`).join('')}</div>` : ''}</div>`).join('')) : ''}
    ${(x.decisions || []).length ? sec('Registro de decisiones', `<table class="rp-table"><thead><tr><th>#</th><th>Decisión</th><th>Contexto y motivo</th><th>Propuso</th><th>Min.</th></tr></thead><tbody>${x.decisions.map((d, i) => `<tr><td>${i + 1}</td><td><b>${esc(d.text)}</b></td><td>${esc(d.context || '')}</td><td>${esc(d.proposedBy || '')}</td><td>${d.t != null ? fmtT(d.t) : ''}</td></tr>`).join('')}</tbody></table>`) : ''}
    ${(x.actions || []).length ? sec('Plan de acción detallado', `<table class="rp-table"><thead><tr><th>Tarea</th><th>Responsable</th><th>Plazo</th><th>Detalle y criterio de cumplimiento</th></tr></thead><tbody>${x.actions.map(t => `<tr><td><b>${esc(t.task)}</b></td><td>${esc(t.owner || '')}</td><td>${esc(t.due || '—')}</td><td>${esc(t.detail || '')}</td></tr>`).join('')}</tbody></table>`) : ''}
    ${(x.risks || []).length ? sec('Riesgos y mitigación', `<table class="rp-table"><thead><tr><th>Riesgo</th><th>Impacto</th><th>Mitigación sugerida</th></tr></thead><tbody>${x.risks.map(r => `<tr><td><b>${esc(r.text)}</b></td><td>${esc(r.impact || '')}</td><td>${esc(r.mitigation || '')}</td></tr>`).join('')}</tbody></table>`) : ''}
    ${(x.positions || []).length ? sec('Postura de cada participante', `<div class="rp-pos">${x.positions.map(p => `<div><b>${esc(p.person)}</b><p>${esc(p.stance)}</p></div>`).join('')}</div>`) : ''}
    ${(x.pending || []).length ? sec('Temas pendientes y cómo abordarlos', `<div class="rp-list">${x.pending.map(p => `<div class="rp-li"><span class="d" style="background:#2F80ED"></span><div>${esc(p.text)}${p.suggestion ? `<small>Sugerencia: ${esc(p.suggestion)}</small>` : ''}</div></div>`).join('')}</div>`) : ''}
    ${(x.chronology || []).length ? sec('Minuta cronológica', `<div class="rp-chrono">${x.chronology.map(c => `<div><span class="mono">${fmtT(c.t || 0)}</span><p>${esc(c.text)}</p></div>`).join('')}</div>`) : ''}
    ${x.conclusions ? sec('Conclusiones', `<div class="rp-prose">${md(x.conclusions)}</div>`) : ''}
  </div>${repFoot(m, a)}</article>`;
}
function reportByMode(m, a, segs, mode) { if (mode === 'compacto') return compactReportHTML(m, a, segs); if (mode === 'extendido' && a.extended) return extendedReportHTML(m, a, segs); return reportHTML(m, a, segs); }
const EXT_SCHEMA = { type: 'object', properties: {
  executive: { type: 'string', description: 'Resumen ejecutivo de 2 a 4 párrafos: qué se buscaba, qué se discutió, qué se resolvió y qué queda abierto. Markdown simple.' },
  context: { type: 'string', description: 'Contexto y objetivo de la reunión en 1-2 párrafos' },
  topics: { type: 'array', description: 'Cada tema tratado, en orden, con desarrollo completo', items: { type: 'object', properties: { name: { type: 'string' }, start: { type: 'number' }, end: { type: 'number' }, summary: { type: 'string', description: 'Desarrollo del tema en 1 a 3 párrafos: qué se planteó, argumentos, acuerdos y desacuerdos' }, points: { type: 'array', items: { type: 'string' }, description: '3 a 8 puntos concretos' }, voices: { type: 'array', description: 'Qué aportó cada persona en este tema', items: { type: 'object', properties: { who: { type: 'string' }, said: { type: 'string' } }, required: ['who', 'said'] } }, numbers: { type: 'array', items: { type: 'object', properties: { value: { type: 'string' }, label: { type: 'string' } }, required: ['value', 'label'] } } }, required: ['name', 'start', 'end', 'summary', 'points'] } },
  decisions: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, context: { type: 'string' }, proposedBy: { type: 'string' }, t: { type: 'number' } }, required: ['text', 'context'] } },
  actions: { type: 'array', items: { type: 'object', properties: { task: { type: 'string' }, owner: { type: 'string' }, due: { type: 'string' }, detail: { type: 'string', description: 'Qué incluye y cómo saber que está cumplida' } }, required: ['task', 'owner', 'detail'] } },
  risks: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, impact: { type: 'string' }, mitigation: { type: 'string' } }, required: ['text', 'impact', 'mitigation'] } },
  positions: { type: 'array', description: 'Postura, intereses y preocupaciones de cada participante', items: { type: 'object', properties: { person: { type: 'string' }, stance: { type: 'string' } }, required: ['person', 'stance'] } },
  pending: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, suggestion: { type: 'string' } }, required: ['text'] } },
  chronology: { type: 'array', description: 'Minuta cronológica: 10 a 30 hitos con su segundo', items: { type: 'object', properties: { t: { type: 'number' }, text: { type: 'string' } }, required: ['t', 'text'] } },
  conclusions: { type: 'string' }
}, required: ['executive', 'topics', 'decisions', 'actions', 'chronology', 'conclusions'] };
async function generateExtended(m, onProgress) {
  const a = m.analysis; const segs = await getSegments(m.id);
  const system = `Eres un redactor experto de informes de reuniones. Escribes informes extendidos, precisos y muy completos, en español de Chile, para que alguien que no estuvo entienda todo lo que pasó.
Reglas: no inventes nada; usa solo lo dicho. Los tiempos en segundos. Cita quién dijo qué. Sé concreto: cifras, fechas, nombres, argumentos. Las sugerencias y mitigaciones pueden ser tuyas, pero márcalas como sugerencias.${Settings.v.about ? `\nSobre quien grabó: ${Settings.v.about}` : ''}`;
  const user = `Acta ya creada (úsala como guía y amplíala):\n${JSON.stringify({ title: a.title, tldr: a.tldr, topics: a.topics, decisions: a.decisions, actions: a.actions, risks: a.risks, questions: a.questions, numbers: a.numbers })}\n\nParticipantes: ${((a.participants?.length ? a.participants : m.participants) || []).join(', ') || '(no indicados)'}\nFecha: ${m.date}\n\nTranscripción completa:\n${transcriptText(m, segs)}\n\nEscribe el informe extendido llamando a la herramienta guardar_informe una vez.`;
  const r = await claude({ system, messages: [{ role: 'user', content: user }], tools: [{ name: 'guardar_informe', description: 'Guarda el informe extendido', input_schema: EXT_SCHEMA }], tool_choice: { type: 'auto' }, max_tokens: 24000, onProgress, kind: 'informe' });
  let x = r.toolInput;
  if (!x && r.text) { try { const t = r.text; x = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch {} }
  if (!x || !x.topics) throw { message: 'No se pudo crear el informe extendido. Reintenta.' };
  a.extended = x; a.extendedAt = Date.now(); await saveMeeting(m);
  return x;
}

/* Las fuentes van incrustadas en cada imagen/PDF desde los archivos propios de la app.
   Así el texto exportado mide exactamente lo mismo que en pantalla: sin letras cortadas ni textos encimados. */
const FONT_FILES = [['Bricolage Grotesque', '200 800', 'fonts/bricolage.woff2'], ['IBM Plex Sans', '400', 'fonts/plex-sans-400.woff2'], ['IBM Plex Sans', '500', 'fonts/plex-sans-500.woff2'], ['IBM Plex Sans', '600', 'fonts/plex-sans-600.woff2'], ['IBM Plex Sans', '700', 'fonts/plex-sans-700.woff2'], ['IBM Plex Mono', '400', 'fonts/plex-mono-400.woff2'], ['IBM Plex Mono', '500', 'fonts/plex-mono-500.woff2']];
let fontCSSP = null;
function fontEmbedCSS() {
  if (!fontCSSP) fontCSSP = Promise.all(FONT_FILES.map(async ([fam, w, url]) => {
    const b = await fetch(url).then(r => { if (!r.ok) throw new Error(); return r.blob(); });
    const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
    return `@font-face{font-family:"${fam}";font-style:normal;font-weight:${w};src:url(${data}) format("woff2")}`;
  })).then(x => x.join('\n')).catch(() => { fontCSSP = null; return ''; });
  return fontCSSP;
}
let h2iLib = null;
async function loadH2I() {
  if (h2iLib) return h2iLib;
  const raw = window.htmlToImage || await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'h2i.js'; s.onload = () => res(window.htmlToImage); s.onerror = () => rej(new Error('No se pudo cargar el generador de imágenes. Revisa tu conexión.')); document.head.appendChild(s); });
  const css = await fontEmbedCSS();
  try { await document.fonts?.ready; await Promise.all(['400 14px "IBM Plex Sans"', '600 14px "IBM Plex Sans"', '700 14px "IBM Plex Sans"', '700 20px "Bricolage Grotesque"', '400 12px "IBM Plex Mono"'].map(f => document.fonts.load(f))); } catch {}
  const wrap = fn => (node, o = {}) => fn(node, css && !o.skipFonts ? { ...o, fontEmbedCSS: css } : o);
  h2iLib = { toBlob: wrap(raw.toBlob), toJpeg: wrap(raw.toJpeg), toPng: wrap(raw.toPng), toCanvas: wrap(raw.toCanvas) };
  return h2iLib;
}
async function exportReport(m, a, segs, kind = 'png') {
  const btn = $(kind === 'pdf' ? '#rp-pdf' : '#rp-png'); const label = btn?.lastChild?.textContent; if (btn) { btn.disabled = true; btn.lastChild.textContent = 'Generando…'; }
  await Busy.show(kind === 'pdf' ? 'Armando el PDF tamaño carta' : 'Armando la imagen', 'Diagramando el informe…');
  const wrap = document.createElement('div'); wrap.className = 'rep-export'; wrap.innerHTML = reportByMode(m, a, segs, S.repMode || 'normal');
  if (kind === 'pdf') wrap.style.width = PDF_CSS_W + 'px';
  document.body.appendChild(wrap);
  const node = wrap.firstElementChild;
  try {
    const lib = await loadH2I();
    try { await document.fonts?.ready; } catch {}
    const suf = (S.repMode || 'normal') === 'normal' ? '' : '-' + S.repMode;
    let file;
    if (kind === 'pdf') {
      const extra = (S.repMode === 'extendido' && a.mindmap?.branches?.length) ? [await mindmapPage(m, a, lib)] : [];
      const pdf = await reportToLetterPdf(node, lib, a.title || 'Informe', (i, n) => { Busy.step(`Página ${i} de ${n}`, 5 + i / n * 90); }, extra, { fitOne: (S.repMode || 'normal') === 'compacto' });
      file = new File([pdf], slug(a.title) + '-informe' + suf + '.pdf', { type: 'application/pdf' });
    } else {
      const opts = { pixelRatio: 2, backgroundColor: '#ffffff', width: 1080 };
      let out; try { await lib.toBlob(node, opts); out = await lib.toBlob(node, opts); } catch { out = await lib.toBlob(node, { ...opts, skipFonts: true }); }
      if (!out) throw new Error('El navegador no generó la imagen.');
      file = new File([out], slug(a.title) + '-informe' + suf + '.png', { type: 'image/png' });
    }
    Busy.hide(); deliverFile(file, kind === 'pdf' ? 'Informe en PDF' : 'Informe en imagen');
  } catch (e) { toast('No se pudo crear el archivo: ' + (e.message || 'error'), 5000); }
  finally { Busy.hide(); wrap.remove(); if (btn) { btn.disabled = false; btn.lastChild.textContent = label; } }
}

/* Documentos en PDF (resumen, brief, transcripción) con el mismo encabezado y diseño que los informes */
function docArticle(m, a, label, body) {
  return `<article class="rep doc-rep"${Settings.v.brandColor ? ` style="--brand:${esc(Settings.v.brandColor)}"` : ''}>${repHead(m, a, label)}<div class="rp-body doc-body">${body}</div>${repFoot(m, a)}</article>`;
}
function transcriptDocHTML(m, segs) {
  return `<div class="doc-tx">${segs.map(x => `<div class="tx-line"><span class="t">${fmtT(x.t)}</span><p>${x.s ? `<b>${esc(spkName(m, x.s))}:</b> ` : ''}${esc(x.text)}</p></div>`).join('')}</div>`;
}
async function htmlPdfBlob(html, title, onPage, extraFn) {
  const wrap = document.createElement('div'); wrap.className = 'rep-export'; wrap.style.width = PDF_CSS_W + 'px';
  wrap.innerHTML = html; document.body.appendChild(wrap);
  try { const lib = await loadH2I(); const extra = extraFn ? (await extraFn(lib) || []) : []; return await reportToLetterPdf(wrap.firstElementChild, lib, title || 'Acta', onPage, extra); }
  finally { wrap.remove(); }
}
async function reportPdfBlob(m, a, segs, mode, onPage) {
  const wrap = document.createElement('div'); wrap.className = 'rep-export'; wrap.style.width = PDF_CSS_W + 'px';
  wrap.innerHTML = reportByMode(m, a, segs, mode); document.body.appendChild(wrap);
  try { const lib = await loadH2I(); const extra = (mode === 'extendido' && a.mindmap?.branches?.length) ? [await mindmapPage(m, a, lib)] : []; return await reportToLetterPdf(wrap.firstElementChild, lib, a.title || 'Informe', onPage, extra, { fitOne: mode === 'compacto' }); }
  finally { wrap.remove(); }
}
function transcriptTxt(m, segs) {
  const a = m.analysis || {};
  const head = [a.title || m.titleHint || 'Reunión', fmtDate(m.date) + (m.durationSec ? ' · ' + fmtT(m.durationSec) : ''), ''];
  return head.concat(segs.map(x => `[${fmtT(x.t)}] ${x.s ? spkName(m, x.s) + ': ' : ''}${x.text}`)).join('\n');
}
/* Cuadro de carga a pantalla completa para tareas largas (exportar, respaldar, importar) */
const Busy = {
  el: null, t0: 0,
  show(title, sub = '') {
    this.hide(); this.t0 = Date.now();
    const d = document.createElement('div'); d.className = 'busy'; d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-live', 'polite');
    d.innerHTML = `<div class="busy-card"><div class="busy-spin" aria-hidden="true"></div><h3>${esc(title)}</h3><p class="busy-step">${esc(sub)}</p><div class="busy-bar"><i style="width:3%"></i></div><p class="busy-sub"></p><p class="busy-note">No cierres la app ni bloquees el teléfono.</p></div>`;
    document.body.appendChild(d); this.el = d; Wake.on();
    return new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));
  },
  step(text, pct) { if (!this.el) return; if (text != null) $('.busy-step', this.el).textContent = text; if (pct != null) $('.busy-bar i', this.el).style.width = Math.max(3, Math.min(100, pct)) + '%'; $('.busy-sub', this.el).textContent = ''; return new Promise(r => setTimeout(r, 16)); },
  sub(text) { if (this.el) $('.busy-sub', this.el).textContent = text || ''; },
  hide() { this.el?.remove(); this.el = null; Wake.off(); }
};
/* Mantiene la pantalla encendida mientras trabaja */
const Wake = { lock: null, async on() { try { if ('wakeLock' in navigator && Rec.state === 'idle') this.lock = await navigator.wakeLock.request('screen'); } catch {} }, off() { try { if (Rec.state === 'idle') this.lock?.release(); } catch {} this.lock = null; } };

/* Descarga todo lo de una reunión en un solo .zip, ordenado y listo para abrir.
   El mismo archivo se puede volver a importar en Acta (trae respaldo.json). */
async function exportEverything(m) {
  const a = m.analysis || {}; const base = slug(a.title || m.titleHint || 'reunion'); const files = []; const map = {};
  const say = (t, pct) => Busy.step(t, pct); const pg = (i, n) => Busy.sub(`Página ${i} de ${n}`);
  await Busy.show('Preparando todo de la reunión', 'Empezando…');
  try {
    const segs = await getSegments(m.id);
    if (m.analysis) {
      await say('Informe en PDF', 5); files.push([`${base}/01-informe.pdf`, new Uint8Array(await (await reportPdfBlob(m, a, segs, 'normal', pg)).arrayBuffer())]);
      if (a.extended) { await say('Informe extendido en PDF', 25); files.push([`${base}/02-informe-extendido.pdf`, new Uint8Array(await (await reportPdfBlob(m, a, segs, 'extendido', pg)).arrayBuffer())]); }
      await say('Acta en Word', 42); files.push([`${base}/03-acta.docx`, new Uint8Array(await (await meetingDocx(m)).arrayBuffer())]);
      await say('Resumen en PDF', 48);
      const sumMd = (await fullMd(m, { transcript: false, brief: false, mindmap: false })).split('\n'); const from = sumMd.findIndex(l => /^## /.test(l));
      const pdfOf = async (label, body, extraFn) => new Uint8Array(await (await htmlPdfBlob(docArticle(m, a, label, body), a.title, pg, extraFn)).arrayBuffer());
      const mmExtra = a.mindmap?.branches?.length ? async lib => [await mindmapPage(m, a, lib)] : null;
      files.push([`${base}/04-resumen.pdf`, await pdfOf('Resumen completo', `<div class="doc-md">${md(sumMd.slice(from < 0 ? 0 : from).join('\n').replace(/^- \[ \] /gm, '- ☐ ').replace(/^- \[x\] /gm, '- ☑ '))}${mmExtra ? '<p class="doc-note">El mapa mental va dibujado en la última página.</p>' : ''}</div>`, mmExtra)]);
      if (mmExtra) { await say('Mapa mental en PDF', 61); files.push([`${base}/08-mapa-mental.pdf`, new Uint8Array(await (await mindmapPdfBlob(m, a)).arrayBuffer())]); }
      if (a.brief) { await say('Brief en PDF', 58); } if (a.brief) files.push([`${base}/05-brief.pdf`, await pdfOf('Brief', `<div class="doc-md">${md(String(a.brief).replace(/^# .*\n?/, ''))}</div>`)]);
      if (a.study) { await say('Apuntes de clase en PDF', 60); const st = a.study;
        const html = `${(st.exam || []).length ? `<h2>Entra en la prueba</h2><ul>${st.exam.map(x => `<li>${esc(x.text)}</li>`).join('')}</ul>` : ''}${st.notes ? `<h2>Apuntes</h2>${md(st.notes)}` : ''}${(st.glossary || []).length ? `<h2>Glosario</h2><table class="rp-table"><thead><tr><th>Concepto</th><th>Definición</th></tr></thead><tbody>${st.glossary.map(g => `<tr><td><b>${esc(g.term)}</b></td><td>${esc(g.def)}</td></tr>`).join('')}</tbody></table>` : ''}${(st.flashcards || []).length ? `<h2>Tarjetas de repaso</h2><table class="rp-table"><thead><tr><th>Pregunta</th><th>Respuesta</th></tr></thead><tbody>${st.flashcards.map(c => `<tr><td>${esc(c.q)}</td><td>${esc(c.a)}</td></tr>`).join('')}</tbody></table>` : ''}`;
        files.push([`${base}/05-apuntes.pdf`, await pdfOf('Apuntes de clase', `<div class="doc-md">${html}</div>`)]); }
      const evs = []; (a.actions || []).forEach(t => { if (t.done) return; const d = taskDate(t, m); if (d) evs.push(taskEvent(m, t, d)); });
      if (evs.length) files.push([`${base}/07-tareas-calendario.ics`, buildICS(evs)]);
    }
    if (segs.length) { await say('Transcripción en PDF', 64); files.push([`${base}/06-transcripcion.pdf`, new Uint8Array(await (await htmlPdfBlob(docArticle(m, a.title ? a : { ...a, title: m.titleHint || 'Reunión' }, 'Transcripción', transcriptDocHTML(m, segs)), a.title || m.titleHint, pg)).arrayBuffer())]); }
    await say('Audio y fotos', 80);
    const parts = m.audioParts || [];
    for (const [i, p] of parts.entries()) { const b = await DB.get('audio', p.key); if (!b) continue; const path = `${base}/audio/${base}${parts.length > 1 ? '-parte-' + (i + 1) : ''}.${extFor(b.type)}`; files.push([path, new Uint8Array(await b.arrayBuffer())]); map[p.key] = path; }
    for (const [i, ph] of (m.photos || []).entries()) { const b = ph.key && await DB.get('photos', ph.key); if (!b) continue; const path = `${base}/fotos/foto-${String(i + 1).padStart(2, '0')}${ph.t != null ? '-' + fmtT(ph.t).replace(/:/g, 'm') : ''}.${/png/.test(b.type) ? 'png' : 'jpg'}`; files.push([path, new Uint8Array(await b.arrayBuffer())]); map[ph.key] = path; }
    await say('Empaquetando', 93);
    const t = segs.length ? { [m.id]: segs } : {};
    files.push(['respaldo.json', JSON.stringify({ app: 'acta', version: 2, exportedAt: new Date().toISOString(), meetings: [m], transcripts: t, files: map })]);
    files.push([`${base}/LEEME.txt`, `${a.title || 'Reunión'}\n\n01-informe.pdf: informe visual, tamaño carta\n02-informe-extendido.pdf: informe con todo el detalle (si se creó)\n03-acta.docx: acta completa para editar en Word\n04-resumen.pdf: resumen, decisiones, tareas, ideas y riesgos\n05-brief.pdf: brief del proyecto (si existe)\n05-apuntes.pdf: apuntes, glosario y tarjetas (en clases)\n06-transcripcion.pdf: transcripción con hablantes y minuto\n07-tareas-calendario.ics: tareas con fecha para el calendario\n08-mapa-mental.pdf: el mapa mental dibujado, en hoja horizontal\naudio/ y fotos/: la grabación original y las fotos\n\nPara volver a cargar esta reunión en Acta: Ajustes > Importar respaldo y elige este .zip tal como está.\n`]);
    const zip = new File([zipStore(files)], `${base}-todo.zip`, { type: 'application/zip' });
    await say('¡Listo!', 100); Busy.hide();
    deliverFile(zip, 'Todo de la reunión');
  } catch (e) { Busy.hide(); toast('No se pudo armar el paquete: ' + (e.message || 'error'), 6000); }
}
/* ---------- PDF tamaño carta, con cortes de página que no parten tarjetas, filas ni párrafos ---------- */
const PDF_CSS_W = 760;                                   /* ancho al que se diagrama el informe para papel */
const LETTER = { w: 612, h: 792, mx: 40, mt: 40, mb: 48 }; /* puntos (1/72"): carta 8,5 × 11" */
const LETTER_H = { w: 792, h: 612, mx: 36, mt: 32, mb: 46 };  /* carta horizontal, para el mapa mental */
const MM_CSS_W = 1040;
function mindmapPageHTML(m, a) {
  return `<div class="mmp"><div class="mmp-h"><div><span class="mmp-k">Mapa mental</span><b>${esc(a.title || m.titleHint || 'Reunión')}</b></div><span>${esc(fmtDate(m.date))}</span></div><div class="mmp-svg">${mindmapSVG(a.mindmap, 1.3)}</div></div>`;
}
/* Página horizontal con el mapa mental dibujado, lista para sumarse a cualquier PDF */
async function mindmapPage(m, a, lib) {
  if (!a?.mindmap?.branches?.length) return null;
  const host = document.createElement('div'); host.className = 'rep-export'; host.style.width = MM_CSS_W + 'px';
  host.innerHTML = mindmapPageHTML(m, a); document.body.appendChild(host);
  try {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const node = host.firstElementChild; const h = Math.ceil(node.getBoundingClientRect().height);
    const o = { pixelRatio: 2, backgroundColor: '#ffffff', width: MM_CSS_W, height: h, quality: .92 };
    let url; try { url = await lib.toJpeg(node, o); } catch { url = await lib.toJpeg(node, { ...o, skipFonts: true }); }
    const cw = LETTER_H.w - 2 * LETTER_H.mx; return { url, h: h * cw / MM_CSS_W, L: LETTER_H };
  } finally { host.remove(); }
}
async function exportMindmap(m) {
  const a = m.analysis || {};
  await Busy.show('Dibujando el mapa mental', 'Armando el PDF…');
  try { const pdf = await mindmapPdfBlob(m, a); Busy.hide(); deliverFile(new File([pdf], slug(a.title || 'reunion') + '-mapa-mental.pdf', { type: 'application/pdf' }), 'Mapa mental en PDF'); }
  catch (e) { Busy.hide(); toast('No se pudo crear el mapa: ' + (e.message || 'error'), 5000); }
}
async function mindmapPdfBlob(m, a) { const lib = await loadH2I(); const pg = await mindmapPage(m, a, lib); if (!pg) throw new Error('Esta reunión no tiene mapa mental'); return imagesToPdf([pg], a.title || 'Mapa mental'); }
function pageBreaks(node, pageCss, opts = {}) {
  const base = node.getBoundingClientRect().top; const total = Math.ceil(node.scrollHeight);
  if (opts.fitOne && total <= pageCss * 1.35) return [[0, total]];
  /* hard: nunca cortar aquí (dentro de una línea de texto, una imagen o un gráfico) · soft: mejor no cortar (filas, tarjetas chicas, títulos con lo que sigue) */
  const hard = new Uint8Array(total + 2), soft = new Uint8Array(total + 2);
  const mark = (arr, t, b) => { t = Math.max(0, Math.round(t) + 1); b = Math.min(total, Math.round(b) - 1); for (let y = t; y <= b; y++) arr[y] = 1; };
  const tw = document.createTreeWalker(node, NodeFilter.SHOW_TEXT); const rg = document.createRange();
  for (let tn = tw.nextNode(); tn; tn = tw.nextNode()) { if (!tn.nodeValue.trim()) continue; rg.selectNodeContents(tn); for (const r of rg.getClientRects()) if (r.height > 1) mark(hard, r.top - base, r.bottom - base); }
  node.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect(); if (r.height < 2) return;
    const t = r.top - base, b = r.bottom - base, tag = el.tagName, cls = String(el.className?.baseVal ?? el.className ?? '');
    if ((tag === 'svg' || tag === 'IMG' || tag === 'CANVAS') && r.height <= pageCss * .95) mark(hard, t, b);
    /* un título nunca queda solo al final de la página: va pegado a lo que sigue */
    if ((/^H[1-4]$/.test(tag) || /(^|[-_\s])(title|eyebrow|tx-h)([-_\s]|$)/i.test(cls)) && r.height < 80) mark(soft, t, Math.min(b + 90, total));
    const atomic = tag === 'TR' || tag === 'LI' || tag === 'FIGURE' || el.querySelector?.('svg,img,canvas') || r.height <= pageCss * .5;
    if (atomic && r.height <= pageCss * .92) mark(soft, t, b);
  });
  const cuts = []; let y = 0;
  while (y < total - 4) {
    const ideal = y + pageCss;
    if (ideal >= total) { cuts.push([y, total]); break; }
    let c = ideal; const floor = y + pageCss * .45;
    while (c > floor && (soft[c] || hard[c])) c--;
    if (c <= floor) { c = ideal; const floor2 = y + pageCss * .2; while (c > floor2 && hard[c]) c--; if (c <= floor2) c = ideal; }
    cuts.push([y, c]); y = c;
  }
  /* un resto chico (por ejemplo, solo el pie del informe) se junta con la página anterior, reduciéndola apenas */
  const n = cuts.length;
  if (n > 1) { const last = cuts[n - 1], prev = cuts[n - 2]; if (last[1] - last[0] < pageCss * .12 && last[1] - prev[0] <= pageCss * 1.06) { prev[1] = last[1]; cuts.pop(); } }
  return cuts;
}
async function reportToLetterPdf(node, lib, title, onPage, extra = [], opts = {}) {
  const L = LETTER, cw = L.w - 2 * L.mx, k = cw / PDF_CSS_W, pageCss = Math.floor((L.h - L.mt - L.mb) / k);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const cuts = pageBreaks(node, pageCss, opts); const imgs = [];
  for (let i = 0; i < cuts.length; i++) {
    onPage && onPage(i + 1, cuts.length);
    const [y0, y1] = cuts[i]; const h = Math.max(1, y1 - y0);
    const host = document.createElement('div'); host.className = 'rep-export'; host.style.width = PDF_CSS_W + 'px';
    const clip = document.createElement('div'); clip.style.cssText = `width:${PDF_CSS_W}px;height:${h}px;overflow:hidden;background:#fff;position:relative`;
    const c = node.cloneNode(true); c.style.marginTop = (-y0) + 'px'; clip.appendChild(c); host.appendChild(clip); document.body.appendChild(host);
    try {
      const o = { pixelRatio: 2, backgroundColor: '#ffffff', width: PDF_CSS_W, height: h, quality: .92 };
      let url; try { if (!i) await lib.toJpeg(clip, o); url = await lib.toJpeg(clip, o); } catch { url = await lib.toJpeg(clip, { ...o, skipFonts: true }); }
      imgs.push({ url, h: h * k });
    } finally { host.remove(); }
  }
  return imagesToPdf(imgs.concat(extra), title);
}
/* Arma el PDF a mano: una imagen por página, márgenes y pie con título y número de página */
async function imagesToPdf(imgs, title) {
  const n = imgs.length;
  const enc = new TextEncoder(); const parts = []; const offs = []; let len = 0;
  const add = x => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); len += u.length; };
  const obj = (num, body) => { offs[num] = len; add(`${num} 0 obj\n`); body(); add('\nendobj\n'); };
  const pstr = t => '(' + [...String(t)].map(ch => { const c = ch.charCodeAt(0); if (ch === '(' || ch === ')' || ch === '\\') return '\\' + ch; if (c < 32) return ' '; if (c < 128) return ch; if (c < 256) return '\\' + c.toString(8).padStart(3, '0'); return ch === '—' || ch === '–' ? '-' : ch === '’' || ch === '‘' ? "'" : ch === '“' || ch === '”' ? '"' : '?'; }).join('') + ')';
  const short = String(title).length > 80 ? String(title).slice(0, 78) + '…'.replace('…', '...') : String(title);
  add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  /* 1 catálogo, 2 páginas, 3 fuente; por página: imagen, página, contenido */
  const kids = imgs.map((_, i) => `${5 + i * 3} 0 R`);
  obj(1, () => add('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => add(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${n} >>`));
  obj(3, () => add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
  for (let i = 0; i < n; i++) {
    const im = imgs[i]; const io = 4 + i * 3, po = io + 1, co = io + 2;
    const bin = atob(im.url.split(',')[1]); const jpg = Uint8Array.from(bin, ch => ch.charCodeAt(0));
    const el = await new Promise((res, rej) => { const x = new Image(); x.onload = () => res(x); x.onerror = rej; x.src = im.url; });
    obj(io, () => { add(`<< /Type /XObject /Subtype /Image /Width ${el.naturalWidth} /Height ${el.naturalHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); add(jpg); add('\nendstream'); });
    const L = im.L || LETTER, cw = L.w - 2 * L.mx;
    const avail = L.h - L.mt - L.mb, f = Math.min(1, avail / im.h), iw = cw * f, ih = im.h * f, ix = L.mx + (cw - iw) / 2;
    const y = L.h - L.mt - ih; const pg = `P\\341gina ${i + 1} de ${n}`;
    const cs = `q ${iw.toFixed(2)} 0 0 ${ih.toFixed(2)} ${ix.toFixed(2)} ${y.toFixed(2)} cm /Im${i} Do Q\n` +
      `0.88 0.89 0.92 RG 0.6 w ${L.mx} ${L.mb - 14} m ${L.w - L.mx} ${L.mb - 14} l S\n` +
      `BT /F1 8 Tf 0.45 0.47 0.53 rg ${L.mx} ${L.mb - 27} Td ${pstr(short)} Tj ET\n` +
      `BT /F1 8 Tf 0.45 0.47 0.53 rg ${(L.w - L.mx - (12 + String(i + 1).length + String(n).length) * 4.1).toFixed(2)} ${L.mb - 27} Td (${pg}) Tj ET`;
    obj(po, () => add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${L.w} ${L.h}] /Resources << /XObject << /Im${i} ${io} 0 R >> /Font << /F1 3 0 R >> >> /Contents ${co} 0 R >>`));
    obj(co, () => add(`<< /Length ${enc.encode(cs).length} >>\nstream\n${cs}\nendstream`));
  }
  const xref = len; const count = 4 + n * 3;
  add(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) add(String(offs[i]).padStart(10, '0') + ' 00000 n \n');
  add(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}

/* =========================================================
   Usage & balance (estimated, per provider)
   ========================================================= */
const PRICES = { 'claude-sonnet-5-5': { in: 2, out: 10 }, 'claude-opus-5-5': { in: 4, out: 20 }, 'claude-haiku-5-5': { in: 0.10, out: 0.50 } };
const STT_PER_MIN = 0.006;
const money = v => 'US$' + (Math.round(v * 100) / 100).toFixed(2);
const Usage = {
  v: null,
  load() {
    try { this.v = JSON.parse(localStorage.getItem('acta:usage') || 'null'); } catch {}
    if (!this.v || !this.v.anthropic) this.v = { anthropic: { balance: 5, setAt: Date.now(), log: [] }, openai: { balance: 5, setAt: Date.now(), log: [] } };
    return this;
  },
  save() { try { localStorage.setItem('acta:usage', JSON.stringify(this.v)); } catch {} },
  add(p, cost, kind) { if (!(cost > 0)) return; const b = this.v[p]; b.log.push({ t: Date.now(), c: +cost.toFixed(6), k: kind }); if (b.log.length > 800) b.log = b.log.slice(-800); this.save(); $$('[data-left="' + p + '"]').forEach(el => el.textContent = money(this.left(p))); },
  spent(p) { const b = this.v[p]; return b.log.filter(x => x.t >= b.setAt).reduce((a, x) => a + x.c, 0); },
  spentAll(p) { return this.v[p].log.reduce((a, x) => a + x.c, 0); },
  left(p) { return Math.max(0, this.v[p].balance - this.spent(p)); },
  set(p, balance) { this.v[p].balance = Math.max(0, +balance || 0); this.v[p].setAt = Date.now(); this.save(); },
  topup(p, amt) { const l = this.left(p); this.v[p].balance = l + Math.max(0, +amt || 0); this.v[p].setAt = Date.now(); this.save(); },
  avg(p, kind, def) { const l = this.v[p].log.filter(x => x.k === kind).slice(-10); return l.length ? l.reduce((a, x) => a + x.c, 0) / l.length : def; },
  count(p, kind) { return this.v[p].log.filter(x => x.k === kind).length; }
}.load();
function walletHTML(p) {
  const isA = p === 'anthropic';
  const b = Usage.v[p], left = Usage.left(p), spent = Usage.spent(p), pct = b.balance ? left / b.balance : 0;
  const color = pct < .2 ? '#FF6B6B' : isA ? '#FF7A45' : '#5AD8FF';
  const est = isA ? `≈ <b>${Math.floor(left / Usage.avg('anthropic', 'acta', 0.1))}</b> actas más (promedio ${money(Usage.avg('anthropic', 'acta', 0.1))} c/u)` : `≈ <b>${(left / (STT_PER_MIN * 60)).toFixed(1).replace('.', ',')} h</b> de transcripción (US$0,36 por hora)`;
  return `<div class="wcard">
    <div class="wh"><b>${isA ? 'Claude · Anthropic' : 'OpenAI'}</b><span class="chip ${pct < .2 ? 'err' : ''}">${isA ? 'Actas y preguntas' : 'Transcripción'}</span></div>
    <div class="wnum">${ringSVG(pct, color, 64, 7)}<div><div class="big" data-left="${p}">${money(left)}</div><small>quedan de ${money(b.balance)} · usado ${money(spent)}</small></div></div>
    <div class="wfoot"><span>${est}</span><span>Desde ${esc(new Date(b.setAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }))} · ${Usage.v[p].log.filter(x => x.t >= b.setAt).length} usos registrados</span></div>
    <div class="wact">
      <div class="wform"><input id="w-${p}-val" inputmode="decimal" placeholder="${left.toFixed(2)}" aria-label="Saldo real en dólares"><button class="btn sm" data-wset="${p}">Ajustar saldo</button></div>
      <div class="wform"><input id="w-${p}-top" inputmode="decimal" placeholder="5" aria-label="Monto recargado"><button class="btn sm" data-wtop="${p}">Sumé recarga</button></div>
    </div>
    <a href="${isA ? 'https://platform.claude.com/settings/billing' : 'https://platform.openai.com/settings/organization/billing/overview'}" target="_blank" rel="noopener">Ver saldo real en la consola ↗</a>
  </div>`;
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
async function fullMd(m, { transcript = true, brief = true, mindmap = true } = {}) {
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
  if (a.mindmap && mindmap) { L.push('## Mapa mental', '', `- **${a.mindmap.center}**`); a.mindmap.branches.forEach(b => { L.push(`  - ${b.label}`); b.children.forEach(c => L.push(`    - ${c}`)); }); L.push(''); }
  if (a.brief && brief) L.push('---', '', a.brief.replace(/^# /m, '## Brief: '), '');
  if (segs.length && transcript) { L.push('---', '', '## Transcripción', ''); segs.forEach(x => L.push(`\`${fmtT(x.t)}\` ${x.s ? `**${spkName(m, x.s)}:** ` : ''}${x.text}  `)); }
  return L.join('\n');
}
function downloadText(name, text, type = 'text/markdown') { deliverFile(new File([text], name, { type: type + ';charset=utf-8' }), name); }
function _oldDownloadText(name, text, type = 'text/markdown') {
  const blob = new Blob([text], { type: type + ';charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
async function shareText(title, text) {
  if (navigator.share) { try { await navigator.share({ title, text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  copyText(text, 'Copiado para compartir');
}
async function shareMeeting(m) { shareText(m.analysis.title, summaryText(m)); }
function copyText(text, ok) { try { navigator.clipboard.writeText(text).then(() => toast(ok), () => fallbackCopy(text, ok)); } catch { fallbackCopy(text, ok); } }
function fallbackCopy(text, ok) { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); let r = false; try { r = document.execCommand('copy'); } catch {} ta.remove(); toast(r ? ok : 'No se pudo copiar'); }
function md(src) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*\w])\*(?![\s*])([^*\n]+?)\*(?![*\w])/g, '$1<em>$2</em>').replace(/\^\(([^)]{1,14})\)/g, '<sup>$1</sup>').replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1<em>$2</em>').replace(/`(.+?)`/g, '<code class="mono">$1</code>');
  let html = '', inList = false;
  String(src).split('\n').forEach(line => {
    const l = line.trimEnd(); const li = l.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
    if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(li[1])}</li>`; return; }
    if (inList) { html += '</ul>'; inList = false; }
    const bq = l.match(/^\s*>\s?(.*)$/); if (bq) { html += `<blockquote>${inline(bq[1])}</blockquote>`; return; }
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
  const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return isoD(d); };
  const d1 = ago(7), d2 = today();
  analysis.actions[0].dueDate = parseDue('viernes', d1); Object.assign(analysis.actions[0], { t: 204, quote: 'Sí, el viernes lo envío con el detalle por etapa.' }); Object.assign(analysis.actions[1], { t: 250, quote: 'Sí, el miércoles te los mando.' }); Object.assign(analysis.actions[2], { t: 238, quote: 'Yo me encargo del diseño.' }); analysis.actions[1].dueDate = parseDue('miércoles', d1); analysis.actions[1].done = true;
  analysis.followUp = { whatsapp: `Hola Camila y Diego, les dejo lo que acordamos hoy para la *app de reservas*:\n\n*Acuerdos*\n• Versión 1 como web app instalable, con agenda por profesional\n• Recordatorios por WhatsApp desde la v1\n• El abono queda para la v2\n• Lanzamiento meta: 15 de noviembre\n\n*Tareas*\n• Diego: presupuesto por etapa (viernes)\n• Camila: fotos y logo (miércoles)\n• Yo: diseño con la identidad del local\n\nSi algo no quedó bien, me avisan. ¡Gracias!`, emailSubject: 'Acuerdos: app de reservas para la peluquería', emailBody: `Hola Camila y Diego:\n\nLes envío el resumen de nuestra reunión sobre la app de reservas.\n\nAcuerdos:\n- La versión 1 será una web app instalable, con agenda por profesional.\n- Los recordatorios por WhatsApp entran en la v1 (aprox. $30.000 al mes).\n- El cobro de abono queda para la v2.\n- Lanzamiento meta: 15 de noviembre.\n\nTareas:\n- Diego: presupuesto final con detalle por etapa, el viernes.\n- Camila: fotos de cortes y logo, el miércoles.\n- Yo: diseño de la interfaz con la identidad del local.\n\nQuedo atento a cualquier comentario.\n\nSaludos.` };
  analysis.ficha = [];
  await DB.put('transcripts', { segments: segs }, id);
  await saveMeeting({ id, createdAt: Date.now() - 7 * 86400000, date: d1, durationSec: 350, participants: ['Camila', 'Diego', 'Tú'], template: 'proyecto', project: 'Peluquería Camila', context: 'Primera reunión para definir la app de reservas.', notes: '', notesLog: [{ t: 95, text: 'Preguntar costo exacto de WhatsApp Business' }], marks: [{ t: 140, label: 'Decisión WhatsApp' }], photos: [], audioParts: [], speakers: {}, status: 'ready', words: wordCount(segs), analysis });
  const id2 = 'ejemplo-' + uid();
  const tx2 = `[0:00] Tú: Retomemos lo de la semana pasada. Camila, gracias por las fotos y el logo, ya están en el diseño.\n[0:14] Diego: El presupuesto lo mando mañana, me faltó cotizar el envío de WhatsApp con el proveedor nuevo.\n[0:35] Camila: Les cuento que los sábados ahora somos cinco, entró una colorista.\n[0:52] Tú: Perfecto, la agenda por profesional ya lo soporta. Lo dejo configurado con cinco.\n[1:10] Diego: Propongo hacer una prueba con diez clientas reales antes del lanzamiento.\n[1:25] Camila: Buenísimo, yo elijo a las clientas. Les aviso el lunes.\n[1:40] Tú: Entonces decidimos piloto con diez clientas la primera semana de noviembre.`;
  const segs2 = parseTranscript(tx2).segments;
  const a2 = { title: 'Revisión de avance: app de reservas', tldr: 'El diseño ya usa las fotos y el logo de Camila. El presupuesto de Diego se atrasa un día por la cotización de WhatsApp. Se decidió un piloto con diez clientas reales la primera semana de noviembre.', mood: { label: 'En marcha', score: 74, note: 'Avance concreto y un atraso menor.' }, tags: ['ejemplo', 'seguimiento'], participants: ['Tú', 'Camila', 'Diego'], speakers: [],
    keyPoints: [{ title: 'Diseño con marca', detail: 'Fotos y logo ya integrados.', icon: 'design' }, { title: 'Presupuesto atrasado', detail: 'Falta cotizar WhatsApp con un proveedor nuevo.', icon: 'money' }, { title: 'Equipo de sábado', detail: 'Ahora son cinco con la nueva colorista.', icon: 'people' }],
    topics: [{ name: 'Avance', start: 0, end: 35, summary: 'Diseño y presupuesto.' }, { name: 'Equipo', start: 35, end: 70, summary: 'Cinco profesionales los sábados.' }, { name: 'Piloto', start: 70, end: 110, summary: 'Prueba con clientas reales.' }],
    decisions: [{ text: 'Piloto con diez clientas reales la primera semana de noviembre', why: 'Probar antes del lanzamiento' }],
    actions: [{ id: uid(), task: 'Enviar presupuesto con la cotización de WhatsApp', owner: 'Diego', due: 'mañana', dueDate: parseDue('mañana', d2), t: 14, quote: 'El presupuesto lo mando mañana.', priority: 'alta', done: false }, { id: uid(), task: 'Elegir las diez clientas del piloto', owner: 'Camila', due: 'lunes', dueDate: parseDue('lunes', d2), t: 85, quote: 'Yo elijo a las clientas. Les aviso el lunes.', priority: 'media', done: false }, { id: uid(), task: 'Configurar la agenda con cinco profesionales los sábados', owner: 'Tú', due: '', dueDate: '', priority: 'media', done: false }],
    ideas: [], risks: [{ text: 'El atraso del presupuesto puede mover el inicio del desarrollo', severity: 'baja' }], questions: [], numbers: [{ value: '10', label: 'clientas en el piloto' }, { value: '5', label: 'profesionales los sábados' }], quotes: [{ text: 'Yo elijo a las clientas. Les aviso el lunes.', who: 'Camila', t: 85 }],
    mindmap: { center: 'Avance', branches: [{ label: 'Hecho', children: ['Fotos y logo'] }, { label: 'Atrasado', children: ['Presupuesto'] }, { label: 'Nuevo', children: ['Piloto 10 clientas', 'Colorista sábados'] }] },
    nextSteps: ['Recibir presupuesto', 'Elegir clientas', 'Lanzar piloto'], brief: '', ficha: [], corrections: [],
    continuity: 'Se cumplió la entrega de fotos y logo y el diseño avanzó. El presupuesto sigue pendiente, ahora para mañana. Lo nuevo: un piloto con clientas reales y un quinto profesional los sábados.',
    previousTasks: [{ ref: id + '|0', status: 'en curso', note: 'Llega mañana' }, { ref: id + '|1', status: 'hecha', note: '' }, { ref: id + '|2', status: 'en curso', note: 'Ya usa las fotos y el logo' }],
    followUp: { whatsapp: 'Hola Camila y Diego, resumen de hoy:\n\n*Avance*\n• Diseño ya con fotos y logo ✅\n• Presupuesto: llega mañana\n\n*Nuevo acuerdo*\n• Piloto con 10 clientas la primera semana de noviembre\n\n*Tareas*\n• Diego: presupuesto (mañana)\n• Camila: elegir clientas (lunes)\n• Yo: agenda con 5 profesionales los sábados', emailSubject: 'Avance app de reservas y piloto', emailBody: 'Hola Camila y Diego:\n\nResumen de la revisión de avance.\n\n- El diseño ya incorpora fotos y logo.\n- Diego envía el presupuesto mañana.\n- Acordamos un piloto con diez clientas la primera semana de noviembre.\n\nSaludos.' } };
  await DB.put('transcripts', { segments: segs2 }, id2);
  await saveMeeting({ id: id2, createdAt: Date.now() - 3600000, date: d2, durationSec: 110, participants: ['Camila', 'Diego', 'Tú'], template: 'uno', project: 'Peluquería Camila', context: '', notes: '', notesLog: [], marks: [], photos: [], audioParts: [], speakers: {}, status: 'ready', words: wordCount(segs2), analysis: a2 });
  const id3 = 'ejemplo-' + uid();
  const tx3 = `[0:00] Profesora: Hoy vemos flujo en canales abiertos. La ecuación clave es la de Manning.\n[0:20] Profesora: Velocidad igual a uno sobre n, por el radio hidráulico elevado a dos tercios, por la raíz de la pendiente.\n[0:48] Profesora: El radio hidráulico es el área mojada dividida por el perímetro mojado. Esto entra en la prueba, anótenlo.\n[1:15] Tú: ¿Y el n de Manning de qué depende?\n[1:22] Profesora: De la rugosidad del material. Hormigón liso anda cerca de 0,013; un canal de tierra, 0,025 o más.\n[1:50] Profesora: Para la próxima clase lean el capítulo 4. La prueba es el 28 de octubre.`;
  const segs3 = parseTranscript(tx3).segments;
  const a3 = { title: 'Clase: flujo en canales abiertos', tldr: 'Se presentó la ecuación de Manning para calcular la velocidad en canales abiertos, el radio hidráulico y cómo la rugosidad define el coeficiente n. La prueba es el 28 de octubre.', mood: { label: 'Clara', score: 80, note: 'Clase expositiva con una pregunta del curso.' }, tags: ['ejemplo', 'hidráulica'], participants: ['Profesora', 'Tú'], speakers: [],
    keyPoints: [{ title: 'Ecuación de Manning', detail: 'V = (1/n)·R^(2/3)·S^(1/2).', icon: 'tech' }, { title: 'Radio hidráulico', detail: 'Área mojada dividida por perímetro mojado.', icon: 'target' }, { title: 'Rugosidad', detail: 'Hormigón liso n≈0,013; tierra n≈0,025.', icon: 'design' }],
    topics: [{ name: 'Manning', start: 0, end: 48, summary: 'La ecuación.' }, { name: 'Radio hidráulico', start: 48, end: 75, summary: 'Definición.' }, { name: 'Coeficiente n', start: 75, end: 110, summary: 'Rugosidad.' }, { name: 'Cierre', start: 110, end: 130, summary: 'Lectura y prueba.' }],
    decisions: [], actions: [{ id: uid(), task: 'Leer el capítulo 4', owner: 'Tú', due: 'próxima clase', dueDate: '', priority: 'media', done: false }, { id: uid(), task: 'Estudiar para la prueba', owner: 'Tú', due: '28 de octubre', dueDate: parseDue('28 de octubre', today()), priority: 'alta', done: false }],
    ideas: [], risks: [], questions: [], numbers: [{ value: '0,013', label: 'n hormigón liso' }, { value: '0,025', label: 'n canal de tierra' }, { value: '28 oct', label: 'prueba' }], quotes: [{ text: 'Esto entra en la prueba, anótenlo.', who: 'Profesora', t: 48 }],
    mindmap: { center: 'Canales abiertos', branches: [{ label: 'Manning', children: ['V = (1/n)·R^(2/3)·S^(1/2)'] }, { label: 'Radio hidráulico', children: ['A / P mojado'] }, { label: 'Rugosidad n', children: ['Hormigón 0,013', 'Tierra 0,025'] }] },
    nextSteps: ['Leer capítulo 4', 'Prueba 28 de octubre'], brief: '', ficha: [{ label: 'Asignatura', value: 'Hidráulica' }, { label: 'Unidad o tema', value: 'Flujo en canales abiertos' }, { label: 'Evaluaciones y fechas', value: 'Prueba el 28 de octubre' }, { label: 'Lecturas o trabajos pedidos', value: 'Capítulo 4' }], corrections: [], previousTasks: [], continuity: '',
    followUp: { whatsapp: 'Resumen de hidráulica: ecuación de Manning, radio hidráulico (entra en la prueba) y coeficiente n. Leer capítulo 4. Prueba el 28 de octubre.', emailSubject: 'Apuntes: canales abiertos', emailBody: 'Apuntes de la clase de canales abiertos.' },
    study: { notes: '## Ecuación de Manning\n\nLa velocidad media en un canal abierto es:\n\n- **V = (1/n) · R^(2/3) · S^(1/2)**\n- **n**: coeficiente de rugosidad de Manning\n- **R**: radio hidráulico (m)\n- **S**: pendiente del fondo (m/m)\n\n## Radio hidráulico\n\n**R = A / P**, donde A es el área mojada y P el perímetro mojado. *Entra en la prueba.*\n\n## Coeficiente de rugosidad\n\nDepende del material del canal:\n\n- Hormigón liso: n ≈ 0,013\n- Canal de tierra: n ≈ 0,025 o más', exam: [{ text: 'Definición y cálculo del radio hidráulico (área mojada / perímetro mojado)', t: 48 }, { text: 'Prueba el 28 de octubre: unidad de canales abiertos', t: 110 }],
      glossary: [{ term: 'Ecuación de Manning', def: 'Relación empírica para la velocidad media en canales abiertos.' }, { term: 'Radio hidráulico', def: 'Área mojada dividida por perímetro mojado.' }, { term: 'Perímetro mojado', def: 'Longitud del contorno en contacto con el agua.' }, { term: 'Coeficiente n', def: 'Mide la rugosidad del canal en Manning.' }, { term: 'Pendiente S', def: 'Inclinación del fondo del canal, en m/m.' }],
      flashcards: [{ q: '¿Cuál es la ecuación de Manning?', a: 'V = (1/n)·R^(2/3)·S^(1/2)' }, { q: '¿Cómo se calcula el radio hidráulico?', a: 'Área mojada / perímetro mojado' }, { q: '¿De qué depende el n de Manning?', a: 'De la rugosidad del material' }, { q: 'n aproximado del hormigón liso', a: '0,013' }, { q: 'n aproximado de un canal de tierra', a: '0,025 o más' }, { q: '¿Qué unidades tiene la pendiente S?', a: 'm/m (adimensional)' }],
      quiz: [{ q: 'En Manning, la velocidad es proporcional a R elevado a:', options: ['1/2', '2/3', '3/2', '1'], answer: 1, why: 'V = (1/n)·R^(2/3)·S^(1/2).' }, { q: 'El radio hidráulico es:', options: ['Perímetro / área', 'Área / perímetro mojado', 'Ancho / profundidad', 'Caudal / área'], answer: 1, why: 'R = A/P.' }, { q: 'Un canal de tierra comparado con uno de hormigón liso tiene:', options: ['Menor n', 'Igual n', 'Mayor n', 'n = 0'], answer: 2, why: 'Más rugosidad, mayor n.' }, { q: 'Si aumenta n, la velocidad:', options: ['Aumenta', 'Disminuye', 'No cambia', 'Se duplica'], answer: 1, why: 'n está en el denominador.' }] } };
  await DB.put('transcripts', { segments: segs3 }, id3);
  await saveMeeting({ id: id3, createdAt: Date.now() - 2 * 86400000, date: ago(2), durationSec: 130, participants: ['Profesora', 'Tú'], template: 'clase', project: 'Hidráulica', context: '', notes: '', notesLog: [], marks: [{ t: 48, label: 'Entra en la prueba' }], photos: [], audioParts: [], speakers: {}, status: 'ready', words: wordCount(segs3), analysis: a3 });
  go('m/' + id2);
}

/* =========================================================
   App-like touch behaviour: no pinch or double-tap zoom
   ========================================================= */
['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => { if ((e.touches && e.touches.length > 1) || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', e => { if (!e.target.closest('input,textarea,[contenteditable]')) e.preventDefault(); }, { passive: false });

/* =========================================================
   Boot
   ========================================================= */
(async () => {
  try { if (await Settings.restore()) setTimeout(() => toast('Tus claves se recuperaron del respaldo del teléfono', 4500), 800); } catch {}
  try { await loadMeetings(); } catch (e) { S.loaded = true; toast('No se pudo abrir el almacenamiento del navegador. Revisa que no estés en modo privado.', 6000); }
  /* Dirección oficial: actasapp.com. Las otras direcciones llevan allá si aún no tienen datos; si los tienen, avisan cómo mudarse. */
  try {
    const h = location.hostname, home = 'actasapp.com';
    if (h !== home && h !== 'localhost' && !/^\d/.test(h) && location.protocol === 'https:' && !NAT) {
      const hasData = S.meetings.some(m => !String(m.id).startsWith('ejemplo-')) || Settings.v.anthropicKey || Settings.v.openaiKey;
      if (!hasData) { location.replace('https://' + home + '/app/' + location.hash); return; }
      S.moveNotice = home;
    }
  } catch {}
  if (Settings.v.admin == null) Settings.set({ admin: !!(Settings.v.anthropicKey || Settings.v.openaiKey) });
  applyMode();
  if (Lock.enabled()) Lock.show();
  try { const r = await DB.get('kv', 'activeRec'); if (r && r.recId) {
    if (NAT) { /* la app se cerró grabando: rescatamos del disco las partes que alcanzaron a guardarse */
      try { const have = new Set((await DB.chunksFor(r.recId)).map(c => c.part)); const lp = await natCall('listParts', { id: r.recId }); r.parts = r.parts || [];
        for (const d of lp.parts || []) { if (have.has(d.part)) continue; const b = await fetch(NAT.convertFileSrc(d.path)).then(x => x.blob()); await DB.put('chunks', { recId: r.recId, part: d.part, seq: 0, blob: new Blob([b], { type: 'audio/mp4' }), type: 'audio/mp4' }); if (!r.parts.some(x => x.part === d.part)) r.parts.push({ part: d.part, offset: d.offset }); }
        r.parts.sort((a, b) => a.part - b.part); if (lp.duration) r.elapsed = Math.round(lp.duration); r.nativeId = r.recId; await DB.put('kv', r, 'activeRec'); } catch {}
    }
    const ch = await DB.chunksFor(r.recId); if (ch.length) S.recovery = r; else await DB.del('kv', 'activeRec'); } } catch {}
  onRoute();
  if (!navigator.onLine) document.body.classList.add('offline');
  for (const m of S.meetings) if (['queued', 'transcribing', 'analyzing', 'waiting'].includes(m.status)) processMeeting(m.id);
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    /* Actualización automática: al volver a la app busca versión nueva y, si llegó, recarga (nunca mientras graba) */
    const hadCtrl = !!navigator.serviceWorker.controller; let reloading = false;
    navigator.serviceWorker.register('sw.js').then(reg => { const chk = () => reg.update().catch(() => {}); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') chk(); }); setInterval(chk, 30 * 60 * 1000); }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadCtrl || reloading) return;
      const go = () => { if (Rec.state !== 'idle' || S.running?.size || S.extBusy) return setTimeout(go, 5000); reloading = true; try { sessionStorage.setItem('acta:updated', '1'); } catch {} location.reload(); };
      go();
    });
    try { if (sessionStorage.getItem('acta:updated')) { sessionStorage.removeItem('acta:updated'); setTimeout(() => toast('Acta se actualizó a la versión ' + APP_VERSION), 1200); } } catch {}
  }
})();
})();
