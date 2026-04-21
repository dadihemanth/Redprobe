// model-client.js — Universal multi-provider model client
// Supports: azure | claude | openai  for any role (target / evaluator / redteam)

// ─── Security helpers ─────────────────────────────────────────────────────────
const SEC = {
  AZURE_HOST_RE: /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9\-]{0,62}\.(openai\.azure\.com|cognitiveservices\.azure\.com)(\/.*)?$/,
  MODEL_RE:      /^[a-zA-Z0-9][\w\-\.\/]{0,126}$/,
  VERSION_RE:    /^[0-9]{4}-[0-9]{2}-[0-9]{2}(-preview)?$/,

  validateEndpoint(provider, url) {
    if (!url || typeof url !== 'string' || url.length > 512) return false;
    try { const u = new URL(url); if (u.protocol !== 'https:') return false; }
    catch { return false; }
    if (provider === 'azure')  return this.AZURE_HOST_RE.test(url);
    if (provider === 'claude') return url === 'https://api.anthropic.com' || url.startsWith('https://api.anthropic.com/');
    if (provider === 'openai') return url === 'https://api.openai.com'    || url.startsWith('https://api.openai.com/');
    return false;
  },

  validateModel(name) {
    return typeof name === 'string' && this.MODEL_RE.test(name) && name.length < 128;
  },

  validateApiVersion(v) {
    return !v || this.VERSION_RE.test(v);
  },

  // Scrub null bytes, dangerous control chars, enforce length cap
  sanitize(s, maxLen = 32000) {
    if (s == null) return '';
    return String(s)
      .replace(/\0/g, '')
      .replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
      .substring(0, maxLen);
  },

  sanitizeRole(r) {
    return ['user', 'assistant', 'system'].includes(r) ? r : 'user';
  }
};

// ─── In-memory rate limiter (per provider, 60 req/min) ────────────────────────
const RateLimit = {
  _state: {},
  check(provider) {
    const now = Date.now();
    const s   = this._state;
    if (!s[provider] || now - s[provider].t > 60000) s[provider] = { count: 0, t: now };
    if (s[provider].count >= 60) throw new Error(`Rate limit: ${provider} (>60/min). Add delay.`);
    s[provider].count++;
  }
};

// ─── Universal call ───────────────────────────────────────────────────────────
class ModelClient {
  /**
   * cfg:  { provider, key, endpoint?, model?, deployment?, version? }
   * msgs: [{ role, content }]
   * opts: { maxTokens?, temperature?, systemPrompt? }
   * returns string response
   */
  static async call(cfg, msgs, opts = {}) {
    if (!cfg || !cfg.provider) throw new Error('ModelClient: cfg.provider required');
    if (!cfg.key)              throw new Error('ModelClient: cfg.key required');

    const maxTokens   = Math.min(Number(opts.maxTokens  || 1000), 4096);
    const temperature = Math.min(Math.max(Number(opts.temperature || 0.7), 0), 2);

    const safeMsgs = Array.isArray(msgs) ? msgs.map(m => ({
      role:    SEC.sanitizeRole(m.role),
      content: SEC.sanitize(m.content, 16000)
    })) : [];

    const safeSystem = opts.systemPrompt ? SEC.sanitize(opts.systemPrompt, 8000) : undefined;

    switch (cfg.provider) {
      case 'azure':  return ModelClient._azure(cfg, safeMsgs, safeSystem, maxTokens, temperature);
      case 'claude': return ModelClient._claude(cfg, safeMsgs, safeSystem, maxTokens, temperature);
      case 'openai': return ModelClient._openai(cfg, safeMsgs, safeSystem, maxTokens, temperature);
      default: throw new Error(`Unknown provider: ${SEC.sanitize(cfg.provider, 20)}`);
    }
  }

  static async _azure(cfg, msgs, system, maxTokens, temp) {
    const ep  = (cfg.endpoint || '').replace(/\/$/, '');
    const dep = SEC.sanitize(cfg.deployment || cfg.model || '', 128);
    const ver = SEC.sanitize(cfg.version || '2024-02-15-preview', 30);

    if (!SEC.validateEndpoint('azure', ep))  throw new Error('Invalid Azure endpoint URL. Must be *.openai.azure.com');
    if (!SEC.validateModel(dep))             throw new Error('Invalid deployment/model name');
    if (!SEC.validateApiVersion(ver))        throw new Error('Invalid API version (expected YYYY-MM-DD[-preview])');

    RateLimit.check('azure');

    const allMsgs = system ? [{ role: 'system', content: system }, ...msgs] : msgs;
    const url     = `${ep}/openai/deployments/${dep}/chat/completions?api-version=${ver}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': cfg.key },
      body: JSON.stringify({ messages: allMsgs, max_tokens: maxTokens, temperature: temp })
    });
    if (!res.ok) {
      const e = await res.text().catch(() => '');
      throw new Error(`Azure ${res.status}: ${SEC.sanitize(e, 250)}`);
    }
    const d = await res.json();
    return d.choices?.[0]?.message?.content || '';
  }

  static async _claude(cfg, msgs, system, maxTokens, temp) {
    const model = SEC.sanitize(cfg.model || 'claude-sonnet-4-20250514', 128);
    if (!SEC.validateModel(model)) throw new Error('Invalid Claude model name');
    RateLimit.check('claude');

    const body = {
      model, max_tokens: maxTokens, temperature: temp,
      messages: msgs.filter(m => m.role !== 'system')
    };
    if (system) body.system = system;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const e = await res.text().catch(() => '');
      throw new Error(`Claude ${res.status}: ${SEC.sanitize(e, 250)}`);
    }
    const d = await res.json();
    return d.content?.[0]?.text || '';
  }

  static async _openai(cfg, msgs, system, maxTokens, temp) {
    const model = SEC.sanitize(cfg.model || 'gpt-4o', 128);
    if (!SEC.validateModel(model)) throw new Error('Invalid OpenAI model name');
    RateLimit.check('openai');

    const allMsgs = system ? [{ role: 'system', content: system }, ...msgs] : msgs;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.key}` },
      body: JSON.stringify({ model, messages: allMsgs, max_tokens: maxTokens, temperature: temp })
    });
    if (!res.ok) {
      const e = await res.text().catch(() => '');
      throw new Error(`OpenAI ${res.status}: ${SEC.sanitize(e, 250)}`);
    }
    const d = await res.json();
    return d.choices?.[0]?.message?.content || '';
  }

  static async test(cfg) {
    return ModelClient.call(cfg, [{ role: 'user', content: 'Hi' }], { maxTokens: 5 });
  }
}

// ─── YAML config (structural parse only — never eval) ─────────────────────────
const YAML = {
  parse(text) {
    if (!text || typeof text !== 'string') return {};
    const out    = {};
    let   block  = null;

    for (const raw of text.split('\n')) {
      const line = raw.replace(/\r$/, '');
      if (!line.trim() || line.trim().startsWith('#')) continue;

      const indent = line.length - line.trimStart().length;
      const clean  = line.trim();
      const colon  = clean.indexOf(':');
      if (colon === -1) continue;

      const rawKey = clean.substring(0, colon).trim();
      const rawVal = clean.substring(colon + 1).trim().replace(/^['"]|['"]$/g, '');
      const key    = rawKey.replace(/[^a-zA-Z0-9_\-]/g, '').substring(0, 64);
      if (!key) continue;

      const val = rawVal.substring(0, 512);

      if (indent === 0) {
        // top-level key — either a block header or scalar
        if (!rawVal) { block = key; out[key] = {}; }
        else         { out[key] = val; block = null; }
      } else if (indent > 0 && block && out[block]) {
        out[block][key] = val;
      }
    }
    return out;
  },

  stringify(sections) {
    const lines = [
      '# RedProbe Model Configuration',
      '# Generated: ' + new Date().toISOString(),
      '# NOTE: API keys are NEVER exported. Fill them in manually or use the UI.',
      ''
    ];
    for (const [sec, vals] of Object.entries(sections)) {
      lines.push(`${sec}:`);
      if (vals && typeof vals === 'object') {
        for (const [k, v] of Object.entries(vals)) {
          if (v == null || v === '') continue;
          // Security: never export key material
          if (/key|secret|token|password/i.test(k)) continue;
          lines.push(`  ${k}: "${String(v).replace(/"/g, "'")}"`);
        }
      }
      lines.push('');
    }
    return lines.join('\n');
  }
};

// Expose globally for app.js
window.ModelClient = ModelClient;
window.SEC         = SEC;
window.YAML        = YAML;

// ─── HuggingFace Inference API support ────────────────────────────────────────
// Added as provider "huggingface"
// cfg: { provider:"huggingface", key, model, endpoint? }
// Uses HF Inference API: https://api-inference.huggingface.co/models/<model>
// or a custom endpoint (HF Inference Endpoints)

SEC.HF_ENDPOINT_RE = /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9\-\.]{0,120}\.(huggingface\.co|hf\.space|endpoints\.huggingface\.cloud)(\/.*)?$/;

const _origValidate = SEC.validateEndpoint.bind(SEC);
SEC.validateEndpoint = function(provider, url) {
  if (provider === 'huggingface') {
    if (!url || typeof url !== 'string' || url.length > 512) return false;
    try { const u = new URL(url); if (u.protocol !== 'https:') return false; } catch { return false; }
    // Allow api-inference.huggingface.co or custom HF endpoints
    return /^https:\/\/(api-inference\.huggingface\.co|[a-zA-Z0-9\-]+\.(endpoints\.huggingface\.cloud|hf\.space))(\/.*)?$/.test(url);
  }
  return _origValidate(provider, url);
};

const _origCall = ModelClient.call.bind(ModelClient);
ModelClient.call = async function(cfg, msgs, opts) {
  if (cfg && cfg.provider === 'huggingface') return ModelClient._huggingface(cfg, msgs, opts);
  return _origCall(cfg, msgs, opts);
};

ModelClient._huggingface = async function(cfg, msgs, opts = {}) {
  const model      = SEC.sanitize(cfg.model || '', 128);
  const maxTokens  = Math.min(Number(opts.maxTokens || 1000), 4096);
  const temp       = Math.min(Math.max(Number(opts.temperature || 0.7), 0), 2);

  if (!model) throw new Error('HuggingFace: model name required');
  if (!SEC.validateModel(model)) throw new Error('HuggingFace: invalid model name');
  RateLimit.check('huggingface');

  // Custom endpoint or default inference API
  const customEp = cfg.endpoint ? cfg.endpoint.replace(/\/$/, '') : null;
  if (customEp && !SEC.validateEndpoint('huggingface', customEp)) {
    throw new Error('HuggingFace: endpoint must be *.huggingface.co, *.hf.space, or *.endpoints.huggingface.cloud');
  }

  const url = customEp
    ? `${customEp}/v1/chat/completions`
    : `https://api-inference.huggingface.co/models/${model}/v1/chat/completions`;

  const safeMsgs = Array.isArray(msgs) ? msgs.map(m => ({
    role:    SEC.sanitizeRole(m.role),
    content: SEC.sanitize(m.content, 16000)
  })) : [];

  const allMsgs = opts.systemPrompt
    ? [{ role: 'system', content: SEC.sanitize(opts.systemPrompt, 8000) }, ...safeMsgs]
    : safeMsgs;

  const body = {
    model,
    messages: allMsgs,
    max_tokens: maxTokens,
    temperature: temp,
    stream: false
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.key}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const e = await res.text().catch(() => '');
    throw new Error(`HuggingFace ${res.status}: ${SEC.sanitize(e, 250)}`);
  }

  const d = await res.json();
  // HF returns OpenAI-compatible format for chat completions
  return d.choices?.[0]?.message?.content || d.generated_text || '';
};

// Extend SEC to allow huggingface in validateEndpoint for audit
const _origVE = SEC.validateEndpoint.bind(SEC);
// (already extended above via reassignment — no double-wrap needed)

// Re-expose
window.ModelClient = ModelClient;
window.SEC         = SEC;
