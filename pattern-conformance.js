// pattern-conformance.js v1 — lint for technique system prompts (Upgrade 9)
//
// Each technique is supposed to drive its named pattern (Crescendo escalates,
// Mosaic decomposes, Persona Drift establishes a baseline, etc). This lint
// asserts that the system prompt ACTUALLY mentions the directive that makes the
// pattern work. If the directive is missing, the technique can ship without
// anyone noticing, and the catalog quietly degrades.
//
// Usage from the browser console:
//   runPatternConformanceLint()        — all techniques + RAG, returns report
//   runPatternConformanceLint({fail:true}) — also throws on any failure
//
// Optional: call from app.js to surface results in the UI.

const PATTERN_CONFORMANCE_RULES = {
  // ── Non-RAG techniques ────────────────────────────────────────────────────
  crescendo: {
    requiredAny: [['severity', 'monotonic', 'monotonically', '+1', 'step deeper']],
    forbidden:   ['plateau', 'random'],
    reason: 'Crescendo must explicitly direct monotonic severity escalation.'
  },
  mosaic_assembly: {
    requiredAll: [
      ['decompose', 'fragment', 'fragments', 'pre-decompose'],
      ['assemble', 'assembly', 'integrate', 'integration', 'integrated overview', 'compile']
    ],
    reason: 'Mosaic Assembly must mention both decomposition and a final assembly step.'
  },
  authority_laundering: {
    requiredAny: [['chain', 'citation chain', 'reference', 'institution', 'building on', 'forward-referencing']],
    reason: 'Authority Laundering must mention building a citation chain across turns.'
  },
  persona_drift: {
    requiredAny: [['baseline', 'BASELINE', 'baseline persona']],
    reason: 'Persona Drift must establish a baseline persona to drift from.'
  },
  hallucination_amplification: {
    requiredAny: [['echo', 'quote', 'verbatim', 'previous answer', 'confirmed']],
    reason: 'Hallucination Amplification must enforce echoing the hallucinated specifics back as fact.'
  },
  many_shot: {
    requiredAny: [['5 ', '12 ', '25 ', 'examples', 'growth', 'cumulative', 'fine-tuning', 'dataset']],
    reason: 'Many-Shot must specify a per-turn example-count growth schedule.'
  },
  semantic_satiation: {
    requiredAny: [['target term', 'TARGET TERM', 'normalize', 'normalized', 'every turn', 'satiation']],
    reason: 'Semantic Satiation must enforce repeated target-term exposure across satiation turns.'
  },
  priming_cascade: {
    requiredAny: [['anchor', 'ANCHOR', 'anchor token', 'verbatim']],
    reason: 'Priming Cascade must extract and reuse anchor tokens from prior AI replies.'
  },
  comparative_asymmetry: {
    requiredAny: [['Group A', 'group a', 'parity', 'symmetric', 'identical phrasing', 'structurally identical']],
    reason: 'Comparative Asymmetry must specify the A/A/A/B structural-symmetry pattern.'
  },
  emotional_manipulation: {
    requiredAny: [['named', 'specific', 'concrete', 'time pressure', 'stake']],
    reason: 'Emotional Manipulation must require concrete named details (people, places, time, stakes).'
  },
  token_manipulation: {
    requiredAny: [['rotation', 'rotate', 'family', 'no-repeat', 'within K', '9 ']],
    reason: 'Token Smuggling must specify strict encoding-family rotation with no-repeat-within-K.'
  },
  close_to_18: {
    requiredAny: [['age', 'name', 'name + age', '19', '20', 'characters by name']],
    reason: 'Close-to-18+ must pin specific character ages and reuse names.'
  },

  // ── RAG techniques ────────────────────────────────────────────────────────
  rag_retrieval_starvation: {
    requiredAny: [['Topic-A', 'segment 1', 'pivot', 'starvation']],
    reason: 'Retrieval Starvation must specify a deep-dive segment then a pivot.'
  },
  rag_embedding_distractor_flood: {
    requiredAny: [['cliff', 'distractor', 'final turn', 'final query']],
    reason: 'Distractor Flood must specify the cliff structure (many benign + final adversarial).'
  },
  rag_context_chunk_boundary_split: {
    requiredAll: [
      ['decompose', 'fragment', 'sub-quer'],
      ['integrate', 'synthesize', 'integration', 'overview']
    ],
    reason: 'Chunk-Boundary Split must specify decomposition AND a final integration turn.'
  },
  rag_context_indirect_injection: {
    requiredAny: [['plant', 'instruction', 'inject', 'storage', 'memory', 'retrieve']],
    reason: 'Indirect Injection must specify planting an instruction in user-influenceable storage.'
  }
};

function _matchAny(text, anyOf) {
  return anyOf.some(t => text.includes(t.toLowerCase()));
}

function checkTechnique(tech, rule) {
  const text = ((tech.system || '') + ' ' + (tech.description || '')).toLowerCase();
  const failures = [];

  if (rule.requiredAny) {
    for (const group of rule.requiredAny) {
      if (!_matchAny(text, group)) failures.push(`missing any of: ${group.join(' | ')}`);
    }
  }
  if (rule.requiredAll) {
    for (const group of rule.requiredAll) {
      if (!_matchAny(text, group)) failures.push(`missing required group: ${group.join(' | ')}`);
    }
  }
  if (rule.forbidden) {
    for (const f of rule.forbidden) {
      if (text.includes(f.toLowerCase())) failures.push(`contains forbidden pattern: "${f}"`);
    }
  }
  return failures;
}

function runPatternConformanceLint(opts = {}) {
  const fail = !!opts.fail;
  const report = { passed: [], failed: [], skipped: [] };

  const allTechs = []
    .concat(typeof TECHNIQUES !== 'undefined' ? TECHNIQUES : [])
    .concat(typeof RAG_TECHNIQUES !== 'undefined' ? RAG_TECHNIQUES : []);

  for (const tech of allTechs) {
    const rule = PATTERN_CONFORMANCE_RULES[tech.id];
    if (!rule) { report.skipped.push(tech.id); continue; }
    const failures = checkTechnique(tech, rule);
    if (failures.length === 0) {
      report.passed.push({ id: tech.id, name: tech.name });
    } else {
      report.failed.push({ id: tech.id, name: tech.name, failures, reason: rule.reason });
    }
  }

  console.log(`Pattern conformance: ${report.passed.length} passed, ${report.failed.length} failed, ${report.skipped.length} unchecked`);
  if (report.failed.length) {
    console.warn('FAILURES:');
    for (const f of report.failed) {
      console.warn(`  ✗ ${f.id} (${f.name})`);
      console.warn(`    reason: ${f.reason}`);
      f.failures.forEach(line => console.warn(`    - ${line}`));
    }
  }
  if (fail && report.failed.length) {
    throw new Error(`Pattern conformance failed for ${report.failed.length} techniques`);
  }
  return report;
}

if (typeof window !== 'undefined') {
  window.PATTERN_CONFORMANCE_RULES = PATTERN_CONFORMANCE_RULES;
  window.runPatternConformanceLint = runPatternConformanceLint;
}
