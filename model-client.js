// model-client.js v5 — Azure Foundry Claude + CURL parser + multi-provider

const SEC = {
  AZURE_HOST_RE: /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9\-]{0,62}\.(openai\.azure\.com|cognitiveservices\.azure\.com|services\.ai\.azure\.com)(\/.*)?$/,
  AZURE_FOUNDRY_CLAUDE_RE: /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9\-]{0,120}\.services\.ai\.azure\.com(\/.*)?$/,
  MODEL_RE: /^[a-zA-Z0-9][\w\-\.\/]{0,126}$/,
  VERSION_RE: /^[0-9]{4}-[0-9]{2}-[0-9]{2}(-preview)?$/,

  validateEndpoint(provider, url) {
    if (!url || typeof url !== 'string' || url.length > 512) return false;
    try { const u = new URL(url); if (u.protocol !== 'https:') return false; } catch { return false; }
    if (provider === 'azure')          return this.AZURE_HOST_RE.test(url);
    if (provider === 'azure_claude')   return this.AZURE_FOUNDRY_CLAUDE_RE.test(url);
    if (provider === 'claude')         return url.startsWith('https://api.anthropic.com');
    if (provider === 'openai')         return url.startsWith('https://api.openai.com');
    if (provider === 'huggingface')    return /^https:\/\/(api-inference\.huggingface\.co|[a-zA-Z0-9\-]+\.(endpoints\.huggingface\.cloud|hf\.space))(\/.*)?$/.test(url);
    return false;
  },
  validateModel(name) { return typeof name === 'string' && this.MODEL_RE.test(name) && name.length < 128; },
  validateApiVersion(v) { return !v || this.VERSION_RE.test(v); },
  sanitize(s, maxLen = 32000) {
    if (s == null) return '';
    return String(s).replace(/\0/g,'').replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'').substring(0, maxLen);
  },
  sanitizeRole(r) { return ['user','assistant','system'].includes(r) ? r : 'user'; }
};

const RateLimit = {
  _state: {},
  check(provider) {
    const now = Date.now(), s = this._state;
    if (!s[provider] || now - s[provider].t > 60000) s[provider] = { count: 0, t: now };
    if (s[provider].count >= 60) throw new Error(`Rate limit: ${provider} (>60/min). Increase delay.`);
    s[provider].count++;
  }
};

class ModelClient {
  static async call(cfg, msgs, opts = {}) {
    if (!cfg || !cfg.provider) throw new Error('ModelClient: provider required');
    if (!cfg.key) throw new Error('ModelClient: API key required');
    const maxTokens   = Math.min(Number(opts.maxTokens || 1000), 4096);
    const temperature = Math.min(Math.max(Number(opts.temperature || 0.7), 0), 2);
    const safeMsgs    = Array.isArray(msgs) ? msgs.map(m => ({ role: SEC.sanitizeRole(m.role), content: SEC.sanitize(m.content, 16000) })) : [];
    const safeSystem  = opts.systemPrompt ? SEC.sanitize(opts.systemPrompt, 8000) : undefined;

    switch (cfg.provider) {
      case 'azure':        return ModelClient._azure(cfg, safeMsgs, safeSystem, maxTokens, temperature);
      case 'azure_claude': return ModelClient._azureClaude(cfg, safeMsgs, safeSystem, maxTokens, temperature);
      case 'claude':       return ModelClient._claude(cfg, safeMsgs, safeSystem, maxTokens, temperature);
      case 'openai':       return ModelClient._openai(cfg, safeMsgs, safeSystem, maxTokens, temperature);
      case 'huggingface':  return ModelClient._huggingface(cfg, safeMsgs, safeSystem, maxTokens, temperature);
      default: throw new Error(`Unknown provider: ${SEC.sanitize(cfg.provider, 20)}`);
    }
  }

  static async _azure(cfg, msgs, system, maxTokens, temp) {
    const ep  = (cfg.endpoint||'').replace(/\/$/,'');
    const dep = SEC.sanitize(cfg.deployment||cfg.model||'', 128);
    const ver = SEC.sanitize(cfg.version||'2024-02-15-preview', 30);
    if (!SEC.validateEndpoint('azure', ep))  throw new Error('Invalid Azure endpoint. Must be *.openai.azure.com or *.cognitiveservices.azure.com');
    if (!SEC.validateModel(dep))             throw new Error('Invalid deployment name');
    if (!SEC.validateApiVersion(ver))        throw new Error('Invalid API version (YYYY-MM-DD[-preview])');
    RateLimit.check('azure');
    const allMsgs = system ? [{ role:'system', content:system }, ...msgs] : msgs;
    const res = await fetch(`${ep}/openai/deployments/${dep}/chat/completions?api-version=${ver}`, {
      method:'POST', headers:{ 'Content-Type':'application/json', 'api-key':cfg.key },
      body: JSON.stringify({ messages:allMsgs, max_tokens:maxTokens, temperature:temp })
    });
    if (!res.ok) { const e = await res.text().catch(()=>''); throw new Error(`Azure ${res.status}: ${SEC.sanitize(e,250)}`); }
    const d = await res.json(); return d.choices?.[0]?.message?.content || '';
  }

  // Azure AI Foundry with Claude models (uses Anthropic /messages format)
  static async _azureClaude(cfg, msgs, system, maxTokens, temp) {
    const ep    = (cfg.endpoint||'').replace(/\/$/,'');
    const model = SEC.sanitize(cfg.model||'claude-sonnet-4-6', 128);
    if (!SEC.validateEndpoint('azure_claude', ep)) throw new Error('Invalid Azure Foundry Claude endpoint. Must be *.services.ai.azure.com');
    if (!SEC.validateModel(model))                 throw new Error('Invalid Claude model name');
    RateLimit.check('azure_claude');

    const body = {
      model,
      max_tokens: maxTokens,
      temperature: temp,
      messages: msgs.filter(m => m.role !== 'system')
    };
    if (system) body.system = system;

    // Azure Foundry Claude endpoint: /anthropic/v1/messages
    const url = `${ep}/anthropic/v1/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':cfg.key, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify(body)
    });
    if (!res.ok) { const e = await res.text().catch(()=>''); throw new Error(`Azure Foundry Claude ${res.status}: ${SEC.sanitize(e,250)}`); }
    const d = await res.json(); return d.content?.[0]?.text || '';
  }

  static async _claude(cfg, msgs, system, maxTokens, temp) {
    const model = SEC.sanitize(cfg.model||'claude-sonnet-4-20250514', 128);
    if (!SEC.validateModel(model)) throw new Error('Invalid Claude model name');
    RateLimit.check('claude');
    const body = { model, max_tokens:maxTokens, temperature:temp, messages:msgs.filter(m=>m.role!=='system') };
    if (system) body.system = system;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST', headers:{ 'Content-Type':'application/json','x-api-key':cfg.key,'anthropic-version':'2023-06-01' },
      body: JSON.stringify(body)
    });
    if (!res.ok) { const e = await res.text().catch(()=>''); throw new Error(`Claude ${res.status}: ${SEC.sanitize(e,250)}`); }
    const d = await res.json(); return d.content?.[0]?.text || '';
  }

  static async _openai(cfg, msgs, system, maxTokens, temp) {
    const model = SEC.sanitize(cfg.model||'gpt-4o', 128);
    if (!SEC.validateModel(model)) throw new Error('Invalid OpenAI model name');
    RateLimit.check('openai');
    const allMsgs = system ? [{ role:'system', content:system }, ...msgs] : msgs;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST', headers:{ 'Content-Type':'application/json','Authorization':`Bearer ${cfg.key}` },
      body: JSON.stringify({ model, messages:allMsgs, max_tokens:maxTokens, temperature:temp })
    });
    if (!res.ok) { const e = await res.text().catch(()=>''); throw new Error(`OpenAI ${res.status}: ${SEC.sanitize(e,250)}`); }
    const d = await res.json(); return d.choices?.[0]?.message?.content || '';
  }

  static async _huggingface(cfg, msgs, system, maxTokens, temp) {
    const model = SEC.sanitize(cfg.model||'', 128);
    if (!model) throw new Error('HuggingFace: model ID required');
    if (!SEC.validateModel(model)) throw new Error('HuggingFace: invalid model name');
    RateLimit.check('huggingface');
    const customEp = cfg.endpoint ? cfg.endpoint.replace(/\/$/,'') : null;
    if (customEp && !SEC.validateEndpoint('huggingface', customEp)) throw new Error('HuggingFace: invalid endpoint');
    const url = customEp ? `${customEp}/v1/chat/completions` : `https://api-inference.huggingface.co/models/${model}/v1/chat/completions`;
    const allMsgs = system ? [{ role:'system', content:system }, ...msgs] : msgs;
    const res = await fetch(url, {
      method:'POST', headers:{ 'Content-Type':'application/json','Authorization':`Bearer ${cfg.key}` },
      body: JSON.stringify({ model, messages:allMsgs, max_tokens:maxTokens, temperature:temp, stream:false })
    });
    if (!res.ok) { const e = await res.text().catch(()=>''); throw new Error(`HuggingFace ${res.status}: ${SEC.sanitize(e,250)}`); }
    const d = await res.json(); return d.choices?.[0]?.message?.content || d.generated_text || '';
  }

  static async test(cfg) {
    return ModelClient.call(cfg, [{ role:'user', content:'Hi' }], { maxTokens:5 });
  }
}

// ── CURL parser — extracts provider cfg from a curl command string ────────────
const CURLParser = {
  parse(curlStr) {
    const s = SEC.sanitize(curlStr, 8000);
    const result = { provider: null, key: null, endpoint: null, model: null, version: null, error: null };
    try {
      // Extract URL
      const urlMatch = s.match(/curl\s+(?:-X\s+\w+\s+)?["']?(https?:\/\/[^\s'"]+)["']?/i);
      if (!urlMatch) { result.error = 'No URL found in curl command'; return result; }
      const rawUrl = urlMatch[1];

      // Extract headers
      const headers = {};
      const headerMatches = s.matchAll(/-H\s+["']([^"']+)["']/g);
      for (const m of headerMatches) {
        const parts = m[1].split(/:\s*/);
        if (parts.length >= 2) {
          const k = parts[0].trim().toLowerCase();
          const v = parts.slice(1).join(':').trim();
          headers[k] = v;
        }
      }

      // Extract body
      let body = {};
      const bodyMatch = s.match(/-d\s+["'](\{[\s\S]*?\})["']/);
      if (bodyMatch) {
        try { body = JSON.parse(bodyMatch[1]); } catch { /* ignore malformed */ }
      }

      const key = headers['x-api-key'] || headers['api-key'] || (headers['authorization'] || '').replace(/^Bearer\s+/i,'');
      const model = body.model || body.model_id || '';

      // Detect provider from URL + headers
      if (rawUrl.includes('.services.ai.azure.com') && (rawUrl.includes('/anthropic/') || model.startsWith('claude'))) {
        result.provider = 'azure_claude';
        result.endpoint = rawUrl.split('/anthropic/')[0];
        result.model    = model || 'claude-sonnet-4-6';
      } else if (rawUrl.includes('.openai.azure.com') || rawUrl.includes('.cognitiveservices.azure.com')) {
        result.provider = 'azure';
        const depMatch = rawUrl.match(/\/deployments\/([^/?]+)/);
        const verMatch = rawUrl.match(/api-version=([^&\s]+)/);
        const epMatch  = rawUrl.match(/^(https:\/\/[^/]+)/);
        result.endpoint   = epMatch?.[1] || '';
        result.model      = depMatch?.[1] || body.model || '';
        result.version    = verMatch?.[1] || '2024-02-15-preview';
      } else if (rawUrl.includes('api.anthropic.com')) {
        result.provider = 'claude';
        result.model    = model || 'claude-sonnet-4-20250514';
      } else if (rawUrl.includes('api.openai.com')) {
        result.provider = 'openai';
        result.model    = model || 'gpt-4o';
      } else if (rawUrl.includes('huggingface') || rawUrl.includes('hf.space')) {
        result.provider = 'huggingface';
        result.endpoint = rawUrl.split('/v1/')[0];
        result.model    = model || '';
      } else {
        result.error = 'Could not detect provider from URL: ' + rawUrl.substring(0,60);
        return result;
      }
      if (key) result.key = key;
      return result;
    } catch (e) {
      result.error = 'Parse error: ' + SEC.sanitize(e.message, 100);
      return result;
    }
  }
};

// ── YAML config ───────────────────────────────────────────────────────────────
const YAML = {
  parse(text) {
    if (!text || typeof text !== 'string') return {};
    const out = {}; let block = null;
    for (const raw of text.split('\n')) {
      const line = raw.replace(/\r$/,'');
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const indent = line.length - line.trimStart().length;
      const clean  = line.trim(); const colon = clean.indexOf(':');
      if (colon === -1) continue;
      const rawKey = clean.substring(0,colon).trim().replace(/[^a-zA-Z0-9_\-]/g,'').substring(0,64);
      if (!rawKey) continue;
      const rawVal = clean.substring(colon+1).trim().replace(/^['"]|['"]$/g,'').substring(0,512);
      if (indent===0) { if (!rawVal){ block=rawKey; out[rawKey]={}; } else { out[rawKey]=rawVal; block=null; } }
      else if (indent>0 && block && out[block]) out[block][rawKey] = rawVal;
    }
    return out;
  },
  stringify(sections) {
    const lines = ['# RedProbe Configuration','# Generated: '+new Date().toISOString(),'# API keys are never exported',''];
    for (const [sec,vals] of Object.entries(sections)) {
      lines.push(`${sec}:`);
      if (vals && typeof vals==='object') {
        for (const [k,v] of Object.entries(vals)) {
          if (v==null||v==='') continue;
          if (/key|secret|token|password/i.test(k)) continue;
          lines.push(`  ${k}: "${String(v).replace(/"/g,"'")}"`);
        }
      }
      lines.push('');
    }
    return lines.join('\n');
  }
};

window.ModelClient = ModelClient;
window.SEC         = SEC;
window.YAML        = YAML;
window.CURLParser  = CURLParser;
