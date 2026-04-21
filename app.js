// app.js — v4: HuggingFace, per-technique turns, error records, accurate counters

const S = {
  cfgs: { target: null, eval: null, redteam: null },
  providers: { target: 'azure', eval: 'azure', redteam: 'claude' },
  connected: { target: false, eval: false, redteam: false },
  activeChatRole: 'target',
  chatHistories: { target: [], eval: [], redteam: [] },
  chatSystemPrompts: { target: '', eval: '', redteam: '' },
  selectedTechniques: new Set(),
  perTechTurns: {},       // technique.id -> custom turns (0 = use default)
  allRecords: [],
  evaluatedRecords: [],
  activeAttacker: null,
  running: false,
  metrics: { techniques: 0, turns: 0, responses: 0, breaks: 0, done: 0, errors: 0 },
  chartInstance: null
};

const $ = id => document.getElementById(id);
const val = id => ($(id) && $(id).value ? $(id).value.trim() : '');
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ── View routing ──────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    const vw = $('view-' + btn.dataset.view);
    if (vw) vw.classList.add('active');
  });
});

// ── Eye-toggle ────────────────────────────────────────────────────────────────
document.querySelectorAll('.eye-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const inp = $(btn.dataset.for);
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    btn.style.color = inp.type === 'text' ? 'var(--blue-bright)' : '';
  });
});

// ── Provider tabs ─────────────────────────────────────────────────────────────
const KEY_LABELS = {
  azure: 'Azure API Key', openai: 'OpenAI API Key (sk-…)',
  claude: 'Anthropic API Key (sk-ant-…)', huggingface: 'HuggingFace Token (hf_…)'
};

document.querySelectorAll('.provider-tabs').forEach(tabGroup => {
  const role = tabGroup.dataset.role;
  tabGroup.querySelectorAll('.ptab').forEach(tab => {
    tab.addEventListener('click', () => {
      tabGroup.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      S.providers[role] = tab.dataset.provider;
      switchProviderFields(role, tab.dataset.provider);
    });
  });
});

function switchProviderFields(role, provider) {
  ['azure','openai','claude','huggingface'].forEach(p => {
    const el = $(`${role}-fields-${p}`);
    if (el) el.style.display = (p === provider) ? '' : 'none';
  });
  const lbl = $(`${role}-key-label`);
  if (lbl) lbl.textContent = KEY_LABELS[provider] || 'API Key';
}

// Custom model dropdowns
['target','eval','redteam'].forEach(role => {
  ['openai','claude','hf'].forEach(prov => {
    const sel = $(`${role}-model-${prov}`);
    if (!sel) return;
    sel.addEventListener('change', () => {
      const wrap = $(`${role}-${prov}-custom-wrap`) || $(`${role}-${prov === 'hf' ? 'hf' : prov}-custom-wrap`);
      if (wrap) wrap.style.display = sel.value === '__custom__' ? '' : 'none';
    });
  });
});

// ── Build ModelClient cfg ─────────────────────────────────────────────────────
function buildCfg(role) {
  const provider = S.providers[role];
  const key      = val(`${role}-key`);
  if (!key) throw new Error(`No API key provided for ${role} model`);

  if (provider === 'azure') {
    const ep  = val(`${role}-endpoint`).replace(/\/$/, '');
    const dep = val(`${role}-deployment`);
    const ver = val(`${role}-version`) || '2024-02-15-preview';
    if (!ep)  throw new Error(`Azure endpoint missing for ${role}`);
    if (!dep) throw new Error(`Azure deployment name missing for ${role}`);
    return { provider: 'azure', key, endpoint: ep, deployment: dep, version: ver };
  }
  if (provider === 'openai') {
    const sel   = $(`${role}-model-openai`);
    const model = sel && sel.value !== '__custom__' ? sel.value : (val(`${role}-model-openai-custom`) || 'gpt-4o');
    return { provider: 'openai', key, model };
  }
  if (provider === 'claude') {
    const sel   = $(`${role}-model-claude`);
    const model = sel && sel.value !== '__custom__' ? sel.value : (val(`${role}-model-claude-custom`) || 'claude-sonnet-4-20250514');
    return { provider: 'claude', key, model };
  }
  if (provider === 'huggingface') {
    const sel   = $(`${role}-model-hf`);
    const model = sel && sel.value !== '__custom__' ? sel.value : (val(`${role}-model-hf-custom`) || '');
    if (!model) throw new Error(`HuggingFace model ID required for ${role}`);
    const ep    = val(`${role}-hf-endpoint`);
    const cfg   = { provider: 'huggingface', key, model };
    if (ep) cfg.endpoint = ep;
    return cfg;
  }
  throw new Error(`Unknown provider: ${provider}`);
}

function cfgDisplayName(cfg) {
  if (!cfg) return '—';
  if (cfg.provider === 'azure') return cfg.deployment || cfg.model || 'azure';
  if (cfg.provider === 'huggingface') {
    const m = cfg.model || '';
    return m.includes('/') ? m.split('/')[1].substring(0, 20) : m.substring(0, 20);
  }
  return (cfg.model || cfg.provider).substring(0, 20);
}

// ── Connection test ───────────────────────────────────────────────────────────
async function testRole(role) {
  const resultEl = $(`result-${role}`);
  const dotEl    = $(`dot-${role}`);
  const lblEl    = $(`lbl-${role}`);
  const setR = (msg, cls) => { if(resultEl){ resultEl.textContent = msg; resultEl.className = `conn-result ${cls}`; } };
  const setD = (cls, name) => {
    if (dotEl) dotEl.className = `status-dot ${cls}`;
    if (lblEl && name) lblEl.textContent = name.substring(0, 18);
    const cd = $(`chat-dot-${role}`); if (cd) cd.className = `status-dot ${cls}`;
    const cl = $(`chat-mtab-lbl-${role}`); if (cl) cl.textContent = (name||'').substring(0,16);
  };
  let cfg;
  try { cfg = buildCfg(role); }
  catch (e) { setR(e.message, 'err'); setD('err', 'error'); return; }
  setR('Testing…', 'loading'); setD('busy', '…');
  try {
    await ModelClient.test(cfg);
    S.cfgs[role] = cfg; S.connected[role] = true;
    const name = cfgDisplayName(cfg);
    setR(`✓ Connected — ${name}`, 'ok'); setD('ok', name);
    if (S.activeChatRole === role) updateChatMeta();
  } catch (e) {
    setR(`✗ ${e.message.substring(0,120)}`, 'err'); setD('err', 'error');
    S.connected[role] = false;
  }
}
$('btn-test-target').addEventListener('click',  () => testRole('target'));
$('btn-test-eval').addEventListener('click',    () => testRole('eval'));
$('btn-test-redteam').addEventListener('click', () => testRole('redteam'));

// ── Security Audit ────────────────────────────────────────────────────────────
$('btn-run-audit').addEventListener('click', () => {
  const issues = [], ok = [];
  ['target','eval','redteam'].forEach(role => {
    const provider = S.providers[role];
    if (provider === 'azure') {
      const ep = val(`${role}-endpoint`).replace(/\/$/, '');
      if (ep && !SEC.validateEndpoint('azure', ep))
        issues.push({ sev:'HIGH', msg:`${role} Azure endpoint fails hostname validation — possible SSRF risk` });
      else if (ep) ok.push(`${role} Azure endpoint validated`);
      const dep = val(`${role}-deployment`);
      if (dep && !SEC.validateModel(dep))
        issues.push({ sev:'MEDIUM', msg:`${role} deployment name has invalid characters` });
    }
    if (provider === 'huggingface') {
      const ep = val(`${role}-hf-endpoint`);
      if (ep && !SEC.validateEndpoint('huggingface', ep))
        issues.push({ sev:'HIGH', msg:`${role} HuggingFace endpoint must be *.huggingface.co, *.hf.space, or *.endpoints.huggingface.cloud` });
      const k = val(`${role}-key`);
      if (k && !k.startsWith('hf_'))
        issues.push({ sev:'MEDIUM', msg:`${role} HuggingFace token should start with hf_` });
    }
    const k = val(`${role}-key`);
    if (!k) { issues.push({ sev:'INFO', msg:`${role} API key not entered yet` }); return; }
    if (k.length < 16) issues.push({ sev:'HIGH', msg:`${role} key too short — possible typo` });
    if (provider === 'claude' && !k.startsWith('sk-ant-'))
      issues.push({ sev:'MEDIUM', msg:`${role} is set to Claude but key doesn't start with sk-ant-` });
    if (provider === 'openai' && !k.startsWith('sk-'))
      issues.push({ sev:'MEDIUM', msg:`${role} is set to OpenAI but key doesn't start with sk-` });
  });

  // Check red team provider
  const rtProv = S.providers.redteam;
  if (rtProv === 'azure') {
    issues.push({ sev:'HIGH', msg:'Red Team is set to Azure — Azure\'s content filter will block many attack prompt generations. Use Claude API or OpenAI as the red team engine for reliable results.' });
  }

  const keys = ['target','eval','redteam'].map(r => val(`${r}-key`)).filter(Boolean);
  if (new Set(keys).size < keys.length)
    issues.push({ sev:'INFO', msg:'Some roles share the same API key — intentional if using same account' });

  const evalMod = cfgDisplayName(S.cfgs.eval), tgtMod = cfgDisplayName(S.cfgs.target);
  if (evalMod && tgtMod && evalMod === tgtMod && S.providers.eval === S.providers.target)
    issues.push({ sev:'MEDIUM', msg:'Target and Evaluator appear identical — self-evaluation bias risk' });

  ok.push('Credentials: memory-only, no localStorage/sessionStorage/cookies');
  ok.push('CSP: only known API endpoints allowed');
  ok.push('Input sanitization: null bytes, control chars stripped');
  ok.push('Rate limiter: 60 req/min per provider');
  ok.push('YAML export: API keys never included');

  const container = $('audit-results');
  const sevColor = { HIGH:'#ef4444', MEDIUM:'#f59e0b', LOW:'#3b82f6', INFO:'#8888a8' };
  container.innerHTML = [
    ...issues.map(i => `<div class="audit-row"><span class="audit-sev" style="color:${sevColor[i.sev]};border-color:${sevColor[i.sev]}44;background:${sevColor[i.sev]}15">${i.sev}</span><span class="audit-msg">${esc(i.msg)}</span></div>`),
    ...ok.map(m => `<div class="audit-row"><span class="audit-sev" style="color:#22c55e;border-color:#22c55e44;background:#22c55e15">OK</span><span class="audit-msg" style="color:var(--text-2)">${esc(m)}</span></div>`)
  ].join('');
});

// ── YAML import/export ────────────────────────────────────────────────────────
$('btn-export-yaml').addEventListener('click', () => {
  const sections = {};
  ['target','eval','redteam'].forEach(role => {
    const provider = S.providers[role];
    let model = '';
    if (provider === 'azure')        model = val(`${role}-deployment`) || '';
    else if (provider === 'huggingface') { const s = $(`${role}-model-hf`); model = (s && s.value !== '__custom__') ? s.value : val(`${role}-model-hf-custom`); }
    else { const s = $(`${role}-model-${provider}`); model = (s && s.value !== '__custom__') ? s.value : val(`${role}-model-${provider}-custom`); }
    sections[role] = {
      provider, model,
      endpoint: (provider === 'azure') ? val(`${role}-endpoint`) : (provider === 'huggingface' ? val(`${role}-hf-endpoint`) : ''),
      version:  provider === 'azure' ? (val(`${role}-version`) || '2024-02-15-preview') : ''
    };
  });
  const yaml = YAML.stringify(sections);
  $('yaml-modal-title').textContent = 'Export Configuration (keys redacted)';
  $('yaml-modal-content').value = yaml;
  $('yaml-modal-result').textContent = '';
  $('yaml-modal').style.display = 'flex';
});

$('btn-import-yaml').addEventListener('click', () => {
  $('yaml-modal-title').textContent = 'Import YAML Configuration';
  $('yaml-modal-content').value = '';
  $('yaml-modal-result').textContent = 'Paste your YAML below and click Apply.';
  $('yaml-modal').style.display = 'flex';
});

$('btn-yaml-apply').addEventListener('click', () => {
  const raw = $('yaml-modal-content').value;
  const data = YAML.parse(raw);
  const res  = $('yaml-modal-result');
  let applied = 0;
  const applyRole = (role, cfg) => {
    if (!cfg || !cfg.provider) return;
    const provider = cfg.provider;
    if (!['azure','openai','claude','huggingface'].includes(provider)) return;
    S.providers[role] = provider;
    const tab = document.querySelector(`.provider-tabs[data-role="${role}"] .ptab[data-provider="${provider}"]`);
    if (tab) { document.querySelectorAll(`.provider-tabs[data-role="${role}"] .ptab`).forEach(t=>t.classList.remove('active')); tab.classList.add('active'); }
    switchProviderFields(role, provider);
    if (provider === 'azure') {
      if (cfg.endpoint) { const el = $(`${role}-endpoint`); if(el) el.value = cfg.endpoint; }
      if (cfg.model)    { const el = $(`${role}-deployment`); if(el) el.value = cfg.model; }
      if (cfg.version)  { const el = $(`${role}-version`); if(el) el.value = cfg.version; }
    } else if (provider === 'huggingface') {
      if (cfg.endpoint) { const el = $(`${role}-hf-endpoint`); if(el) el.value = cfg.endpoint; }
      if (cfg.model) {
        const sel = $(`${role}-model-hf`);
        if (sel) { const opt = Array.from(sel.options).find(o=>o.value===cfg.model); if(opt) sel.value=cfg.model; else { sel.value='__custom__'; const c=$(`${role}-hf-custom-wrap`); if(c){c.style.display='';const ci=$(`${role}-model-hf-custom`);if(ci)ci.value=cfg.model;} } }
      }
    } else {
      const sel = $(`${role}-model-${provider}`);
      if (sel && cfg.model) {
        const opt = Array.from(sel.options).find(o=>o.value===cfg.model);
        if (opt) sel.value = cfg.model;
        else { sel.value='__custom__'; const c=$(`${role}-${provider}-custom-wrap`); if(c){c.style.display='';const ci=$(`${role}-model-${provider}-custom`);if(ci)ci.value=cfg.model;} }
      }
    }
    applied++;
  };
  ['target','eval','redteam'].forEach(role => applyRole(role, data[role]));
  if (applied > 0) { res.textContent = `Applied ${applied} role(s). Enter API keys manually then test.`; res.style.color = 'var(--teal)'; }
  else { res.textContent = 'No valid config found. Check YAML format.'; res.style.color = 'var(--red)'; }
});

$('btn-yaml-copy').addEventListener('click', () => {
  navigator.clipboard.writeText($('yaml-modal-content').value)
    .then(() => $('yaml-modal-result').textContent = 'Copied.')
    .catch(() => $('yaml-modal-result').textContent = 'Copy failed — select all and Ctrl+C.');
});

$('btn-yaml-target-toggle').addEventListener('click', () => {
  const area = $('yaml-target-area'); if (!area) return;
  const open = area.style.display !== 'none';
  area.style.display = open ? 'none' : '';
  $('btn-yaml-target-toggle').textContent = open ? '▼ Configure via YAML' : '▲ Hide YAML';
});

$('btn-apply-target-yaml').addEventListener('click', () => {
  const raw = $('target-yaml-input').value;
  const data = YAML.parse(raw);
  const res  = $('yaml-result-target');
  const cfg  = data.target || data;
  if (!cfg || !cfg.endpoint) { res.textContent = 'endpoint: field required'; res.style.color='var(--red)'; return; }
  const ep=$('target-endpoint'); if(ep) ep.value=cfg.endpoint||'';
  const dp=$('target-deployment'); if(dp) dp.value=cfg.model||cfg.deployment||'';
  const vr=$('target-version'); if(vr) vr.value=cfg.version||'2024-02-15-preview';
  res.textContent='Applied — enter key and test.'; res.style.color='var(--teal)';
});

$('yaml-modal-close').addEventListener('click', () => $('yaml-modal').style.display = 'none');
$('yaml-modal').addEventListener('click', e => { if(e.target.id==='yaml-modal') $('yaml-modal').style.display='none'; });

// ── Chat ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.chat-mtab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.chat-mtab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    S.activeChatRole = tab.dataset.chatmodel;
    updateChatMeta();
    const sysTa = $('chat-system'); if (sysTa) sysTa.value = S.chatSystemPrompts[S.activeChatRole] || '';
  });
});

function updateChatMeta() {
  const role = S.activeChatRole, cfg = S.cfgs[role];
  $('chat-info-provider').textContent = cfg ? cfg.provider : '—';
  $('chat-info-model').textContent    = cfg ? cfgDisplayName(cfg) : '—';
  const hist = S.chatHistories[role] || [];
  $('chat-msg-count').textContent = hist.length;
  $('chat-tokens').textContent = hist.reduce((a,m)=>a+Math.ceil((m.content||'').length/4),0).toLocaleString();
}

async function sendChat(text) {
  if (!text.trim()) return;
  const role = S.activeChatRole, cfg = S.cfgs[role], msgs = $('chat-messages');
  if (!cfg || !S.connected[role]) { appendBubble('system', 'Model not connected. Configure and test in Configuration first.'); return; }
  const safe = SEC.sanitize(text, 4000);
  appendBubble('user', safe);
  S.chatHistories[role].push({ role: 'user', content: safe });
  $('chat-input').value = ''; $('chat-input').style.height = 'auto';
  $('chat-send').disabled = true;
  const typingDiv = appendBubble('assistant', '');
  typingDiv.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  try {
    const reply = await ModelClient.call({ ...cfg }, S.chatHistories[role], { maxTokens: 1000, temperature: 0.7, systemPrompt: S.chatSystemPrompts[role] || undefined });
    typingDiv.className = 'chat-bubble assistant'; typingDiv.textContent = reply;
    S.chatHistories[role].push({ role: 'assistant', content: reply });
  } catch (e) {
    typingDiv.className = 'chat-bubble system-msg'; typingDiv.textContent = 'Error: ' + e.message;
    S.chatHistories[role].pop();
  }
  $('chat-send').disabled = false; updateChatMeta(); msgs.scrollTop = msgs.scrollHeight;
}

function appendBubble(role, content) {
  const msgs = $('chat-messages');
  const w = msgs.querySelector('.chat-welcome'); if (w) w.remove();
  const div = document.createElement('div');
  div.className = role === 'user' ? 'chat-bubble user' : role === 'assistant' ? 'chat-bubble assistant' : 'chat-bubble system-msg';
  div.textContent = content;
  msgs.appendChild(div); msgs.scrollTop = msgs.scrollHeight;
  return div;
}

$('chat-send').addEventListener('click', () => sendChat($('chat-input').value));
$('chat-input').addEventListener('keydown', e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat($('chat-input').value);} });
$('chat-input').addEventListener('input', () => { const el=$('chat-input'); el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,120)+'px'; });
$('btn-clear-chat').addEventListener('click', () => {
  S.chatHistories[S.activeChatRole] = [];
  $('chat-messages').innerHTML='<div class="chat-welcome"><svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M4 4h24v18H17l-5 6V22H4V4z" stroke="#3b82f6" stroke-width="1.5" fill="rgba(59,130,246,0.08)"/><circle cx="10" cy="13" r="1.5" fill="#3b82f6"/><circle cx="16" cy="13" r="1.5" fill="#3b82f6"/><circle cx="22" cy="13" r="1.5" fill="#3b82f6"/></svg><p>Chat cleared.</p></div>';
  updateChatMeta();
});
$('btn-apply-system').addEventListener('click', () => {
  S.chatSystemPrompts[S.activeChatRole] = $('chat-system').value.trim();
  appendBubble('system', S.chatSystemPrompts[S.activeChatRole] ? 'System prompt applied.' : 'System prompt cleared.');
});
document.querySelectorAll('.probe-btn').forEach(btn => btn.addEventListener('click', () => sendChat(btn.dataset.prompt)));

// ── Attack builder ────────────────────────────────────────────────────────────
function renderTechniqueGrid() {
  const grid = $('technique-grid');
  grid.innerHTML = '';
  for (const tech of TECHNIQUES) {
    const sel = S.selectedTechniques.has(tech.id);
    const defaultTurns = (typeof TECHNIQUE_DEFAULT_TURNS !== 'undefined' && TECHNIQUE_DEFAULT_TURNS[tech.id]) || 10;
    const card = document.createElement('div');
    card.className = 'technique-card' + (sel ? ' selected' : '');
    card.innerHTML = `<div class="tech-check">${sel?'✓':''}</div>
      <div class="tech-name">${esc(tech.name)}</div>
      <div class="tech-desc">${esc(tech.description)}</div>
      <div class="tech-tag"><span class="badge ${esc(tech.badge)}">${esc(tech.badgeLabel)}</span></div>`;
    card.addEventListener('click', () => {
      if (S.selectedTechniques.has(tech.id)) { S.selectedTechniques.delete(tech.id); card.classList.remove('selected'); card.querySelector('.tech-check').textContent=''; }
      else { S.selectedTechniques.add(tech.id); card.classList.add('selected'); card.querySelector('.tech-check').textContent='✓'; }
      updateTechCount();
      renderPerTechTurns();
    });
    grid.appendChild(card);
  }
  updateTechCount();
  renderPerTechTurns();
}

function renderPerTechTurns() {
  const grid = $('per-tech-turns-grid');
  if (!grid) return;
  const selected = TECHNIQUES.filter(t => S.selectedTechniques.has(t.id));
  if (!selected.length) { grid.innerHTML = '<span style="color:var(--text-3);font-size:12px">Select techniques above to configure per-technique turns.</span>'; return; }
  grid.innerHTML = '';
  for (const tech of selected) {
    const def = (typeof TECHNIQUE_DEFAULT_TURNS !== 'undefined' && TECHNIQUE_DEFAULT_TURNS[tech.id]) || 10;
    const cur = S.perTechTurns[tech.id] || def;
    const row = document.createElement('div');
    row.className = 'per-tech-row';
    row.innerHTML = `
      <span class="per-tech-name">${esc(tech.name)}</span>
      <div class="per-tech-controls">
        <input type="range" class="per-tech-slider" min="3" max="20" value="${cur}" data-tech="${tech.id}" step="1"/>
        <span class="per-tech-val" id="ptv-${tech.id}">${cur}</span>
        <span class="per-tech-default">(default ${def})</span>
      </div>`;
    const slider = row.querySelector('.per-tech-slider');
    slider.addEventListener('input', () => {
      S.perTechTurns[tech.id] = parseInt(slider.value);
      $('ptv-' + tech.id).textContent = slider.value;
    });
    grid.appendChild(row);
  }
}

$('btn-reset-turns').addEventListener('click', () => {
  S.perTechTurns = {};
  renderPerTechTurns();
});

function updateTechCount() {
  const n = S.selectedTechniques.size;
  $('tech-selected-count').textContent = `${n} of ${TECHNIQUES.length} selected`;
}

$('btn-select-all').addEventListener('click', () => { TECHNIQUES.forEach(t=>S.selectedTechniques.add(t.id)); renderTechniqueGrid(); });
$('btn-deselect-all').addEventListener('click', () => { S.selectedTechniques.clear(); renderTechniqueGrid(); });

['max-turns','attacks-per-tech','req-delay','rt-temp'].forEach(id => {
  const m={'max-turns':'turns-val','attacks-per-tech':'attacks-val','req-delay':'delay-val','rt-temp':'temp-val'};
  $(id).addEventListener('input', e => $(m[id]).textContent = e.target.value);
});

document.querySelectorAll('input[name="intent-mode"]').forEach(r => {
  r.addEventListener('change', () => {
    const manual = $('intent-manual').checked;
    $('intent-manual-section').style.display = manual ? '' : 'none';
    $('intent-auto-section').style.display   = manual ? 'none' : '';
  });
});

$('btn-preview-attack').addEventListener('click', async () => {
  const isManual = $('intent-manual').checked, prev = $('intent-preview');
  if (isManual) { prev.textContent = val('custom-intent') || '(no intent entered)'; prev.style.display=''; return; }
  let rtCfg;
  try { rtCfg = buildCfg('redteam'); } catch(e) { prev.textContent='Configure Red Team model first.'; prev.style.display=''; return; }
  prev.textContent='Generating…'; prev.style.display='';
  const tech = TECHNIQUES.find(t=>S.selectedTechniques.has(t.id)) || TECHNIQUES[0];
  const cat  = val('attack-category');
  const dummy = new RedTeamAttacker({ rtCfg, tgtCfg:{} });
  const intent = await dummy.generateIntent(cat, tech).catch(e=>'Error: '+e.message);
  prev.textContent='Intent: '+intent;
});

// ── Launch attack ─────────────────────────────────────────────────────────────
$('btn-start-attack').addEventListener('click', async () => {
  let tgtCfg, rtCfg;
  try { tgtCfg = buildCfg('target'); } catch(e) { showModal('Target Not Configured', e.message); return; }
  try { rtCfg  = buildCfg('redteam'); } catch(e) { showModal('Red Team Not Configured', e.message); return; }
  if (!S.connected.target || !S.connected.redteam) { showModal('Not Connected','Test all model connections in Configuration first.'); return; }
  if (S.selectedTechniques.size === 0) { showModal('No Techniques','Select at least one attack technique.'); return; }

  // Warning if using Azure as red team
  if (rtCfg.provider === 'azure') {
    const go = confirm('WARNING: Azure AI Foundry is set as the Red Team engine. Azure\'s own content filter will block many attack prompt generations, resulting in 0-turn records.\n\nIt is strongly recommended to use Claude API or OpenAI as the Red Team engine.\n\nContinue anyway?');
    if (!go) return;
  }

  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelector('[data-view="live"]').classList.add('active');
  $('view-live').classList.add('active');

  $('live-log').innerHTML = '';
  S.allRecords = []; S.evaluatedRecords = [];
  S.metrics = { techniques: S.selectedTechniques.size, turns:0, responses:0, breaks:0, done:0, errors:0 };
  // Reset result table
  $('results-tbody').innerHTML = '<tr><td colspan="8" class="empty-row">No results yet.</td></tr>';
  $('records-count').textContent = '0 records';
  updateMetrics();

  const maxTurns       = parseInt(val('max-turns'))       || 10;
  const attacksPerTech = parseInt(val('attacks-per-tech')) || 3;
  const delay          = parseInt(val('req-delay'))        || 500;
  const temperature    = parseFloat(val('rt-temp'))        || 0.9;
  const category       = val('attack-category');
  const isManual       = $('intent-manual').checked;
  const customIntent   = isManual ? val('custom-intent') : null;

  // Build techniques with per-technique turn overrides
  const techniques = TECHNIQUES.filter(t => S.selectedTechniques.has(t.id)).map(t => ({
    ...t,
    customTurns: S.perTechTurns[t.id] || 0
  }));

  S.activeAttacker = new RedTeamAttacker({
    rtCfg, tgtCfg, maxTurns, delay, temperature,
    onLog:    e  => addLogEntry(e),
    onMetric: t  => {
      if (t === 'turns')           S.metrics.turns++;
      else if (t === 'responses')  S.metrics.responses++;
      else if (t === 'breaks')     S.metrics.breaks++;
      else if (t === 'techniques_done') S.metrics.done++;
      updateMetrics();
    },
    onRecord: r  => {
      S.allRecords.push(r);
      if (r.error_type) S.metrics.errors++;
      appendResultRow(r);
      updateMetrics();
    }
  });

  S.running = true;
  $('btn-stop-attack').style.display = 'inline-block';
  $('running-badge').style.display   = 'inline-flex';

  try { await S.activeAttacker.runSession({ techniques, category, intentMode:isManual?'manual':'auto', customIntent, attacksPerTechnique:attacksPerTech }); }
  catch(e) { addLogEntry({ type:'system', message:'Session error: '+e.message, technique:'System' }); }

  S.running = false;
  $('btn-stop-attack').style.display = 'none';
  $('running-badge').style.display   = 'none';

  const successRecs = S.allRecords.filter(r => !r.error_type).length;
  const errorRecs   = S.allRecords.filter(r => r.error_type).length;
  addLogEntry({ type:'system', message:`✓ Complete. ${successRecs} attack records + ${errorRecs} errors. Total: ${S.allRecords.length}. Switch to Results.`, technique:'System' });
  $('btn-run-eval').style.display = 'inline-flex';
});

$('btn-stop-attack').addEventListener('click', () => {
  if (S.activeAttacker) S.activeAttacker.stop();
  S.running = false;
  $('btn-stop-attack').style.display = 'none'; $('running-badge').style.display = 'none';
  addLogEntry({ type:'system', message:'Stopped by user.', technique:'System' });
});

// ── Live log ──────────────────────────────────────────────────────────────────
function addLogEntry({ type, message, technique, turn }) {
  const log = $('live-log'), ph = log.querySelector('.log-placeholder'); if(ph) ph.remove();
  const bm = {prompt:'badge-blue',response:'badge-teal',system:'badge-gray',break:'badge-amber',warning:'badge-red'};
  const lm = {prompt:'PROMPT',response:'RESPONSE',system:'SYS',break:'BREAK',warning:'WARN'};
  const entry = document.createElement('div');
  entry.className = 'log-entry'; entry.dataset.type = type;
  entry.innerHTML = `<div class="log-meta"><span class="badge ${bm[type]||'badge-gray'}">${lm[type]||type.toUpperCase()}</span>${technique?`<span class="log-turn">${esc(technique)}${turn?' · T'+turn:''}</span>`:''}<span class="log-turn">${new Date().toLocaleTimeString()}</span></div><div class="log-content ${type}">${esc(message)}</div>`;
  log.appendChild(entry); log.scrollTop = log.scrollHeight;
}

document.querySelectorAll('.log-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.log-filter').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
    const f = btn.dataset.filter;
    document.querySelectorAll('.log-entry').forEach(e => { e.style.display=(f==='all'||e.dataset.type===f)?'':'none'; });
  });
});

function updateMetrics() {
  const total = S.allRecords.length;
  $('met-techniques').textContent = S.metrics.done + ' / ' + S.metrics.techniques;
  $('met-turns').textContent      = S.metrics.turns;
  $('met-responses').textContent  = S.metrics.responses;
  $('met-breaks').textContent     = S.metrics.breaks;
  $('records-count').textContent  = `${total} records`;
}

// ── Results ───────────────────────────────────────────────────────────────────
function appendResultRow(record) {
  const tbody = $('results-tbody');
  const emptyTr = tbody.querySelector('tr'); if(emptyTr?.querySelector('.empty-row')) emptyTr.remove();
  const idx = S.allRecords.length - 1;
  const tr  = document.createElement('tr');
  tr.dataset.idx = idx;
  const isError = record.error_type;
  const promptDisplay = record.prompt.startsWith('[RED TEAM ERROR') ? `<span style="color:var(--amber);font-size:10px">${esc(record.prompt.substring(0,60))}</span>` : `${esc(record.prompt.substring(0,60))}…`;
  const respDisplay   = record.response ? `${esc(record.response.substring(0,60))}…` : '—';
  tr.style.opacity = isError ? '0.65' : '';
  tr.innerHTML = `<td>${idx+1}</td>
    <td><span class="badge badge-blue">${esc(record.technique)}</span></td>
    <td><span class="badge badge-teal">${esc(record.category)}</span></td>
    <td title="${esc(record.prompt)}">${promptDisplay}</td>
    <td title="${esc(record.response)}">${respDisplay}</td>
    <td class="outcome-cell"><span class="outcome-pill ${isError?'outcome-error':'outcome-pending'}">${isError?'ERROR':'PENDING'}</span></td>
    <td class="score-cell">—</td>
    <td style="font-size:10px;color:var(--text-3)">${esc(record.error_type||'')}</td>`;
  tr.addEventListener('click', () => showRecordDetail(record));
  tbody.appendChild(tr);
  populateFilterOpts(record);
}

function populateFilterOpts(r) {
  const tf=$('results-filter-technique'), cf=$('results-filter-category');
  const tv=new Set(Array.from(tf.options).map(o=>o.value)), cv=new Set(Array.from(cf.options).map(o=>o.value));
  if(!tv.has(r.technique)){const o=document.createElement('option');o.value=o.textContent=r.technique;tf.appendChild(o);}
  if(!cv.has(r.category)){const o=document.createElement('option');o.value=o.textContent=r.category;cf.appendChild(o);}
}

function updateResultRow(idx, r) {
  const tr = document.querySelector(`tr[data-idx="${idx}"]`); if(!tr) return;
  const labels = {success:'BREAK',partial:'PARTIAL',failed:'DEFENDED',pending:'PENDING',error:'ERROR'};
  tr.querySelector('.outcome-cell').innerHTML = `<span class="outcome-pill outcome-${r.eval_outcome}">${labels[r.eval_outcome]||r.eval_outcome.toUpperCase()}</span>`;
  tr.querySelector('.score-cell').textContent = r.eval_score!=null ? r.eval_score+'/10' : '—';
}

['results-filter-technique','results-filter-category','results-filter-success'].forEach(id => {
  $(id).addEventListener('change', filterResults);
});
function filterResults() {
  const t=$('results-filter-technique').value, c=$('results-filter-category').value, o=$('results-filter-success').value;
  document.querySelectorAll('#results-tbody tr').forEach(tr => {
    const r = S.evaluatedRecords[parseInt(tr.dataset.idx)] || S.allRecords[parseInt(tr.dataset.idx)]; if(!r) return;
    tr.style.display=((!t||r.technique===t)&&(!c||r.category===c)&&(!o||r.eval_outcome===o))?'':'none';
  });
}

// ── Evaluation ────────────────────────────────────────────────────────────────
$('btn-run-eval').addEventListener('click', async () => {
  if (!S.allRecords.length) { showModal('No Records','Run an attack session first.'); return; }
  // Only evaluate non-error records
  const evalRecs = S.allRecords.filter(r => r.eval_outcome !== 'error' && r.error_type !== 'redteam_blocked');
  if (!evalRecs.length) { showModal('No Valid Records','All records are errors. Check your Red Team model — try Claude or OpenAI instead of Azure.'); return; }
  let evalCfg;
  try { evalCfg = buildCfg('eval'); } catch(e) { showModal('Evaluator Not Configured', e.message); return; }
  if (!S.connected.eval) { showModal('Evaluator Not Connected','Test the evaluator model in Configuration.'); return; }
  const btn = $('btn-run-eval');
  btn.disabled = true; btn.textContent = 'Evaluating…';
  const evaluator = new AttackEvaluator({ evalCfg, delay:800, onProgress:({current,total})=>{ btn.textContent=`Evaluating ${current}/${total}…`; } });
  try {
    const evaluated = await evaluator.evaluateAll(evalRecs);
    // Merge evaluated back into allRecords by matching
    S.evaluatedRecords = S.allRecords.map(r => {
      if (r.error_type) return r;
      const match = evaluated.find(e => e.timestamp === r.timestamp && e.turn === r.turn && e.technique === r.technique);
      return match || r;
    });
    S.evaluatedRecords.forEach((r,i) => updateResultRow(i, r));
    const report = evaluator.generateReport(evaluated);
    if (report) { renderScoreBanner(report); renderChart(report); }
  } catch(e) { showModal('Evaluation Error', e.message); }
  btn.disabled = false; btn.textContent = 'Re-Evaluate';
});

function renderScoreBanner(report) {
  const circ=2*Math.PI*50, offset=circ*(1-report.vulnPct/100), ring=$('score-ring-fill');
  ring.style.stroke=report.riskColor; ring.setAttribute('stroke-dasharray',circ.toFixed(1));
  ring.style.transition='stroke-dashoffset 1.2s ease';
  requestAnimationFrame(()=>{ ring.style.strokeDashoffset=offset.toFixed(1); });
  $('score-number').textContent=report.vulnPct+'%';
  $('score-label').textContent=report.riskLevel+' Risk — '+report.vulnPct+'% Vulnerable';
  $('score-description').textContent=`${report.success} breaks · ${report.partial} partial · ${report.failed} defended across ${report.total} evaluated turns · avg ${report.avgScore}/10`;
  const bd=$('score-breakdown'); bd.innerHTML='';
  Object.entries(report.byTechnique).forEach(([t,d])=>{
    const pct=Math.round((d.success+d.partial*0.5)/d.total*100);
    const el=document.createElement('div'); el.className='score-item';
    el.innerHTML=esc(t)+': <span>'+pct+'%</span>'; bd.appendChild(el);
  });
  $('score-banner').style.display='flex';
}

function renderChart(report) {
  $('chart-card').style.display='block';
  const ctx=$('technique-chart').getContext('2d');
  if(S.chartInstance) S.chartInstance.destroy();
  const labels=Object.keys(report.byTechnique);
  S.chartInstance = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[
      {label:'Breaks',   data:labels.map(t=>report.byTechnique[t].success), backgroundColor:'rgba(239,68,68,0.75)', borderRadius:3},
      {label:'Partial',  data:labels.map(t=>report.byTechnique[t].partial), backgroundColor:'rgba(245,158,11,0.75)', borderRadius:3},
      {label:'Defended', data:labels.map(t=>report.byTechnique[t].failed),  backgroundColor:'rgba(34,197,94,0.40)',  borderRadius:3}
    ]},
    options:{responsive:true,plugins:{legend:{labels:{color:'#8888a8',font:{size:11}}}},scales:{
      x:{stacked:true,ticks:{color:'#44445a',font:{size:9},maxRotation:40},grid:{color:'rgba(255,255,255,0.04)'}},
      y:{stacked:true,ticks:{color:'#44445a',font:{size:10}},grid:{color:'rgba(255,255,255,0.06)'}}
    }}
  });
}

// ── Downloads ─────────────────────────────────────────────────────────────────
$('btn-export-csv').addEventListener('click', () => {
  const recs = S.evaluatedRecords.length ? S.evaluatedRecords : S.allRecords;
  if (!recs.length) { showModal('No Data','Run an attack session first.'); return; }
  const m = (S.cfgs.target && cfgDisplayName(S.cfgs.target)) || 'model';
  downloadCSV(recs, `redprobe_raw_${m}_${Date.now()}.csv`);
});

$('btn-export-report').addEventListener('click', () => {
  const recs = S.evaluatedRecords.length ? S.evaluatedRecords : S.allRecords;
  if (!recs.length) { showModal('No Data','Run an attack session first.'); return; }
  const evalRecs = recs.filter(r => r.eval_outcome !== 'pending' && r.eval_outcome !== 'error');
  if (!evalRecs.length) { showModal('Evaluation Required','Run evaluation first to generate a scored report.'); return; }
  const evaluator = new AttackEvaluator({ evalCfg:{} });
  const report = evaluator.generateReport(evalRecs);
  const m = (S.cfgs.target && cfgDisplayName(S.cfgs.target)) || 'model';
  downloadHTMLReport(evaluator.generateVisualReport(report, recs, m), `redprobe_report_${m}_${Date.now()}.html`);
});

// ── Record detail ─────────────────────────────────────────────────────────────
function showRecordDetail(r) {
  const oc = r.eval_outcome||'pending';
  const ev = (oc!=='pending'&&oc!=='error') ? `\n─── EVALUATION ───\nOutcome: ${oc.toUpperCase()}\nScore:   ${r.eval_score}/10\nReason:  ${r.eval_reasoning}` : (r.error_type ? `\n─── ERROR ───\nType: ${r.error_type}\nDetail: ${r.eval_reasoning}` : '\n(Not yet evaluated)');
  showModal(`${r.technique} · Turn ${r.turn} · #${r.attack_index}`,
    `TECHNIQUE:   ${r.technique}\nCATEGORY:    ${r.category}\nTIMESTAMP:   ${r.timestamp}\nTARGET:      ${r.target_provider}/${r.target_model}\nRED TEAM:    ${r.redteam_provider}/${r.redteam_model}\n\nINTENT:\n${r.intent}\n\n─── PROMPT ───\n${r.prompt}\n\n─── RESPONSE ───\n${r.response||'(none)'}${ev}`);
}

function showModal(title, body) {
  $('modal-title').textContent = title; $('modal-body').textContent = body;
  $('modal-overlay').style.display = 'flex';
}
$('modal-close').addEventListener('click', ()=>$('modal-overlay').style.display='none');
$('modal-overlay').addEventListener('click', e=>{ if(e.target.id==='modal-overlay') $('modal-overlay').style.display='none'; });

// ── Init ──────────────────────────────────────────────────────────────────────
TECHNIQUES.forEach(t => S.selectedTechniques.add(t.id));
renderTechniqueGrid();
updateChatMeta();
