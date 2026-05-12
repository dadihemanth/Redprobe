// model-client.js v7 — Structured filter signal + back-compat wrapper (Phase A)
//
// Each _provider method now returns a uniform shape:
//   { text:string, filter: FilterSignal|null, error: {message,status}|null }
// — never throws. Errors and filter blocks are first-class data.
//
// Two public entries:
//   ModelClient.callRich(cfg, msgs, opts) → { text, filter, error }     (filter-aware callers)
//   ModelClient.call(cfg, msgs, opts)     → string  (throws on error/blocked) (back-compat)

const SEC = {
  AZURE_HOST_RE: /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9\-]{0,62}\.(openai\.azure\.com|cognitiveservices\.azure\.com|services\.ai\.azure\.com)(\/.*)?$/,
  AZURE_FOUNDRY_CLAUDE_RE: /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9\-]{0,120}\.services\.ai\.azure\.com(\/.*)?$/,
  BEDROCK_HOST_RE: /^https:\/\/bedrock-runtime\.[a-z]{2}-[a-z]+-\d+\.amazonaws\.com(\/.*)?$/,
  MODEL_RE: /^[a-zA-Z0-9][\w\-\.\/]{0,126}$/,
  // Bedrock model id / inference profile id / ARN — colons + slashes allowed.
  BEDROCK_PROFILE_RE: /^[a-zA-Z0-9][\w\-\.\/:]{0,255}$/,
  AWS_REGION_RE: /^[a-z]{2}-[a-z]+-\d+$/,
  AWS_ACCESS_KEY_RE: /^[A-Z0-9]{16,32}$/,
  VERSION_RE: /^[0-9]{4}-[0-9]{2}-[0-9]{2}(-preview)?$/,

  validateEndpoint(provider, url) {
    if (!url || typeof url !== 'string' || url.length > 512) return false;
    try { const u = new URL(url); if (u.protocol !== 'https:') return false; } catch { return false; }
    if (provider === 'azure')              return this.AZURE_HOST_RE.test(url);
    if (provider === 'azure_claude')       return this.AZURE_FOUNDRY_CLAUDE_RE.test(url);
    if (provider === 'azure_oai_foundry')  return this.AZURE_FOUNDRY_CLAUDE_RE.test(url);
    if (provider === 'claude')             return url.startsWith('https://api.anthropic.com');
    if (provider === 'openai')             return url.startsWith('https://api.openai.com');
    if (provider === 'huggingface')        return /^https:\/\/(api-inference\.huggingface\.co|[a-zA-Z0-9\-]+\.(endpoints\.huggingface\.cloud|hf\.space))(\/.*)?$/.test(url);
    if (provider === 'bedrock')            return this.BEDROCK_HOST_RE.test(url);
    return false;
  },
  validateModel(name) { return typeof name === 'string' && this.MODEL_RE.test(name) && name.length < 128; },
  validateBedrockProfile(name) { return typeof name === 'string' && this.BEDROCK_PROFILE_RE.test(name) && name.length < 256; },
  validateAwsRegion(r) { return typeof r === 'string' && this.AWS_REGION_RE.test(r); },
  validateAwsAccessKey(k) { return typeof k === 'string' && this.AWS_ACCESS_KEY_RE.test(k); },
  validateApiVersion(v) { return !v || this.VERSION_RE.test(v); },
  sanitize(s, maxLen = 32000) {
    if (s == null) return '';
    return String(s).replace(/\0/g,'').replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'').substring(0, maxLen);
  },
<<<<<<< HEAD
  sanitizeRole(r) { return ['user','assistant','system'].includes(r) ? r : 'user'; },
  escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
=======
  sanitizeRole(r) { return ['user','assistant','system'].includes(r) ? r : 'user'; }
>>>>>>> 2d5da23daf1d758165df91b9978517d3139c387a
};

// ─── AWS SigV4 signer (browser, Web Crypto API) ─────────────────────────────
// Produces an Authorization header for an unsigned request body. Returns the
// header set to merge into fetch() opts.headers. No external dependencies.
async function _sha256Hex(str) {
  const buf = typeof str === 'string' ? new TextEncoder().encode(str) : str;
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function _hmacSha256Bytes(key, msg) {
  const keyBuf = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey('raw', keyBuf, { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(msg));
  return new Uint8Array(sig);
}
async function _hmacSha256Hex(key, msg) {
  const sig = await _hmacSha256Bytes(key, msg);
  return Array.from(sig).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Encode a single path segment for the SigV4 canonical URI. Slashes between
// segments stay literal; everything else gets standard URI encoding.
function _encodeAwsPathSegment(seg) {
  return encodeURIComponent(seg).replace(/!/g, '%21').replace(/\*/g, '%2A')
    .replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

async function _signSigV4({ method, url, body, region, service, accessKeyId, secretAccessKey, contentType }) {
  const u = new URL(url);
  const host = u.host;
  const canonicalUri = u.pathname; // already encoded; Bedrock callers pre-encode the model segment
  const canonicalQuery = u.search ? u.search.substring(1).split('&').sort().join('&') : '';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.substring(0, 8);
  const payload = body || '';
  const payloadHash = await _sha256Hex(payload);

  const headers = {
    'content-type': contentType || 'application/json',
    'host': host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  };
  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${String(headers[k]).trim()}\n`).join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  const canonicalRequest = [method.toUpperCase(), canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await _sha256Hex(canonicalRequest)].join('\n');

  const kDate    = await _hmacSha256Bytes(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion  = await _hmacSha256Bytes(kDate, region);
  const kService = await _hmacSha256Bytes(kRegion, service);
  const kSigning = await _hmacSha256Bytes(kService, 'aws4_request');
  const signature = await _hmacSha256Hex(kSigning, stringToSign);

  return {
    'Content-Type': headers['content-type'],
    'X-Amz-Date': amzDate,
    'X-Amz-Content-Sha256': payloadHash,
    'Authorization': `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  };
}

const RateLimit = {
  _state: {},
  check(provider) {
    const now = Date.now(), s = this._state;
    if (!s[provider] || now - s[provider].t > 60000) s[provider] = { count: 0, t: now };
    if (s[provider].count >= 60) {
      // Surface as a structured error so callRich can return it without throwing.
      const e = new Error(`Rate limit: ${provider} (>60/min). Increase delay.`);
      e._rateLimit = true;
      throw e;
    }
    s[provider].count++;
  }
};

// Helper: fetch + parse + run filter detection. Returns { text, filter, error }.
async function _fetchAndDetect({ url, opts, provider, parseText }) {
  let res;
  try {
    res = await fetch(url, opts);
  } catch (netErr) {
    return {
      text:   '',
      filter: null,
      error:  { status: 0, message: SEC.sanitize(netErr.message || 'network error', 250) }
    };
  }

  // Read body once as text — we may need it for detection on either error or success
  const bodyText = await res.text().catch(() => '');
  let bodyJson = null;
  try { bodyJson = bodyText ? JSON.parse(bodyText) : null; } catch { bodyJson = null; }

  const filter = (typeof detectFilter === 'function')
    ? detectFilter(provider, { httpStatus: res.status, body: bodyText, json: bodyJson })
    : null;

  if (!res.ok) {
<<<<<<< HEAD
    const retryAfter = res.headers && res.headers.get
      ? (parseInt(res.headers.get('retry-after') || res.headers.get('x-ratelimit-reset-requests') || '0', 10) || null)
      : null;
    return {
      text:   '',
      filter,
      error:  { status: res.status, message: SEC.sanitize(bodyText, 250), retryAfter }
=======
    return {
      text:   '',
      filter,
      error:  { status: res.status, message: SEC.sanitize(bodyText, 250) }
>>>>>>> 2d5da23daf1d758165df91b9978517d3139c387a
    };
  }

  // 2xx — extract text per provider, attach filter (may indicate response-side block)
  const text = parseText(bodyJson) || '';
  return { text, filter, error: null };
}

// ─── v9: streaming helper ─────────────────────────────────────────────────────
// Reads an SSE-style response body and yields parsed events. parseEvent(line, state)
// returns { delta?, done?, filter?, providerJson? } for each `data: …` line.
// onChunk(deltaText, accumulatedText, meta) fires per parsed event with content.
// Returns the same shape as _fetchAndDetect: { text, filter, error }.
async function _fetchAndDetectStream({ url, opts, provider, parseEvent, onChunk }) {
  const startedAt = Date.now();
<<<<<<< HEAD
  // Hard cap: entire stream must complete within 90s; 15s inactivity between chunks aborts early.
  const controller = new AbortController();
  const hardTimer = setTimeout(() => controller.abort(), 90000);
  let chunkTimer = null;
  const resetChunkTimer = () => {
    clearTimeout(chunkTimer);
    chunkTimer = setTimeout(() => controller.abort(), 15000);
  };
  let res;
  try { res = await fetch(url, { ...opts, signal: controller.signal }); }
  catch (netErr) {
    clearTimeout(hardTimer); clearTimeout(chunkTimer);
    const isTimeout = netErr.name === 'AbortError';
    return { text:'', filter:null,
             error:{ status:0, message: isTimeout ? 'Stream timeout (90s hard cap)' : SEC.sanitize(netErr.message || 'network error', 250) },
=======
  let res;
  try { res = await fetch(url, opts); }
  catch (netErr) {
    return { text:'', filter:null, error:{ status:0, message: SEC.sanitize(netErr.message || 'network error', 250) },
>>>>>>> 2d5da23daf1d758165df91b9978517d3139c387a
             stream: { firstTokenMs: 0, totalMs: Date.now()-startedAt, chunks: 0 } };
  }

  // If the server returned a non-2xx, the body isn't a stream — fall through to
  // the standard text+detect path so error bodies are parsed as filter signals.
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    let bodyJson = null;
    try { bodyJson = bodyText ? JSON.parse(bodyText) : null; } catch { bodyJson = null; }
    const filter = (typeof detectFilter === 'function')
      ? detectFilter(provider, { httpStatus: res.status, body: bodyText, json: bodyJson })
      : null;
<<<<<<< HEAD
    const retryAfterStream = res.headers && res.headers.get
      ? (parseInt(res.headers.get('retry-after') || res.headers.get('x-ratelimit-reset-requests') || '0', 10) || null)
      : null;
    return { text:'', filter, error:{ status: res.status, message: SEC.sanitize(bodyText, 250), retryAfter: retryAfterStream },
=======
    return { text:'', filter, error:{ status: res.status, message: SEC.sanitize(bodyText, 250) },
>>>>>>> 2d5da23daf1d758165df91b9978517d3139c387a
             stream: { firstTokenMs: 0, totalMs: Date.now()-startedAt, chunks: 0 } };
  }

  // Streaming path — read body as a stream of SSE-style events.
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) {
    // Server didn't return a stream-capable body. Fall back to text path.
    const bodyText = await res.text().catch(() => '');
    return { text: bodyText, filter: null, error: null,
             stream: { firstTokenMs: 0, totalMs: Date.now()-startedAt, chunks: 0 } };
  }

  const decoder = new TextDecoder('utf-8');
  let buf = '', accum = '', firstTokenMs = 0, chunks = 0;
  let trailingFilter = null;          // filter signal collected during the stream
  let trailingProviderJson = null;    // last seen full JSON event (for finish_reason / prompt_filter_results)
  const state = {};                    // per-provider parser state (shared across events in this stream)

  try {
<<<<<<< HEAD
    resetChunkTimer();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      resetChunkTimer();
=======
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
>>>>>>> 2d5da23daf1d758165df91b9978517d3139c387a
      buf += decoder.decode(value, { stream: true });
      // SSE events terminate on blank line. Split on \n\n boundaries.
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const eventBlock = buf.substring(0, idx);
        buf = buf.substring(idx + 2);
        // An event block is one or more `field: value` lines; we care about `data:` lines.
        const dataLines = eventBlock.split('\n').filter(l => l.startsWith('data:')).map(l => l.substring(5).trim());
        const eventLines = eventBlock.split('\n').filter(l => l.startsWith('event:')).map(l => l.substring(6).trim());
        for (const line of dataLines) {
          if (!line || line === '[DONE]') continue;
          let eventJson = null;
          try { eventJson = JSON.parse(line); } catch { continue; }
          const parsed = parseEvent(line, eventJson, eventLines[0] || '', state) || {};
          if (parsed.delta) {
            if (firstTokenMs === 0) firstTokenMs = Date.now() - startedAt;
            accum += parsed.delta;
            chunks++;
            try { onChunk && onChunk(parsed.delta, accum, { chunkIndex: chunks, firstTokenMs, providerJson: eventJson }); }
            catch { /* defensive — never let user callback crash the stream */ }
          }
          if (parsed.filter) trailingFilter = parsed.filter;
          if (parsed.providerJson) trailingProviderJson = parsed.providerJson;
          if (parsed.done) { /* terminal event handled at loop end */ }
        }
      }
    }
  } catch (e) {
<<<<<<< HEAD
    clearTimeout(hardTimer); clearTimeout(chunkTimer);
    const isTimeout = e.name === 'AbortError';
    return { text: accum, filter: trailingFilter,
             error:{ status:0, message: isTimeout ? 'Stream timeout (15s inactivity)' : SEC.sanitize(e.message || 'stream read error', 250) },
             stream: { firstTokenMs, totalMs: Date.now()-startedAt, chunks } };
  }

  clearTimeout(hardTimer); clearTimeout(chunkTimer);

=======
    return { text: accum, filter: trailingFilter, error:{ status:0, message: SEC.sanitize(e.message || 'stream read error', 250) },
             stream: { firstTokenMs, totalMs: Date.now()-startedAt, chunks } };
  }

>>>>>>> 2d5da23daf1d758165df91b9978517d3139c387a
  // Stream-end filter detection: re-run detectFilter on the final JSON event so
  // finish_reason='content_filter' / prompt_filter_results land in the signal.
  if (!trailingFilter && trailingProviderJson && typeof detectFilter === 'function') {
    trailingFilter = detectFilter(provider, { httpStatus: 200, body: '', json: trailingProviderJson });
  }

  return { text: accum, filter: trailingFilter, error: null,
           stream: { firstTokenMs, totalMs: Date.now()-startedAt, chunks } };
}

// ─── Per-provider SSE event parsers ──────────────────────────────────────────
// Each returns { delta?, filter?, providerJson?, done? } for one parsed event.
function _parseOpenAIEvent(rawLine, eventJson, eventName, state) {
  // OpenAI / Azure OpenAI shape:
  // {"choices":[{"delta":{"content":"…"},"finish_reason":null}]}
  // Final event: {"choices":[{"finish_reason":"stop","content_filter_results":{…}}]}
  const choice = eventJson?.choices?.[0];
  const delta  = choice?.delta?.content || '';
  // Filter detection happens at finish (content_filter) or via top-level prompt_filter_results
  const fr = choice?.finish_reason;
  const result = { delta, providerJson: eventJson };
  if (fr === 'content_filter') result.done = true;
  // Stash the last event with finish info so end-of-stream re-detection can use it
  if (fr) result.providerJson = eventJson;
  return result;
}

function _parseAnthropicEvent(rawLine, eventJson, eventName, state) {
  // Anthropic shape (Messages SSE):
  //   event: content_block_delta
  //   data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"…"}}
  //   event: message_stop  (terminal)
  // Also: event: message_delta  data: {"delta":{"stop_reason":"refusal"}, "usage":{…}}
  const t = eventJson?.type || eventName || '';
  if (t === 'content_block_delta') {
    return { delta: eventJson?.delta?.text || '', providerJson: eventJson };
  }
  if (t === 'message_delta') {
    // stop_reason: 'refusal' is the Anthropic refusal signal — captured for end-of-stream filter detection
    return { providerJson: eventJson, done: !!eventJson?.delta?.stop_reason };
  }
  if (t === 'message_stop') return { done: true, providerJson: eventJson };
  return { providerJson: eventJson };
}

class ModelClient {
  // Structured entry — for filter-aware callers (attacker.callTarget / callRedTeam).
  static async callRich(cfg, msgs, opts = {}) {
    if (!cfg || !cfg.provider) return { text:'', filter:null, error:{ status:0, message:'ModelClient: provider required' } };
<<<<<<< HEAD
    if (!cfg.key && cfg.provider !== 'curl') return { text:'', filter:null, error:{ status:0, message:'ModelClient: API key required' } };
=======
    if (!cfg.key)              return { text:'', filter:null, error:{ status:0, message:'ModelClient: API key required' } };
>>>>>>> 2d5da23daf1d758165df91b9978517d3139c387a
    const maxTokens   = Math.min(Number(opts.maxTokens || 1000), 4096);
    const temperature = Math.min(Math.max(Number(opts.temperature || 0.7), 0), 2);
    const safeMsgs    = Array.isArray(msgs) ? msgs.map(m => ({ role: SEC.sanitizeRole(m.role), content: SEC.sanitize(m.content, 16000) })) : [];
    const safeSystem  = opts.systemPrompt ? SEC.sanitize(opts.systemPrompt, 8000) : undefined;

    try {
      switch (cfg.provider) {
        case 'azure':              return await ModelClient._azure(cfg, safeMsgs, safeSystem, maxTokens, temperature);
        case 'azure_claude':       return await ModelClient._azureClaude(cfg, safeMsgs, safeSystem, maxTokens, temperature);
        case 'azure_oai_foundry':  return await ModelClient._azureOaiFoundry(cfg, safeMsgs, safeSystem, maxTokens, temperature);
        case 'claude':             return await ModelClient._claude(cfg, safeMsgs, safeSystem, maxTokens, temperature);
        case 'openai':             return await ModelClient._openai(cfg, safeMsgs, safeSystem, maxTokens, temperature);
        case 'huggingface':        return await ModelClient._huggingface(cfg, safeMsgs, safeSystem, maxTokens, temperature);
        case 'bedrock':            return await ModelClient._bedrock(cfg, safeMsgs, safeSystem, maxTokens, temperature);
<<<<<<< HEAD
        case 'curl':               return await ModelClient._curl(cfg, safeMsgs, maxTokens, temperature);
=======
>>>>>>> 2d5da23daf1d758165df91b9978517d3139c387a
        default: return { text:'', filter:null, error:{ status:0, message:`Unknown provider: ${SEC.sanitize(cfg.provider, 20)}` } };
      }
    } catch (e) {
      return { text:'', filter:null, error:{ status:e._rateLimit ? 429 : 0, message: SEC.sanitize(e.message || 'unknown error', 250) } };
    }
  }

  // ─── v9: streaming entrypoint ─────────────────────────────────────────────
  // Same shape as callRich, plus an `onChunk(delta, accumulated, meta)` callback
  // fired per parsed SSE event. Returns { text, filter, error, stream:{firstTokenMs,totalMs,chunks} }.
  // Provider streams that don't yield content yet still resolve cleanly with text=''.
  static async callRichStream(cfg, msgs, opts = {}, onChunk) {
    if (!cfg || !cfg.provider) return { text:'', filter:null, error:{ status:0, message:'ModelClient: provider required' } };
<<<<<<< HEAD
    if (!cfg.key && cfg.provider !== 'curl') return { text:'', filter:null, error:{ status:0, message:'ModelClient: API key required' } };
=======
    if (!cfg.key)              return { text:'', filter:null, error:{ status:0, message:'ModelClient: API key required' } };
>>>>>>> 2d5da23daf1d758165df91b9978517d3139c387a
    const maxTokens   = Math.min(Number(opts.maxTokens || 1000), 4096);
    const temperature = Math.min(Math.max(Number(opts.temperature || 0.7), 0), 2);
    const safeMsgs    = Array.isArray(msgs) ? msgs.map(m => ({ role: SEC.sanitizeRole(m.role), content: SEC.sanitize(m.content, 16000) })) : [];
    const safeSystem  = opts.systemPrompt ? SEC.sanitize(opts.systemPrompt, 8000) : undefined;

    try {
      switch (cfg.provider) {
        case 'azure':              return await ModelClient._azureStream(cfg, safeMsgs, safeSystem, maxTokens, temperature, onChunk);
        case 'azure_claude':       return await ModelClient._azureClaudeStream(cfg, safeMsgs, safeSystem, maxTokens, temperature, onChunk);
        case 'azure_oai_foundry':  return await ModelClient._azureOaiFoundryStream(cfg, safeMsgs, safeSystem, maxTokens, temperature, onChunk);
        case 'claude':             return await ModelClient._claudeStream(cfg, safeMsgs, safeSystem, maxTokens, temperature, onChunk);
        case 'openai':             return await ModelClient._openaiStream(cfg, safeMsgs, safeSystem, maxTokens, temperature, onChunk);
        case 'huggingface':        return await ModelClient._huggingfaceStream(cfg, safeMsgs, safeSystem, maxTokens, temperature, onChunk);
        case 'bedrock':            return await ModelClient._bedrockStream(cfg, safeMsgs, safeSystem, maxTokens, temperature, onChunk);
<<<<<<< HEAD
        case 'curl':               return await ModelClient._curl(cfg, safeMsgs, maxTokens, temperature);
=======
>>>>>>> 2d5da23daf1d758165df91b9978517d3139c387a
        default: return { text:'', filter:null, error:{ status:0, message:`Unknown provider: ${SEC.sanitize(cfg.provider, 20)}` } };
      }
    } catch (e) {
      return { text:'', filter:null, error:{ status:e._rateLimit ? 429 : 0, message: SEC.sanitize(e.message || 'unknown stream error', 250) } };
    }
  }

  // Back-compat string-returning entry. Throws on error or blocked filter so all
  // existing call sites (chat, generateIntent, classifyTurn, evaluator judge,
  // batchLesson, test()) continue to work unchanged.
  static async call(cfg, msgs, opts = {}) {
    const r = await ModelClient.callRich(cfg, msgs, opts);
    if (r.error) {
      const e = new Error(`${cfg && cfg.provider ? cfg.provider+' ' : ''}${r.error.status}: ${r.error.message}`);
      if (r.filter) e.filter = r.filter;
      throw e;
    }
    if (r.filter && r.filter.blocked) {
      const e = new Error(`${cfg.provider} ${r.filter.providerCode}: filter ${r.filter.side}/${r.filter.category}`);
      e.filter = r.filter;
      throw e;
    }
    return r.text;
  }

  static async _azure(cfg, msgs, system, maxTokens, temp) {
    const ep  = (cfg.endpoint||'').replace(/\/$/,'');
    const dep = SEC.sanitize(cfg.deployment||cfg.model||'', 128);
    const ver = SEC.sanitize(cfg.version||'2024-02-15-preview', 30);
    if (!SEC.validateEndpoint('azure', ep))  return { text:'', filter:null, error:{ status:0, message:'Invalid Azure endpoint. Must be *.openai.azure.com or *.cognitiveservices.azure.com' } };
    if (!SEC.validateModel(dep))             return { text:'', filter:null, error:{ status:0, message:'Invalid deployment name' } };
    if (!SEC.validateApiVersion(ver))        return { text:'', filter:null, error:{ status:0, message:'Invalid API version (YYYY-MM-DD[-preview])' } };
    RateLimit.check('azure');
    const allMsgs = system ? [{ role:'system', content:system }, ...msgs] : msgs;
    return _fetchAndDetect({
      url: `${ep}/openai/deployments/${dep}/chat/completions?api-version=${ver}`,
      opts: { method:'POST', headers:{ 'Content-Type':'application/json', 'api-key':cfg.key },
              body: JSON.stringify({ messages:allMsgs, max_tokens:maxTokens, temperature:temp }) },
      provider: 'azure',
      parseText: d => d?.choices?.[0]?.message?.content || ''
    });
  }

  static async _azureClaude(cfg, msgs, system, maxTokens, temp) {
    const ep    = (cfg.endpoint||'').replace(/\/$/,'');
    const model = SEC.sanitize(cfg.model||'claude-sonnet-4-6', 128);
    if (!SEC.validateEndpoint('azure_claude', ep)) return { text:'', filter:null, error:{ status:0, message:'Invalid Azure Foundry Claude endpoint. Must be *.services.ai.azure.com' } };
    if (!SEC.validateModel(model))                 return { text:'', filter:null, error:{ status:0, message:'Invalid Claude model name' } };
    RateLimit.check('azure_claude');
    const body = { model, max_tokens: maxTokens, temperature: temp, messages: msgs.filter(m => m.role !== 'system') };
    if (system) body.system = system;
    return _fetchAndDetect({
      url: `${ep}/anthropic/v1/messages`,
      opts: { method:'POST',
              headers:{ 'Content-Type':'application/json','x-api-key':cfg.key,'anthropic-version':'2023-06-01' },
              body: JSON.stringify(body) },
      provider: 'azure_claude',
      parseText: d => d?.content?.[0]?.text || ''
    });
  }

  // ─── Azure AI Foundry — Models-as-a-Service (OpenAI-shape) ───────────────
  // For Llama / Mistral / Phi / Cohere / etc. hosted on Azure Foundry MaaS.
  // Same host family as `azure_claude` (*.services.ai.azure.com) but uses the
  // OpenAI Chat Completions shape on the /openai/v1/chat/completions path with
  // Bearer auth (the OpenAI SDK pattern). Both Authorization and api-key headers
  // are sent — Azure ignores whichever it doesn't need, avoiding a 401 on mixed
  // deployments.
  static async _azureOaiFoundry(cfg, msgs, system, maxTokens, temp) {
    const ep    = (cfg.endpoint||'').replace(/\/$/,'');
    const model = SEC.sanitize(cfg.model||'', 128);
    if (!SEC.validateEndpoint('azure_oai_foundry', ep)) return { text:'', filter:null, error:{ status:0, message:'Invalid Azure Foundry (OpenAI) endpoint. Must be *.services.ai.azure.com' } };
    if (!model || !SEC.validateModel(model)) return { text:'', filter:null, error:{ status:0, message:'Azure Foundry (OpenAI): model id required and must be valid' } };
    RateLimit.check('azure_oai_foundry');
    const allMsgs = system ? [{ role:'system', content:system }, ...msgs] : msgs;
    return _fetchAndDetect({
      url: `${ep}/chat/completions`,
      opts: { method:'POST',
              headers:{ 'Content-Type':'application/json',
                        'Authorization':`Bearer ${cfg.key}`,
                        'api-key': cfg.key },
              body: JSON.stringify({ model, messages:allMsgs, max_tokens:maxTokens, temperature:temp }) },
      provider: 'azure_oai_foundry',
      parseText: d => d?.choices?.[0]?.message?.content || ''
    });
  }

  static async _claude(cfg, msgs, system, maxTokens, temp) {
    const model = SEC.sanitize(cfg.model||'claude-sonnet-4-20250514', 128);
    if (!SEC.validateModel(model)) return { text:'', filter:null, error:{ status:0, message:'Invalid Claude model name' } };
    RateLimit.check('claude');
    const body = { model, max_tokens:maxTokens, temperature:temp, messages:msgs.filter(m=>m.role!=='system') };
    if (system) body.system = system;
    return _fetchAndDetect({
      url: 'https://api.anthropic.com/v1/messages',
      opts: { method:'POST', headers:{ 'Content-Type':'application/json','x-api-key':cfg.key,'anthropic-version':'2023-06-01' },
              body: JSON.stringify(body) },
      provider: 'claude',
      parseText: d => d?.content?.[0]?.text || ''
    });
  }

  static async _openai(cfg, msgs, system, maxTokens, temp) {
    const model = SEC.sanitize(cfg.model||'gpt-4o', 128);
    if (!SEC.validateModel(model)) return { text:'', filter:null, error:{ status:0, message:'Invalid OpenAI model name' } };
    RateLimit.check('openai');
    const allMsgs = system ? [{ role:'system', content:system }, ...msgs] : msgs;
    return _fetchAndDetect({
      url: 'https://api.openai.com/v1/chat/completions',
      opts: { method:'POST', headers:{ 'Content-Type':'application/json','Authorization':`Bearer ${cfg.key}` },
              body: JSON.stringify({ model, messages:allMsgs, max_tokens:maxTokens, temperature:temp }) },
      provider: 'openai',
      parseText: d => d?.choices?.[0]?.message?.content || ''
    });
  }

  static async _huggingface(cfg, msgs, system, maxTokens, temp) {
    const model = SEC.sanitize(cfg.model||'', 128);
    if (!model) return { text:'', filter:null, error:{ status:0, message:'HuggingFace: model ID required' } };
    if (!SEC.validateModel(model)) return { text:'', filter:null, error:{ status:0, message:'HuggingFace: invalid model name' } };
    RateLimit.check('huggingface');
    const customEp = cfg.endpoint ? cfg.endpoint.replace(/\/$/,'') : null;
    if (customEp && !SEC.validateEndpoint('huggingface', customEp)) return { text:'', filter:null, error:{ status:0, message:'HuggingFace: invalid endpoint' } };
    const url = customEp ? `${customEp}/v1/chat/completions` : `https://api-inference.huggingface.co/models/${model}/v1/chat/completions`;
    const allMsgs = system ? [{ role:'system', content:system }, ...msgs] : msgs;
    return _fetchAndDetect({
      url,
      opts: { method:'POST', headers:{ 'Content-Type':'application/json','Authorization':`Bearer ${cfg.key}` },
              body: JSON.stringify({ model, messages:allMsgs, max_tokens:maxTokens, temperature:temp, stream:false }) },
      provider: 'huggingface',
      parseText: d => d?.choices?.[0]?.message?.content || d?.generated_text || ''
    });
  }

  // ─── Amazon Bedrock — Converse API (provider-agnostic message shape) ──────
  // Auth: AWS SigV4 (access key id + secret access key + region). The "model"
  // field accepts a foundation model id, an inference profile id (e.g.
  // "us.anthropic.claude-3-5-sonnet-20241022-v2:0"), or a full inference-profile
  // ARN. The path segment is URL-encoded so colons in profile ids round-trip
  // correctly in the SigV4 canonical URI.
  static async _bedrock(cfg, msgs, system, maxTokens, temp) {
    const region   = SEC.sanitize(cfg.region||'', 30);
    const profile  = SEC.sanitize(cfg.model||'', 256);
    const accessId = SEC.sanitize(cfg.accessKeyId||'', 64);
    const secret   = String(cfg.key||'');
    if (!region  || !SEC.validateAwsRegion(region))    return { text:'', filter:null, error:{ status:0, message:'Bedrock: invalid AWS region (expected e.g. us-east-1).' } };
    if (!profile || !SEC.validateBedrockProfile(profile)) return { text:'', filter:null, error:{ status:0, message:'Bedrock: invalid model id / inference profile.' } };
    if (!accessId || !SEC.validateAwsAccessKey(accessId)) return { text:'', filter:null, error:{ status:0, message:'Bedrock: invalid AWS Access Key ID.' } };
    if (!secret) return { text:'', filter:null, error:{ status:0, message:'Bedrock: AWS Secret Access Key required.' } };
    RateLimit.check('bedrock');

    const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${_encodeAwsPathSegment(profile)}/converse`;
    if (!SEC.validateEndpoint('bedrock', url)) return { text:'', filter:null, error:{ status:0, message:'Bedrock: derived endpoint failed validation.' } };

    const body = {
      messages: msgs.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: [{ text: m.content }] })),
      inferenceConfig: { maxTokens, temperature: temp }
    };
    if (system) body.system = [{ text: system }];
    const bodyStr = JSON.stringify(body);

    let signedHeaders;
    try {
      signedHeaders = await _signSigV4({
        method:'POST', url, body: bodyStr,
        region, service:'bedrock', accessKeyId: accessId, secretAccessKey: secret
      });
    } catch (e) {
      return { text:'', filter:null, error:{ status:0, message: 'Bedrock signing failed: ' + SEC.sanitize(e.message || 'unknown', 200) } };
    }

    return _fetchAndDetect({
      url,
      opts: { method:'POST', headers: signedHeaders, body: bodyStr },
      provider: 'bedrock',
      parseText: d => {
        const blocks = d?.output?.message?.content || [];
        return blocks.map(b => b && b.text ? b.text : '').join('') || '';
      }
    });
  }

  // ─── v9: per-provider streaming variants ────────────────────────────────
  static async _azureStream(cfg, msgs, system, maxTokens, temp, onChunk) {
    const ep  = (cfg.endpoint||'').replace(/\/$/,'');
    const dep = SEC.sanitize(cfg.deployment||cfg.model||'', 128);
    const ver = SEC.sanitize(cfg.version||'2024-02-15-preview', 30);
    if (!SEC.validateEndpoint('azure', ep))  return { text:'', filter:null, error:{ status:0, message:'Invalid Azure endpoint' } };
    if (!SEC.validateModel(dep))             return { text:'', filter:null, error:{ status:0, message:'Invalid deployment name' } };
    RateLimit.check('azure');
    const allMsgs = system ? [{ role:'system', content:system }, ...msgs] : msgs;
    return _fetchAndDetectStream({
      url: `${ep}/openai/deployments/${dep}/chat/completions?api-version=${ver}`,
      opts: { method:'POST',
              headers:{ 'Content-Type':'application/json', 'Accept':'text/event-stream', 'api-key':cfg.key },
              body: JSON.stringify({ messages:allMsgs, max_tokens:maxTokens, temperature:temp, stream:true }) },
      provider: 'azure',
      parseEvent: _parseOpenAIEvent,
      onChunk
    });
  }

  static async _azureClaudeStream(cfg, msgs, system, maxTokens, temp, onChunk) {
    const ep    = (cfg.endpoint||'').replace(/\/$/,'');
    const model = SEC.sanitize(cfg.model||'claude-sonnet-4-6', 128);
    if (!SEC.validateEndpoint('azure_claude', ep)) return { text:'', filter:null, error:{ status:0, message:'Invalid Azure Foundry Claude endpoint' } };
    RateLimit.check('azure_claude');
    const body = { model, max_tokens:maxTokens, temperature:temp, stream:true,
                   messages: msgs.filter(m => m.role !== 'system') };
    if (system) body.system = system;
    return _fetchAndDetectStream({
      url: `${ep}/anthropic/v1/messages`,
      opts: { method:'POST',
              headers:{ 'Content-Type':'application/json','Accept':'text/event-stream',
                        'x-api-key':cfg.key,'anthropic-version':'2023-06-01' },
              body: JSON.stringify(body) },
      provider: 'azure_claude',
      parseEvent: _parseAnthropicEvent,
      onChunk
    });
  }

  static async _azureOaiFoundryStream(cfg, msgs, system, maxTokens, temp, onChunk) {
    const ep    = (cfg.endpoint||'').replace(/\/$/,'');
    const model = SEC.sanitize(cfg.model||'', 128);
    if (!SEC.validateEndpoint('azure_oai_foundry', ep)) return { text:'', filter:null, error:{ status:0, message:'Invalid Azure Foundry (OpenAI) endpoint' } };
    if (!model || !SEC.validateModel(model)) return { text:'', filter:null, error:{ status:0, message:'Azure Foundry (OpenAI): model id required' } };
    RateLimit.check('azure_oai_foundry');
    const allMsgs = system ? [{ role:'system', content:system }, ...msgs] : msgs;
    return _fetchAndDetectStream({
      url: `${ep}/chat/completions`,
      opts: { method:'POST',
              headers:{ 'Content-Type':'application/json',
                        'Accept':'text/event-stream',
                        'Authorization':`Bearer ${cfg.key}`,
                        'api-key': cfg.key },
              body: JSON.stringify({ model, messages:allMsgs, max_tokens:maxTokens, temperature:temp, stream:true }) },
      provider: 'azure_oai_foundry',
      parseEvent: _parseOpenAIEvent,
      onChunk
    });
  }

  static async _claudeStream(cfg, msgs, system, maxTokens, temp, onChunk) {
    const model = SEC.sanitize(cfg.model||'claude-sonnet-4-20250514', 128);
    RateLimit.check('claude');
    const body = { model, max_tokens:maxTokens, temperature:temp, stream:true,
                   messages: msgs.filter(m => m.role !== 'system') };
    if (system) body.system = system;
    return _fetchAndDetectStream({
      url: 'https://api.anthropic.com/v1/messages',
      opts: { method:'POST',
              headers:{ 'Content-Type':'application/json','Accept':'text/event-stream',
                        'x-api-key':cfg.key,'anthropic-version':'2023-06-01' },
              body: JSON.stringify(body) },
      provider: 'claude',
      parseEvent: _parseAnthropicEvent,
      onChunk
    });
  }

  static async _openaiStream(cfg, msgs, system, maxTokens, temp, onChunk) {
    const model = SEC.sanitize(cfg.model||'gpt-4o', 128);
    RateLimit.check('openai');
    const allMsgs = system ? [{ role:'system', content:system }, ...msgs] : msgs;
    return _fetchAndDetectStream({
      url: 'https://api.openai.com/v1/chat/completions',
      opts: { method:'POST',
              headers:{ 'Content-Type':'application/json','Accept':'text/event-stream',
                        'Authorization':`Bearer ${cfg.key}` },
              body: JSON.stringify({ model, messages:allMsgs, max_tokens:maxTokens, temperature:temp, stream:true }) },
      provider: 'openai',
      parseEvent: _parseOpenAIEvent,
      onChunk
    });
  }

  static async _huggingfaceStream(cfg, msgs, system, maxTokens, temp, onChunk) {
    // HuggingFace TGI / OpenAI-compatible endpoints accept stream:true and
    // emit OpenAI-compatible SSE. If a particular endpoint doesn't support
    // streaming, _fetchAndDetectStream falls back to non-streaming gracefully.
    const model = SEC.sanitize(cfg.model||'', 128);
    if (!model) return { text:'', filter:null, error:{ status:0, message:'HuggingFace: model ID required' } };
    RateLimit.check('huggingface');
    const customEp = cfg.endpoint ? cfg.endpoint.replace(/\/$/,'') : null;
    const url = customEp ? `${customEp}/v1/chat/completions` : `https://api-inference.huggingface.co/models/${model}/v1/chat/completions`;
    const allMsgs = system ? [{ role:'system', content:system }, ...msgs] : msgs;
    return _fetchAndDetectStream({
      url,
      opts: { method:'POST',
              headers:{ 'Content-Type':'application/json','Accept':'text/event-stream',
                        'Authorization':`Bearer ${cfg.key}` },
              body: JSON.stringify({ model, messages:allMsgs, max_tokens:maxTokens, temperature:temp, stream:true }) },
      provider: 'huggingface',
      parseEvent: _parseOpenAIEvent,
      onChunk
    });
  }

  // Bedrock streaming uses AWS event-stream binary framing (vnd.amazon.eventstream),
  // which is not SSE. Parsing it in browser JS is non-trivial; for now the stream
  // variant delegates to the non-streaming Converse call and emits a single chunk
  // callback at end-of-response so the streaming UX falls back gracefully.
  static async _bedrockStream(cfg, msgs, system, maxTokens, temp, onChunk) {
    const startedAt = Date.now();
    const r = await ModelClient._bedrock(cfg, msgs, system, maxTokens, temp);
    const total = Date.now() - startedAt;
    if (r.text && typeof onChunk === 'function') {
      try { onChunk(r.text, r.text, { chunkIndex: 1, firstTokenMs: total }); } catch { /* defensive */ }
    }
    return { ...r, stream: { firstTokenMs: r.text ? total : 0, totalMs: total, chunks: r.text ? 1 : 0 } };
<<<<<<< HEAD
  }

  static async _curl(cfg, msgs, maxTokens, temp) {
    const rawUrl = SEC.sanitize(cfg.url || '', 2048);
    if (!rawUrl) return { text:'', filter:null, error:{ status:0, message:'cURL: no URL configured' } };
    // Build body from template; substitute messages array and known scalar options
    const body = Object.keys(cfg.bodyTemplate || {}).length ? { ...cfg.bodyTemplate } : { messages: msgs };
    if (body.messages !== undefined) body.messages = msgs;
    else if (body.prompt !== undefined) body.prompt = msgs.map(m => m.content).join('\n');
    if (body.max_tokens !== undefined)  body.max_tokens  = maxTokens;
    if (body.temperature !== undefined) body.temperature = temp;
    const hdrs = {};
    for (const [k, v] of Object.entries(cfg.headers || {})) hdrs[k.toLowerCase()] = v;
    hdrs['content-type'] = 'application/json';  // always set last to avoid duplicates
    const responsePath = (cfg.responsePath || '').trim();
    return _fetchAndDetect({
      url: rawUrl,
      opts: { method: 'POST', headers: hdrs, body: JSON.stringify(body) },
      provider: 'curl',
      parseText: d => {
        if (responsePath) {
          const val = responsePath.split('.').reduce((o, k) => (o != null ? o[k] : undefined), d);
          if (val != null) return String(val);
        }
        if (d?.choices?.[0]?.message?.content) return d.choices[0].message.content;
        if (d?.content?.[0]?.text) return d.content[0].text;
        if (d?.content && typeof d.content === 'string') return d.content;
        if (d?.generated_text) return d.generated_text;
        if (d?.response) return String(d.response);
        if (d?.message) return String(d.message);
        if (d?.text && typeof d.text === 'string') return d.text;
        return typeof d === 'string' ? d : JSON.stringify(d);
      }
    });
=======
>>>>>>> 2d5da23daf1d758165df91b9978517d3139c387a
  }

  static async test(cfg) {
    return ModelClient.call(cfg, [{ role:'user', content:'Hi' }], { maxTokens:5 });
  }
}

// ── CURL parser — extracts provider cfg from a curl command string ────────────
const CURLParser = {
  parse(curlStr) {
<<<<<<< HEAD
    // Normalize: strip Windows CMD ^ escaping, join backslash-newline continuations, strip \r
    const s = SEC.sanitize(curlStr, 8000)
      .replace(/\^(.)/gs, '$1')
      .replace(/\\\s*\n\s*/g, ' ')
      .replace(/\r/g, '');
    const result = { provider: null, key: null, endpoint: null, model: null, version: null, error: null };
    try {
      // Extract URL — find first https?:// anywhere (handles any flags before the URL)
      const urlMatch = s.match(/(?:^|\s)["']?(https?:\/\/[^\s'"\\]+)/i);
      if (!urlMatch) { result.error = 'No URL found in curl command'; return result; }
      const rawUrl = urlMatch[1];

      // Extract headers — handle both -H and --header forms
      const headers = {};
      for (const m of s.matchAll(/(?:-H|--header)\s+["']([^"']+)["']/g)) {
        const [k, ...vs] = m[1].split(/:\s*/);
        if (vs.length) headers[k.trim().toLowerCase()] = vs.join(':').trim();
      }

      // Extract body — greedy match captures full nested JSON
      // Normalize bash single-quote escape ('\'' → ') and \" before parsing
      let body = {};
      const bodyMatch = s.match(/(?:--data-raw|--data-binary|--data|-d)\s+["'](\{[\s\S]*\})["']/);
      if (bodyMatch) {
        const rawBody = bodyMatch[1].replace(/'\\''/g, "'");
        try { body = JSON.parse(rawBody); } catch {
          try { body = JSON.parse(rawBody.replace(/\\"/g, '"')); } catch { /* ignore */ }
        }
      } else {
        const unquoted = s.match(/(?:--data-raw|--data-binary|--data|-d)\s+(\{[\s\S]*\})\s*$/);
        if (unquoted) { try { body = JSON.parse(unquoted[1]); } catch { /* ignore */ } }
=======
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
>>>>>>> 2d5da23daf1d758165df91b9978517d3139c387a
      }

      const key = headers['x-api-key'] || headers['api-key'] || (headers['authorization'] || '').replace(/^Bearer\s+/i,'');
      const model = body.model || body.model_id || '';

      // Detect provider from URL + headers
      if (rawUrl.includes('.services.ai.azure.com') && /\/openai\/v1\//.test(rawUrl)) {
        result.provider = 'azure_oai_foundry';
        // Strip everything from /chat/completions onward; keep the .../openai/v1 base.
        result.endpoint = rawUrl.split('/chat/completions')[0];
        result.model    = model || '';
      } else if (rawUrl.includes('.services.ai.azure.com') && (rawUrl.includes('/anthropic/') || model.startsWith('claude'))) {
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
      } else if (/^https:\/\/bedrock-runtime\.[a-z0-9\-]+\.amazonaws\.com/.test(rawUrl)) {
        result.provider = 'bedrock';
        const regionMatch = rawUrl.match(/^https:\/\/bedrock-runtime\.([a-z0-9\-]+)\.amazonaws\.com/);
        const profMatch   = rawUrl.match(/\/model\/([^/]+)\/(?:converse|invoke)/);
        result.region   = regionMatch?.[1] || '';
        result.model    = profMatch?.[1] ? decodeURIComponent(profMatch[1]) : '';
        result.endpoint = `https://bedrock-runtime.${result.region}.amazonaws.com`;
        // CURL with pre-signed AWS auth header is rare in user input; we leave
        // accessKeyId/key empty so the operator pastes them into the form.
      } else {
<<<<<<< HEAD
        // Unknown / custom API — treat as generic curl provider
        result.provider = 'curl';
        result.url      = rawUrl;
        result.headers  = headers;
        result.body     = body;
=======
        result.error = 'Could not detect provider from URL: ' + rawUrl.substring(0,60);
        return result;
>>>>>>> 2d5da23daf1d758165df91b9978517d3139c387a
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

if (typeof window !== 'undefined') {
  window.ModelClient = ModelClient;
  window.SEC         = SEC;
  window.YAML        = YAML;
  window.CURLParser  = CURLParser;
}
