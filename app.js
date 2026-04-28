// app.js v8 — Application Surface Probes (A+B+C), always-visible nav, OWASP-LLM full coverage

// ── Pricing sheet (curated) ──────────────────────────────────────────────────
// Per-million-token USD pricing. Resolution priority (highest first):
//   1. User overrides     — operator-entered, persisted localStorage
//   2. LLM-estimated cache — auto-populated from RT/eval model lookups
//   3. PRICING_SHEET      — curated below; matched by exact key OR pattern prefix
// All numbers are per 1,000,000 tokens, in USD. Updated as of late 2025; operators
// can override any entry via the Costs view's Manage Pricing modal.
const PRICING_SHEET = [
  // ── OpenAI / Azure OpenAI (deployment names usually mirror the model id) ──
  { match: /^(azure|openai)::gpt-4o(?!-mini|-2024-08-06|-2024-11-20|_ft)?(?:-2024-(05-13|08-06|11-20))?$/, in: 2.50, out: 10.00, label: 'GPT-4o' },
  { match: /^(azure|openai)::gpt-4o-mini(-2024-07-18)?$/,        in: 0.15, out: 0.60,  label: 'GPT-4o-mini' },
  { match: /^(azure|openai)::gpt-4-turbo(-2024-04-09|-preview)?$/, in: 10.00, out: 30.00, label: 'GPT-4-turbo' },
  { match: /^(azure|openai)::gpt-4(-0613|-0314)?$/,              in: 30.00, out: 60.00, label: 'GPT-4' },
  { match: /^(azure|openai)::gpt-3\.5-turbo.*$/,                 in: 0.50,  out: 1.50,  label: 'GPT-3.5-turbo' },
  { match: /^(azure|openai)::o1-preview.*$/,                     in: 15.00, out: 60.00, label: 'o1-preview' },
  { match: /^(azure|openai)::o1-mini.*$/,                        in: 3.00,  out: 12.00, label: 'o1-mini' },
  { match: /^(azure|openai)::o1(-2024.*)?$/,                     in: 15.00, out: 60.00, label: 'o1' },
  { match: /^(azure|openai)::o3-mini.*$/,                        in: 1.10,  out: 4.40,  label: 'o3-mini' },

  // ── Anthropic Claude (direct + Azure Foundry Claude) ────────────────────
  { match: /^(claude|azure_claude)::claude-(opus-4-7|opus-4|sonnet-4-7|sonnet-4-7-1m|opus-4-7-1m).*/, in: 15.00, out: 75.00, label: 'Claude Opus 4.x' },
  { match: /^(claude|azure_claude)::claude-(sonnet-4-6|sonnet-4-20250514|sonnet-4-7).*/,              in: 3.00,  out: 15.00, label: 'Claude Sonnet 4.x' },
  { match: /^(claude|azure_claude)::claude-(haiku-4-5).*/,                                            in: 0.80,  out: 4.00,  label: 'Claude Haiku 4.5' },
  { match: /^(claude|azure_claude)::claude-3-5-sonnet.*/,                                             in: 3.00,  out: 15.00, label: 'Claude 3.5 Sonnet' },
  { match: /^(claude|azure_claude)::claude-3-5-haiku.*/,                                              in: 0.80,  out: 4.00,  label: 'Claude 3.5 Haiku' },
  { match: /^(claude|azure_claude)::claude-3-opus.*/,                                                 in: 15.00, out: 75.00, label: 'Claude 3 Opus' },
  { match: /^(claude|azure_claude)::claude-3-sonnet.*/,                                               in: 3.00,  out: 15.00, label: 'Claude 3 Sonnet' },
  { match: /^(claude|azure_claude)::claude-3-haiku.*/,                                                in: 0.25,  out: 1.25,  label: 'Claude 3 Haiku' },

  // ── Amazon Bedrock (foundation models + cross-region inference profiles) ─
  { match: /^bedrock::(us\.|eu\.|apac\.)?anthropic\.claude-3-5-sonnet.*/, in: 3.00,  out: 15.00, label: 'Bedrock Claude 3.5 Sonnet' },
  { match: /^bedrock::(us\.|eu\.|apac\.)?anthropic\.claude-3-5-haiku.*/,  in: 0.80,  out: 4.00,  label: 'Bedrock Claude 3.5 Haiku' },
  { match: /^bedrock::(us\.|eu\.|apac\.)?anthropic\.claude-3-opus.*/,     in: 15.00, out: 75.00, label: 'Bedrock Claude 3 Opus' },
  { match: /^bedrock::(us\.|eu\.|apac\.)?anthropic\.claude-3-haiku.*/,    in: 0.25,  out: 1.25,  label: 'Bedrock Claude 3 Haiku' },
  { match: /^bedrock::(us\.|eu\.|apac\.)?meta\.llama3-1-70b.*/,           in: 0.99,  out: 0.99,  label: 'Bedrock Llama 3.1 70B' },
  { match: /^bedrock::(us\.|eu\.|apac\.)?meta\.llama3-1-8b.*/,            in: 0.22,  out: 0.22,  label: 'Bedrock Llama 3.1 8B' },
  { match: /^bedrock::(us\.|eu\.|apac\.)?meta\.llama3-2.*/,               in: 0.30,  out: 0.30,  label: 'Bedrock Llama 3.2' },
  { match: /^bedrock::mistral\.mistral-large.*/,                          in: 2.00,  out: 6.00,  label: 'Bedrock Mistral Large' },
  { match: /^bedrock::mistral\.mistral-7b.*/,                             in: 0.15,  out: 0.20,  label: 'Bedrock Mistral 7B' },
  { match: /^bedrock::amazon\.nova-pro.*/,                                in: 0.80,  out: 3.20,  label: 'Bedrock Nova Pro' },
  { match: /^bedrock::amazon\.nova-lite.*/,                               in: 0.06,  out: 0.24,  label: 'Bedrock Nova Lite' },
  { match: /^bedrock::amazon\.nova-micro.*/,                              in: 0.035, out: 0.14,  label: 'Bedrock Nova Micro' },
  { match: /^bedrock::cohere\.command-r-plus.*/,                          in: 3.00,  out: 15.00, label: 'Bedrock Cohere Command R+' },
  { match: /^bedrock::cohere\.command-r(-v1.*|$)/,                        in: 0.50,  out: 1.50,  label: 'Bedrock Cohere Command R' },

  // ── Azure Foundry MaaS (OpenAI-shape) ─────────────────────────────────
  { match: /^azure_oai_foundry::Llama-3\.3-70B-Instruct.*/,    in: 0.71, out: 0.71, label: 'Foundry Llama 3.3 70B' },
  { match: /^azure_oai_foundry::Llama-3\.1-405B.*/,            in: 5.33, out: 16.00, label: 'Foundry Llama 3.1 405B' },
  { match: /^azure_oai_foundry::Llama-3\.1-70B.*/,             in: 0.71, out: 0.71, label: 'Foundry Llama 3.1 70B' },
  { match: /^azure_oai_foundry::Mistral-large-2407.*/,         in: 2.00, out: 6.00, label: 'Foundry Mistral Large' },
  { match: /^azure_oai_foundry::Phi-4.*/,                      in: 0.125, out: 0.50, label: 'Foundry Phi-4' },

  // ── HuggingFace (most are operator-priced; common open weights below) ───
  { match: /^huggingface::meta-llama\/Meta-Llama-3\.1-70B.*/, in: 0.50, out: 0.50, label: 'HF Llama 3.1 70B (typical)' },
  { match: /^huggingface::meta-llama\/Meta-Llama-3\.1-8B.*/,  in: 0.10, out: 0.10, label: 'HF Llama 3.1 8B (typical)' },
  { match: /^huggingface::mistralai\/Mistral-7B-Instruct.*/,   in: 0.10, out: 0.10, label: 'HF Mistral 7B (typical)' },
  { match: /^huggingface::Qwen\/Qwen2\.5-72B-Instruct.*/,     in: 0.50, out: 0.50, label: 'HF Qwen 2.5 72B (typical)' }
];

const PRICING_OVERRIDES_KEY = 'redprobe_pricing_overrides_v1';
const PRICING_CACHE_KEY     = 'redprobe_pricing_cache_v1';

function _loadPricingOverrides() {
  try { const raw = localStorage.getItem(PRICING_OVERRIDES_KEY); return raw ? (JSON.parse(raw) || {}) : {}; }
  catch { return {}; }
}
function _loadPricingCache() {
  try { const raw = localStorage.getItem(PRICING_CACHE_KEY); return raw ? (JSON.parse(raw) || {}) : {}; }
  catch { return {}; }
}
let pricingOverrides = _loadPricingOverrides();
let pricingCache     = _loadPricingCache();

function _savePricingOverrides() { try { localStorage.setItem(PRICING_OVERRIDES_KEY, JSON.stringify(pricingOverrides)); } catch {} }
function _savePricingCache()     { try { localStorage.setItem(PRICING_CACHE_KEY,     JSON.stringify(pricingCache));     } catch {} }
function clearPricingAll() {
  pricingOverrides = {}; pricingCache = {};
  try { localStorage.removeItem(PRICING_OVERRIDES_KEY); localStorage.removeItem(PRICING_CACHE_KEY); } catch {}
}

// ─── Settings persistence (Configuration + Settings tabs) ────────────────
// Two storage layers:
//   redprobe_settings_v1   — non-secret fields (provider tab + endpoint/model/version/region/etc)
//   redprobe_credentials_v1 — API keys, gated by remember-credentials-toggle (default OFF)
const SETTINGS_KEY     = 'redprobe_settings_v1';
const CREDENTIALS_KEY  = 'redprobe_credentials_v1';
const REMEMBER_CREDS_KEY = 'redprobe_remember_credentials_v1';

// All field ids per role keyed by provider. The save/load functions iterate
// these to capture/repopulate fields. AWS Access Key IDs are non-secret.
const SETTINGS_FIELDS_BY_PROVIDER = {
  azure:             ['endpoint', 'deployment', 'version'],
  azure_claude:      ['az-claude-endpoint', 'az-claude-model', 'az-claude-model-custom'],
  azure_oai_foundry: ['az-oai-endpoint', 'az-oai-model', 'az-oai-model-custom'],
  openai:            ['model-openai', 'model-openai-custom'],
  claude:            ['model-claude', 'model-claude-custom'],
  huggingface:       ['model-hf', 'model-hf-custom', 'hf-endpoint'],
  bedrock:           ['bedrock-access-key-id', 'bedrock-region', 'bedrock-profile', 'bedrock-profile-custom']
};
const ROLES_FOR_SETTINGS = ['target', 'eval', 'redteam'];

function _readRoleSettings(role) {
  const provider = (S.providers && S.providers[role]) || 'azure';
  const out = { provider };
  const fields = SETTINGS_FIELDS_BY_PROVIDER[provider] || [];
  for (const f of fields) {
    const el = $(`${role}-${f}`);
    if (el) out[f] = el.value || '';
  }
  return out;
}
function _writeRoleSettings(role, saved) {
  if (!saved || !saved.provider) return;
  const provider = saved.provider;
  // Switch provider tab via the same path the click handler uses.
  S.providers[role] = provider;
  const tabs = document.querySelectorAll(`.provider-tabs[data-role="${role}"] .ptab`);
  tabs.forEach(t => {
    if (t.dataset.provider === provider) t.classList.add('active');
    else                                  t.classList.remove('active');
  });
  if (typeof switchProviderFields === 'function') switchProviderFields(role, provider);
  // Populate fields.
  const fields = SETTINGS_FIELDS_BY_PROVIDER[provider] || [];
  for (const f of fields) {
    const el = $(`${role}-${f}`);
    if (el && saved[f] != null) el.value = saved[f];
  }
  // Reveal custom-model wraps if the saved model value isn't in the dropdown.
  const customWrapMap = {
    azure_claude:      `${role}-az-claude-custom-wrap`,
    azure_oai_foundry: `${role}-az-oai-custom-wrap`,
    openai:            `${role}-openai-custom-wrap`,
    claude:            `${role}-claude-custom-wrap`,
    huggingface:       `${role}-hf-custom-wrap`,
    bedrock:           `${role}-bedrock-custom-wrap`
  };
  const wrapId = customWrapMap[provider];
  if (wrapId) {
    const sel = $(`${role}-${(provider==='azure_claude'?'az-claude-model':provider==='azure_oai_foundry'?'az-oai-model':provider==='huggingface'?'model-hf':provider==='bedrock'?'bedrock-profile':`model-${provider}`)}`);
    const wrap = $(wrapId);
    if (sel && wrap) wrap.style.display = sel.value === '__custom__' ? '' : 'none';
  }
}

function isCredentialsRemembered() { try { return localStorage.getItem(REMEMBER_CREDS_KEY) === '1'; } catch { return false; } }
function setCredentialsRemembered(on) { try { localStorage.setItem(REMEMBER_CREDS_KEY, on ? '1' : '0'); } catch {} }

function saveAllSettings() {
  // Non-secret fields per role.
  try {
    const out = {};
    for (const role of ROLES_FOR_SETTINGS) out[role] = _readRoleSettings(role);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(out));
  } catch {}
  // Secret fields (API keys) — only if the toggle is ON.
  if (isCredentialsRemembered()) {
    try {
      const out = {};
      for (const role of ROLES_FOR_SETTINGS) {
        const k = $(`${role}-key`);
        if (k && k.value) out[role] = { key: k.value };
      }
      localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(out));
    } catch {}
  } else {
    try { localStorage.removeItem(CREDENTIALS_KEY); } catch {}
  }
  updateSettingsStatusLine();
}

let _saveSettingsTimer = null;
function saveAllSettingsDebounced() {
  clearTimeout(_saveSettingsTimer);
  _saveSettingsTimer = setTimeout(saveAllSettings, 300);
}

function loadAllSettings() {
  let nonSecret = null, creds = null;
  try { const raw = localStorage.getItem(SETTINGS_KEY);    if (raw) nonSecret = JSON.parse(raw); } catch {}
  try { const raw = localStorage.getItem(CREDENTIALS_KEY); if (raw) creds    = JSON.parse(raw); } catch {}
  if (nonSecret && typeof nonSecret === 'object') {
    for (const role of ROLES_FOR_SETTINGS) {
      if (nonSecret[role]) _writeRoleSettings(role, nonSecret[role]);
    }
  }
  if (creds && typeof creds === 'object' && isCredentialsRemembered()) {
    for (const role of ROLES_FOR_SETTINGS) {
      const el = $(`${role}-key`);
      if (el && creds[role] && creds[role].key) el.value = creds[role].key;
    }
  }
  // Sync the toggle UI to the persisted flag.
  const tg = $('remember-credentials-toggle'); if (tg) tg.checked = isCredentialsRemembered();
  updateSettingsStatusLine();
}

function clearAllSettings() {
  try { localStorage.removeItem(SETTINGS_KEY);    } catch {}
  try { localStorage.removeItem(CREDENTIALS_KEY); } catch {}
  // Clear all in-memory form fields.
  for (const role of ROLES_FOR_SETTINGS) {
    const k = $(`${role}-key`); if (k) k.value = '';
    for (const provider of Object.keys(SETTINGS_FIELDS_BY_PROVIDER)) {
      for (const f of SETTINGS_FIELDS_BY_PROVIDER[provider]) {
        const el = $(`${role}-${f}`);
        if (el && el.tagName === 'INPUT') el.value = '';
        else if (el && el.tagName === 'SELECT' && el.options.length) el.value = el.options[0].value;
      }
    }
  }
  updateSettingsStatusLine();
}

function updateSettingsStatusLine() {
  const el = $('settings-status-line'); if (!el) return;
  let nonSecret = null;
  try { const raw = localStorage.getItem(SETTINGS_KEY); if (raw) nonSecret = JSON.parse(raw); } catch {}
  const haveCreds = isCredentialsRemembered() && !!localStorage.getItem(CREDENTIALS_KEY);
  const parts = [];
  for (const role of ROLES_FOR_SETTINGS) {
    const has = nonSecret && nonSecret[role] && Object.keys(nonSecret[role]).length > 1; // > 1 because 'provider' is always there
    parts.push(`${role} ${has ? '✓' : '·'}`);
  }
  el.textContent = `Saved: ${parts.join(' · ')}${haveCreds ? ' · creds ✓' : ''}`;
}

// Stable pricing key. Matches the format used in PRICING_SHEET regexes.
function pricingKeyFor(provider, model) {
  const p = String(provider || 'unknown').toLowerCase();
  const m = String(model || '').trim();
  return `${p}::${m}`;
}

// Resolve pricing for a (provider, model) pair. Returns { in, out, source, confidence?, label }.
// Source is one of: 'user' | 'llm' | 'curated' | 'unknown'. Unknown means no entry —
// caller may trigger an LLM lookup or prompt the user.
function getModelPricing(provider, model) {
  if (!model) return { in: 0, out: 0, source: 'unknown', label: '(no model)' };
  const key = pricingKeyFor(provider, model);
  if (pricingOverrides[key])  return { ...pricingOverrides[key], source: 'user',    label: model };
  if (pricingCache[key])      return { ...pricingCache[key],     source: 'llm',     label: model, confidence: pricingCache[key].confidence || 'unknown' };
  for (const entry of PRICING_SHEET) {
    if (entry.match.test(key)) return { in: entry.in, out: entry.out, source: 'curated', label: entry.label };
  }
  return { in: 0, out: 0, source: 'unknown', label: model };
}

function setUserPricing(provider, model, inP, outP) {
  const key = pricingKeyFor(provider, model);
  pricingOverrides[key] = { in: Number(inP) || 0, out: Number(outP) || 0, ts: Date.now() };
  _savePricingOverrides();
}
function setLLMPricingCache(provider, model, inP, outP, confidence) {
  const key = pricingKeyFor(provider, model);
  pricingCache[key] = { in: Number(inP) || 0, out: Number(outP) || 0, confidence: confidence || 'unknown', ts: Date.now() };
  _savePricingCache();
}

// ── State ─────────────────────────────────────────────────────────────────────
const S = {
  cfgs: { target: null, eval: null, redteam: null, curl_custom: null },
  providers: { target:'azure', eval:'azure', redteam:'claude' },
  connected: { target:false, eval:false, redteam:false, curl_custom:false },
  activeChatRole: 'target',
  chatHistories: { target:[], eval:[], redteam:[], curl_custom:[] },
  chatSystemPrompts: { target:'', eval:'', redteam:'', curl_custom:'' },
  selectedTechniques: new Set(),
  selectedCategories: new Set(),
  selectedRagTechniques: new Set(),  // RAG-only technique IDs (separate from selectedTechniques)
  selectedDomains: new Set(),         // multi-select domain IDs from RAG Attack Builder
  selectedFilterProbes: new Set(),   // Filter-layer probe IDs (Phase B)
  selectedSurfaceProbes: new Set(),  // Application Surface probe IDs (LLM02/04/06/07/08)
  targetSurface: {},                  // capability declarations { html_render:true, db_query_tool:false, ... }
  perTechTurns: {},
  allRecords: [],
  evaluatedRecords: [],
  activeAttacker: null,
  running: false,
  metrics: { techniques:0, turns:0, responses:0, breaks:0, done:0, errors:0 },
  chartInstance: null,
  // Cost tracking — persisted in memory across sessions
  costHistory: [],  // { sessionName, date, records, metadata }
  // ─── Cross-session break archive (Upgrade 10) ─────────────────────────────
  // Opt-in: persisted to localStorage only when breakArchiveEnabled=true.
  // Keeps top-N break signatures per (technique, category) to seed future intents.
  breakArchive: [],
  breakArchiveEnabled: false,
  // ─── Auto-Tune learning (gated by breakArchiveEnabled) ───────────────────
  // Four cross-session channels persisted to localStorage. All gated by the
  // existing breakArchiveEnabled flag — one toggle, four storage keys.
  lessonsArchive:   {},  // {techId: [{text, ts, sessions_seen}]}
  statsMatrix:      {},  // {`${techId}||${catId}||${tgtKey}`: {attempts, breaks, avgScore, lastBreakTs, recentRunVerdicts}}
  failuresArchive:  {},  // {`${techId}||${catId}`: [{prompt_head, response_head, ts}]}
  payloadStats:     {}   // {payloadId: {attempts, breaks, byCategory: {catId: {attempts, breaks}}}}
};

// ─── Break archive persistence (Upgrade 10) ────────────────────────────────
const BREAK_ARCHIVE_KEY  = 'redprobe_break_archive_v1';
const BREAK_ARCHIVE_FLAG = 'redprobe_break_archive_enabled_v1';
const BREAK_ARCHIVE_MAX  = 20; // per (technique, category)

function loadBreakArchive() {
  try {
    S.breakArchiveEnabled = localStorage.getItem(BREAK_ARCHIVE_FLAG) === '1';
    if (!S.breakArchiveEnabled) { S.breakArchive = []; return; }
    const raw = localStorage.getItem(BREAK_ARCHIVE_KEY);
    S.breakArchive = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(S.breakArchive)) S.breakArchive = [];
  } catch { S.breakArchive = []; S.breakArchiveEnabled = false; }
}
function saveBreakArchive() {
  if (!S.breakArchiveEnabled) return;
  try { localStorage.setItem(BREAK_ARCHIVE_KEY, JSON.stringify(S.breakArchive)); } catch {}
}
function mergeIntoBreakArchive(newBreaks) {
  if (!Array.isArray(newBreaks) || !newBreaks.length) return;
  const merged = [...S.breakArchive, ...newBreaks];
  // Per (techId, category), keep top BREAK_ARCHIVE_MAX by score then recency
  const groups = {};
  for (const b of merged) {
    const k = (b.techId || '') + '||' + (b.category || '');
    (groups[k] ||= []).push(b);
  }
  const trimmed = [];
  for (const k of Object.keys(groups)) {
    const arr = groups[k];
    arr.sort((a,b) => ((b.score || 0) - (a.score || 0)) || ((b.ts || 0) - (a.ts || 0)));
    trimmed.push(...arr.slice(0, BREAK_ARCHIVE_MAX));
  }
  S.breakArchive = trimmed;
  saveBreakArchive();
}
function clearBreakArchive() {
  S.breakArchive = [];
  try { localStorage.removeItem(BREAK_ARCHIVE_KEY); } catch {}
}
loadBreakArchive();

// ─── Auto-Tune persistence (Tracks A/B/C/D) ────────────────────────────────
// Four sibling channels under the existing breakArchiveEnabled toggle.
const LESSONS_KEY        = 'redprobe_lessons_v1';
const STATS_KEY          = 'redprobe_stats_v1';
const FAILURES_KEY       = 'redprobe_failures_v1';
const PAYLOAD_STATS_KEY  = 'redprobe_payload_stats_v1';
const LESSONS_PER_TECH_MAX = 5;
const FAILURES_PER_PAIR_MAX = 20;
const RECENT_VERDICTS_MAX   = 10;

function _loadJSONOrDefault(key, fallback) {
  try { const raw = localStorage.getItem(key); if (!raw) return fallback; const v = JSON.parse(raw); return v || fallback; }
  catch { return fallback; }
}
function _saveJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

function loadAutoTuneArchives() {
  if (!S.breakArchiveEnabled) {
    S.lessonsArchive = {}; S.statsMatrix = {}; S.failuresArchive = {}; S.payloadStats = {};
    return;
  }
  S.lessonsArchive  = _loadJSONOrDefault(LESSONS_KEY, {});
  S.statsMatrix     = _loadJSONOrDefault(STATS_KEY, {});
  S.failuresArchive = _loadJSONOrDefault(FAILURES_KEY, {});
  S.payloadStats    = _loadJSONOrDefault(PAYLOAD_STATS_KEY, {});
  if (typeof S.lessonsArchive !== 'object' || Array.isArray(S.lessonsArchive))  S.lessonsArchive = {};
  if (typeof S.statsMatrix !== 'object' || Array.isArray(S.statsMatrix))        S.statsMatrix = {};
  if (typeof S.failuresArchive !== 'object' || Array.isArray(S.failuresArchive)) S.failuresArchive = {};
  if (typeof S.payloadStats !== 'object' || Array.isArray(S.payloadStats))      S.payloadStats = {};
}

function saveLessonsArchive()    { if (S.breakArchiveEnabled) _saveJSON(LESSONS_KEY,       S.lessonsArchive); }
function saveStatsMatrix()       { if (S.breakArchiveEnabled) _saveJSON(STATS_KEY,         S.statsMatrix); }
function saveFailuresArchive()   { if (S.breakArchiveEnabled) _saveJSON(FAILURES_KEY,      S.failuresArchive); }
function savePayloadStats()      { if (S.breakArchiveEnabled) _saveJSON(PAYLOAD_STATS_KEY, S.payloadStats); }

function clearAutoTuneArchives() {
  S.lessonsArchive = {}; S.statsMatrix = {}; S.failuresArchive = {}; S.payloadStats = {};
  try { localStorage.removeItem(LESSONS_KEY); localStorage.removeItem(STATS_KEY); localStorage.removeItem(FAILURES_KEY); localStorage.removeItem(PAYLOAD_STATS_KEY); } catch {}
}

// Stable target key — survives provider naming differences. Mirrors cfgDisplayName scope.
function targetCfgKeyOf(cfg) {
  if (!cfg || !cfg.provider) return 'unknown';
  const tail = cfg.deployment || cfg.model || cfg.provider;
  return `${cfg.provider}:${tail}`.substring(0, 120);
}

// Track A — merge per-technique lesson text from the just-completed session.
// Prepend new lesson, dedupe by exact text, cap at LESSONS_PER_TECH_MAX.
function mergeIntoLessonsArchive(lessonsByTech) {
  if (!lessonsByTech || typeof lessonsByTech !== 'object') return;
  const ts = Date.now();
  for (const techId of Object.keys(lessonsByTech)) {
    const text = String(lessonsByTech[techId] || '').trim();
    if (!text) continue;
    const list = S.lessonsArchive[techId] || [];
    const existing = list.find(l => l.text === text);
    if (existing) { existing.ts = ts; existing.sessions_seen = (existing.sessions_seen || 1) + 1; }
    else list.unshift({ text, ts, sessions_seen: 1 });
    S.lessonsArchive[techId] = list.slice(0, LESSONS_PER_TECH_MAX);
  }
  saveLessonsArchive();
}

// Track B — fold the per-run verdicts from the last evaluation into the stats matrix.
// runs come from evaluator.lastRuns. tgtKey is targetCfgKeyOf(cfg).
function mergeStatsFromRuns(runs, tgtKey) {
  if (!Array.isArray(runs) || !runs.length) return;
  for (const run of runs) {
    if (!run || !run.technique_id || !run.category_id) continue;
    if (run.run_verdict === 'filter_blocked' || run.run_verdict === 'error') continue; // not informative for the matrix
    const key = `${run.technique_id}||${run.category_id}||${tgtKey || 'unknown'}`;
    const cur = S.statsMatrix[key] || { attempts: 0, breaks: 0, avgScore: 0, lastBreakTs: 0, recentRunVerdicts: [] };
    cur.attempts += 1;
    const isBreak = run.run_verdict === 'break';
    if (isBreak) {
      cur.breaks += 1;
      cur.lastBreakTs = Date.now();
    }
    // Running mean of run_score
    const score = Number(run.run_score) || 0;
    cur.avgScore = ((cur.avgScore * (cur.attempts - 1)) + score) / cur.attempts;
    cur.recentRunVerdicts = [run.run_verdict, ...(cur.recentRunVerdicts || [])].slice(0, RECENT_VERDICTS_MAX);
    S.statsMatrix[key] = cur;
  }
  saveStatsMatrix();
}

// Track C — merge new failure fingerprints. Prepend, dedupe by prompt_head, cap.
function mergeIntoFailuresArchive(newFailures) {
  if (!Array.isArray(newFailures) || !newFailures.length) return;
  for (const f of newFailures) {
    if (!f || !f.techId || !f.categoryId || !f.prompt_head) continue;
    const k = `${f.techId}||${f.categoryId}`;
    const list = S.failuresArchive[k] || [];
    if (list.some(x => x.prompt_head === f.prompt_head)) continue;
    list.unshift({ prompt_head: f.prompt_head, response_head: f.response_head || '', ts: f.ts || Date.now() });
    S.failuresArchive[k] = list.slice(0, FAILURES_PER_PAIR_MAX);
  }
  saveFailuresArchive();
}

// Track D — fold per-payload outcomes from the just-evaluated records.
function mergePayloadStatsFromRecords(records) {
  if (!Array.isArray(records) || !records.length) return;
  // Index records by run_id so we know each record's run_verdict.
  for (const rec of records) {
    if (!rec || !rec.payload_id_used) continue;
    const id = rec.payload_id_used;
    const cur = S.payloadStats[id] || { attempts: 0, breaks: 0, byCategory: {} };
    cur.attempts += 1;
    const broke = rec.run_verdict === 'break';
    if (broke) cur.breaks += 1;
    const cat = rec.category_id || 'unknown';
    const cb = cur.byCategory[cat] || { attempts: 0, breaks: 0 };
    cb.attempts += 1; if (broke) cb.breaks += 1;
    cur.byCategory[cat] = cb;
    S.payloadStats[id] = cur;
  }
  savePayloadStats();
}

loadAutoTuneArchives();

// ─── Session history persistence (IndexedDB) ─────────────────────────────
// Sessions are persisted to IndexedDB so the full history survives across
// refreshes without the ~5MB localStorage quota cap. The previous localStorage
// implementation trimmed at 10 sessions and could lose data on quota exceeded;
// IndexedDB has effectively unlimited storage (~50% of free disk on most
// browsers). On first load, any sessions still in localStorage are auto-migrated
// to IDB and the localStorage key is cleared so we don't drift between two
// stores.
const SESSIONS_KEY = 'redprobe_sessions_v1';      // legacy localStorage key (migrated then deleted)
const IDB_NAME     = 'redprobe_db';
const IDB_VERSION  = 1;
const IDB_STORE    = 'sessions';

function _idbOpen() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        const store = db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error || new Error('IDB open failed'));
  });
}
function _idbTx(mode) {
  return _idbOpen().then(db => {
    const tx = db.transaction(IDB_STORE, mode);
    return { tx, store: tx.objectStore(IDB_STORE), db };
  });
}
async function idbAddSession(entry) {
  if (!entry || !entry.id) return;
  const { tx, store } = await _idbTx('readwrite');
  return new Promise((resolve, reject) => {
    const r = store.put(entry); // put() upserts by keyPath
    r.onsuccess = () => resolve(true);
    r.onerror   = () => reject(r.error);
    tx.oncomplete = () => {};
  });
}
async function idbGetAllSessions() {
  const { tx, store } = await _idbTx('readonly');
  return new Promise((resolve, reject) => {
    const r = store.getAll();
    r.onsuccess = () => {
      const arr = (r.result || []).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      resolve(arr);
    };
    r.onerror = () => reject(r.error);
  });
}
async function idbClearSessions() {
  const { tx, store } = await _idbTx('readwrite');
  return new Promise((resolve, reject) => {
    const r = store.clear();
    r.onsuccess = () => resolve(true);
    r.onerror   = () => reject(r.error);
  });
}
async function idbDeleteSession(id) {
  const { tx, store } = await _idbTx('readwrite');
  return new Promise((resolve, reject) => {
    const r = store.delete(id);
    r.onsuccess = () => resolve(true);
    r.onerror   = () => reject(r.error);
  });
}

// Migrate any legacy localStorage sessions into IDB once, then clear the key.
async function _migrateLocalStorageSessionsIntoIDB() {
  let raw = null;
  try { raw = localStorage.getItem(SESSIONS_KEY); } catch { return; }
  if (!raw) return;
  let arr = [];
  try { arr = JSON.parse(raw) || []; if (!Array.isArray(arr)) arr = []; } catch { arr = []; }
  for (const s of arr) {
    if (!s.id) s.id = (s.date || new Date().toISOString()) + '-' + Math.random().toString(36).slice(2, 8);
    try { await idbAddSession(s); } catch {}
  }
  try { localStorage.removeItem(SESSIONS_KEY); } catch {}
}

async function loadSessionHistory() {
  try { await _migrateLocalStorageSessionsIntoIDB(); } catch {}
  try { S.costHistory = await idbGetAllSessions(); }
  catch { S.costHistory = []; }
}
async function saveSessionHistoryEntry(entry) {
  // Single-entry write — replaces the previous "save the whole array" approach.
  // No cap; IDB stores everything. Operator wipes via Clear History.
  try { await idbAddSession(entry); }
  catch (e) { console.warn('saveSessionHistoryEntry failed:', e && e.message); }
}
async function clearSessionHistory() {
  S.costHistory = [];
  try { await idbClearSessions(); } catch {}
}
// Kick off the async load. Other code that reads S.costHistory at startup must
// either call this and await OR re-render after the promise resolves.
loadSessionHistory().then(() => {
  // After initial load, refresh any view that reads S.costHistory.
  if (typeof renderCostView   === 'function' && $('view-costs')   && $('view-costs').classList.contains('active'))   renderCostView();
  if (typeof renderSessionsList === 'function' && $('view-results') && $('view-results').classList.contains('active')) renderSessionsList();
});

const $ = id => document.getElementById(id);
const val = id => ($(id)&&$(id).value ? $(id).value.trim() : '');
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ── Sidebar collapse/expand ───────────────────────────────────────────────────
$('sidebar-collapse').addEventListener('click', () => {
  $('app').classList.remove('sidebar-open');
  $('app').classList.add('sidebar-closed');
  $('sidebar-expand').style.display = 'flex';
});
$('sidebar-expand').addEventListener('click', () => {
  $('app').classList.remove('sidebar-closed');
  $('app').classList.add('sidebar-open');
  $('sidebar-expand').style.display = 'none';
});

// ── View routing ──────────────────────────────────────────────────────────────
function navigateToView(view) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (navBtn) navBtn.classList.add('active');
  const vw = $('view-' + view); if (vw) vw.classList.add('active');
  if (view === 'costs')    { _showCostsList(); renderCostView(); }
  if (view === 'autotune') renderAutoTunePanel();
  if (view === 'settings') updateSettingsStatusLine();
  if (view === 'results') {
    // If an attack is running OR a session is already open, stay in detail.
    // Otherwise, default to the sessions list.
    if (S.running || S.activeDetailSessionId) _showResultsDetail();
    else _showResultsList();
  }
}
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => navigateToView(btn.dataset.view));
});
// Buttons inside views (e.g. "Configure →" links in family-summary cards) can
// declare data-goto-view to navigate without leaving the click model.
document.querySelectorAll('[data-goto-view]').forEach(btn => {
  btn.addEventListener('click', () => navigateToView(btn.dataset.gotoView));
});

// ── Eye-toggle ────────────────────────────────────────────────────────────────
document.querySelectorAll('.eye-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const inp = $(btn.dataset.for); if(!inp) return;
    inp.type = inp.type==='password'?'text':'password';
    btn.style.color = inp.type==='text'?'var(--blue-bright)':'';
  });
});

// ── Provider tabs ─────────────────────────────────────────────────────────────
const KEY_LABELS = {
  azure:'Azure API Key', azure_claude:'Azure API Key (x-api-key)',
  azure_oai_foundry:'API Key (Bearer)',
  openai:'OpenAI API Key (sk-…)', claude:'Anthropic API Key (sk-ant-…)',
  huggingface:'HuggingFace Token (hf_…)',
  bedrock:'AWS Secret Access Key'
};

document.querySelectorAll('.provider-tabs').forEach(tabGroup => {
  const role = tabGroup.dataset.role;
  tabGroup.querySelectorAll('.ptab').forEach(tab => {
    tab.addEventListener('click', () => {
      tabGroup.querySelectorAll('.ptab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      S.providers[role] = tab.dataset.provider;
      switchProviderFields(role, tab.dataset.provider);
    });
  });
});

function switchProviderFields(role, provider) {
  ['azure','azure_claude','azure_oai_foundry','openai','claude','huggingface','bedrock'].forEach(p => {
    const el = $(`${role}-fields-${p}`); if(el) el.style.display = p===provider ? '' : 'none';
  });
  const lbl = $(`${role}-key-label`); if(lbl) lbl.textContent = KEY_LABELS[provider]||'API Key';
}

// Custom model dropdowns
['target','eval','redteam'].forEach(role => {
  ['openai','claude','hf','az-claude'].forEach(prov => {
    const sel = $(`${role}-model-${prov}`) || $(`${role}-az-claude-model`);
    const selById = $(`${role}-model-${prov}`);
    if(selById) selById.addEventListener('change', () => {
      const wrap = $(`${role}-${prov}-custom-wrap`)||$(`${role}-${prov.replace('-','-')}-custom-wrap`);
      if(wrap) wrap.style.display = selById.value==='__custom__'?'':'none';
    });
  });
  const azClaudeSel = $(`${role}-az-claude-model`);
  if(azClaudeSel) azClaudeSel.addEventListener('change', () => {
    const w = $(`${role}-az-claude-custom-wrap`); if(w) w.style.display = azClaudeSel.value==='__custom__'?'':'none';
  });
  const bedrockSel = $(`${role}-bedrock-profile`);
  if(bedrockSel) bedrockSel.addEventListener('change', () => {
    const w = $(`${role}-bedrock-custom-wrap`); if(w) w.style.display = bedrockSel.value==='__custom__'?'':'none';
  });
  const azOaiSel = $(`${role}-az-oai-model`);
  if(azOaiSel) azOaiSel.addEventListener('change', () => {
    const w = $(`${role}-az-oai-custom-wrap`); if(w) w.style.display = azOaiSel.value==='__custom__'?'':'none';
  });
});

// ── Build ModelClient cfg ─────────────────────────────────────────────────────
function readRagSettings(role) {
  if (role !== 'target') return null;
  const enabled = !!($('target-rag-enabled') && $('target-rag-enabled').checked);
  if (!enabled) return { ragEnabled: false };

  // Selected RAG technique objects (resolved from rag-attacks.js catalog)
  const ragTechs = (typeof RAG_TECHNIQUES !== 'undefined')
    ? RAG_TECHNIQUES.filter(t => S.selectedRagTechniques.has(t.id))
    : [];
  const layers = Array.from(new Set(ragTechs.map(t => t.layer)));

  return {
    ragEnabled:    true,
    ragStack:      val('target-rag-stack') || 'unknown',
    ragLayers:     layers.length ? layers : [],
    ragTechniques: ragTechs,                                 // empty array allowed
    domains:       Array.from(S.selectedDomains),            // multi-select
    domain:        Array.from(S.selectedDomains)[0] || '',   // back-compat scalar
    corpusHint:    (val('rag-corpus-hint') || '').substring(0, 4000)
  };
}

function buildCfg(role) {
  const provider = S.providers[role];
  const key      = val(`${role}-key`);
  if (!key) throw new Error(`No API key for ${role} model`);

  let baseCfg;
  if (provider === 'azure') {
    const ep=val(`${role}-endpoint`).replace(/\/$/,''), dep=val(`${role}-deployment`), ver=val(`${role}-version`)||'2024-02-15-preview';
    if(!ep)  throw new Error(`Azure endpoint missing for ${role}`);
    if(!dep) throw new Error(`Azure deployment missing for ${role}`);
    baseCfg = { provider:'azure', key, endpoint:ep, deployment:dep, version:ver };
  } else if (provider === 'azure_claude') {
    const ep  = val(`${role}-az-claude-endpoint`).replace(/\/$/,'');
    const sel = $(`${role}-az-claude-model`);
    const model = sel && sel.value !== '__custom__' ? sel.value : (val(`${role}-az-claude-model-custom`)||'claude-sonnet-4-6');
    if(!ep) throw new Error(`Azure Foundry Claude endpoint missing for ${role}`);
    baseCfg = { provider:'azure_claude', key, endpoint:ep, model };
  } else if (provider === 'azure_oai_foundry') {
    const ep  = val(`${role}-az-oai-endpoint`).replace(/\/$/,'');
    const sel = $(`${role}-az-oai-model`);
    const model = sel && sel.value !== '__custom__' ? sel.value : (val(`${role}-az-oai-model-custom`)||'').trim();
    if(!ep) throw new Error(`Azure Foundry (OpenAI) endpoint missing for ${role}`);
    if(!model) throw new Error(`Azure Foundry (OpenAI) model id missing for ${role}`);
    baseCfg = { provider:'azure_oai_foundry', key, endpoint:ep, model };
  } else if (provider === 'openai') {
    const sel = $(`${role}-model-openai`);
    const model = sel && sel.value!=='__custom__' ? sel.value : (val(`${role}-model-openai-custom`)||'gpt-4o');
    baseCfg = { provider:'openai', key, model };
  } else if (provider === 'claude') {
    const sel = $(`${role}-model-claude`);
    const model = sel && sel.value!=='__custom__' ? sel.value : (val(`${role}-model-claude-custom`)||'claude-sonnet-4-20250514');
    baseCfg = { provider:'claude', key, model };
  } else if (provider === 'huggingface') {
    const sel = $(`${role}-model-hf`);
    const model = sel && sel.value!=='__custom__' ? sel.value : (val(`${role}-model-hf-custom`)||'');
    if(!model) throw new Error(`HuggingFace model ID required for ${role}`);
    const ep = val(`${role}-hf-endpoint`);
    baseCfg = { provider:'huggingface', key, model }; if(ep) baseCfg.endpoint=ep;
  } else if (provider === 'bedrock') {
    // For Bedrock, the master `${role}-key` field carries the AWS Secret Access Key.
    // Access Key ID, region, and inference profile / model id are separate inputs.
    const accessKeyId = val(`${role}-bedrock-access-key-id`).trim();
    const region      = val(`${role}-bedrock-region`).trim();
    const sel         = $(`${role}-bedrock-profile`);
    const model       = sel && sel.value!=='__custom__' ? sel.value : (val(`${role}-bedrock-profile-custom`)||'').trim();
    if (!accessKeyId) throw new Error(`Bedrock: AWS Access Key ID missing for ${role}`);
    if (!region)      throw new Error(`Bedrock: AWS region missing for ${role}`);
    if (!model)       throw new Error(`Bedrock: inference profile / model id missing for ${role}`);
    baseCfg = { provider:'bedrock', key, accessKeyId, region, model };
  } else {
    throw new Error(`Unknown provider: ${provider}`);
  }

  // RAG settings ride on the cfg (target only). model-client.js ignores them.
  const rag = readRagSettings(role);
  if (rag) Object.assign(baseCfg, rag);

  // Filter-probe selection rides on the target cfg too (Phase B).
  // model-client.js ignores it; attacker.runSession appends them to the technique pool.
  if (role === 'target' && typeof FILTER_TECHNIQUES !== 'undefined') {
    const filterTechs = FILTER_TECHNIQUES.filter(t => S.selectedFilterProbes.has(t.id));
    if (filterTechs.length) baseCfg.filterTechniques = filterTechs;
  }

  // Surface-probe selection + operator-declared target surface (Application Surface Probes).
  if (role === 'target') {
    if (typeof SURFACE_TECHNIQUES !== 'undefined') {
      const surfaceTechs = SURFACE_TECHNIQUES.filter(t => S.selectedSurfaceProbes.has(t.id));
      if (surfaceTechs.length) baseCfg.surfaceTechniques = surfaceTechs;
    }
    // Always pass declared surface — used by precondition gating
    baseCfg.targetSurface = { ...S.targetSurface };

    // Streaming toggle (v9) — when on, model-client routes target calls to callRichStream.
    baseCfg.streamingEnabled = !!($('target-streaming-enabled') && $('target-streaming-enabled').checked);
  }
  return baseCfg;
}

// v8 — RAG + Surface nav are always visible. The toggle controls whether the
// builder VIEW shows the real builder content or a "please enable" placeholder.

// Toggles `is-on` on the parent `.probe-mode-tile` so the tile gets a highlighted
// border when its checkbox is checked. Pure visual feedback for the new layout.
function _markTileOnState(cb) {
  const tile = cb && cb.closest && cb.closest('.probe-mode-tile');
  if (tile) tile.classList.toggle('is-on', !!cb.checked);
}

(function wireRagToggle(){
  const cb = document.getElementById('target-rag-enabled');
  const opts = document.getElementById('target-rag-options');
  if (!cb) return;
  const apply = () => {
    if (opts) opts.style.display = cb.checked ? '' : 'none';
    // Swap between placeholder banner and real builder content (nav stays visible)
    const banner  = document.getElementById('rag-disabled-banner');
    const content = document.getElementById('rag-builder-content');
    if (banner)  banner.style.display  = cb.checked ? 'none' : '';
    if (content) content.style.display = cb.checked ? '' : 'none';
    _markTileOnState(cb);
  };
  cb.addEventListener('change', apply);
  apply();
})();

(function wireSurfaceToggle(){
  const cb = document.getElementById('target-surface-enabled');
  if (!cb) return;
  const apply = () => {
    const banner  = document.getElementById('surface-disabled-banner');
    const content = document.getElementById('surface-builder-content');
    if (banner)  banner.style.display  = cb.checked ? 'none' : '';
    if (content) content.style.display = cb.checked ? '' : 'none';
    _markTileOnState(cb);
  };
  cb.addEventListener('change', apply);
  apply();
})();

// Streaming toggle has no banner/builder swap, but we still want the tile
// highlight when it's on.
(function wireStreamingToggle(){
  const cb = document.getElementById('target-streaming-enabled');
  if (!cb) return;
  const apply = () => _markTileOnState(cb);
  cb.addEventListener('change', apply);
  apply();
})();

function cfgDisplayName(cfg) {
  if (!cfg) return '—';
  if (cfg.provider==='azure')             return cfg.deployment||'azure';
  if (cfg.provider==='azure_claude')      return (cfg.model||'').split('-').slice(0,2).join('-')||'az-claude';
  if (cfg.provider==='azure_oai_foundry') return (cfg.model||'').split('-').slice(0,2).join('-')||'az-oai';
  if (cfg.provider==='huggingface')       { const m=cfg.model||''; return m.includes('/')?m.split('/')[1].substring(0,18):m.substring(0,18); }
  if (cfg.provider==='bedrock')           { const m=cfg.model||''; const tail=m.split('/').pop()||m; return tail.substring(0,18); }
  return (cfg.model||cfg.provider).substring(0,18);
}

// ── Connection test ───────────────────────────────────────────────────────────
// Update the global "Attacker Ready" pill at the top of the main content based on
// the current connected-state of redteam (the attacker) and eval (the judge).
//   Red   = redteam not connected (regardless of eval)
//   Amber = redteam connected, but judge (eval) not yet connected
//   Green = both connected
function updateAttackerStatusPill() {
  const pill = document.getElementById('attacker-status'); if (!pill) return;
  const lbl = pill.querySelector('.attacker-status-text');
  pill.classList.remove('is-ready', 'is-warn', 'is-not-ready');
  if (!S.connected.redteam) {
    pill.classList.add('is-not-ready');
    if (lbl) lbl.textContent = 'Attacker Not Ready';
    return;
  }
  if (!S.connected.eval) {
    pill.classList.add('is-warn');
    if (lbl) lbl.textContent = 'Attacker Ready · Judge not configured';
    return;
  }
  pill.classList.add('is-ready');
  if (lbl) lbl.textContent = 'Attacker Ready';
}

async function testRole(role) {
  const setR=(msg,cls)=>{ const el=$(`result-${role}`); if(el){el.textContent=msg;el.className=`conn-result ${cls}`;} };
  const setD=(cls,name)=>{
    const d=$(`dot-${role}`),l=$(`lbl-${role}`); if(d) d.className=`status-dot ${cls}`; if(l&&name) l.textContent=name.substring(0,18);
    const cd=$(`chat-dot-${role}`); if(cd) cd.className=`status-dot ${cls}`;
    const cl=$(`chat-mtab-lbl-${role}`); if(cl) cl.textContent=(name||'').substring(0,14);
  };
  let cfg;
  try { cfg = buildCfg(role); } catch(e) { setR(e.message,'err'); setD('err','error'); updateAttackerStatusPill(); return; }
  setR('Testing…','loading'); setD('busy','…');
  try {
    await ModelClient.test(cfg);
    S.cfgs[role]=cfg; S.connected[role]=true;
    const name=cfgDisplayName(cfg); setR(`✓ Connected — ${name}`,'ok'); setD('ok',name);
    if(S.activeChatRole===role) updateChatMeta();
  } catch(e) { setR(`✗ ${e.message.substring(0,120)}`,'err'); setD('err','error'); S.connected[role]=false; }
  updateAttackerStatusPill();
}
$('btn-test-target').addEventListener('click',()=>testRole('target'));
$('btn-test-eval').addEventListener('click',()=>testRole('eval'));
$('btn-test-redteam').addEventListener('click',()=>testRole('redteam'));

// ── CURL import ───────────────────────────────────────────────────────────────
function applyCurlToRole(curlStr, role, resultId) {
  const res = CURLParser.parse(curlStr);
  const resEl = $(resultId);
  if (res.error) { if(resEl){resEl.textContent='Parse error: '+res.error; resEl.style.color='var(--red)';} return false; }
  if (!res.provider) { if(resEl){resEl.textContent='Could not detect provider'; resEl.style.color='var(--red)';} return false; }

  // Switch to the detected provider tab
  S.providers[role] = res.provider;
  const tab = document.querySelector(`.provider-tabs[data-role="${role}"] .ptab[data-provider="${res.provider}"]`);
  if (tab) { document.querySelectorAll(`.provider-tabs[data-role="${role}"] .ptab`).forEach(t=>t.classList.remove('active')); tab.classList.add('active'); }
  switchProviderFields(role, res.provider);

  // Fill in fields
  if (res.provider==='azure') {
    const ep=$(`${role}-endpoint`); if(ep&&res.endpoint) ep.value=res.endpoint;
    const dep=$(`${role}-deployment`); if(dep&&res.model) dep.value=res.model;
    const ver=$(`${role}-version`); if(ver&&res.version) ver.value=res.version;
  } else if (res.provider==='azure_claude') {
    const ep=$(`${role}-az-claude-endpoint`); if(ep&&res.endpoint) ep.value=res.endpoint;
    const sel=$(`${role}-az-claude-model`);
    if (sel&&res.model) { const opt=Array.from(sel.options).find(o=>o.value===res.model); if(opt) sel.value=res.model; else { sel.value='__custom__'; const c=$(`${role}-az-claude-custom-wrap`); if(c) c.style.display=''; const ci=$(`${role}-az-claude-model-custom`); if(ci) ci.value=res.model; } }
  } else if (res.provider==='azure_oai_foundry') {
    const ep=$(`${role}-az-oai-endpoint`); if(ep&&res.endpoint) ep.value=res.endpoint;
    const sel=$(`${role}-az-oai-model`);
    if (sel&&res.model) { const opt=Array.from(sel.options).find(o=>o.value===res.model); if(opt) sel.value=res.model; else { sel.value='__custom__'; const c=$(`${role}-az-oai-custom-wrap`); if(c) c.style.display=''; const ci=$(`${role}-az-oai-model-custom`); if(ci) ci.value=res.model; } }
  } else if (res.provider==='claude'||res.provider==='openai') {
    const sel=$(`${role}-model-${res.provider}`);
    if (sel&&res.model) { const opt=Array.from(sel.options).find(o=>o.value===res.model); if(opt) sel.value=res.model; else { sel.value='__custom__'; const c=$(`${role}-${res.provider}-custom-wrap`); if(c) c.style.display=''; const ci=$(`${role}-model-${res.provider}-custom`); if(ci) ci.value=res.model; } }
  } else if (res.provider==='bedrock') {
    if (res.region) { const r=$(`${role}-bedrock-region`); if(r) r.value=res.region; }
    if (res.model)  {
      const sel=$(`${role}-bedrock-profile`);
      if (sel) { const opt=Array.from(sel.options).find(o=>o.value===res.model); if(opt) sel.value=res.model; else { sel.value='__custom__'; const c=$(`${role}-bedrock-custom-wrap`); if(c) c.style.display=''; const ci=$(`${role}-bedrock-profile-custom`); if(ci) ci.value=res.model; } }
    }
  }
  if (res.key) { const k=$(`${role}-key`); if(k) k.value=res.key; }
  if (resEl) { resEl.textContent=`Applied: ${res.provider} — ${res.model||res.endpoint||''}. Enter key if not detected, then test.`; resEl.style.color='var(--teal)'; }
  return true;
}

// Inline CURL toggles
$('btn-curl-target-toggle').addEventListener('click', () => {
  const area=$('curl-target-area'); if(!area) return;
  const open = area.style.display!=='none'; area.style.display=open?'none':'';
  $('btn-curl-target-toggle').textContent=open?'▼ Import from CURL':'▲ Hide CURL';
});
$('btn-apply-target-curl-any').addEventListener('click', () => applyCurlToRole(val('target-curl-any'),'target','curl-result-target-any'));

// Chat CURL import
$('btn-chat-curl-import').addEventListener('click', () => {
  const banner=$('curl-import-banner'); banner.style.display=banner.style.display==='none'?'':'none';
});
$('btn-cancel-curl').addEventListener('click', () => { $('curl-import-banner').style.display='none'; });
$('btn-apply-chat-curl').addEventListener('click', async () => {
  const curlStr = val('chat-curl-input');
  const res = CURLParser.parse(curlStr);
  const resEl = $('result-curl-chat');
  if (res.error||!res.provider) { if(resEl){resEl.textContent='Error: '+(res.error||'unknown provider'); resEl.style.color='var(--red)';} return; }
  if (!res.key) { if(resEl){resEl.textContent='No API key found in curl command — add manually'; resEl.style.color='var(--amber)';} return; }
  if(resEl){resEl.textContent='Testing connection…'; resEl.style.color='var(--text-2)';}
  try {
    await ModelClient.test(res);
    S.cfgs.curl_custom = res; S.connected.curl_custom = true;
    $('curl-chat-tab').style.display='';
    $('chat-mtab-lbl-curl').textContent=(res.model||res.provider).substring(0,14);
    if(resEl){resEl.textContent=`✓ Connected — ${res.provider}/${res.model||''}`;resEl.style.color='var(--teal)';}
    // Switch to curl tab
    document.querySelectorAll('.chat-mtab').forEach(t=>t.classList.remove('active'));
    $('curl-chat-tab').classList.add('active');
    S.activeChatRole='curl_custom'; updateChatMeta();
    $('curl-import-banner').style.display='none';
  } catch(e) { if(resEl){resEl.textContent='✗ '+e.message.substring(0,100); resEl.style.color='var(--red)';} }
});

// ── Security Audit ────────────────────────────────────────────────────────────
$('btn-run-audit').addEventListener('click', () => {
  const issues=[],ok=[];
  ['target','eval','redteam'].forEach(role => {
    const provider=S.providers[role];
    if (provider==='azure') {
      const ep=val(`${role}-endpoint`).replace(/\/$/,'');
      if(ep&&!SEC.validateEndpoint('azure',ep)) issues.push({sev:'HIGH',msg:`${role} Azure endpoint fails validation — possible SSRF`});
      else if(ep) ok.push(`${role} Azure endpoint validated`);
    }
    if (provider==='azure_claude') {
      const ep=val(`${role}-az-claude-endpoint`).replace(/\/$/,'');
      if(ep&&!SEC.validateEndpoint('azure_claude',ep)) issues.push({sev:'HIGH',msg:`${role} Azure Foundry Claude endpoint must be *.services.ai.azure.com`});
      else if(ep) ok.push(`${role} Azure Foundry Claude endpoint validated`);
    }
    if (provider==='azure_oai_foundry') {
      const ep=val(`${role}-az-oai-endpoint`).replace(/\/$/,'');
      if(ep&&!SEC.validateEndpoint('azure_oai_foundry',ep)) issues.push({sev:'HIGH',msg:`${role} Azure Foundry (OpenAI) endpoint must be *.services.ai.azure.com`});
      else if(ep) ok.push(`${role} Azure Foundry (OpenAI) endpoint validated`);
    }
    if (provider==='huggingface') {
      const ep=val(`${role}-hf-endpoint`);
      if(ep&&!SEC.validateEndpoint('huggingface',ep)) issues.push({sev:'HIGH',msg:`${role} HF endpoint must be *.huggingface.co or *.endpoints.huggingface.cloud`});
    }
    if (provider==='bedrock') {
      const region = val(`${role}-bedrock-region`).trim();
      const accessKeyId = val(`${role}-bedrock-access-key-id`).trim();
      const sel = $(`${role}-bedrock-profile`);
      const profile = sel && sel.value!=='__custom__' ? sel.value : (val(`${role}-bedrock-profile-custom`)||'').trim();
      if (region && !SEC.validateAwsRegion(region)) issues.push({sev:'HIGH',msg:`${role} Bedrock region must look like us-east-1 / eu-west-2`});
      else if (region) ok.push(`${role} Bedrock region validated`);
      if (accessKeyId && !SEC.validateAwsAccessKey(accessKeyId)) issues.push({sev:'MEDIUM',msg:`${role} Bedrock Access Key ID format unexpected`});
      if (profile && !SEC.validateBedrockProfile(profile)) issues.push({sev:'HIGH',msg:`${role} Bedrock profile / model id fails validation`});
    }
    const k=val(`${role}-key`); if(!k){issues.push({sev:'INFO',msg:`${role} key not entered`});return;}
    if(k.length<16) issues.push({sev:'HIGH',msg:`${role} key too short`});
    if(provider==='claude'&&!k.startsWith('sk-ant-')) issues.push({sev:'MEDIUM',msg:`${role} Claude key should start with sk-ant-`});
    if(provider==='openai'&&!k.startsWith('sk-')) issues.push({sev:'MEDIUM',msg:`${role} OpenAI key should start with sk-`});
    if(provider==='huggingface'&&!k.startsWith('hf_')) issues.push({sev:'LOW',msg:`${role} HF token should start with hf_`});
    if(provider==='bedrock'&&k.length<30) issues.push({sev:'MEDIUM',msg:`${role} Bedrock secret key looks short (AWS secret access keys are typically 40 chars)`});
  });
  if(S.providers.redteam==='azure') issues.push({sev:'HIGH',msg:'Red Team set to Azure OpenAI — Azure content filter will block many attack prompt generations. Use Claude or Azure Foundry Claude instead.'});
  if (isCredentialsRemembered() && localStorage.getItem(CREDENTIALS_KEY)) {
    issues.push({ sev:'MEDIUM', msg:'Credentials: PERSISTED to localStorage (Settings → "Remember API keys" is ON). Anyone with browser access can read them via DevTools.' });
  } else {
    ok.push('Credentials: memory-only (Settings → "Remember API keys" is OFF)');
  }
  ok.push('CSP: restricts connections to known API endpoints only');
  ok.push('Input sanitization: null bytes, control chars stripped, length capped');
  ok.push('Rate limiter: 60 req/min per provider enforced');
  ok.push('YAML export: API keys never included');
  ok.push('CURL parser: only allowed endpoints accepted');
  const container=$('audit-results');
  const sevColor={HIGH:'#ef4444',MEDIUM:'#f59e0b',LOW:'#3b82f6',INFO:'#8888a8'};
  container.innerHTML=[
    ...issues.map(i=>`<div class="audit-row"><span class="audit-sev" style="color:${sevColor[i.sev]};border-color:${sevColor[i.sev]}44;background:${sevColor[i.sev]}15">${i.sev}</span><span class="audit-msg">${esc(i.msg)}</span></div>`),
    ...ok.map(m=>`<div class="audit-row"><span class="audit-sev" style="color:#22c55e;border-color:#22c55e44;background:#22c55e15">OK</span><span class="audit-msg" style="color:var(--text-2)">${esc(m)}</span></div>`)
  ].join('');
});

// ── YAML import/export ────────────────────────────────────────────────────────
$('btn-export-yaml').addEventListener('click', () => {
  const sections={};
  ['target','eval','redteam'].forEach(role => {
    const provider=S.providers[role]; let model='',endpoint='',version='';
    if(provider==='azure'){model=val(`${role}-deployment`);endpoint=val(`${role}-endpoint`);version=val(`${role}-version`)||'2024-02-15-preview';}
    else if(provider==='azure_claude'){const sel=$(`${role}-az-claude-model`);model=sel&&sel.value!=='__custom__'?sel.value:val(`${role}-az-claude-model-custom`);endpoint=val(`${role}-az-claude-endpoint`);}
    else if(provider==='azure_oai_foundry'){const sel=$(`${role}-az-oai-model`);model=sel&&sel.value!=='__custom__'?sel.value:val(`${role}-az-oai-model-custom`);endpoint=val(`${role}-az-oai-endpoint`);}
    else if(provider==='huggingface'){const sel=$(`${role}-model-hf`);model=sel&&sel.value!=='__custom__'?sel.value:val(`${role}-model-hf-custom`);endpoint=val(`${role}-hf-endpoint`);}
    else if(provider==='bedrock'){const sel=$(`${role}-bedrock-profile`);model=sel&&sel.value!=='__custom__'?sel.value:val(`${role}-bedrock-profile-custom`);}
    else{const sel=$(`${role}-model-${provider}`);model=sel&&sel.value!=='__custom__'?sel.value:val(`${role}-model-${provider}-custom`);}
    const section={provider,model,endpoint,version};
    if(provider==='bedrock'){section.region=val(`${role}-bedrock-region`); section.accessKeyId=val(`${role}-bedrock-access-key-id`);}
    sections[role]=section;
  });
  $('yaml-modal-title').textContent='Export Configuration (keys redacted)';
  $('yaml-modal-content').value=YAML.stringify(sections);
  $('yaml-modal-result').textContent='';
  $('yaml-modal').style.display='flex';
});
$('btn-import-yaml').addEventListener('click', () => {
  $('yaml-modal-title').textContent='Import YAML Configuration';
  $('yaml-modal-content').value=''; $('yaml-modal-result').textContent='Paste YAML then click Apply.';
  $('yaml-modal').style.display='flex';
});
$('btn-yaml-apply').addEventListener('click', () => {
  const raw=val('yaml-modal-content'), data=YAML.parse(raw), res=$('yaml-modal-result'); let applied=0;
  ['target','eval','redteam'].forEach(role => {
    const cfg=data[role]; if(!cfg||!cfg.provider) return;
    const provider=cfg.provider; if(!['azure','azure_claude','azure_oai_foundry','openai','claude','huggingface','bedrock'].includes(provider)) return;
    S.providers[role]=provider;
    const tab=document.querySelector(`.provider-tabs[data-role="${role}"] .ptab[data-provider="${provider}"]`);
    if(tab){document.querySelectorAll(`.provider-tabs[data-role="${role}"] .ptab`).forEach(t=>t.classList.remove('active'));tab.classList.add('active');}
    switchProviderFields(role,provider);
    if(provider==='azure'){if(cfg.endpoint){const e=$(`${role}-endpoint`);if(e)e.value=cfg.endpoint;}if(cfg.model){const e=$(`${role}-deployment`);if(e)e.value=cfg.model;}if(cfg.version){const e=$(`${role}-version`);if(e)e.value=cfg.version;}}
    else if(provider==='azure_claude'){if(cfg.endpoint){const e=$(`${role}-az-claude-endpoint`);if(e)e.value=cfg.endpoint;}if(cfg.model){const sel=$(`${role}-az-claude-model`);if(sel){const opt=Array.from(sel.options).find(o=>o.value===cfg.model);if(opt)sel.value=cfg.model;}}}
    else if(provider==='azure_oai_foundry'){
      if(cfg.endpoint){const e=$(`${role}-az-oai-endpoint`);if(e)e.value=cfg.endpoint;}
      if(cfg.model){const sel=$(`${role}-az-oai-model`);if(sel){const opt=Array.from(sel.options).find(o=>o.value===cfg.model);if(opt)sel.value=cfg.model;else{sel.value='__custom__';const c=$(`${role}-az-oai-custom-wrap`);if(c)c.style.display='';const ci=$(`${role}-az-oai-model-custom`);if(ci)ci.value=cfg.model;}}}
    }
    else if(provider==='bedrock'){
      if(cfg.region){const e=$(`${role}-bedrock-region`);if(e)e.value=cfg.region;}
      // accessKeyId is filtered from YAML export by the secret-redaction rule, but accept it on import if present.
      if(cfg.accessKeyId){const e=$(`${role}-bedrock-access-key-id`);if(e)e.value=cfg.accessKeyId;}
      if(cfg.model){const sel=$(`${role}-bedrock-profile`);if(sel){const opt=Array.from(sel.options).find(o=>o.value===cfg.model);if(opt)sel.value=cfg.model;else{sel.value='__custom__';const c=$(`${role}-bedrock-custom-wrap`);if(c)c.style.display='';const ci=$(`${role}-bedrock-profile-custom`);if(ci)ci.value=cfg.model;}}}
    }
    applied++;
  });
  if(applied>0){res.textContent=`Applied ${applied} role(s). Enter API keys then test.`;res.style.color='var(--teal)';}
  else{res.textContent='No valid config found.';res.style.color='var(--red)';}
});
$('btn-yaml-copy').addEventListener('click', () => navigator.clipboard.writeText($('yaml-modal-content').value).then(()=>$('yaml-modal-result').textContent='Copied.').catch(()=>$('yaml-modal-result').textContent='Copy failed.'));
$('yaml-modal-close').addEventListener('click',()=>$('yaml-modal').style.display='none');
$('yaml-modal').addEventListener('click',e=>{if(e.target.id==='yaml-modal')$('yaml-modal').style.display='none';});

// ── Chat ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.chat-mtab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.chat-mtab').forEach(t=>t.classList.remove('active')); tab.classList.add('active');
    S.activeChatRole=tab.dataset.chatmodel; updateChatMeta();
    const sys=$('chat-system'); if(sys) sys.value=S.chatSystemPrompts[S.activeChatRole]||'';
  });
});
function updateChatMeta() {
  const role=S.activeChatRole, cfg=S.cfgs[role];
  $('chat-info-provider').textContent=cfg?cfg.provider:'—';
  $('chat-info-model').textContent=cfg?cfgDisplayName(cfg):'—';
  const hist=S.chatHistories[role]||[];
  $('chat-msg-count').textContent=hist.length;
  $('chat-tokens').textContent=hist.reduce((a,m)=>a+Math.ceil((m.content||'').length/4),0).toLocaleString();
}
async function sendChat(text) {
  if(!text.trim()) return;
  const role=S.activeChatRole, cfg=S.cfgs[role], msgs=$('chat-messages');
  if(!cfg||!S.connected[role]){appendBubble('system','Model not connected. Configure and test in Configuration or Import CURL.');return;}
  const safe=SEC.sanitize(text,4000); appendBubble('user',safe);
  S.chatHistories[role].push({role:'user',content:safe});
  $('chat-input').value=''; $('chat-input').style.height='auto'; $('chat-send').disabled=true;
  const typing=appendBubble('assistant',''); typing.innerHTML='<div class="typing-dots"><span></span><span></span><span></span></div>';
  try {
    const reply=await ModelClient.call({...cfg},S.chatHistories[role],{maxTokens:1000,temperature:0.7,systemPrompt:S.chatSystemPrompts[role]||undefined});
    typing.className='chat-bubble assistant'; typing.textContent=reply;
    S.chatHistories[role].push({role:'assistant',content:reply});
  } catch(e) { typing.className='chat-bubble system-msg'; typing.textContent='Error: '+e.message; S.chatHistories[role].pop(); }
  $('chat-send').disabled=false; updateChatMeta(); msgs.scrollTop=msgs.scrollHeight;
}
function appendBubble(role, content) {
  const msgs=$('chat-messages'), w=msgs.querySelector('.chat-welcome'); if(w) w.remove();
  const div=document.createElement('div');
  div.className=role==='user'?'chat-bubble user':role==='assistant'?'chat-bubble assistant':'chat-bubble system-msg';
  div.textContent=content; msgs.appendChild(div); msgs.scrollTop=msgs.scrollHeight; return div;
}
$('chat-send').addEventListener('click',()=>sendChat(val('chat-input')));
$('chat-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat(val('chat-input'));}});
$('chat-input').addEventListener('input',()=>{const el=$('chat-input');el.style.height='auto';el.style.height=Math.min(el.scrollHeight,120)+'px';});
$('btn-clear-chat').addEventListener('click',()=>{S.chatHistories[S.activeChatRole]=[];$('chat-messages').innerHTML='<div class="chat-welcome"><svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M4 4h24v18H17l-5 6V22H4V4z" stroke="#3b82f6" stroke-width="1.5" fill="rgba(59,130,246,0.08)"/><circle cx="10" cy="13" r="1.5" fill="#3b82f6"/><circle cx="16" cy="13" r="1.5" fill="#3b82f6"/><circle cx="22" cy="13" r="1.5" fill="#3b82f6"/></svg><p>Chat cleared.</p></div>';updateChatMeta();});
$('btn-apply-system').addEventListener('click',()=>{S.chatSystemPrompts[S.activeChatRole]=$('chat-system').value.trim();appendBubble('system',S.chatSystemPrompts[S.activeChatRole]?'System prompt applied.':'System prompt cleared.');});
document.querySelectorAll('.probe-btn').forEach(btn=>btn.addEventListener('click',()=>sendChat(btn.dataset.prompt)));

// ── Attack builder ────────────────────────────────────────────────────────────
function renderCategoryGrid() {
  const grid=$('category-grid'); grid.innerHTML='';
  const cats = Object.entries(ATTACK_CATEGORIES);
  cats.forEach(([id, label]) => {
    const sel=S.selectedCategories.has(id);
    const pill=document.createElement('div'); pill.className='cat-pill'+(sel?' selected':'');
    pill.dataset.id=id; pill.textContent=label;
    pill.addEventListener('click',()=>{
      if(S.selectedCategories.has(id)){S.selectedCategories.delete(id);pill.classList.remove('selected');}
      else{S.selectedCategories.add(id);pill.classList.add('selected');}
      updateCatCount();
    });
    grid.appendChild(pill);
  });
  updateCatCount();
}
function updateCatCount() { $('cat-selected-count').textContent=S.selectedCategories.size+' selected'; }
$('btn-cat-all').addEventListener('click',()=>{Object.keys(ATTACK_CATEGORIES).forEach(id=>S.selectedCategories.add(id));renderCategoryGrid();});
$('btn-cat-none').addEventListener('click',()=>{S.selectedCategories.clear();renderCategoryGrid();});

function renderTechniqueGrid() {
  const grid=$('technique-grid'); grid.innerHTML='';
  TECHNIQUES.forEach(tech => {
    const sel=S.selectedTechniques.has(tech.id);
    const card=document.createElement('div'); card.className='technique-card'+(sel?' selected':'');
    card.innerHTML=`<div class="tech-check">${sel?'✓':''}</div><div class="tech-name">${esc(tech.name)}</div><div class="tech-desc">${esc(tech.description)}</div><div class="tech-tag"><span class="badge ${esc(tech.badge)}">${esc(tech.badgeLabel)}</span></div>`;
    card.addEventListener('click',()=>{
      if(S.selectedTechniques.has(tech.id)){S.selectedTechniques.delete(tech.id);card.classList.remove('selected');card.querySelector('.tech-check').textContent='';}
      else{S.selectedTechniques.add(tech.id);card.classList.add('selected');card.querySelector('.tech-check').textContent='✓';}
      updateTechCount(); renderPerTechTurns();
    });
    grid.appendChild(card);
  });
  updateTechCount(); renderPerTechTurns();
}
function updateTechCount() { $('tech-selected-count').textContent=`${S.selectedTechniques.size} of ${TECHNIQUES.length} selected`; }
$('btn-select-all').addEventListener('click',()=>{TECHNIQUES.forEach(t=>S.selectedTechniques.add(t.id));renderTechniqueGrid();});
$('btn-deselect-all').addEventListener('click',()=>{S.selectedTechniques.clear();renderTechniqueGrid();});

// ── Filter-Layer Probes (Phase B) ────────────────────────────────────────────
function renderFilterProbeGrid() {
  const grid = $('filter-tech-grid');
  if (!grid || typeof FILTER_TECHNIQUES === 'undefined') return;
  grid.innerHTML = '';
  FILTER_TECHNIQUES.forEach(tech => {
    const sel = S.selectedFilterProbes.has(tech.id);
    const card = document.createElement('div');
    card.className = 'technique-card' + (sel ? ' selected' : '');
    card.innerHTML = `<div class="tech-check">${sel?'✓':''}</div><div class="tech-name">${esc(tech.name)}</div><div class="tech-desc">${esc(tech.description)}</div><div class="tech-tag"><span class="badge ${esc(tech.badge)}">${esc(tech.badgeLabel)}</span></div>`;
    card.addEventListener('click', () => {
      if (S.selectedFilterProbes.has(tech.id)) { S.selectedFilterProbes.delete(tech.id); card.classList.remove('selected'); card.querySelector('.tech-check').textContent=''; }
      else                                      { S.selectedFilterProbes.add(tech.id);    card.classList.add('selected');    card.querySelector('.tech-check').textContent='✓'; }
      updateFilterCount();
    });
    grid.appendChild(card);
  });
  updateFilterCount();
}
function updateFilterCount() {
  const el = $('filter-selected-count'); if (!el) return;
  const total = (typeof FILTER_TECHNIQUES !== 'undefined') ? FILTER_TECHNIQUES.length : 0;
  el.textContent = `${S.selectedFilterProbes.size} of ${total} selected`;
}
$('btn-filter-all') && $('btn-filter-all').addEventListener('click', () => {
  if (typeof FILTER_TECHNIQUES === 'undefined') return;
  FILTER_TECHNIQUES.forEach(t => S.selectedFilterProbes.add(t.id));
  renderFilterProbeGrid();
});
$('btn-filter-none') && $('btn-filter-none').addEventListener('click', () => {
  S.selectedFilterProbes.clear(); renderFilterProbeGrid();
});
renderFilterProbeGrid();

// ── Attack Builder family-summary updater ───────────────────────────────────
// Keeps the unified Attack Builder's three family cards in sync with whatever
// is selected in each family's dedicated builder.
function updateAttackBuilderFamilySummary() {
  const llmCount = (S.selectedTechniques ? S.selectedTechniques.size : 0)
                 + (S.selectedFilterProbes ? S.selectedFilterProbes.size : 0);
  const ragCount     = S.selectedRagTechniques     ? S.selectedRagTechniques.size     : 0;
  const surfaceCount = S.selectedSurfaceProbes     ? S.selectedSurfaceProbes.size     : 0;

  const ragOn     = !!($('target-rag-enabled')     && $('target-rag-enabled').checked);
  const surfaceOn = !!($('target-surface-enabled') && $('target-surface-enabled').checked);

  const llm = $('ab-llm-count');     if (llm) llm.textContent = llmCount;
  const rag = $('ab-rag-count');     if (rag) rag.textContent = ragCount;
  const sur = $('ab-surface-count'); if (sur) sur.textContent = surfaceCount;

  const ragStatus = $('ab-rag-status');
  if (ragStatus) {
    if (!ragOn) ragStatus.textContent = 'Disabled — turn on in Target config';
    else if (ragCount === 0) ragStatus.textContent = 'Enabled · no probes selected';
    else ragStatus.textContent = `Enabled · ${ragCount} probes selected`;
  }
  const surStatus = $('ab-surface-status');
  if (surStatus) {
    if (!surfaceOn) surStatus.textContent = 'Disabled — turn on in Target config';
    else if (surfaceCount === 0) surStatus.textContent = 'Enabled · no probes selected';
    else surStatus.textContent = `Enabled · ${surfaceCount} probes selected`;
  }

  // Launch summary
  const cats = S.selectedCategories ? S.selectedCategories.size : 0;
  const totalProbes = llmCount + ragCount + surfaceCount;
  const summary = $('ab-launch-summary');
  if (summary) {
    if (totalProbes === 0)        summary.textContent = 'Pick at least one probe in any family.';
    else if (cats === 0)          summary.textContent = `${totalProbes} probes selected — pick at least one Attack Category.`;
    else                          summary.textContent = `${totalProbes} probes × ${cats} categories = ${totalProbes*cats} attack jobs. Ready.`;
  }
}

// Hook into existing renderers so the summary stays current.
// The originals already exist as updateTechCount / updateCatCount / updateRagLaunchSummary /
// updateFilterCount / updateSurfaceLayerCounts. We patch them to also call our updater.
(function patchSummaryHooks(){
  const wrap = (name) => {
    if (typeof window[name] !== 'function') return;
    const orig = window[name];
    window[name] = function(...args){ const r = orig.apply(this, args); updateAttackBuilderFamilySummary(); return r; };
  };
  // These run after their respective renderers redefine globals, so we use a
  // generic post-event approach: listen to clicks on the relevant grids/chips.
  ['technique-grid','category-grid','filter-tech-grid','rag-domain-grid'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => setTimeout(updateAttackBuilderFamilySummary, 0));
  });
  document.querySelectorAll('.surface-tech-grid').forEach(g => {
    g.addEventListener('click', () => setTimeout(updateAttackBuilderFamilySummary, 0));
  });
  // Also flip when the target toggles flip
  ['target-rag-enabled','target-surface-enabled'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateAttackBuilderFamilySummary);
  });
  // And on any "All / None" button click
  document.querySelectorAll('.btn-xs').forEach(b => b.addEventListener('click', () => setTimeout(updateAttackBuilderFamilySummary, 0)));
})();

// Initial render once everything is loaded
setTimeout(updateAttackBuilderFamilySummary, 0);

// ── Surface-Layer Probes (Application Surface Probes — OWASP-LLM aligned) ────
const SURFACE_LAYER_COUNT_IDS = {
  output_handling: 'surface-out-count',
  tool_call:       'surface-tool-count',
  disclosure:      'surface-disc-count',
  resource:        'surface-res-count'
};

function renderSurfaceTargetCheckboxes() {
  document.querySelectorAll('.surface-tgt').forEach(cb => {
    const k = cb.dataset.key;
    cb.checked = !!S.targetSurface[k];
    if (!cb._wired) {
      cb._wired = true;
      cb.addEventListener('change', () => {
        S.targetSurface[k] = cb.checked;
        updateSurfaceTargetCount();
        renderSurfaceProbeGrid();
        updateSurfaceLaunchSummary();
      });
    }
  });
  updateSurfaceTargetCount();
}
function updateSurfaceTargetCount() {
  const n = Object.keys(S.targetSurface).filter(k => S.targetSurface[k]).length;
  const el = $('surface-tgt-count'); if (el) el.textContent = `${n} declared`;
}

function renderSurfaceProbeGrid() {
  if (typeof SURFACE_TECHNIQUES === 'undefined') return;
  document.querySelectorAll('.surface-tech-grid').forEach(grid => {
    const layer = grid.dataset.layer;
    grid.innerHTML = '';
    const probes = SURFACE_TECHNIQUES.filter(t => t.surface_class === layer);
    probes.forEach(tech => {
      const sel = S.selectedSurfaceProbes.has(tech.id);
      // Precondition gating — visually disable cards whose preconditions aren't declared
      const preMissing = (tech.precondition && Array.isArray(tech.precondition.requires))
        ? tech.precondition.requires.filter(r => !S.targetSurface[r])
        : [];
      const dimmed = preMissing.length > 0;
      const card = document.createElement('div');
      card.className = 'technique-card' + (sel ? ' selected' : '') + (dimmed ? ' surface-disabled' : '');
      if (dimmed) card.style.opacity = '0.45';
      card.innerHTML = `<div class="tech-check">${sel?'✓':''}</div><div class="tech-name">${esc(tech.name)}</div><div class="tech-desc">${esc(tech.description)}</div><div class="tech-tag"><span class="badge ${esc(tech.badge)}">${esc(tech.badgeLabel)}</span>${dimmed ? `<span class="badge badge-gray" title="Requires: ${esc(preMissing.join(', '))}" style="margin-left:4px">PRE</span>` : ''}</div>`;
      card.title = dimmed ? `Will skip — declare: ${preMissing.join(', ')}` : '';
      card.addEventListener('click', () => {
        if (S.selectedSurfaceProbes.has(tech.id)) { S.selectedSurfaceProbes.delete(tech.id); card.classList.remove('selected'); card.querySelector('.tech-check').textContent=''; }
        else                                       { S.selectedSurfaceProbes.add(tech.id);    card.classList.add('selected');    card.querySelector('.tech-check').textContent='✓'; }
        updateSurfaceLayerCounts(); updateSurfaceLaunchSummary();
      });
      grid.appendChild(card);
    });
  });
  updateSurfaceLayerCounts();
}
function updateSurfaceLayerCounts() {
  if (typeof SURFACE_TECHNIQUES === 'undefined') return;
  ['output_handling','tool_call','disclosure','resource'].forEach(layer => {
    const total = SURFACE_TECHNIQUES.filter(t => t.surface_class === layer).length;
    const sel   = SURFACE_TECHNIQUES.filter(t => t.surface_class === layer && S.selectedSurfaceProbes.has(t.id)).length;
    const el    = $(SURFACE_LAYER_COUNT_IDS[layer]); if (el) el.textContent = `${sel} of ${total} selected`;
  });
}
function updateSurfaceLaunchSummary() {
  const el = $('surface-launch-summary'); if (!el) return;
  const total = S.selectedSurfaceProbes.size;
  const declared = Object.keys(S.targetSurface).filter(k => S.targetSurface[k]).length;
  if (total === 0)        el.textContent = 'Pick at least one surface probe above.';
  else if (declared === 0) el.textContent = `${total} probes selected — but no target surface declared. All will be skipped.`;
  else {
    // Count how many of the selected probes are actually applicable
    const applicable = SURFACE_TECHNIQUES.filter(t => S.selectedSurfaceProbes.has(t.id) && (
      !t.precondition || (t.precondition.requires||[]).every(r => S.targetSurface[r])
    )).length;
    el.textContent = `${total} probes selected · ${applicable} will run · ${total-applicable} will skip (preconditions unmet) · ${declared} surface keys declared`;
  }
}

document.querySelectorAll('.surface-layer-all').forEach(b => b.addEventListener('click', () => {
  const layer = b.dataset.layer;
  if (typeof SURFACE_TECHNIQUES === 'undefined') return;
  SURFACE_TECHNIQUES.filter(t => t.surface_class === layer).forEach(t => S.selectedSurfaceProbes.add(t.id));
  renderSurfaceProbeGrid(); updateSurfaceLaunchSummary();
}));
document.querySelectorAll('.surface-layer-none').forEach(b => b.addEventListener('click', () => {
  const layer = b.dataset.layer;
  if (typeof SURFACE_TECHNIQUES === 'undefined') return;
  SURFACE_TECHNIQUES.filter(t => t.surface_class === layer).forEach(t => S.selectedSurfaceProbes.delete(t.id));
  renderSurfaceProbeGrid(); updateSurfaceLaunchSummary();
}));
$('btn-surface-tgt-all') && $('btn-surface-tgt-all').addEventListener('click', () => {
  document.querySelectorAll('.surface-tgt').forEach(cb => { S.targetSurface[cb.dataset.key] = true; cb.checked = true; });
  updateSurfaceTargetCount(); renderSurfaceProbeGrid(); updateSurfaceLaunchSummary();
});
$('btn-surface-tgt-none') && $('btn-surface-tgt-none').addEventListener('click', () => {
  document.querySelectorAll('.surface-tgt').forEach(cb => { S.targetSurface[cb.dataset.key] = false; cb.checked = false; });
  updateSurfaceTargetCount(); renderSurfaceProbeGrid(); updateSurfaceLaunchSummary();
});
$('btn-start-surface-attack') && $('btn-start-surface-attack').addEventListener('click', () => {
  if (S.selectedSurfaceProbes.size === 0) {
    showModal('No Surface Probes', 'Select at least one Surface Probe across the four layer sections.');
    return;
  }
  // Delegate to the regular launch path — it already accepts surface-only sessions via tgtCfg.surfaceTechniques
  $('btn-start-attack').click();
});

renderSurfaceTargetCheckboxes();
renderSurfaceProbeGrid();
updateSurfaceLaunchSummary();

function renderPerTechTurns() {
  const grid=$('per-tech-turns-grid'); if(!grid) return;
  const selected=TECHNIQUES.filter(t=>S.selectedTechniques.has(t.id));
  if(!selected.length){grid.innerHTML='<span style="color:var(--text-3);font-size:12px">Select techniques above.</span>';return;}
  grid.innerHTML='';
  selected.forEach(tech=>{
    const def=(typeof TECHNIQUE_DEFAULT_TURNS!=='undefined'&&TECHNIQUE_DEFAULT_TURNS[tech.id])||10;
    const cur=S.perTechTurns[tech.id]||def;
    const row=document.createElement('div'); row.className='per-tech-row';
    row.innerHTML=`<span class="per-tech-name">${esc(tech.name)}</span><div class="per-tech-controls"><input type="range" class="per-tech-slider" min="3" max="20" value="${cur}" data-tech="${tech.id}" step="1"/><span class="per-tech-val" id="ptv-${tech.id}">${cur}</span><span class="per-tech-default">(def ${def})</span></div>`;
    row.querySelector('.per-tech-slider').addEventListener('input',e=>{S.perTechTurns[tech.id]=parseInt(e.target.value);$('ptv-'+tech.id).textContent=e.target.value;});
    grid.appendChild(row);
  });
}
$('btn-reset-turns').addEventListener('click',()=>{S.perTechTurns={};renderPerTechTurns();});

// ── RAG Attack Builder: domains + layer-grouped technique grids ──────────────
const RAG_LAYER_COUNT_IDS = {
  retrieval:'rag-ret-count', embedding:'rag-emb-count',
  context:'rag-ctx-count',   integration:'rag-int-count'
};

function renderDomainChipGrid() {
  const grid = $('rag-domain-grid'); if (!grid || typeof DOMAIN_INTENT_PACKS === 'undefined') return;
  grid.innerHTML = '';
  Object.keys(DOMAIN_INTENT_PACKS).forEach(id => {
    const pack = DOMAIN_INTENT_PACKS[id];
    const sel = S.selectedDomains.has(id);
    const pill = document.createElement('div');
    pill.className = 'cat-pill' + (sel ? ' selected' : '');
    pill.dataset.id = id;
    pill.textContent = pack.label;
    pill.title = `${pack.high_value_failure_modes.length} failure modes • ${pack.sensitive_assets.length} sensitive assets`;
    pill.addEventListener('click', () => {
      if (S.selectedDomains.has(id)) { S.selectedDomains.delete(id); pill.classList.remove('selected'); }
      else                            { S.selectedDomains.add(id);    pill.classList.add('selected'); }
      updateDomainCount(); updateRagLaunchSummary();
    });
    grid.appendChild(pill);
  });
  updateDomainCount();
}
function updateDomainCount() { const el=$('rag-dom-selected-count'); if(el) el.textContent = S.selectedDomains.size + ' selected'; }

function renderRagTechniqueGrid() {
  if (typeof RAG_TECHNIQUES === 'undefined') return;
  document.querySelectorAll('.rag-tech-grid').forEach(grid => {
    const layer = grid.dataset.layer;
    grid.innerHTML = '';
    const techs = RAG_TECHNIQUES.filter(t => t.layer === layer);
    techs.forEach(tech => {
      const sel = S.selectedRagTechniques.has(tech.id);
      const card = document.createElement('div');
      card.className = 'technique-card' + (sel ? ' selected' : '');
      card.innerHTML = `<div class="tech-check">${sel?'✓':''}</div><div class="tech-name">${esc(tech.name)}</div><div class="tech-desc">${esc(tech.description)}</div><div class="tech-tag"><span class="badge ${esc(tech.badge)}">${esc(tech.badgeLabel)}</span></div>`;
      card.addEventListener('click', () => {
        if (S.selectedRagTechniques.has(tech.id)) { S.selectedRagTechniques.delete(tech.id); card.classList.remove('selected'); card.querySelector('.tech-check').textContent=''; }
        else                                       { S.selectedRagTechniques.add(tech.id);    card.classList.add('selected');    card.querySelector('.tech-check').textContent='✓'; }
        updateRagLayerCounts(); updateRagLaunchSummary();
      });
      grid.appendChild(card);
    });
  });
  updateRagLayerCounts();
}
function updateRagLayerCounts() {
  if (typeof RAG_TECHNIQUES === 'undefined') return;
  ['retrieval','embedding','context','integration'].forEach(layer => {
    const total = RAG_TECHNIQUES.filter(t => t.layer === layer).length;
    const sel   = RAG_TECHNIQUES.filter(t => t.layer === layer && S.selectedRagTechniques.has(t.id)).length;
    const el    = $(RAG_LAYER_COUNT_IDS[layer]); if (el) el.textContent = `${sel} of ${total} selected`;
  });
}
function updateRagLaunchSummary() {
  const el = $('rag-launch-summary'); if (!el) return;
  const techCount = S.selectedRagTechniques.size;
  const domCount  = S.selectedDomains.size;
  const catCount  = S.selectedCategories.size;
  if (techCount === 0)      el.textContent = 'Pick at least one RAG technique above.';
  else if (domCount === 0)  el.textContent = `${techCount} techniques selected — pick at least one domain (or use 'All') for targeted intents.`;
  else if (catCount === 0)  el.textContent = `${techCount} techniques × ${domCount} domains — but no Attack Categories picked. Set categories on the regular Attack Builder.`;
  else                      el.textContent = `${techCount} RAG techniques × ${domCount} domains × ${catCount} categories. Ready.`;
}

document.querySelectorAll('.rag-layer-all').forEach(b => b.addEventListener('click', () => {
  const layer = b.dataset.layer;
  if (typeof RAG_TECHNIQUES === 'undefined') return;
  RAG_TECHNIQUES.filter(t => t.layer === layer).forEach(t => S.selectedRagTechniques.add(t.id));
  renderRagTechniqueGrid(); updateRagLaunchSummary();
}));
document.querySelectorAll('.rag-layer-none').forEach(b => b.addEventListener('click', () => {
  const layer = b.dataset.layer;
  if (typeof RAG_TECHNIQUES === 'undefined') return;
  RAG_TECHNIQUES.filter(t => t.layer === layer).forEach(t => S.selectedRagTechniques.delete(t.id));
  renderRagTechniqueGrid(); updateRagLaunchSummary();
}));
$('btn-rag-dom-all') && $('btn-rag-dom-all').addEventListener('click', () => {
  if (typeof DOMAIN_INTENT_PACKS === 'undefined') return;
  Object.keys(DOMAIN_INTENT_PACKS).forEach(id => S.selectedDomains.add(id));
  renderDomainChipGrid(); updateRagLaunchSummary();
});
$('btn-rag-dom-none') && $('btn-rag-dom-none').addEventListener('click', () => {
  S.selectedDomains.clear(); renderDomainChipGrid(); updateRagLaunchSummary();
});

// Render once on load (guarded; rag-attacks.js loads before app.js per script order)
renderDomainChipGrid();
renderRagTechniqueGrid();
updateRagLaunchSummary();

// (v8 — removed setRagNavVisible; nav is now always visible. Toggle controls
//  the in-view placeholder banner via wireRagToggle above.)

// Preview RAG intent — uses the first selected RAG tech + first domain + first category
$('btn-preview-rag-intent') && $('btn-preview-rag-intent').addEventListener('click', async () => {
  const prev = $('rag-intent-preview');
  let rtCfg; try { rtCfg = buildCfg('redteam'); } catch(e){ prev.textContent='Configure Red Team first.'; prev.style.display=''; return; }
  if (S.selectedRagTechniques.size === 0) { prev.textContent='Select at least one RAG technique.'; prev.style.display=''; return; }
  const tech = RAG_TECHNIQUES.find(t => S.selectedRagTechniques.has(t.id));
  const cat  = [...S.selectedCategories][0] || Object.keys(ATTACK_CATEGORIES)[0];
  prev.textContent = 'Generating…'; prev.style.display = '';
  const dummyTgt = {
    ragEnabled: true,
    ragStack:   val('target-rag-stack') || 'unknown',
    domains:    Array.from(S.selectedDomains),
    domain:     Array.from(S.selectedDomains)[0] || '',
    corpusHint: (val('rag-corpus-hint') || '').substring(0, 4000)
  };
  const dummy = new RedTeamAttacker({ rtCfg, tgtCfg: dummyTgt });
  const intent = await dummy.generateIntent(cat, tech).catch(e => 'Error: ' + e.message);
  prev.textContent = 'Intent: ' + intent;
});

// Launch RAG-builder session — same path as the regular launch button
$('btn-start-rag-attack') && $('btn-start-rag-attack').addEventListener('click', () => {
  if (S.selectedRagTechniques.size === 0) { showModal('No RAG Techniques','Select at least one RAG technique across the four layer sections.'); return; }
  $('btn-start-attack').click();
});

['max-turns','attacks-per-tech','req-delay','rt-temp','concurrency'].forEach(id=>{
  const m={'max-turns':'turns-val','attacks-per-tech':'attacks-val','req-delay':'delay-val','rt-temp':'temp-val','concurrency':'concurrency-val'};
  const el=$(id); if(el) el.addEventListener('input',e=>{const out=$(m[id]); if(out) out.textContent=e.target.value;});
});
document.querySelectorAll('input[name="intent-mode"]').forEach(r=>r.addEventListener('change',()=>{const manual=$('intent-manual').checked;$('intent-manual-section').style.display=manual?'':'none';}));

$('btn-preview-attack').addEventListener('click',async()=>{
  const isManual=$('intent-manual').checked, prev=$('intent-preview');
  if(isManual){prev.textContent=val('custom-intent')||'(no intent)';prev.style.display='';return;}
  let rtCfg; try{rtCfg=buildCfg('redteam');}catch(e){prev.textContent='Configure Red Team first.';prev.style.display='';return;}
  prev.textContent='Generating…'; prev.style.display='';
  const tech=TECHNIQUES.find(t=>S.selectedTechniques.has(t.id))||TECHNIQUES[0];
  const cat=[...S.selectedCategories][0]||Object.keys(ATTACK_CATEGORIES)[0];
  const dummy=new RedTeamAttacker({rtCfg,tgtCfg:{}});
  const intent=await dummy.generateIntent(cat,tech).catch(e=>'Error: '+e.message);
  prev.textContent='Intent: '+intent;
});

// ── Launch attack ─────────────────────────────────────────────────────────────
$('btn-start-attack').addEventListener('click',async()=>{
  let tgtCfg,rtCfg;
  try{tgtCfg=buildCfg('target');}catch(e){showModal('Target Not Configured',e.message);return;}
  try{rtCfg=buildCfg('redteam');}catch(e){showModal('Red Team Not Configured',e.message);return;}
  if(!S.connected.target||!S.connected.redteam){showModal('Not Connected','Test connections in Configuration first.');return;}
  const ragOn = !!(tgtCfg && tgtCfg.ragEnabled);
  const ragSelectedCount     = ragOn ? (tgtCfg.ragTechniques||[]).length : 0;
  const filterSelectedCount  = (tgtCfg && tgtCfg.filterTechniques)  ? tgtCfg.filterTechniques.length  : 0;
  const surfaceSelectedCount = (tgtCfg && tgtCfg.surfaceTechniques) ? tgtCfg.surfaceTechniques.length : 0;
  if(S.selectedTechniques.size===0 && ragSelectedCount===0 && filterSelectedCount===0 && surfaceSelectedCount===0){
    showModal('No Techniques',
      'Select at least one technique on the Attack Builder, or pick Filter / Surface / RAG probes from their respective builders.');
    return;
  }
  if(S.selectedCategories.size===0){showModal('No Categories','Select at least one attack category on the Attack Builder.');return;}

  const sessionName=val('session-name')||`Session ${new Date().toLocaleString()}`;
  if(rtCfg.provider==='azure'){const go=confirm('WARNING: Azure OpenAI as Red Team will likely hit content filter blocks. Recommend Claude or Azure Foundry Claude. Continue anyway?');if(!go)return;}

  // Navigate to live view
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelector('[data-view="live"]').classList.add('active');
  $('view-live').classList.add('active');
  $('live-session-name').textContent=`"${esc(sessionName)}"`;
  // Reset live turn table (keep sticky header, clear only body)
  if ($('turn-table-body')) {
    $('turn-table-body').innerHTML = '<div class="log-placeholder">Session log appears here…</div>';
  }
  _liveOpenRow = null;
  $('eval-progress-list').innerHTML=''; $('eval-progress-card').style.display='none';
  S.allRecords=[]; S.evaluatedRecords=[];
  // Reset the detail-view UI for a fresh session and switch to detail mode so
  // streaming records appear live when the user navigates to Results.
  $('score-banner').style.display='none';
  $('chart-card').style.display='none';
  S.activeDetailSessionId = '__current';
  $('detail-session-name').textContent = val('session-name') || 'Current session';
  $('detail-session-meta').textContent = `Live · running…`;
  _showResultsDetail();
  // Job count = (manual techniques + user-selected RAG techniques) × categories
  const numJobs = (S.selectedTechniques.size + ragSelectedCount + filterSelectedCount + surfaceSelectedCount) * S.selectedCategories.size;
  S.metrics={techniques:numJobs,turns:0,responses:0,breaks:0,done:0,errors:0};
  $('results-tbody').innerHTML='<tr><td colspan="8" class="empty-row">No results yet.</td></tr>';
  $('records-count').textContent='0 records'; updateMetrics();

  const maxTurns=parseInt(val('max-turns'))||10;
  const attacksPerTech=parseInt(val('attacks-per-tech'))||3;
  const delay=parseInt(val('req-delay'))||500;
  const temperature=parseFloat(val('rt-temp'))||0.9;
  const isManual=$('intent-manual').checked;
  const customIntent=isManual?val('custom-intent'):null;
  const parallelEval=$('parallel-eval-toggle').checked;

  const techniques=TECHNIQUES.filter(t=>S.selectedTechniques.has(t.id)).map(t=>({...t,customTurns:S.perTechTurns[t.id]||0}));
  const categories=[...S.selectedCategories];

  // Setup parallel evaluator if enabled
  let parallelEvaluator=null;
  if(parallelEval&&S.connected.eval){
    try {
      const evalCfg=buildCfg('eval');
      parallelEvaluator=new AttackEvaluator({ evalCfg, delay:600, onProgress:()=>{} });
    } catch(e){ addLogEntry({type:'system',message:'Parallel eval not available: '+e.message,technique:'System'}); }
  }

  if(parallelEval&&parallelEvaluator) $('eval-progress-card').style.display='block';

  // evalCfg passed to attacker for in-loop classifier (Upgrade 5).
  // Only attached if eval is configured; if not, attacker falls back to heuristics.
  let attackerEvalCfg = null;
  try { attackerEvalCfg = S.connected.eval ? buildCfg('eval') : null; } catch { attackerEvalCfg = null; }

  const concurrency = parseInt(val('concurrency')) || 1;

  // Auto-tune state — gated by breakArchiveEnabled. Empty objects when disabled.
  const tgtKey = targetCfgKeyOf(tgtCfg);
  S.activeAttacker=new RedTeamAttacker({
    rtCfg,tgtCfg,maxTurns,delay,temperature,sessionName,
    evalCfg: attackerEvalCfg,
    breakArchive: S.breakArchiveEnabled ? S.breakArchive : [],
    lessonsArchive:  S.breakArchiveEnabled ? S.lessonsArchive  : {},
    priorStats:      S.breakArchiveEnabled ? S.statsMatrix     : {},
    priorFailures:   S.breakArchiveEnabled ? S.failuresArchive : {},
    priorPayloadStats: S.breakArchiveEnabled ? S.payloadStats  : {},
    targetCfgKey:    tgtKey,
    concurrency,
    onLog:e=>addLogEntry(e),
    onMetric:t=>{if(t==='turns')S.metrics.turns++;else if(t==='responses')S.metrics.responses++;else if(t==='techniques_done')S.metrics.done++;updateMetrics();},
    onRecord:r=>{S.allRecords.push(r);if(r.error_type)S.metrics.errors++;appendResultRow(r);updateMetrics();},
    onTechniqueComplete: parallelEvaluator
      ? async (techRecords, techName) => {
          const validRecs=techRecords.filter(r=>!r.error_type&&r.eval_outcome==='pending');
          if(!validRecs.length) return;
          addEvalProgress(techName, 'evaluating', 0, validRecs.length);
          try {
            const evaluated=await parallelEvaluator.evaluateAll(validRecs);
            // Merge back
            evaluated.forEach(er=>{
              const idx=S.allRecords.findIndex(r=>r.timestamp===er.timestamp&&r.turn===er.turn&&r.technique===er.technique);
              if(idx>=0){S.allRecords[idx]={...S.allRecords[idx],...er};updateResultRow(idx,er);}
            });
            // Count at run-level (one verdict per run_id). The new evaluator returns
            // run_verdict in {'break','defended','filter_blocked','partial_filter_blocked','error'}.
            const runVerdicts=new Map();
            evaluated.forEach(r=>{ if(r.run_id && !runVerdicts.has(r.run_id)) runVerdicts.set(r.run_id, r.run_verdict); });
            const verdicts=[...runVerdicts.values()];
            const breaks=verdicts.filter(v=>v==='break').length;
            const totalRuns=verdicts.length || evaluated.length;
            addEvalProgress(techName,'done',totalRuns,totalRuns,breaks,'');
            updateMetrics();
            // Track 6: surface the per-run judge verdict + reasoning in the live log so
            // the operator can see at a glance which runs broke and why the others
            // were scored defended.
            if (parallelEvaluator && Array.isArray(parallelEvaluator.lastRuns)) {
              for (const run of parallelEvaluator.lastRuns) {
                const v = run.run_verdict;
                const score = run.run_score != null ? `${run.run_score}/10` : '—';
                const breakAt = run.run_break_turn != null ? ` @T${run.run_break_turn}` : '';
                const label = (v||'unknown').toUpperCase().replace(/_/g,' ');
                addLogEntry({
                  type: v === 'break' ? 'break' : 'system',
                  message: `Judge ${techName} #${run.attack_index||'?'}: ${label}${breakAt} (score ${score}) — ${(run.run_reasoning||'').substring(0,180)}`,
                  technique: techName
                });
              }
            }
          } catch(e){ addEvalProgress(techName,'error',0,validRecs.length,0,e.message); }
        }
      : ()=>{}
  });

  S.running=true; $('btn-stop-attack').style.display='inline-block'; $('running-badge').style.display='inline-flex';

  // Track session metadata for cost view
  const sessionStart=new Date();
  try{ await S.activeAttacker.runSession({techniques,categories,intentMode:isManual?'manual':'auto',customIntent,attacksPerTechnique:attacksPerTech}); }
  catch(e){ addLogEntry({type:'system',message:'Session error: '+e.message,technique:'System'}); }

  S.running=false; $('btn-stop-attack').style.display='none'; $('running-badge').style.display='none';
  const successRecs=S.allRecords.filter(r=>!r.error_type).length;
  const errorRecs=S.allRecords.filter(r=>r.error_type).length;
  addLogEntry({type:'system',message:`✓ "${sessionName}" complete. ${successRecs} records + ${errorRecs} errors. Total: ${S.allRecords.length}.`,technique:'System'});
  $('btn-run-eval').style.display='inline-flex';

  // Merge new break signatures into the cross-session archive (Upgrade 10)
  if (S.breakArchiveEnabled && S.activeAttacker && typeof S.activeAttacker.exportBreakSignatures === 'function') {
    try {
      const sigs = S.activeAttacker.exportBreakSignatures();
      if (sigs.length) {
        mergeIntoBreakArchive(sigs);
        addLogEntry({type:'system',message:`Archived ${sigs.length} break signatures (total: ${S.breakArchive.length}).`,technique:'System'});
        renderBreakArchivePanel();
      }
    } catch(e){ addLogEntry({type:'system',message:'Archive merge error: '+e.message,technique:'System'}); }
  }

  // Auto-Tune merges — Tracks A / B / C / D. Each is opt-in via breakArchiveEnabled.
  // Stats-matrix and payload-stats need post-evaluation run verdicts; if parallel
  // evaluation ran, evaluator.lastRuns is already populated. Otherwise we merge
  // what we can (lessons + failure fingerprints — they don't need eval verdicts).
  if (S.breakArchiveEnabled && S.activeAttacker) {
    try {
      // A — lessons
      if (typeof S.activeAttacker.exportLessons === 'function') {
        const lessons = S.activeAttacker.exportLessons();
        const count = Object.keys(lessons || {}).length;
        if (count) { mergeIntoLessonsArchive(lessons); addLogEntry({type:'system',message:`Auto-Tune: archived ${count} lesson(s).`,technique:'System'}); }
      }
      // C — failure fingerprints
      if (typeof S.activeAttacker.exportFailureFingerprints === 'function') {
        const fails = S.activeAttacker.exportFailureFingerprints();
        if (fails && fails.length) { mergeIntoFailuresArchive(fails); addLogEntry({type:'system',message:`Auto-Tune: archived ${fails.length} failure fingerprint(s).`,technique:'System'}); }
      }
      // B + D — stats matrix + payload stats. Need run-level verdicts; pull from
      // parallelEvaluator.lastRuns when available, otherwise skip (operator can
      // re-run via btn-run-eval which will populate them).
      if (parallelEvaluator && Array.isArray(parallelEvaluator.lastRuns) && parallelEvaluator.lastRuns.length) {
        mergeStatsFromRuns(parallelEvaluator.lastRuns, tgtKey);
        // Walk evaluated records (same pass app.js already did per-technique) for payload stats.
        mergePayloadStatsFromRecords(S.allRecords);
        addLogEntry({type:'system',message:`Auto-Tune: stats-matrix and payload-stats updated.`,technique:'System'});
      }
      renderAutoTunePanel();
    } catch(e){ addLogEntry({type:'system',message:'Auto-Tune merge error: '+e.message,technique:'System'}); }
  }

  // Housekeeping: drop the attacker reference so its closures are GC'd
  S.activeAttacker = null;

  // Save session to cost history (persisted to localStorage; cap at SESSIONS_MAX).
  const runMap = new Map();
  for (const r of S.allRecords) { if (r.run_id && !runMap.has(r.run_id)) runMap.set(r.run_id, r.run_verdict); }
  const verdicts = [...runMap.values()];
  const sessionEntry={
    id: sessionStart.toISOString() + '-' + Math.random().toString(36).slice(2, 8),
    sessionName, date:sessionStart.toISOString(),
    techniques:[...S.selectedTechniques],
    categories:[...S.selectedCategories],
    records: S.allRecords,
    targetModel: tgtCfg.deployment||tgtCfg.model||'',
    targetProvider: tgtCfg.provider||'',
    redteamModel: rtCfg.model||'',
    redteamProvider: rtCfg.provider||'',
    totalTurns: S.metrics.turns,
    // Run-level breaks count (was inflated per-turn before; now derived from run_verdict).
    totalBreaks: verdicts.filter(v => v === 'break').length,
    totalRuns:   verdicts.length
  };
  S.costHistory.unshift(sessionEntry);
  // Fire-and-forget the IDB write — UI doesn't block on persistence.
  saveSessionHistoryEntry(sessionEntry);
  // The user was on the in-progress detail view ('__current'); upgrade it to
  // the persisted entry's id so Back returns to a list that includes this row.
  if (S.activeDetailSessionId === '__current') S.activeDetailSessionId = sessionEntry.id;
  $('detail-session-name').textContent = sessionEntry.sessionName;
  const dt = new Date(sessionEntry.date);
  const tgt = `${sessionEntry.targetProvider}/${sessionEntry.targetModel}`.replace(/^\/|\/$/g, '');
  $('detail-session-meta').textContent = `${dt.toLocaleString()} · target: ${tgt} · ${(sessionEntry.techniques||[]).length} technique${(sessionEntry.techniques||[]).length===1?'':'s'} · ${sessionEntry.records.length} records`;
  if ($('view-results').classList.contains('active') && $('results-list-view').style.display !== 'none') renderSessionsList();
});

$('btn-stop-attack').addEventListener('click',()=>{if(S.activeAttacker)S.activeAttacker.stop();S.running=false;$('btn-stop-attack').style.display='none';$('running-badge').style.display='none';addLogEntry({type:'system',message:'Stopped.',technique:'System'});});

// ── Parallel eval progress list ───────────────────────────────────────────────
function addEvalProgress(techName, status, done, total, breaks=0, error='', partials=0) {
  const list=$('eval-progress-list'); const existing=$(`ep-${techName.replace(/\s+/g,'-')}`);
  const el = existing || document.createElement('div');
  if(!existing){el.id=`ep-${techName.replace(/\s+/g,'-')}`;el.className='eval-progress-row';list.appendChild(el);}
  const icons={evaluating:'…',done:'✓',error:'✗'}, colors={evaluating:'var(--blue-bright)',done:'var(--teal)',error:'var(--red)'};
  const doneText = `${total} evaluated · ${breaks} breaks${partials?` · ${partials} partials`:''}`;
  el.innerHTML=`<span class="ep-icon" style="color:${colors[status]}">${icons[status]}</span><span class="ep-name">${esc(techName)}</span><span class="ep-status" style="color:${colors[status]}">${status==='evaluating'?`${done}/${total}`:(status==='done'?doneText:esc(error.substring(0,60)))}</span>`;
}

// ── Live turn table (v6/v7) ──────────────────────────────────────────────────
// Two-column layout: prompt on the left, response on the right, aligned by turn.
// Prompt event creates a new row (response cell shows "thinking…"). Response
// event fills that row's response cell. System / warning are full-width banner rows.
let _liveOpenRow = null; // most recently created turn row awaiting its response

function _liveBody() { return $('turn-table-body'); }
function _clearPlaceholder() {
  const body = _liveBody(); if (!body) return;
  const ph = body.querySelector('.log-placeholder'); if (ph) ph.remove();
}
function _scrollLiveToBottom() {
  const body = _liveBody(); if (body) body.scrollTop = body.scrollHeight;
}

function _addBannerRow(type, message) {
  const body = _liveBody(); if (!body) return;
  _clearPlaceholder();
  const div = document.createElement('div');
  div.className = `turn-banner is-${type}`;
  div.dataset.rowType = (type === 'break') ? 'break' : 'system';
  div.innerHTML = `<span class="turn-banner-time">${new Date().toLocaleTimeString()}</span><span>${esc(message)}</span>`;
  body.appendChild(div);
  _scrollLiveToBottom();
}

function _addTurnRow({ technique, turn, category, prompt }) {
  const body = _liveBody(); if (!body) return null;
  _clearPlaceholder();
  const row = document.createElement('div');
  row.className = 'turn-row';
  row.dataset.rowType = 'turn';
  row.innerHTML = `
    <div class="turn-cell turn-meta">
      <span class="turn-meta-tech">${esc(technique || '—')}</span>
      ${category ? `<span class="turn-meta-cat">${esc(category)}</span>` : ''}
      <span class="turn-meta-num">${turn ? 'Turn ' + turn : ''}</span>
      <span class="turn-meta-time">${new Date().toLocaleTimeString()}</span>
    </div>
    <div class="turn-cell turn-prompt"></div>
    <div class="turn-cell turn-response is-pending">…awaiting target response</div>`;
  row.querySelector('.turn-prompt').textContent = prompt || '';
  body.appendChild(row);
  _scrollLiveToBottom();
  return row;
}

function _fillTurnResponse(row, message, isError) {
  if (!row) return;
  const cell = row.querySelector('.turn-response'); if (!cell) return;
  cell.classList.remove('is-pending');
  cell.classList.remove('is-streaming');
  if (isError) cell.classList.add('is-error');
  cell.textContent = message || '';
  _scrollLiveToBottom();
}

// v9: incrementally update the open row's response cell as SSE chunks arrive.
// Removes the placeholder on first chunk, swaps to the streaming class for the
// pulsing-cursor cue, and replaces the cell text with the latest accumulated
// buffer. The final response event still fires _fillTurnResponse to finalize.
function _appendStreamChunk(row, accumulated) {
  if (!row) return;
  const cell = row.querySelector('.turn-response'); if (!cell) return;
  if (cell.classList.contains('is-pending')) {
    cell.classList.remove('is-pending');
    cell.classList.add('is-streaming');
  }
  cell.textContent = accumulated || '';
  _scrollLiveToBottom();
}

function _flagRowAsBreak(row) {
  if (!row) return;
  row.classList.add('is-break');
  row.dataset.rowType = 'break';
  const meta = row.querySelector('.turn-meta');
  if (meta && !meta.querySelector('.turn-meta-break-pill')) {
    const pill = document.createElement('span');
    pill.className = 'turn-meta-break-pill';
    pill.textContent = '⚡ break';
    meta.appendChild(pill);
  }
}

function addLogEntry({ type, message, technique, turn, category, accumulated, chunkIndex, firstTokenMs }) {
  if (type === 'prompt') {
    _liveOpenRow = _addTurnRow({ technique, turn, category, prompt: message });
    return;
  }
  if (type === 'stream_chunk') {
    // Render incrementally on the currently-open turn row. If there is none
    // (rare ordering — chunk before prompt log), drop the chunk silently;
    // the full response event will populate the cell at end-of-stream.
    if (_liveOpenRow) _appendStreamChunk(_liveOpenRow, accumulated);
    return;
  }
  if (type === 'response') {
    const isError = typeof message === 'string' && message.startsWith('[TARGET ERROR');
    if (_liveOpenRow) { _fillTurnResponse(_liveOpenRow, message, isError); _liveOpenRow = null; }
    else              { _addTurnRow({ technique, turn, category, prompt: '(no prompt captured)' }); _fillTurnResponse(_liveBody().lastElementChild, message, isError); }
    return;
  }
  if (type === 'break') {
    if (_liveOpenRow) _flagRowAsBreak(_liveOpenRow);
    else {
      // Break logged after the row was already closed — find the most recent turn row
      const body = _liveBody();
      const last = body && body.querySelector('.turn-row:last-of-type');
      if (last) _flagRowAsBreak(last);
      else _addBannerRow('break', message);
    }
    return;
  }
  // system / warning / fallback
  _addBannerRow(type === 'warning' ? 'warning' : 'system', message);
}

document.querySelectorAll('.log-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.log-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const f = btn.dataset.filter;
    const body = _liveBody(); if (!body) return;
    body.querySelectorAll('.turn-row, .turn-banner').forEach(el => {
      const t = el.dataset.rowType;
      let show = (f === 'all') || (t === f);
      // 'turn' filter should still show breaks (they're a kind of turn)
      if (f === 'turn' && t === 'break') show = true;
      el.style.display = show ? '' : 'none';
    });
  });
});
function updateMetrics(){
  $('met-techniques').textContent=S.metrics.done+' / '+S.metrics.techniques;
  $('met-turns').textContent=S.metrics.turns;
  $('met-responses').textContent=S.metrics.responses;
  // Run-level break counter — derived from records, not a per-turn counter. Counts
  // unique run_ids whose run_verdict is 'break' (post-evaluation) over total unique
  // run_ids seen so far. During the attack itself the runs show as 'pending' until
  // the per-technique evaluator stamps a verdict.
  const runMap = new Map();
  for (const r of S.allRecords) {
    if (!r || !r.run_id) continue;
    const cur = runMap.get(r.run_id);
    // Prefer a record that already has a run_verdict stamped on it.
    if (!cur || (r.run_verdict && !cur.run_verdict)) runMap.set(r.run_id, r);
  }
  const runs = [...runMap.values()];
  const breaks = runs.filter(r => r.run_verdict === 'break').length;
  $('met-breaks').textContent = `${breaks} / ${runs.length}`;
  $('records-count').textContent=S.allRecords.length+' records';
}

// ── Sessions list / detail navigation ─────────────────────────────────────
// view-results contains two sub-views: list (default) and detail (drilled in).
// Switching is JS-driven; back button returns to list. The currently-displayed
// session id is stashed on S.activeDetailSessionId. When an attack runs, we
// auto-switch to detail mode so live records stream into the existing tbody.
function _showResultsList() {
  $('results-list-view').style.display = '';
  $('results-detail-view').style.display = 'none';
  S.activeDetailSessionId = null;
  renderSessionsList();
}
function _showResultsDetail() {
  $('results-list-view').style.display = 'none';
  $('results-detail-view').style.display = '';
}

function renderSessionsList() {
  const tbody = $('sessions-tbody'); if (!tbody) return;
  const list = S.costHistory || [];
  $('sessions-count').textContent = `${list.length} session${list.length===1?'':'s'}`;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">No sessions yet — run an attack to see it here.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  list.forEach((s, i) => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.dataset.sessionId = s.id || s.date || String(i);
    const dt = new Date(s.date || 0);
    const dateStr = isNaN(dt) ? '—' : `${dt.toLocaleDateString()} ${dt.toLocaleTimeString().substring(0,5)}`;
    const totalRuns = (typeof s.totalRuns === 'number' && s.totalRuns) || (s.records ? new Set(s.records.map(r=>r.run_id).filter(Boolean)).size : 0);
    const breaks    = s.totalBreaks || 0;
    const vuln      = totalRuns ? Math.round((breaks / totalRuns) * 100) : 0;
    const techList  = (s.techniques || []).slice(0, 3).join(', ') + ((s.techniques||[]).length > 3 ? `, +${s.techniques.length - 3}` : '');
    const tgt       = `${s.targetProvider || ''}/${s.targetModel || ''}`.replace(/^\/|\/$/g, '') || '—';
    tr.innerHTML = `
      <td>${i+1}</td>
      <td style="font-size:11px">${dateStr}</td>
      <td style="font-weight:500;color:var(--text-1)" title="${esc(s.sessionName||'')}">${esc((s.sessionName||'—').substring(0, 50))}</td>
      <td style="font-size:11px;color:var(--text-2)" title="${esc(tgt)}">${esc(tgt.substring(0, 30))}</td>
      <td style="font-size:11px;color:var(--text-2)" title="${esc((s.techniques||[]).join(', '))}">${esc(techList)}</td>
      <td style="font-family:var(--font-mono)">${totalRuns}</td>
      <td style="font-family:var(--font-mono);color:var(--blue-bright)">${breaks}</td>
      <td style="font-family:var(--font-mono);color:${vuln>=50?'var(--red)':vuln>=25?'var(--amber)':'var(--text-2)'}">${vuln}%</td>
      <td style="color:var(--blue-bright);font-size:11px">View →</td>`;
    tr.addEventListener('click', () => loadSessionDetail(s));
    tbody.appendChild(tr);
  });
}

// Render an existing session's records into the detail view, re-using the
// existing run-grouped table renderer + the score banner / chart.
function loadSessionDetail(session) {
  if (!session) return;
  S.activeDetailSessionId = session.id || session.date;
  const records = (session.records || []);
  // Swap S.allRecords / S.evaluatedRecords to this session's records so the
  // existing filter / download / re-eval flows operate on the right data.
  S.allRecords = records.slice();
  S.evaluatedRecords = records.slice();

  // Header
  $('detail-session-name').textContent = session.sessionName || 'Session';
  const dt = new Date(session.date || 0);
  const dateStr = isNaN(dt) ? '—' : dt.toLocaleString();
  const tgt = `${session.targetProvider || ''}/${session.targetModel || ''}`.replace(/^\/|\/$/g, '') || '—';
  $('detail-session-meta').textContent = `${dateStr} · target: ${tgt} · ${(session.techniques||[]).length} technique${(session.techniques||[]).length===1?'':'s'} · ${records.length} records`;

  // Show the run-grouped table populated with this session's records.
  $('results-tbody').innerHTML = '';
  for (const r of records) appendResultRow(r);
  // Stamp run verdicts onto the run rows.
  records.forEach((r, idx) => updateResultRow(idx, r));
  $('records-count').textContent = `${records.length} records`;

  // Score banner + chart — derived from a quick generateReport pass when records
  // are evaluated. Skip if records are still pending (operator can hit Re-Eval).
  const evalRecs = records.filter(r => r.eval_outcome && r.eval_outcome !== 'pending' && r.eval_outcome !== 'error');
  if (evalRecs.length && typeof AttackEvaluator === 'function') {
    try {
      const evaluator = new AttackEvaluator({ evalCfg: {} });
      const report = evaluator.generateReport(evalRecs);
      if (report) {
        try { renderScoreBanner(report); } catch {}
        try { renderChart(report);       } catch {}
      } else {
        $('score-banner').style.display = 'none';
        $('chart-card').style.display = 'none';
      }
    } catch {
      $('score-banner').style.display = 'none';
      $('chart-card').style.display = 'none';
    }
  } else {
    $('score-banner').style.display = 'none';
    $('chart-card').style.display = 'none';
  }

  // Re-eval button visibility: show if there are pending records.
  const hasPending = records.some(r => r.eval_outcome === 'pending');
  $('btn-run-eval').style.display = hasPending ? 'inline-flex' : 'none';

  _showResultsDetail();
}

$('btn-back-to-sessions').addEventListener('click', _showResultsList);
$('btn-clear-sessions').addEventListener('click', async () => {
  if (confirm('Clear all session history? This cannot be undone.')) {
    await clearSessionHistory();
    renderSessionsList();
  }
});

// ── Results ───────────────────────────────────────────────────────────────────
// Run-grouped rendering. Each multi-turn attack run gets ONE primary row showing
// the run's verdict + score + break-turn + reason. Turn-detail rows live beneath
// it, hidden by default — click the run row to expand them inline. Click a turn
// row to open the full-detail modal.
const RUN_VERDICT_LABELS = { break:'BREAK', defended:'DEFENDED', filter_blocked:'FILTER-BLOCKED', partial_filter_blocked:'PARTIAL-BLOCKED', error:'ERROR', pending:'PENDING' };
const RUN_VERDICT_CLASSES = { break:'outcome-success', defended:'outcome-failed', filter_blocked:'outcome-pending', partial_filter_blocked:'outcome-pending', error:'outcome-error', pending:'outcome-pending' };

function _runIdOf(record, fallbackIdx) {
  return record && record.run_id ? record.run_id : `__norun__${fallbackIdx}`;
}

function _findRunRow(runId) {
  return document.querySelector(`#results-tbody tr[data-row-type="run"][data-run-id="${CSS.escape(runId)}"]`);
}

function _renderRunRowVerdict(runTr, record) {
  const v   = record.run_verdict || (record.error_type ? 'error' : 'pending');
  const lbl = RUN_VERDICT_LABELS[v] || v.toUpperCase().replace(/_/g,' ');
  const cls = RUN_VERDICT_CLASSES[v] || 'outcome-pending';
  runTr.querySelector('.outcome-cell').innerHTML = `<span class="outcome-pill ${cls}">${lbl}</span>`;
  runTr.querySelector('.score-cell').textContent = record.run_score != null ? `${record.run_score}/10` : '—';
  const bt = runTr.querySelector('.break-turn-cell');
  if (bt) bt.textContent = record.run_break_turn != null ? `T${record.run_break_turn}` : '—';
  const reason = runTr.querySelector('.reason-cell');
  if (reason) {
    const fullReason = record.run_reasoning || (record.error_type ? record.error_type : '…');
    reason.textContent = fullReason.substring(0, 120);
    // Track 6: full reasoning available on hover, since the cell truncates at 120 chars.
    reason.title = fullReason;
    reason.style.cursor = 'help';
  }
}

function _toggleRun(runId) {
  const runTr = _findRunRow(runId); if (!runTr) return;
  const expanded = runTr.dataset.expanded !== 'true';
  runTr.dataset.expanded = expanded ? 'true' : 'false';
  const caret = runTr.querySelector('.run-caret');
  if (caret) caret.textContent = expanded ? '▼' : '▶';
  const safeId = CSS.escape(runId);
  document.querySelectorAll(`#results-tbody tr[data-row-type="turn"][data-run-id="${safeId}"]`).forEach(tr => {
    tr.style.display = expanded ? '' : 'none';
  });
}

function appendResultRow(record) {
  const tbody = $('results-tbody');
  const empty = tbody.querySelector('tr td.empty-row');
  if (empty) empty.parentNode.remove();

  const idx   = S.allRecords.length - 1;
  const runId = _runIdOf(record, idx);
  let runTr   = _findRunRow(runId);

  if (!runTr) {
    // First turn of this run — create the run row.
    const runIndex = tbody.querySelectorAll('tr[data-row-type="run"]').length + 1;
    runTr = document.createElement('tr');
    runTr.dataset.rowType = 'run';
    runTr.dataset.runId   = runId;
    runTr.dataset.expanded= 'false';
    runTr.style.cursor    = 'pointer';
    runTr.innerHTML = `
      <td><span class="run-caret">▶</span> ${runIndex}</td>
      <td><span class="badge badge-blue">${esc(record.technique)}</span></td>
      <td><span class="badge badge-teal">${esc(record.category)}</span></td>
      <td class="run-turns-cell">1</td>
      <td class="outcome-cell"><span class="outcome-pill outcome-pending">PENDING</span></td>
      <td class="score-cell">—</td>
      <td class="break-turn-cell">—</td>
      <td class="reason-cell" style="font-size:11px;color:var(--text-3)">running…</td>
    `;
    runTr.addEventListener('click', () => _toggleRun(runId));
    tbody.appendChild(runTr);
    populateFilterOpts(record);
  } else {
    // Increment the turn counter on the existing run row.
    const tc = runTr.querySelector('.run-turns-cell');
    if (tc) tc.textContent = String((parseInt(tc.textContent, 10) || 0) + 1);
  }

  // Append the turn-detail row directly after the last existing row of this run
  // (run row + any prior turn rows). Hidden by default; the run row's caret toggles.
  const turnTr = document.createElement('tr');
  turnTr.dataset.rowType = 'turn';
  turnTr.dataset.runId   = runId;
  turnTr.dataset.idx     = idx;
  turnTr.style.display   = 'none';
  turnTr.style.background= 'rgba(255,255,255,0.02)';
  if (record.error_type) turnTr.style.opacity = '0.6';
  const cv = record.classifier_verdict
    ? `<span class="outcome-pill outcome-pending" style="font-size:9px">${esc(record.classifier_verdict)}</span>`
    : (record.error_type ? `<span class="outcome-pill outcome-error" style="font-size:9px">${esc(record.error_type)}</span>` : '');
  turnTr.innerHTML = `
    <td style="padding-left:24px;color:var(--text-3);font-size:11px">↳ T${record.turn}</td>
    <td colspan="2" title="${esc(record.prompt||'')}" style="font-size:11px;color:var(--text-2);max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((record.prompt||'').substring(0,100))}${(record.prompt||'').length>100?'…':''}</td>
    <td colspan="2" title="${esc(record.response||'')}" style="font-size:11px;color:var(--text-2);max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((record.response||'').substring(0,100))}${(record.response||'').length>100?'…':''}</td>
    <td>${cv}</td>
    <td colspan="2" style="font-size:10px;color:var(--text-3)">click to view</td>
  `;
  turnTr.addEventListener('click', (e) => { e.stopPropagation(); showRecordDetail(record); });
  // Insert after the last row belonging to this run.
  let insertAfter = runTr;
  let next = runTr.nextElementSibling;
  while (next && next.dataset.rowType === 'turn' && next.dataset.runId === runId) {
    insertAfter = next; next = next.nextElementSibling;
  }
  insertAfter.parentNode.insertBefore(turnTr, insertAfter.nextElementSibling);

  // If the new record already carries a run_verdict (e.g. came pre-evaluated), reflect it.
  if (record.run_verdict) _renderRunRowVerdict(runTr, record);
  else if (record.error_type) _renderRunRowVerdict(runTr, record);
}

function populateFilterOpts(r){const tf=$('results-filter-technique'),cf=$('results-filter-category'),tv=new Set(Array.from(tf.options).map(o=>o.value)),cv=new Set(Array.from(cf.options).map(o=>o.value));if(!tv.has(r.technique)){const o=document.createElement('option');o.value=o.textContent=r.technique;tf.appendChild(o);}if(!cv.has(r.category)){const o=document.createElement('option');o.value=o.textContent=r.category;cf.appendChild(o);}}

function updateResultRow(idx, r) {
  // Post-evaluation merge: refresh the parent run row's verdict / score / break turn /
  // reason. The turn-row itself does not need updating because turn-level fields
  // (prompt, response, classifier_verdict) don't change after the attack.
  if (!r) return;
  const runId = _runIdOf(r, idx);
  const runTr = _findRunRow(runId); if (!runTr) return;
  _renderRunRowVerdict(runTr, r);
}

['results-filter-technique','results-filter-category','results-filter-success'].forEach(id => {
  $(id).addEventListener('change', () => {
    const t = $('results-filter-technique').value;
    const c = $('results-filter-category').value;
    const o = $('results-filter-success').value;
    // Filter operates on run rows. Each run carries the verdict; turn rows are hidden
    // unless their parent run is expanded.
    document.querySelectorAll('#results-tbody tr[data-row-type="run"]').forEach(runTr => {
      const runId = runTr.dataset.runId;
      // Find any record of this run for technique/category lookup.
      const turnTr = document.querySelector(`#results-tbody tr[data-row-type="turn"][data-run-id="${CSS.escape(runId)}"]`);
      const idx = turnTr ? parseInt(turnTr.dataset.idx, 10) : NaN;
      const rec = (S.evaluatedRecords && S.evaluatedRecords[idx]) || S.allRecords[idx];
      if (!rec) return;
      const verdict = rec.run_verdict || (rec.error_type ? 'error' : 'pending');
      const techMatch = !t || rec.technique === t;
      const catMatch  = !c || rec.category === c;
      const outMatch  = !o || verdict === o;
      const show = techMatch && catMatch && outMatch;
      runTr.style.display = show ? '' : 'none';
      // If hiding, force-hide the turn rows too (so collapsed runs don't reveal their turns).
      if (!show) {
        document.querySelectorAll(`#results-tbody tr[data-row-type="turn"][data-run-id="${CSS.escape(runId)}"]`).forEach(tr => { tr.style.display = 'none'; });
      } else if (runTr.dataset.expanded === 'true') {
        document.querySelectorAll(`#results-tbody tr[data-row-type="turn"][data-run-id="${CSS.escape(runId)}"]`).forEach(tr => { tr.style.display = ''; });
      }
    });
  });
});

// ── Full evaluation (manual trigger) ─────────────────────────────────────────
$('btn-run-eval').addEventListener('click',async()=>{
  if(!S.allRecords.length){showModal('No Records','Run an attack session first.');return;}
  const evalRecs=S.allRecords.filter(r=>r.eval_outcome==='pending');
  if(!evalRecs.length){showModal('Already Evaluated','All records have been evaluated. Results are current.');return;}
  let evalCfg; try{evalCfg=buildCfg('eval');}catch(e){showModal('Evaluator Not Configured',e.message);return;}
  if(!S.connected.eval){showModal('Evaluator Not Connected','Test evaluator in Configuration.');return;}
  const btn=$('btn-run-eval'); btn.disabled=true; btn.textContent='Evaluating…';
  const evaluator=new AttackEvaluator({evalCfg,delay:800,onProgress:({current,total})=>{btn.textContent=`Evaluating ${current}/${total}…`;}});
  try {
    const evaluated=await evaluator.evaluateAll(evalRecs);
    S.evaluatedRecords=S.allRecords.map(r=>{if(r.eval_outcome!=='pending')return r;const m=evaluated.find(e=>e.timestamp===r.timestamp&&e.turn===r.turn&&e.technique===r.technique);return m||r;});
    S.evaluatedRecords.forEach((r,i)=>updateResultRow(i,r));
    const report=evaluator.generateReport(S.evaluatedRecords.filter(r=>r.eval_outcome!=='error'&&r.eval_outcome!=='pending'));
    if(report){renderScoreBanner(report);renderChart(report);}
    // Auto-Tune: feed the run-level verdicts into the stats matrix and payload-stats.
    if (S.breakArchiveEnabled && Array.isArray(evaluator.lastRuns) && evaluator.lastRuns.length) {
      const tgtKey = targetCfgKeyOf(S.cfgs.target);
      mergeStatsFromRuns(evaluator.lastRuns, tgtKey);
      mergePayloadStatsFromRecords(S.evaluatedRecords);
      renderAutoTunePanel();
      updateMetrics();
    }
  } catch(e){showModal('Evaluation Error',e.message);}
  btn.disabled=false; btn.textContent='Re-Evaluate Remaining';
});

function renderScoreBanner(report){
  // Headline metrics are per-RUN (one verdict per multi-turn attack execution).
  // Falls back to per-turn fields for old reports without run aggregations.
  const pct       = (report.runVulnPct   != null) ? report.runVulnPct   : report.vulnPct;
  const riskLevel = report.runRiskLevel  || report.riskLevel;
  const riskColor = report.runRiskColor  || report.riskColor;
  const breaks    = report.runSuccess    != null ? report.runSuccess    : report.success;
  const partial   = report.runPartial    != null ? report.runPartial    : report.partial;
  const leak      = report.runRefusedLeak!= null ? report.runRefusedLeak: (report.refused_with_leak||0);
  const defended  = report.runFailed     != null ? report.runFailed     : report.failed;
  const totalRuns = (report.runs && report.runs.length) || report.runTotal || report.total;
  const byTech    = report.byTechniqueRuns || report.byTechnique;
  const circ=2*Math.PI*50, offset=circ*(1-pct/100), ring=$('score-ring-fill');
  ring.style.stroke=riskColor; ring.setAttribute('stroke-dasharray',circ.toFixed(1));
  ring.style.transition='stroke-dashoffset 1.2s ease';
  requestAnimationFrame(()=>{ring.style.strokeDashoffset=offset.toFixed(1);});
  $('score-number').textContent=pct+'%';
  $('score-label').textContent=riskLevel+' Risk — '+pct+'% Vulnerable (per run)';
  $('score-description').textContent=`${breaks} breaks · ${partial} partial · ${leak} leak · ${defended} defended across ${totalRuns} runs · avg ${report.avgScore}/10`;
  const bd=$('score-breakdown'); bd.innerHTML='';
  Object.entries(byTech).forEach(([t,d])=>{
    const denom = d.total - (d.filter_blocked||0) - (d.error||0);
    const p = denom > 0 ? Math.round((d.success+(d.refused_with_leak||0)*0.6+d.partial*0.5)/denom*100) : 0;
    const el=document.createElement('div'); el.className='score-item';
    el.innerHTML=esc(t)+': <span>'+p+'%</span>'; bd.appendChild(el);
  });
  $('score-banner').style.display='flex';
}
function renderChart(report){
  $('chart-card').style.display='block';
  const ctx=$('technique-chart').getContext('2d');
  if(S.chartInstance)S.chartInstance.destroy();
  // One bar per technique, stacked by RUN-level outcome (not per-turn).
  const byTech=report.byTechniqueRuns || report.byTechnique;
  const labels=Object.keys(byTech);
  S.chartInstance=new Chart(ctx,{type:'bar',data:{labels,datasets:[
    {label:'Breaks',  data:labels.map(t=>byTech[t].success), backgroundColor:'rgba(239,68,68,0.75)', borderRadius:3},
    {label:'Partial', data:labels.map(t=>byTech[t].partial), backgroundColor:'rgba(245,158,11,0.75)', borderRadius:3},
    {label:'Leak',    data:labels.map(t=>byTech[t].refused_with_leak||0), backgroundColor:'rgba(168,85,247,0.65)', borderRadius:3},
    {label:'Defended',data:labels.map(t=>byTech[t].failed),  backgroundColor:'rgba(34,197,94,0.40)', borderRadius:3}
  ]},options:{responsive:true,plugins:{legend:{labels:{color:'#8888a8',font:{size:11}}}},scales:{x:{stacked:true,ticks:{color:'#44445a',font:{size:9},maxRotation:40},grid:{color:'rgba(255,255,255,0.04)'}},y:{stacked:true,ticks:{color:'#44445a',font:{size:10}},grid:{color:'rgba(255,255,255,0.06)'}}}}});
}

// ── Downloads ─────────────────────────────────────────────────────────────────
$('btn-export-csv').addEventListener('click',()=>{const recs=S.evaluatedRecords.length?S.evaluatedRecords:S.allRecords;if(!recs.length){showModal('No Data','Run a session first.');return;}const m=(S.cfgs.target&&cfgDisplayName(S.cfgs.target))||'model';downloadCSV(recs,`redprobe_raw_${m}_${Date.now()}.csv`);});
$('btn-export-report').addEventListener('click',()=>{const recs=S.evaluatedRecords.length?S.evaluatedRecords:S.allRecords;if(!recs.length){showModal('No Data','Run a session first.');return;}const evalRecs=recs.filter(r=>r.eval_outcome!=='pending'&&r.eval_outcome!=='error');if(!evalRecs.length){showModal('Evaluation Required','Run evaluation first.');return;}const evaluator=new AttackEvaluator({evalCfg:{}});const report=evaluator.generateReport(evalRecs);const m=(S.cfgs.target&&cfgDisplayName(S.cfgs.target))||'model';downloadHTMLReport(evaluator.generateVisualReport(report,recs,m),`redprobe_report_${m}_${Date.now()}.html`);});
function showRecordDetail(r){const oc=r.eval_outcome||'pending';const ev=(oc!=='pending'&&oc!=='error')?`\n─── EVALUATION ───\nOutcome: ${oc.toUpperCase()}\nScore:   ${r.eval_score}/10\nReason:  ${r.eval_reasoning}`:(r.error_type?`\n─── ERROR ───\nType: ${r.error_type}\nDetail: ${r.eval_reasoning}`:'\n(Not yet evaluated)');showModal(`${r.technique} · T${r.turn} · #${r.attack_index}`,`SESSION:    ${r.session_name||'—'}\nTECHNIQUE:  ${r.technique}\nCATEGORY:   ${r.category}\nTIMESTAMP:  ${r.timestamp}\nTARGET:     ${r.target_provider}/${r.target_model}\nRED TEAM:   ${r.redteam_provider}/${r.redteam_model}\n\nINTENT:\n${r.intent}\n\n─── PROMPT ───\n${r.prompt}\n\n─── RESPONSE ───\n${r.response||'(none)'}${ev}`);}
function showModal(title,body){$('modal-title').textContent=title;$('modal-body').textContent=body;$('modal-overlay').style.display='flex';}
$('modal-close').addEventListener('click',()=>$('modal-overlay').style.display='none');
$('modal-overlay').addEventListener('click',e=>{if(e.target.id==='modal-overlay')$('modal-overlay').style.display='none';});

// ── Costs & Analysis ──────────────────────────────────────────────────────────
// Per-session cost calculation. Uses each record's actual RT and target model
// (recorded by the attacker per-turn) — pricing is resolved via getModelPricing.
// Returns full breakdown so the detail view can show by-model and by-technique.
function calcSessionCost(session) {
  const recs = (session && session.records) || [];
  let totalTokens = 0, totalCost = 0;
  const byModel    = {}; // {modelKey: {in_tokens, out_tokens, cost, label, source}}
  const byTechnique = {}; // {techId: {tokens, cost}}
  const missingPricing = []; // [{provider, model}] (deduped)
  const missingSet = new Set();

  const bumpMissing = (provider, model) => {
    const k = pricingKeyFor(provider, model);
    if (!missingSet.has(k)) { missingSet.add(k); missingPricing.push({ provider, model }); }
  };
  const bumpModelBucket = (provider, model, tokIn, tokOut, cost, source, label) => {
    const k = pricingKeyFor(provider, model);
    const bucket = byModel[k] || { provider, model, in_tokens: 0, out_tokens: 0, cost: 0, source, label };
    bucket.in_tokens  += tokIn;
    bucket.out_tokens += tokOut;
    bucket.cost       += cost;
    byModel[k] = bucket;
  };

  for (const r of recs) {
    if (!r || r.error_type) continue;
    const tokP = Number(r.tokens_prompt)   || Math.ceil((r.prompt   || '').length / 4);
    const tokR = Number(r.tokens_response) || Math.ceil((r.response || '').length / 4);

    // Target call: input = the user prompt sent (tokP), output = the model response (tokR).
    const tgtPrice = getModelPricing(r.target_provider, r.target_model);
    const tgtCost  = (tokP / 1e6) * (tgtPrice.in || 0) + (tokR / 1e6) * (tgtPrice.out || 0);
    if (tgtPrice.source === 'unknown') bumpMissing(r.target_provider, r.target_model);
    bumpModelBucket(r.target_provider, r.target_model, tokP, tokR, tgtCost, tgtPrice.source, tgtPrice.label);

    // RT call: rough approximation (history grows over turns). Treat the RT as paying
    // input on ~the prompt-being-built (tokP × 4 ≈ prior context) and output on tokP itself.
    // This intentionally overestimates slightly so the cost number is conservative.
    const rtPrice = getModelPricing(r.redteam_provider, r.redteam_model);
    const rtInTokens  = tokP * 4;
    const rtOutTokens = tokP;
    const rtCost = (rtInTokens / 1e6) * (rtPrice.in || 0) + (rtOutTokens / 1e6) * (rtPrice.out || 0);
    if (rtPrice.source === 'unknown') bumpMissing(r.redteam_provider, r.redteam_model);
    bumpModelBucket(r.redteam_provider, r.redteam_model, rtInTokens, rtOutTokens, rtCost, rtPrice.source, rtPrice.label);

    totalCost   += tgtCost + rtCost;
    totalTokens += tokP + tokR;

    // Per-technique aggregation
    const tk = r.technique_id || r.technique || 'unknown';
    const tb = byTechnique[tk] || { technique: r.technique || tk, tokens: 0, cost: 0 };
    tb.tokens += tokP + tokR;
    tb.cost   += tgtCost + rtCost;
    byTechnique[tk] = tb;
  }

  return { totalTokens, totalCost, byModel, byTechnique, missingPricing };
}

// ── Costs view: list + detail rendering ─────────────────────────────────
function _showCostsList()   { $('costs-list-view').style.display=''; $('costs-detail-view').style.display='none'; S.activeCostDetailId=null; }
function _showCostsDetail() { $('costs-list-view').style.display='none'; $('costs-detail-view').style.display=''; }

function renderCostView() {
  // Sessions list view (default).
  const fromDate=val('cost-filter-from'), toDate=val('cost-filter-to'), nameFilter=val('cost-filter-name').toLowerCase();
  let sessions=S.costHistory.slice();
  if(fromDate)   sessions=sessions.filter(s=>s.date>=fromDate);
  if(toDate)     sessions=sessions.filter(s=>s.date<=toDate+'T23:59:59');
  if(nameFilter) sessions=sessions.filter(s=>(s.sessionName||'').toLowerCase().includes(nameFilter));

  let grandTurns=0, grandTokens=0, grandCost=0, anyMissing=false;
  const tbody=$('cost-sessions-tbody'); tbody.innerHTML='';

  if(!sessions.length){
    tbody.innerHTML='<tr><td colspan="10" class="empty-row">No sessions recorded yet.</td></tr>';
    $('cost-total-sessions').textContent='0';
    $('cost-total-turns').textContent='0';
    $('cost-total-tokens').textContent='0';
    $('cost-total-usd').textContent='$0.00';
    return;
  }

  sessions.forEach((s, i) => {
    const c = calcSessionCost(s);
    grandTurns  += s.totalTurns||0;
    grandTokens += c.totalTokens;
    grandCost   += c.totalCost;
    if (c.missingPricing.length) anyMissing = true;
    const tr=document.createElement('tr');
    tr.style.cursor='pointer';
    const dt = new Date(s.date || 0);
    const dateStr = isNaN(dt) ? '—' : `${dt.toLocaleDateString()} ${dt.toLocaleTimeString().substring(0,5)}`;
    const rt  = `${s.redteamProvider||''}/${s.redteamModel||''}`.replace(/^\/|\/$/g,'') || '—';
    const tgt = `${s.targetProvider||''}/${s.targetModel||''}`.replace(/^\/|\/$/g,'') || '—';
    const status = c.missingPricing.length
      ? `<span class="outcome-pill" style="background:rgba(245,158,11,0.15);color:var(--amber);font-size:10px">! ${c.missingPricing.length} missing</span>`
      : `<span class="outcome-pill" style="background:rgba(34,197,94,0.12);color:#22c55e;font-size:10px">✓ priced</span>`;
    tr.innerHTML = `
      <td>${i+1}</td>
      <td style="font-size:11px">${dateStr}</td>
      <td style="font-weight:500;color:var(--text-1)" title="${esc(s.sessionName||'')}">${esc((s.sessionName||'—').substring(0,46))}</td>
      <td style="font-size:11px;color:var(--text-2)" title="${esc(rt)}">${esc(rt.substring(0,30))}</td>
      <td style="font-size:11px;color:var(--text-2)" title="${esc(tgt)}">${esc(tgt.substring(0,30))}</td>
      <td style="font-family:var(--font-mono)">${s.totalTurns||0}</td>
      <td style="font-family:var(--font-mono);font-size:11px">${c.totalTokens.toLocaleString()}</td>
      <td style="font-family:var(--font-mono);color:var(--blue-bright);font-weight:500">$${c.totalCost.toFixed(4)}</td>
      <td>${status}</td>
      <td style="color:var(--blue-bright);font-size:11px">View →</td>`;
    tr.addEventListener('click', () => loadCostDetail(s));
    tbody.appendChild(tr);
  });

  $('cost-total-sessions').textContent=sessions.length;
  $('cost-total-turns').textContent=grandTurns.toLocaleString();
  $('cost-total-tokens').textContent=grandTokens.toLocaleString();
  $('cost-total-usd').textContent='$'+grandCost.toFixed(4);

  // If we just did the initial render and any session has missing pricing, kick
  // off background LLM lookups so the next render has the numbers filled in.
  if (anyMissing) lookupMissingPricingForAll(sessions);
}

// ── Detail view ──────────────────────────────────────────────────────────
function loadCostDetail(session) {
  if (!session) return;
  S.activeCostDetailId = session.id || session.date;
  S._activeCostSession = session;

  const dt = new Date(session.date || 0);
  $('cost-detail-name').textContent = session.sessionName || 'Session';
  $('cost-detail-meta').textContent = `${dt.toLocaleString()} · ${(session.techniques||[]).length} technique${(session.techniques||[]).length===1?'':'s'} · ${(session.records||[]).length} records`;

  const c = calcSessionCost(session);
  $('cost-detail-turns').textContent  = (session.totalTurns||0).toLocaleString();
  $('cost-detail-tokens').textContent = c.totalTokens.toLocaleString();
  $('cost-detail-cost').textContent   = '$' + c.totalCost.toFixed(4);

  // By-model table
  const mtbody = $('cost-detail-bymodel-tbody');
  mtbody.innerHTML = '';
  const sorted = Object.values(c.byModel).sort((a,b) => b.cost - a.cost);
  if (!sorted.length) mtbody.innerHTML = '<tr><td colspan="9" class="empty-row">No model data.</td></tr>';
  sorted.forEach(b => {
    const price = getModelPricing(b.provider, b.model);
    const sourceLabel = price.source==='user' ? '✎ override' : price.source==='llm' ? `≈ LLM (${price.confidence||'?'})` : price.source==='curated' ? '✓ curated' : '? unknown';
    const sourceColor = price.source==='user' ? 'color:var(--blue-bright)' : price.source==='llm' ? 'color:var(--amber)' : price.source==='curated' ? 'color:#22c55e' : 'color:var(--red)';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-size:11px;color:var(--text-2)">${esc(b.provider||'—')}</td>
      <td style="font-size:11px;color:var(--text-1)" title="${esc(b.model||'')}">${esc((b.model||'—').substring(0,40))}</td>
      <td style="font-size:11px;${sourceColor}">${sourceLabel}</td>
      <td style="font-family:var(--font-mono);font-size:11px">$${(price.in||0).toFixed(2)}</td>
      <td style="font-family:var(--font-mono);font-size:11px">$${(price.out||0).toFixed(2)}</td>
      <td style="font-family:var(--font-mono);font-size:11px">${b.in_tokens.toLocaleString()}</td>
      <td style="font-family:var(--font-mono);font-size:11px">${b.out_tokens.toLocaleString()}</td>
      <td style="font-family:var(--font-mono);color:var(--blue-bright)">$${b.cost.toFixed(4)}</td>
      <td><button class="btn-xs cost-edit-btn" data-provider="${esc(b.provider||'')}" data-model="${esc(b.model||'')}">Edit</button></td>`;
    mtbody.appendChild(tr);
  });
  // Wire Edit buttons
  mtbody.querySelectorAll('.cost-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openPricingModal(btn.dataset.provider, btn.dataset.model);
    });
  });

  // By-technique table
  const ttbody = $('cost-detail-bytech-tbody');
  ttbody.innerHTML = '';
  const tsorted = Object.values(c.byTechnique).sort((a,b) => b.cost - a.cost);
  if (!tsorted.length) ttbody.innerHTML = '<tr><td colspan="3" class="empty-row">No technique data.</td></tr>';
  tsorted.forEach(b => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(b.technique||'—')}</td>
      <td style="font-family:var(--font-mono);font-size:11px">${b.tokens.toLocaleString()}</td>
      <td style="font-family:var(--font-mono);color:var(--blue-bright)">$${b.cost.toFixed(4)}</td>`;
    ttbody.appendChild(tr);
  });

  // Pricing-missing banner
  const banner = $('cost-detail-pricing-banner');
  const bannerBody = $('cost-detail-pricing-banner-body');
  if (c.missingPricing.length) {
    banner.style.display = '';
    const items = c.missingPricing.map(m => `<code>${esc(m.provider)}/${esc(m.model)}</code>`).join(', ');
    bannerBody.innerHTML = `${c.missingPricing.length} model(s) lack pricing: ${items}. Auto-querying the attacker LLM in the background — refresh in a few seconds. Click <b>Manage Pricing</b> to provide manually.`;
    // Kick off background lookup for this session's missing models.
    lookupMissingPricingForAll([session]);
  } else {
    banner.style.display = 'none';
  }

  _showCostsDetail();
}

// ── LLM auto-lookup for unknown pricing ─────────────────────────────────
const _llmPricingInflight = new Set();

async function requestPricingFromLLM(provider, model) {
  const key = pricingKeyFor(provider, model);
  if (_llmPricingInflight.has(key)) return null; // dedupe concurrent lookups
  // Pick a cfg: prefer red-team, fall back to eval, then target.
  const cfg = (S.connected.redteam && S.cfgs.redteam) || (S.connected.eval && S.cfgs.eval) || (S.connected.target && S.cfgs.target);
  if (!cfg) return null; // nothing to query with

  _llmPricingInflight.add(key);
  try {
    const sys = `You are a pricing-lookup assistant. Given a model, return the publicly-listed per-million-token price in USD. If the price is not publicly listed or you don't know with reasonable confidence, return confidence "unknown" and zeros.

Respond ONLY with this exact JSON: {"input_per_m_usd":N,"output_per_m_usd":N,"confidence":"high"|"medium"|"low"|"unknown","source":"<one short citation phrase>"}`;
    const msg = `Provider: ${provider}\nModel: ${model}\n\nWhat is the per-million-token USD price?`;
    const raw = await ModelClient.call({ ...cfg }, [{ role:'user', content: msg }], { maxTokens: 200, temperature: 0.0, systemPrompt: sys });
    const cleaned = String(raw||'').replace(/```json|```/g,'').trim();
    let parsed = null;
    try { parsed = JSON.parse(cleaned); } catch {
      const a = cleaned.indexOf('{'), b = cleaned.lastIndexOf('}');
      if (a>=0 && b>a) { try { parsed = JSON.parse(cleaned.slice(a, b+1)); } catch {} }
    }
    if (!parsed) return null;
    const inP  = Number(parsed.input_per_m_usd)  || 0;
    const outP = Number(parsed.output_per_m_usd) || 0;
    const conf = String(parsed.confidence || 'unknown').toLowerCase();
    if (conf === 'unknown' || (inP === 0 && outP === 0)) return null;
    setLLMPricingCache(provider, model, inP, outP, conf);
    return { in: inP, out: outP, confidence: conf };
  } catch {
    return null;
  } finally {
    _llmPricingInflight.delete(key);
  }
}

async function lookupMissingPricingForAll(sessions) {
  // Collect every (provider, model) pair across the session(s) that has no pricing.
  const needing = new Map();
  for (const s of sessions) {
    const c = calcSessionCost(s);
    for (const m of c.missingPricing) needing.set(pricingKeyFor(m.provider, m.model), m);
  }
  if (!needing.size) return;
  const results = await Promise.allSettled([...needing.values()].map(m => requestPricingFromLLM(m.provider, m.model)));
  let anyResolved = false;
  results.forEach(r => { if (r.status === 'fulfilled' && r.value) anyResolved = true; });
  if (anyResolved) {
    // Re-render whichever cost sub-view is currently visible.
    if ($('costs-detail-view').style.display !== 'none' && S._activeCostSession) loadCostDetail(S._activeCostSession);
    if ($('costs-list-view').style.display   !== 'none') renderCostView();
  }
}

// ── Pricing modal (manual entry) ────────────────────────────────────────
let _pricingModalCtx = { provider: '', model: '' };
function openPricingModal(provider, model) {
  _pricingModalCtx = { provider, model };
  $('pricing-modal-title').textContent = `Pricing for ${provider}/${model}`;
  const existing = getModelPricing(provider, model);
  $('pricing-modal-in').value  = existing.source !== 'unknown' ? existing.in  : '';
  $('pricing-modal-out').value = existing.source !== 'unknown' ? existing.out : '';
  const note = existing.source === 'curated' ? `Curated default: $${existing.in}/$${existing.out} per 1M. Save to override.`
             : existing.source === 'llm'     ? `LLM-estimated (${existing.confidence}): $${existing.in}/$${existing.out} per 1M. Save to override.`
             : existing.source === 'user'    ? `Operator override active: $${existing.in}/$${existing.out} per 1M.`
             : `No pricing on file. Provide values, or click "Estimate via LLM".`;
  $('pricing-modal-llm-result').textContent = note;
  $('pricing-modal').style.display = 'flex';
}
function closePricingModal() { $('pricing-modal').style.display = 'none'; }
$('pricing-modal-cancel').addEventListener('click', closePricingModal);
$('pricing-modal-save').addEventListener('click', () => {
  const inP  = parseFloat($('pricing-modal-in').value);
  const outP = parseFloat($('pricing-modal-out').value);
  if (!isFinite(inP) || !isFinite(outP) || inP < 0 || outP < 0) {
    $('pricing-modal-llm-result').textContent = 'Please enter valid non-negative numbers for both fields.';
    return;
  }
  setUserPricing(_pricingModalCtx.provider, _pricingModalCtx.model, inP, outP);
  closePricingModal();
  // Re-render whichever view is open.
  if ($('costs-detail-view').style.display !== 'none' && S._activeCostSession) loadCostDetail(S._activeCostSession);
  if ($('costs-list-view').style.display   !== 'none') renderCostView();
});
$('pricing-modal-llm-btn').addEventListener('click', async () => {
  const { provider, model } = _pricingModalCtx;
  $('pricing-modal-llm-result').textContent = `Querying configured LLM for ${provider}/${model}…`;
  $('pricing-modal-llm-btn').disabled = true;
  try {
    const r = await requestPricingFromLLM(provider, model);
    if (r) {
      $('pricing-modal-in').value  = r.in;
      $('pricing-modal-out').value = r.out;
      $('pricing-modal-llm-result').textContent = `LLM estimate (${r.confidence}): $${r.in.toFixed(2)} input / $${r.out.toFixed(2)} output per 1M. Click Save to accept, or edit the values first.`;
    } else {
      $('pricing-modal-llm-result').textContent = `LLM couldn't estimate this model's price. Please enter manually.`;
    }
  } finally { $('pricing-modal-llm-btn').disabled = false; }
});

// ── Manage Pricing modal (overview of all priced models) ────────────────
function openManagePricingModal() {
  // Collect every model that's been used across all sessions, plus any with overrides/cache.
  const seen = new Map();
  for (const s of S.costHistory) {
    for (const r of (s.records || [])) {
      if (r.target_provider && r.target_model) seen.set(pricingKeyFor(r.target_provider, r.target_model), { provider: r.target_provider, model: r.target_model });
      if (r.redteam_provider && r.redteam_model) seen.set(pricingKeyFor(r.redteam_provider, r.redteam_model), { provider: r.redteam_provider, model: r.redteam_model });
    }
  }
  for (const k of Object.keys(pricingOverrides)) { const [p, m] = k.split('::'); seen.set(k, { provider: p, model: m }); }
  for (const k of Object.keys(pricingCache))     { const [p, m] = k.split('::'); seen.set(k, { provider: p, model: m }); }
  const tbody = $('manage-pricing-tbody');
  tbody.innerHTML = '';
  const items = [...seen.values()];
  if (!items.length) tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No models used yet.</td></tr>';
  items.sort((a,b) => (a.provider+a.model).localeCompare(b.provider+b.model)).forEach(it => {
    const p = getModelPricing(it.provider, it.model);
    const src = p.source==='user' ? '✎ override' : p.source==='llm' ? `≈ LLM (${p.confidence||'?'})` : p.source==='curated' ? '✓ curated' : '? unknown';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-size:11px">${esc(it.provider)}</td>
      <td style="font-size:11px;color:var(--text-1)" title="${esc(it.model)}">${esc(it.model.substring(0, 40))}</td>
      <td style="font-family:var(--font-mono);font-size:11px">$${(p.in||0).toFixed(2)}</td>
      <td style="font-family:var(--font-mono);font-size:11px">$${(p.out||0).toFixed(2)}</td>
      <td style="font-size:11px">${src}</td>
      <td><button class="btn-xs cost-edit-btn" data-provider="${esc(it.provider)}" data-model="${esc(it.model)}">Edit</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.cost-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      $('manage-pricing-modal').style.display = 'none';
      openPricingModal(btn.dataset.provider, btn.dataset.model);
    });
  });
  $('manage-pricing-modal').style.display = 'flex';
}
$('btn-manage-pricing').addEventListener('click', openManagePricingModal);
$('btn-cost-detail-pricing').addEventListener('click', openManagePricingModal);
$('manage-pricing-close').addEventListener('click', () => { $('manage-pricing-modal').style.display = 'none'; });

// Sessions-list controls
$('btn-back-to-cost-list').addEventListener('click', () => { _showCostsList(); renderCostView(); });
$('btn-apply-cost-filter').addEventListener('click', renderCostView);
$('btn-clear-cost-history').addEventListener('click', async () => {
  if (confirm('Clear all session cost history? This wipes the persisted sessions list.')) {
    await clearSessionHistory();
    renderCostView();
  }
});

// ─── Break-archive UI wiring (Upgrade 10) ─────────────────────────────────
function renderBreakArchivePanel() {
  const el = $('archive-count'); if (el) el.textContent = `${S.breakArchive.length} entries`;
  const tg = $('archive-enabled-toggle'); if (tg) tg.checked = !!S.breakArchiveEnabled;
}
$('archive-enabled-toggle') && $('archive-enabled-toggle').addEventListener('change', e => {
  S.breakArchiveEnabled = !!e.target.checked;
  try { localStorage.setItem(BREAK_ARCHIVE_FLAG, S.breakArchiveEnabled ? '1' : '0'); } catch {}
  if (!S.breakArchiveEnabled) {
    clearBreakArchive();
    clearAutoTuneArchives();          // one toggle gates all five channels
  } else {
    loadAutoTuneArchives();           // reload (in case data persisted in localStorage from a prior on-state)
  }
  renderBreakArchivePanel();
  renderAutoTunePanel();
});
$('btn-clear-archive') && $('btn-clear-archive').addEventListener('click', () => {
  if (confirm('Clear all archived break signatures and auto-tune learning data?')) {
    clearBreakArchive();
    clearAutoTuneArchives();
    renderBreakArchivePanel();
    renderAutoTunePanel();
  }
});
renderBreakArchivePanel();

// ─── Auto-Tune UI panel (Track E) ─────────────────────────────────────────
function renderAutoTunePanel() {
  const panel = $('autotune-panel'); if (!panel) return;
  panel.style.display = S.breakArchiveEnabled ? '' : 'none';
  if (!S.breakArchiveEnabled) return;

  // Headline counts.
  const allEntries = Object.values(S.statsMatrix);
  const totalAttempts = allEntries.reduce((a, e) => a + (e.attempts || 0), 0);
  const totalBreaks   = allEntries.reduce((a, e) => a + (e.breaks   || 0), 0);
  const sumEl = $('autotune-summary'); if (sumEl) sumEl.textContent = `${totalAttempts} runs · ${totalBreaks} breaks`;

  // Top 5 pairings by break-rate (min 2 attempts so a 1/1 doesn't dominate).
  const pairings = Object.entries(S.statsMatrix)
    .map(([k, v]) => ({ k, ...v, rate: v.attempts ? v.breaks / v.attempts : 0 }))
    .filter(p => p.attempts >= 1);
  const top    = pairings.slice().sort((a,b) => (b.rate - a.rate) || (b.attempts - a.attempts)).slice(0, 5);
  const bottom = pairings.slice().filter(p => p.attempts >= 2).sort((a,b) => (a.rate - b.rate) || (b.attempts - a.attempts)).slice(0, 5);
  const renderPairings = (arr) => arr.length
    ? arr.map(p => {
        const [tech, cat, tgt] = p.k.split('||');
        const pct = Math.round(p.rate * 100);
        return `<div class="autotune-row"><span class="autotune-label">${esc(tech)} × ${esc(cat)} × <em>${esc(tgt)}</em></span><span class="autotune-stat">${p.breaks}/${p.attempts} (${pct}%)</span></div>`;
      }).join('')
    : '<div class="autotune-empty">no data yet</div>';
  const topEl    = $('autotune-top-pairings');    if (topEl) topEl.innerHTML = renderPairings(top);
  const botEl    = $('autotune-bottom-pairings'); if (botEl) botEl.innerHTML = renderPairings(bottom);

  // Top 5 payloads by break-rate (min 1 attempt).
  const payloads = Object.entries(S.payloadStats)
    .map(([id, v]) => ({ id, ...v, rate: v.attempts ? v.breaks / v.attempts : 0 }))
    .filter(p => p.attempts >= 1)
    .sort((a,b) => (b.rate - a.rate) || (b.attempts - a.attempts))
    .slice(0, 5);
  const payEl = $('autotune-payloads');
  if (payEl) {
    payEl.innerHTML = payloads.length
      ? payloads.map(p => `<div class="autotune-row"><span class="autotune-label">${esc(p.id)}</span><span class="autotune-stat">${p.breaks}/${p.attempts} (${Math.round(p.rate*100)}%)</span></div>`).join('')
      : '<div class="autotune-empty">no data yet</div>';
  }

  // Recent lessons (3 most recent across all techniques).
  const lessons = [];
  for (const [techId, list] of Object.entries(S.lessonsArchive)) {
    for (const l of (list || [])) lessons.push({ techId, ...l });
  }
  lessons.sort((a,b) => (b.ts || 0) - (a.ts || 0));
  const lesEl = $('autotune-lessons');
  if (lesEl) {
    lesEl.innerHTML = lessons.length
      ? lessons.slice(0, 3).map(l => `<div class="autotune-row"><span class="autotune-label">${esc(l.techId)}</span><span class="autotune-stat" style="font-size:11px;color:var(--text-2);text-align:right;max-width:60%">${esc(l.text.substring(0, 110))}${l.text.length>110?'…':''}</span></div>`).join('')
      : '<div class="autotune-empty">no lessons yet</div>';
  }
}
$('btn-reset-autotune') && $('btn-reset-autotune').addEventListener('click', () => {
  if (confirm('Reset all auto-tune learning data (lessons, stats, failures, payload weights)?')) {
    clearAutoTuneArchives();
    renderAutoTunePanel();
  }
});
renderAutoTunePanel();
// (Old global RT/Target pricing dropdowns removed — pricing is now per-record-model
// resolved via getModelPricing(). The Manage Pricing modal handles overrides.)

// ── Init ──────────────────────────────────────────────────────────────────────
TECHNIQUES.forEach(t=>S.selectedTechniques.add(t.id));
renderCategoryGrid();
renderTechniqueGrid();
updateChatMeta();

// ── Settings: load saved state, wire auto-save + toggle + clear ─────────
// Run after the DOM is fully populated and provider-tab handlers exist.
(function initSettingsPersistence() {
  // Auto-save on any input/change inside the three role cards. Delegated listener,
  // so dynamically-added fields (e.g. a future Foundry endpoint) Just Work.
  const cards = document.querySelectorAll('.config-card');
  cards.forEach(card => {
    card.addEventListener('input',  saveAllSettingsDebounced, true);
    card.addEventListener('change', saveAllSettingsDebounced, true);
  });
  // Provider-tab clicks change S.providers and the visible field set —
  // capture phase listener fires AFTER the existing handler updates state.
  document.querySelectorAll('.provider-tabs .ptab').forEach(tab => {
    tab.addEventListener('click', () => setTimeout(saveAllSettingsDebounced, 0));
  });
  // Credentials toggle.
  const tg = $('remember-credentials-toggle');
  if (tg) {
    tg.addEventListener('change', e => {
      setCredentialsRemembered(!!e.target.checked);
      saveAllSettings();   // immediate write/clear of the credentials key
    });
  }
  // Clear button (Settings tab).
  const clearBtn = $('btn-clear-settings');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear all saved settings (provider tabs, endpoints, model ids, and any persisted keys)?')) {
        clearAllSettings();
      }
    });
  }
  // Load existing settings into the form fields.
  loadAllSettings();
  // Render the initial Attacker Ready pill (no connections tested yet → red).
  updateAttackerStatusPill();
})();
