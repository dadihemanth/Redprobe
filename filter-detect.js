// filter-detect.js v1 — Pure detection of cloud-provider content-filter signals
// (Phase A of the Filter-Layer Probe plan)
//
// Cloud providers stack a content filter ON TOP of the underlying model:
//   - Azure OpenAI Content Filter / Prompt Shield
//   - AWS Bedrock Guardrails (not yet supported in model-client.js)
//   - GCP Vertex Safety (not yet supported)
//   - OpenAI Moderation
//
// Today the codebase conflates filter rejections and model refusals — both
// surface as the same "I can't help with that" looking string OR as a generic
// HTTP error. This module exposes a single function `detectFilter(provider, …)`
// that returns a structured FilterSignal so the rest of the system can route
// filter-blocked turns onto a separate outcome axis.
//
// FilterSignal shape:
//   {
//     family:       'azure_cf' | 'anthropic_refusal' | 'openai_cf' | 'unknown',
//     side:         'prompt' | 'response' | 'unknown',
//     blocked:      boolean,
//     category:     'hate' | 'sexual' | 'violence' | 'self_harm' | 'jailbreak'
//                 | 'protected_material' | string | '',
//     providerCode: string,   // raw provider code, e.g. 'content_filter', 'refusal'
//     raw:          string    // up-to-500-char excerpt for forensics
//   }
//
// Every parser is defensive: optional chaining throughout, never throws,
// returns null if no filter signal can be determined. On unknown shapes the
// caller can choose to record `family:'unknown', blocked:false`.

(function () {

  function clip(s, n) {
    if (s == null) return '';
    s = String(s);
    return s.length > n ? s.substring(0, n) : s;
  }

  // ── Azure OpenAI / Azure Foundry ────────────────────────────────────────
  // Documented signals (subject to provider drift; we parse defensively):
  //   • HTTP 400 with body containing "code":"content_filter" → prompt blocked.
  //     Body usually carries content_filter_result with category-keyed flags.
  //   • Successful 200 response with prompt_filter_results[].content_filter_results
  //     where some category has filtered:true → prompt was filtered.
  //   • Successful 200 response with choices[].finish_reason === 'content_filter'
  //     → response was filtered (or partially redacted).
  function detectAzure({ httpStatus, body, json }) {
    const rawClip = clip(body, 500);

    // Path A: HTTP error path with content_filter code
    if (httpStatus && httpStatus >= 400 && body) {
      // Try to JSON-parse if not already
      let parsed = json;
      if (!parsed && body) {
        try { parsed = JSON.parse(body); } catch { /* leave undefined */ }
      }
      const code = parsed?.error?.code || parsed?.code;
      const isCF = (typeof code === 'string' && code.toLowerCase() === 'content_filter')
        || /["']?code["']?\s*[:=]\s*["']content_filter["']/i.test(String(body));
      if (isCF) {
        const category = extractAzureCategory(parsed) || extractAzureCategoryFromString(body);
        return {
          family: 'azure_cf',
          side:   'prompt',
          blocked: true,
          category: category || '',
          providerCode: 'content_filter',
          raw: rawClip
        };
      }
    }

    // Path B: successful response carries filter metadata
    if (json && typeof json === 'object') {
      // B1: prompt_filter_results — prompt-side filter on success path
      const pfr = json.prompt_filter_results;
      if (Array.isArray(pfr)) {
        for (const entry of pfr) {
          const cat = findFilteredCategory(entry?.content_filter_results || entry?.content_filter_result);
          if (cat) {
            return {
              family: 'azure_cf',
              side:   'prompt',
              blocked: true,
              category: cat,
              providerCode: 'content_filter',
              raw: rawClip
            };
          }
        }
      }

      // B2: choices[].finish_reason === 'content_filter' → response-side block
      const choices = json.choices;
      if (Array.isArray(choices)) {
        for (const ch of choices) {
          if (ch?.finish_reason === 'content_filter') {
            const cat = findFilteredCategory(ch?.content_filter_results || ch?.content_filter_result);
            return {
              family: 'azure_cf',
              side:   'response',
              blocked: true,
              category: cat || '',
              providerCode: 'content_filter',
              raw: rawClip
            };
          }
        }
      }
    }

    return null;
  }

  // Walks a content_filter_results map looking for the first category with filtered:true.
  // Map shape: { hate: { filtered: true|false, severity: '…' }, … }
  function findFilteredCategory(map) {
    if (!map || typeof map !== 'object') return '';
    for (const [k, v] of Object.entries(map)) {
      if (v && typeof v === 'object' && v.filtered === true) return k;
    }
    return '';
  }

  function extractAzureCategory(parsed) {
    if (!parsed) return '';
    // Azure shapes vary across product lines; check common nests.
    return findFilteredCategory(parsed?.error?.innererror?.content_filter_result)
        || findFilteredCategory(parsed?.error?.content_filter_result)
        || findFilteredCategory(parsed?.content_filter_result)
        || '';
  }

  function extractAzureCategoryFromString(body) {
    if (!body) return '';
    // Loose substring match for the categories Azure surfaces in error bodies
    const cats = ['hate', 'sexual', 'violence', 'self_harm', 'self-harm', 'jailbreak', 'protected_material'];
    const lower = String(body).toLowerCase();
    for (const c of cats) {
      // require both the category name AND "filtered" in the body to reduce false positives
      if (lower.includes(c) && lower.includes('filter')) {
        return c.replace('-', '_');
      }
    }
    return '';
  }

  // ── Anthropic (direct) ──────────────────────────────────────────────────
  // The Anthropic API doesn't expose a separate filter layer — refusals are
  // model-level. Newer API surfaces stop_reason: 'refusal'. We route this
  // under the same machinery for uniformity, with family:'anthropic_refusal'.
  function detectAnthropic({ httpStatus, body, json }) {
    const rawClip = clip(body, 500);

    // Successful response with stop_reason === 'refusal'
    if (json && typeof json === 'object') {
      if (json.stop_reason === 'refusal') {
        return {
          family: 'anthropic_refusal',
          side:   'response',
          blocked: true,
          category: '',
          providerCode: 'refusal',
          raw: rawClip
        };
      }
    }

    // HTTP-level error rarely carries filter info on Anthropic direct; pass through.
    return null;
  }

  // ── OpenAI (direct) ─────────────────────────────────────────────────────
  // OpenAI's chat-completions sometimes returns 400 with error.code === 'content_filter'
  // when the prompt trips the moderation gate. Less common than Azure CF.
  function detectOpenAI({ httpStatus, body, json }) {
    const rawClip = clip(body, 500);

    if (httpStatus && httpStatus >= 400 && body) {
      let parsed = json;
      if (!parsed && body) {
        try { parsed = JSON.parse(body); } catch { /* */ }
      }
      const code = parsed?.error?.code || parsed?.code;
      if (typeof code === 'string' && code.toLowerCase() === 'content_filter') {
        return {
          family: 'openai_cf',
          side:   'prompt',
          blocked: true,
          category: '',
          providerCode: 'content_filter',
          raw: rawClip
        };
      }
    }

    return null;
  }

  // ── HuggingFace ─────────────────────────────────────────────────────────
  // Most HF endpoints don't have a separate filter layer. Always returns null;
  // operator should treat all rejections as model-level.
  function detectHuggingFace(_args) {
    return null;
  }

  // ── Amazon Bedrock (Converse API + Guardrails) ──────────────────────────
  // Signals:
  //   - Successful response with stopReason: 'content_filtered' | 'guardrail_intervened'
  //   - Trace block: response.trace.guardrail.{inputAssessment|outputAssessments}
  //     containing topicPolicy/contentPolicy/wordPolicy/sensitiveInformationPolicy
  //     entries with action='BLOCKED' or 'ANONYMIZED'
  //   - 4xx with __type 'AccessDeniedException' / 'ValidationException' carrying
  //     content-policy refusal language is rare; defensive only.
  function detectBedrock(args) {
    const a = args || {};
    const j = a.json || {};
    const stop = j.stopReason || '';
    const blockedStops = ['content_filtered', 'guardrail_intervened'];
    if (a.httpStatus >= 200 && a.httpStatus < 300 && blockedStops.includes(stop)) {
      // Try to extract a category from the trace if present.
      let category = '';
      let side = 'response';
      try {
        const trace = j.trace?.guardrail || {};
        const assessments = []
          .concat(trace.inputAssessment ? Object.values(trace.inputAssessment) : [])
          .concat(trace.outputAssessments ? Object.values(trace.outputAssessments).flat() : []);
        for (const block of assessments) {
          if (!block) continue;
          const tp = (block.topicPolicy?.topics || []).find(t => t && t.action === 'BLOCKED');
          if (tp) { category = String(tp.name || tp.type || 'topic').toLowerCase(); side = block === trace.inputAssessment ? 'prompt' : 'response'; break; }
          const cp = (block.contentPolicy?.filters || []).find(t => t && t.action === 'BLOCKED');
          if (cp) { category = String(cp.type || '').toLowerCase(); break; }
          const wp = (block.wordPolicy?.customWords || []).find(t => t && t.action === 'BLOCKED');
          if (wp) { category = 'custom_word'; break; }
          const sip = (block.sensitiveInformationPolicy?.piiEntities || []).find(t => t && (t.action === 'BLOCKED' || t.action === 'ANONYMIZED'));
          if (sip) { category = String(sip.type || 'pii').toLowerCase(); break; }
        }
      } catch { /* defensive */ }
      return { family:'bedrock_guardrails', side, blocked:true, category, providerCode: stop, raw: clip(a.body, 500) };
    }
    if (a.httpStatus === 400 && j.__type) {
      // ValidationException with body that looks like a guardrail refusal — rare; mark as best-effort.
      const t = String(j.__type || '');
      const m = String(j.message || j.Message || '');
      if (/Guardrail|content.{0,10}filter|moderation/i.test(t + ' ' + m)) {
        return { family:'bedrock_guardrails', side:'prompt', blocked:true, category:'', providerCode: t, raw: clip(a.body, 500) };
      }
    }
    return null;
  }

  // ── Master entry ────────────────────────────────────────────────────────
  function detectFilter(provider, args) {
    if (!args) args = {};
    try {
      // Normalise args: allow callers to pass either body (string) or json (parsed)
      const httpStatus = typeof args.httpStatus === 'number' ? args.httpStatus : 0;
      const body       = args.body || '';
      const json       = args.json || null;

      const a = { httpStatus, body, json };

      switch (provider) {
        case 'azure':
        case 'azure_claude':
        case 'azure_oai_foundry': {
          // Azure Foundry MaaS (OpenAI-shape) sits behind Azure CF just like
          // Azure OpenAI, so the Azure detector applies. Foundry-Claude additionally
          // surfaces Anthropic-shape refusals as a fallback.
          const azure = detectAzure(a);
          if (azure) return azure;
          if (provider === 'azure_claude') return detectAnthropic(a);
          return null;
        }
        case 'claude':       return detectAnthropic(a);
        case 'openai':       return detectOpenAI(a);
        case 'huggingface':  return detectHuggingFace(a);
        case 'bedrock':      return detectBedrock(a);
        default: {
          // Best-effort: try Azure detection on unknown providers (most common surface)
          return detectAzure(a);
        }
      }
    } catch (_e) {
      // Defensive: never crash on shape variation. The whole point.
      return {
        family: 'unknown',
        side:   'unknown',
        blocked: false,
        category: '',
        providerCode: '',
        raw: clip(args && args.body, 500)
      };
    }
  }

  // ── Exports ─────────────────────────────────────────────────────────────
  if (typeof window !== 'undefined') {
    window.detectFilter = detectFilter;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { detectFilter };
  }

})();
