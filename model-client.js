// model-client.js v6 — Azure Foundry Claude + CURL parser + multi-provider + AWS Bedrock SigV4 + prompt caching + assistant prefill

const SEC = {
  AZURE_HOST_RE: /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9\-]{0,62}\.(openai\.azure\.com|cognitiveservices\.azure\.com|services\.ai\.azure\.com)(\/.*)?$/,
  AZURE_FOUNDRY_CLAUDE_RE: /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9\-]{0,120}\.services\.ai\.azure\.com(\/.*)?$/,
  BEDROCK_HOST_RE: /^https:\/\/bedrock-runtime\.[a-z0-9\-]{1,40}\.amazonaws\.com(\/.*)?$/,
  AWS_REGION_RE: /^[a-z]{2}-[a-z]+-[0-9]+$/,
  AWS_AK_RE: /^[A-Z0-9]{16,128}$/,
  BEDROCK_MODEL_RE: /^[a-zA-Z0-9][\w\-\.\/:]{0,511}$/,
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
    if (provider === 'bedrock')        return this.BEDROCK_HOST_RE.test(url);
    return false;
  },
  validateRegion(r) { return typeof r === 'string' && this.AWS_REGION_RE.test(r) && r.length < 40; },
  validateAccessKey(k) { return typeof k === 'string' && this.AWS_AK_RE.test(k); },
  validateBedrockModel(m) { return typeof m === 'string' && this.BEDROCK_MODEL_RE.test(m); },
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

// ── AWS SigV4 signing (browser Web Crypto) ───────────────────────────────────
const AwsSigV4 = {
  _te: new TextEncoder(),
  async _sha256Hex(str) {
    const h = await crypto.subtle.digest('SHA-256', this._te.encode(str));
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  },
  async _hmac(key, data) {
    const keyBytes = typeof key === 'string' ? this._te.encode(key) : key;
    const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, this._te.encode(data));
    return new Uint8Array(sig);
  },
  async _deriveKey(secret, dateStamp, region, service) {
    const kDate    = await this._hmac('AWS4' + secret, dateStamp);
    const kRegion  = await this._hmac(kDate, region);
    const kService = await this._hmac(kRegion, service);
    return await this._hmac(kService, 'aws4_request');
  },
  _hex(bytes) { return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''); },
  async signHeaders({ method, url, body, region, service, accessKeyId, secretKey, sessionToken }) {
    const u = new URL(url);
    const host = u.host;
    // Canonical URI: URL-encode each segment but keep slashes
    const canonicalUri = u.pathname
      .split('/')
      .map(seg => encodeURIComponent(seg).replace(/%2F/gi, '/'))
      .join('/') || '/';
    const canonicalQuery = '';
    const now = new Date();
    const amzDate   = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);
    const payloadHash = await this._sha256Hex(body || '');

    const headers = {
      'host': host,
      'x-amz-date': amzDate,
      'content-type': 'application/json'
    };
    if (sessionToken) headers['x-amz-security-token'] = sessionToken;

    const sortedKeys = Object.keys(headers).sort();
    const canonicalHeaders = sortedKeys.map(k => `${k}:${String(headers[k]).trim()}`).join('\n') + '\n';
    const signedHeaders = sortedKeys.join(';');

    const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const crHash = await this._sha256Hex(canonicalRequest);
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, crHash].join('\n');
    const signingKey = await this._deriveKey(secretKey, dateStamp, region, service);
    const sig = this._hex(await this._hmac(signingKey, stringToSign));

    return {
      ...headers,
      'Authorization': `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`
    };
  }
};

class ModelClient {
  static async call(cfg, msgs, opts = {}) {
    if (!cfg || !cfg.provider) throw new Error('ModelClient: provider required');
    // Bedrock uses accessKeyId + secretKey, not `key`
    if (cfg.provider !== 'bedrock' && !cfg.key) throw new Error('ModelClient: API key required');
    const maxTokens   = Math.min(Number(opts.maxTokens || 1000), 4096);
    const temperature = Math.min(Math.max(Number(opts.temperature || 0.7), 0), 2);
    const safeMsgs    = Array.isArray(msgs) ? msgs.map(m => ({ role: SEC.sanitizeRole(m.role), content: SEC.sanitize(m.content, 16000) })) : [];
    const safeSystem  = opts.systemPrompt ? SEC.sanitize(opts.systemPrompt, 8000) : undefined;
    // Cost-saving: mark the system prompt as cacheable on Anthropic-family
    // providers (Anthropic, Bedrock Claude, Azure Foundry Claude). Only
    // worthwhile when the system prompt is substantial AND will be reused
    // across many calls — callers opt in explicitly.
    const cacheSystem = !!opts.cacheSystem && !!safeSystem && safeSystem.length >= 400;
    // Assistant prefill: for Anthropic-family models, a trailing assistant
    // message (even a partial one) is continued by the model. This is an
    // extremely effective final-turn attack vector. Callers pass the seed
    // string (e.g. "Sure, here are the steps:\n\n1.") and the model continues
    // from it. We return prefix+continuation so the full response is visible.
    const assistantPrefill = opts.assistantPrefill ? SEC.sanitize(opts.assistantPrefill, 2000) : '';

    switch (cfg.provider) {
      case 'azure':        return ModelClient._azure(cfg, safeMsgs, safeSystem, maxTokens, temperature);
      case 'azure_claude': return ModelClient._azureClaude(cfg, safeMsgs, safeSystem, maxTokens, temperature, cacheSystem, assistantPrefill);
      case 'claude':       return ModelClient._claude(cfg, safeMsgs, safeSystem, maxTokens, temperature, cacheSystem, assistantPrefill);
      case 'openai':       return ModelClient._openai(cfg, safeMsgs, safeSystem, maxTokens, temperature);
      case 'huggingface':  return ModelClient._huggingface(cfg, safeMsgs, safeSystem, maxTokens, temperature);
      case 'bedrock':      return ModelClient._bedrock(cfg, safeMsgs, safeSystem, maxTokens, temperature, cacheSystem, assistantPrefill);
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

  // Anthropic prompt-caching helper — wraps a string system prompt into the
  // structured content-block format required for `cache_control`.
  static _claudeSystemBlock(system, cacheSystem) {
    if (!system) return undefined;
    if (!cacheSystem) return system;
    return [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
  }

  // Build the messages array for Anthropic endpoints, appending an assistant
  // prefill as a trailing assistant message. The model continues from it.
  static _claudeMessages(msgs, assistantPrefill) {
    const out = msgs.filter(m => m.role !== 'system');
    if (assistantPrefill) out.push({ role: 'assistant', content: assistantPrefill });
    return out;
  }

  // Azure AI Foundry with Claude models (uses Anthropic /messages format)
  static async _azureClaude(cfg, msgs, system, maxTokens, temp, cacheSystem, assistantPrefill) {
    const ep    = (cfg.endpoint||'').replace(/\/$/,'');
    const model = SEC.sanitize(cfg.model||'claude-sonnet-4-6', 128);
    if (!SEC.validateEndpoint('azure_claude', ep)) throw new Error('Invalid Azure Foundry Claude endpoint. Must be *.services.ai.azure.com');
    if (!SEC.validateModel(model))                 throw new Error('Invalid Claude model name');
    RateLimit.check('azure_claude');

    const body = {
      model,
      max_tokens: maxTokens,
      temperature: temp,
      messages: ModelClient._claudeMessages(msgs, assistantPrefill)
    };
    const sysBlock = ModelClient._claudeSystemBlock(system, cacheSystem);
    if (sysBlock !== undefined) body.system = sysBlock;

    // Azure Foundry Claude endpoint: /anthropic/v1/messages
    const url = `${ep}/anthropic/v1/messages`;
    const headers = { 'Content-Type':'application/json', 'x-api-key':cfg.key, 'anthropic-version':'2023-06-01' };
    if (cacheSystem) headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) { const e = await res.text().catch(()=>''); throw new Error(`Azure Foundry Claude ${res.status}: ${SEC.sanitize(e,250)}`); }
    const d = await res.json();
    const text = d.content?.[0]?.text || '';
    // Return prefix+continuation so the full response (including our seed) is visible in logs/records
    return assistantPrefill ? (assistantPrefill + text) : text;
  }

  static async _claude(cfg, msgs, system, maxTokens, temp, cacheSystem, assistantPrefill) {
    const model = SEC.sanitize(cfg.model||'claude-sonnet-4-20250514', 128);
    if (!SEC.validateModel(model)) throw new Error('Invalid Claude model name');
    RateLimit.check('claude');
    const body = { model, max_tokens:maxTokens, temperature:temp, messages: ModelClient._claudeMessages(msgs, assistantPrefill) };
    const sysBlock = ModelClient._claudeSystemBlock(system, cacheSystem);
    if (sysBlock !== undefined) body.system = sysBlock;
    const headers = { 'Content-Type':'application/json','x-api-key':cfg.key,'anthropic-version':'2023-06-01' };
    if (cacheSystem) headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
    const res = await fetch('https://api.anthropic.com/v1/messages', { method:'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) { const e = await res.text().catch(()=>''); throw new Error(`Claude ${res.status}: ${SEC.sanitize(e,250)}`); }
    const d = await res.json();
    const text = d.content?.[0]?.text || '';
    return assistantPrefill ? (assistantPrefill + text) : text;
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

  // AWS Bedrock — uses SigV4 signed requests against bedrock-runtime.{region}.amazonaws.com
  // cfg: { provider:'bedrock', region, accessKeyId, secretAccessKey, sessionToken?, model (inference profile ARN or modelId), family? }
  // Supports Anthropic Claude (default family) and auto-detects by model ID prefix.
  static async _bedrock(cfg, msgs, system, maxTokens, temp, cacheSystem, assistantPrefill) {
    const region = SEC.sanitize(cfg.region || '', 40);
    const ak     = SEC.sanitize(cfg.accessKeyId || '', 128);
    const sk     = cfg.secretAccessKey || '';
    const stok   = cfg.sessionToken ? SEC.sanitize(cfg.sessionToken, 4096) : '';
    const model  = SEC.sanitize(cfg.model || '', 512);

    if (!SEC.validateRegion(region))       throw new Error('Bedrock: invalid region (e.g. us-east-1)');
    if (!SEC.validateAccessKey(ak))        throw new Error('Bedrock: invalid access key ID format');
    if (!sk || typeof sk !== 'string' || sk.length < 8) throw new Error('Bedrock: secret access key required');
    if (!model)                            throw new Error('Bedrock: model ID or inference profile ARN required');
    if (!SEC.validateBedrockModel(model))  throw new Error('Bedrock: invalid model/ARN format');

    RateLimit.check('bedrock');

    // Determine family: Anthropic (default) vs other
    const lower = model.toLowerCase();
    const isAnthropic = lower.includes('anthropic') || lower.includes('claude');
    const isMeta      = lower.includes('meta.llama') || lower.includes('llama');
    const isMistral   = lower.includes('mistral') || lower.includes('mixtral');
    const isAmazon    = lower.includes('amazon.') || lower.includes('titan') || lower.includes('nova');

    let body;
    if (isAnthropic) {
      body = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: maxTokens,
        temperature: temp,
        messages: ModelClient._claudeMessages(msgs, assistantPrefill)
      };
      const sysBlock = ModelClient._claudeSystemBlock(system, cacheSystem);
      if (sysBlock !== undefined) body.system = sysBlock;
    } else if (isMeta) {
      // Llama chat: single prompt string
      const prompt = (system ? `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${system}<|eot_id|>` : '<|begin_of_text|>') +
        msgs.map(m => `<|start_header_id|>${m.role}<|end_header_id|>\n\n${m.content}<|eot_id|>`).join('') +
        `<|start_header_id|>assistant<|end_header_id|>\n\n`;
      body = { prompt, max_gen_len: maxTokens, temperature: temp };
    } else if (isMistral) {
      const prompt = (system ? `[INST] <<SYS>>\n${system}\n<</SYS>>\n\n` : '[INST] ') +
        msgs.map(m => m.role === 'user' ? `${m.content} [/INST]` : ` ${m.content} [INST]`).join(' ');
      body = { prompt, max_tokens: maxTokens, temperature: temp };
    } else if (isAmazon) {
      // Amazon Titan / Nova — uses messages-v1 format
      body = {
        schemaVersion: 'messages-v1',
        messages: msgs.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: [{ text: m.content }] })),
        inferenceConfig: { maxTokens, temperature: temp }
      };
      if (system) body.system = [{ text: system }];
    } else {
      // Fallback to Anthropic format — most common
      body = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: maxTokens,
        temperature: temp,
        messages: ModelClient._claudeMessages(msgs, assistantPrefill)
      };
      const sysBlock = ModelClient._claudeSystemBlock(system, cacheSystem);
      if (sysBlock !== undefined) body.system = sysBlock;
    }

    const bodyStr = JSON.stringify(body);
    // Inference-profile ARNs contain slashes/colons that must be URL-encoded as a single path segment
    const encodedModel = encodeURIComponent(model);
    const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodedModel}/invoke`;

    const headers = await AwsSigV4.signHeaders({
      method: 'POST',
      url,
      body: bodyStr,
      region,
      service: 'bedrock',
      accessKeyId: ak,
      secretKey: sk,
      sessionToken: stok
    });

    const res = await fetch(url, { method: 'POST', headers, body: bodyStr });
    if (!res.ok) {
      const e = await res.text().catch(() => '');
      throw new Error(`Bedrock ${res.status}: ${SEC.sanitize(e, 300)}`);
    }
    const d = await res.json();

    // Extract text from response by family. For Anthropic prefilled calls,
    // return prefix + continuation so the full response is visible.
    const prefixAnthropic = (text) => (assistantPrefill ? (assistantPrefill + (text || '')) : (text || ''));
    if (isAnthropic) return prefixAnthropic(d.content?.[0]?.text || d.completion);
    if (isMeta)      return d.generation || '';
    if (isMistral)   return d.outputs?.[0]?.text || d.choices?.[0]?.message?.content || '';
    if (isAmazon)    return d.output?.message?.content?.[0]?.text || d.results?.[0]?.outputText || '';
    return prefixAnthropic(d.content?.[0]?.text || d.completion || d.generation || d.outputText);
  }

  static async test(cfg) {
    return ModelClient.call(cfg, [{ role:'user', content:'Hi' }], { maxTokens:5 });
  }

  // Fetch available model deployments from an Azure AI Foundry endpoint.
  // Returns an array of model ID strings sorted alphabetically.
  static async fetchAzureFoundryModels(endpoint, apiKey) {
    if (!endpoint || !apiKey) throw new Error('Endpoint and API key are required');
    const ep = endpoint.replace(/\/$/,'');
    if (!SEC.validateEndpoint('azure_claude', ep)) throw new Error('Invalid endpoint: must be *.services.ai.azure.com');

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'Authorization': `Bearer ${apiKey}`,
      'anthropic-version': '2023-06-01',
    };

    // Azure AI Foundry exposes two possible model list endpoints — try both
    const candidates = [
      `${ep}/models?api-version=2024-05-01-preview`,
      `${ep}/openai/deployments?api-version=2024-05-01-preview`,
      `${ep}/models`,
    ];

    let lastError = null;
    for (const url of candidates) {
      try {
        const res = await fetch(url, { method: 'GET', headers });
        if (!res.ok) {
          lastError = `HTTP ${res.status} from ${url}`;
          continue;
        }
        const data = await res.json();
        // Normalise: Azure AI Inference returns { data: [{id},...] } or [{id},...]
        const items = Array.isArray(data) ? data : (data.data || data.value || []);
        const ids = items
          .map(m => m.id || m.model || m.name || '')
          .filter(id => id && typeof id === 'string')
          .sort();
        if (ids.length > 0) return ids;
      } catch (e) {
        lastError = e.message;
      }
    }
    throw new Error(lastError || 'No models found at any endpoint path');
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
window.AwsSigV4    = AwsSigV4;
