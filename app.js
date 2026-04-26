<<<<<<< HEAD
// app.js v5 — sidebar collapse, multi-category, session naming, parallel eval, costs
=======
// app.js v6 — adaptive routing, commitment tracking, payload injection, conversation-level eval, OWASP mapping, log downloads
>>>>>>> f6b5e08a7fc748af977ddd9184b1a7af857c6346

// ── Pricing tables ────────────────────────────────────────────────────────────
const PRICING = {
  claude_sonnet: { in: 3.00,  out: 15.00 },
  claude_haiku:  { in: 0.80,  out: 4.00  },
  gpt4o:         { in: 2.50,  out: 10.00 },
  gpt4o_mini:    { in: 0.15,  out: 0.60  },
  gpt4o_ft:      { in: 0.30,  out: 1.20  },
  custom_rt:     { in: 0,     out: 0     },
  custom_tgt:    { in: 0,     out: 0     },
};

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
  perTechTurns: {},
  allRecords: [],
  evaluatedRecords: [],
  activeAttacker: null,
  running: false,
  metrics: { techniques:0, turns:0, responses:0, breaks:0, done:0, errors:0 },
  chartInstance: null,
  // Cost tracking — persisted in memory across sessions
  costHistory: [],  // { sessionName, date, records, metadata }
};

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
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    btn.classList.add('active');
    const vw = $('view-'+btn.dataset.view); if(vw) vw.classList.add('active');
    if (btn.dataset.view === 'costs') renderCostView();
  });
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
  openai:'OpenAI API Key (sk-…)', claude:'Anthropic API Key (sk-ant-…)',
  huggingface:'HuggingFace Token (hf_…)',
  bedrock:'(Bedrock uses AWS keys inside the Bedrock panel above)'
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
  ['azure','azure_claude','openai','claude','huggingface','bedrock'].forEach(p => {
    const el = $(`${role}-fields-${p}`); if(el) el.style.display = p===provider ? '' : 'none';
  });
  const lbl = $(`${role}-key-label`); if(lbl) lbl.textContent = KEY_LABELS[provider]||'API Key';
  // Bedrock uses AWS keys inside its own panel — hide the shared single-key row.
  const sharedKey = $(`${role}-key`);
  const sharedKeyGroup = sharedKey ? sharedKey.closest('.field-group') : null;
  if (sharedKeyGroup) sharedKeyGroup.style.display = provider === 'bedrock' ? 'none' : '';
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
});

// ── Build ModelClient cfg ─────────────────────────────────────────────────────
function buildCfg(role) {
  const provider = S.providers[role];

  // Bedrock is the only provider whose credentials are NOT in `${role}-key`
  if (provider === 'bedrock') {
    const region = val(`${role}-bedrock-region`);
    const model  = val(`${role}-bedrock-model`);
    const ak     = val(`${role}-bedrock-ak`);
    const sk     = val(`${role}-bedrock-sk`);
    const stok   = val(`${role}-bedrock-session`);
    if (!region) throw new Error(`Bedrock region required for ${role}`);
    if (!model)  throw new Error(`Bedrock inference profile ARN or model ID required for ${role}`);
    if (!ak)     throw new Error(`Bedrock AWS Access Key ID required for ${role}`);
    if (!sk)     throw new Error(`Bedrock AWS Secret Access Key required for ${role}`);
    const cfg = { provider:'bedrock', region, model, accessKeyId: ak, secretAccessKey: sk };
    if (stok) cfg.sessionToken = stok;
    return cfg;
  }

  const key = val(`${role}-key`);
  if (!key) throw new Error(`No API key for ${role} model`);

  if (provider === 'azure') {
    const ep=val(`${role}-endpoint`).replace(/\/$/,''), dep=val(`${role}-deployment`), ver=val(`${role}-version`)||'2024-02-15-preview';
    if(!ep)  throw new Error(`Azure endpoint missing for ${role}`);
    if(!dep) throw new Error(`Azure deployment missing for ${role}`);
    return { provider:'azure', key, endpoint:ep, deployment:dep, version:ver };
  }
  if (provider === 'azure_claude') {
    const ep  = val(`${role}-az-claude-endpoint`).replace(/\/$/,'');
    const sel = $(`${role}-az-claude-model`);
    const model = sel && sel.value !== '__custom__' ? sel.value : (val(`${role}-az-claude-model-custom`)||'claude-sonnet-4-6');
    if(!ep) throw new Error(`Azure Foundry Claude endpoint missing for ${role}`);
    return { provider:'azure_claude', key, endpoint:ep, model };
  }
  if (provider === 'openai') {
    const sel = $(`${role}-model-openai`);
    const model = sel && sel.value!=='__custom__' ? sel.value : (val(`${role}-model-openai-custom`)||'gpt-4o');
    return { provider:'openai', key, model };
  }
  if (provider === 'claude') {
    const sel = $(`${role}-model-claude`);
    const model = sel && sel.value!=='__custom__' ? sel.value : (val(`${role}-model-claude-custom`)||'claude-sonnet-4-20250514');
    return { provider:'claude', key, model };
  }
  if (provider === 'huggingface') {
    const sel = $(`${role}-model-hf`);
    const model = sel && sel.value!=='__custom__' ? sel.value : (val(`${role}-model-hf-custom`)||'');
    if(!model) throw new Error(`HuggingFace model ID required for ${role}`);
    const ep = val(`${role}-hf-endpoint`);
    const cfg = { provider:'huggingface', key, model }; if(ep) cfg.endpoint=ep; return cfg;
  }
  throw new Error(`Unknown provider: ${provider}`);
}

function cfgDisplayName(cfg) {
  if (!cfg) return '—';
  if (cfg.provider==='azure')        return cfg.deployment||'azure';
  if (cfg.provider==='azure_claude') return (cfg.model||'').split('-').slice(0,2).join('-')||'az-claude';
  if (cfg.provider==='huggingface')  { const m=cfg.model||''; return m.includes('/')?m.split('/')[1].substring(0,18):m.substring(0,18); }
  if (cfg.provider==='bedrock') {
    const m = cfg.model||'';
    // Extract a short name from an ARN: arn:aws:bedrock:region:acct:inference-profile/us.anthropic.claude-sonnet-4-…
    const last = m.split('/').pop() || m;
    return ('br:' + last.split(':')[0]).substring(0,28);
  }
  return (cfg.model||cfg.provider).substring(0,18);
}

// ── Connection test ───────────────────────────────────────────────────────────
async function testRole(role) {
  const setR=(msg,cls)=>{ const el=$(`result-${role}`); if(el){el.textContent=msg;el.className=`conn-result ${cls}`;} };
  const setD=(cls,name)=>{
    const d=$(`dot-${role}`),l=$(`lbl-${role}`); if(d) d.className=`status-dot ${cls}`; if(l&&name) l.textContent=name.substring(0,18);
    const cd=$(`chat-dot-${role}`); if(cd) cd.className=`status-dot ${cls}`;
    const cl=$(`chat-mtab-lbl-${role}`); if(cl) cl.textContent=(name||'').substring(0,14);
  };
  let cfg;
  try { cfg = buildCfg(role); } catch(e) { setR(e.message,'err'); setD('err','error'); return; }
  setR('Testing…','loading'); setD('busy','…');
  try {
    await ModelClient.test(cfg);
    S.cfgs[role]=cfg; S.connected[role]=true;
    const name=cfgDisplayName(cfg); setR(`✓ Connected — ${name}`,'ok'); setD('ok',name);
    if(S.activeChatRole===role) updateChatMeta();
  } catch(e) { setR(`✗ ${e.message.substring(0,120)}`,'err'); setD('err','error'); S.connected[role]=false; }
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
  } else if (res.provider==='claude'||res.provider==='openai') {
    const sel=$(`${role}-model-${res.provider}`);
    if (sel&&res.model) { const opt=Array.from(sel.options).find(o=>o.value===res.model); if(opt) sel.value=res.model; else { sel.value='__custom__'; const c=$(`${role}-${res.provider}-custom-wrap`); if(c) c.style.display=''; const ci=$(`${role}-model-${res.provider}-custom`); if(ci) ci.value=res.model; } }
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
    if (provider==='huggingface') {
      const ep=val(`${role}-hf-endpoint`);
      if(ep&&!SEC.validateEndpoint('huggingface',ep)) issues.push({sev:'HIGH',msg:`${role} HF endpoint must be *.huggingface.co or *.endpoints.huggingface.cloud`});
    }
    if (provider==='bedrock') {
      const region=val(`${role}-bedrock-region`), model=val(`${role}-bedrock-model`), ak=val(`${role}-bedrock-ak`), sk=val(`${role}-bedrock-sk`);
      if(!region) issues.push({sev:'HIGH',msg:`${role} Bedrock region missing`});
      else if(!SEC.validateRegion(region)) issues.push({sev:'HIGH',msg:`${role} Bedrock region fails format check`});
      else ok.push(`${role} Bedrock region validated`);
      if(!model) issues.push({sev:'INFO',msg:`${role} Bedrock inference profile ARN / model ID not entered`});
      else if(!SEC.validateBedrockModel(model)) issues.push({sev:'HIGH',msg:`${role} Bedrock model / ARN fails format check`});
      if(!ak) issues.push({sev:'INFO',msg:`${role} Bedrock access key ID not entered`});
      else if(!SEC.validateAccessKey(ak)) issues.push({sev:'MEDIUM',msg:`${role} Bedrock access key ID format looks unusual (expected AKIA… or ASIA…, uppercase alphanumeric)`});
      if(!sk) issues.push({sev:'INFO',msg:`${role} Bedrock secret access key not entered`});
      else if(sk.length<20) issues.push({sev:'HIGH',msg:`${role} Bedrock secret access key too short`});
      return;
    }
    const k=val(`${role}-key`); if(!k){issues.push({sev:'INFO',msg:`${role} key not entered`});return;}
    if(k.length<16) issues.push({sev:'HIGH',msg:`${role} key too short`});
    if(provider==='claude'&&!k.startsWith('sk-ant-')) issues.push({sev:'MEDIUM',msg:`${role} Claude key should start with sk-ant-`});
    if(provider==='openai'&&!k.startsWith('sk-')) issues.push({sev:'MEDIUM',msg:`${role} OpenAI key should start with sk-`});
    if(provider==='huggingface'&&!k.startsWith('hf_')) issues.push({sev:'LOW',msg:`${role} HF token should start with hf_`});
  });
  if(S.providers.redteam==='azure') issues.push({sev:'HIGH',msg:'Red Team set to Azure OpenAI — Azure content filter will block many attack prompt generations. Use Claude or Azure Foundry Claude instead.'});
  ok.push('Credentials: memory-only, no localStorage/sessionStorage/cookies');
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
    const provider=S.providers[role]; let model='',endpoint='',version='',region='';
    if(provider==='azure'){model=val(`${role}-deployment`);endpoint=val(`${role}-endpoint`);version=val(`${role}-version`)||'2024-02-15-preview';}
    else if(provider==='azure_claude'){const sel=$(`${role}-az-claude-model`);model=sel&&sel.value!=='__custom__'?sel.value:val(`${role}-az-claude-model-custom`);endpoint=val(`${role}-az-claude-endpoint`);}
    else if(provider==='huggingface'){const sel=$(`${role}-model-hf`);model=sel&&sel.value!=='__custom__'?sel.value:val(`${role}-model-hf-custom`);endpoint=val(`${role}-hf-endpoint`);}
    else if(provider==='bedrock'){region=val(`${role}-bedrock-region`);model=val(`${role}-bedrock-model`);}
    else{const sel=$(`${role}-model-${provider}`);model=sel&&sel.value!=='__custom__'?sel.value:val(`${role}-model-${provider}-custom`);}
    const sec={provider,model,endpoint,version}; if(region) sec.region=region;
    sections[role]=sec;
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
    const provider=cfg.provider; if(!['azure','azure_claude','openai','claude','huggingface','bedrock'].includes(provider)) return;
    S.providers[role]=provider;
    const tab=document.querySelector(`.provider-tabs[data-role="${role}"] .ptab[data-provider="${provider}"]`);
    if(tab){document.querySelectorAll(`.provider-tabs[data-role="${role}"] .ptab`).forEach(t=>t.classList.remove('active'));tab.classList.add('active');}
    switchProviderFields(role,provider);
    if(provider==='azure'){if(cfg.endpoint){const e=$(`${role}-endpoint`);if(e)e.value=cfg.endpoint;}if(cfg.model){const e=$(`${role}-deployment`);if(e)e.value=cfg.model;}if(cfg.version){const e=$(`${role}-version`);if(e)e.value=cfg.version;}}
    else if(provider==='azure_claude'){if(cfg.endpoint){const e=$(`${role}-az-claude-endpoint`);if(e)e.value=cfg.endpoint;}if(cfg.model){const sel=$(`${role}-az-claude-model`);if(sel){const opt=Array.from(sel.options).find(o=>o.value===cfg.model);if(opt)sel.value=cfg.model;}}}
    else if(provider==='bedrock'){
      if(cfg.region){const sel=$(`${role}-bedrock-region`);if(sel){const opt=Array.from(sel.options).find(o=>o.value===cfg.region);if(opt)sel.value=cfg.region;}}
      if(cfg.model){const e=$(`${role}-bedrock-model`);if(e)e.value=cfg.model;}
    }
    applied++;
  });
  if(applied>0){res.textContent=`Applied ${applied} role(s). Enter API keys then test.`;res.style.color='var(--teal)';}
  else{res.textContent='No valid config found.';res.style.color='var(--red)';}
});
$('btn-yaml-copy').addEventListener('click', () => navigator.clipboard.writeText($('yaml-modal-content').value).then(()=>$('yaml-modal-result').textContent='Copied.').catch(()=>$('yaml-modal-result').textContent='Copy failed.'));
$('yaml-modal-close').addEventListener('click',()=>$('yaml-modal').style.display='none');
$('yaml-modal').addEventListener('click',e=>{if(e.target.id==='yaml-modal')$('yaml-modal').style.display='none';});
$('btn-yaml-target-toggle').addEventListener('click',()=>{const a=$('yaml-target-area');if(!a)return;const o=a.style.display!=='none';a.style.display=o?'none':'';$('btn-yaml-target-toggle').textContent=o?'▼ Configure via YAML':'▲ Hide YAML';});
$('btn-apply-target-yaml').addEventListener('click',()=>{const raw=val('target-yaml-input'),data=YAML.parse(raw),res=$('yaml-result-target'),cfg=data.target||data;if(!cfg||!cfg.endpoint){res.textContent='endpoint: required';res.style.color='var(--red)';return;}const ep=$('target-endpoint');if(ep)ep.value=cfg.endpoint||'';const dp=$('target-deployment');if(dp)dp.value=cfg.model||cfg.deployment||'';const vr=$('target-version');if(vr)vr.value=cfg.version||'2024-02-15-preview';res.textContent='Applied — enter key and test.';res.style.color='var(--teal)';});

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

['max-turns','attacks-per-tech','req-delay','rt-temp'].forEach(id=>{
  const m={'max-turns':'turns-val','attacks-per-tech':'attacks-val','req-delay':'delay-val','rt-temp':'temp-val'};
  $(id).addEventListener('input',e=>$(m[id]).textContent=e.target.value);
});
document.querySelectorAll('input[name="intent-mode"]').forEach(r=>r.addEventListener('change',()=>{
  const manual=$('intent-manual').checked;
  const isStatic=$('intent-static')?.checked;
  const isAutotune=$('intent-autotune')?.checked;
  $('intent-manual-section').style.display=manual?'':'none';
  if($('static-temp-hint')) $('static-temp-hint').style.display=isStatic?'':'none';
  if($('autotune-settings')) $('autotune-settings').style.display=isAutotune?'':'none';
}));
['autotune-pilot-turns','autotune-candidates'].forEach(id=>{
  const el=$(id); if(!el) return;
  const disp=$(id+'-val'); if(!disp) return;
  el.addEventListener('input',e=>disp.textContent=e.target.value);
});

function currentIntentMode() {
  if ($('intent-static')?.checked)   return 'static';
  if ($('intent-auto')?.checked)     return 'auto';
  if ($('intent-autotune')?.checked) return 'autotune';
  return 'manual';
}

$('btn-preview-attack').addEventListener('click',async()=>{
  const intentMode=currentIntentMode();
  const prev=$('intent-preview');
  if(intentMode==='manual'){prev.textContent=val('custom-intent')||'(no intent)';prev.style.display='';return;}
  const tech=TECHNIQUES.find(t=>S.selectedTechniques.has(t.id))||TECHNIQUES[0];
  const cat=[...S.selectedCategories][0]||Object.keys(ATTACK_CATEGORIES)[0];
  if(intentMode==='static'){
    const dummy=new RedTeamAttacker({rtCfg:{},tgtCfg:{},intentMode:'static'});
    const intent=await dummy.generateIntent(cat,tech,'static');
    prev.textContent='Intent (static): '+intent; prev.style.display=''; return;
  }
  if(intentMode==='autotune'){
    const candidates=(INTENT_TEMPLATES[cat]||[]).slice(0, parseInt(val('autotune-candidates'))||3);
    prev.innerHTML='Auto-tune candidates (live scored during run):<br>' + candidates.map((c,i)=>`<strong>#${i+1}:</strong> ${esc(c.substring(0,160))}…`).join('<br>');
    prev.style.display=''; return;
  }
  let rtCfg; try{rtCfg=buildCfg('redteam');}catch(e){prev.textContent='Configure Red Team first.';prev.style.display='';return;}
  prev.textContent='Generating…'; prev.style.display='';
  const dummy=new RedTeamAttacker({rtCfg,tgtCfg:{},intentMode:'auto'});
  const intent=await dummy.generateIntent(cat,tech,'auto').catch(e=>'Error: '+e.message);
  prev.textContent='Intent: '+intent;
});

// ── Launch attack ─────────────────────────────────────────────────────────────
$('btn-start-attack').addEventListener('click',async()=>{
  let tgtCfg,rtCfg;
  try{tgtCfg=buildCfg('target');}catch(e){showModal('Target Not Configured',e.message);return;}
  try{rtCfg=buildCfg('redteam');}catch(e){showModal('Red Team Not Configured',e.message);return;}
  if(!S.connected.target||!S.connected.redteam){showModal('Not Connected','Test connections in Configuration first.');return;}
  if(S.selectedTechniques.size===0){showModal('No Techniques','Select at least one technique.');return;}
  if(S.selectedCategories.size===0){showModal('No Categories','Select at least one attack category.');return;}

  const sessionName=val('session-name')||`Session ${new Date().toLocaleString()}`;
  if(rtCfg.provider==='azure'){const go=confirm('WARNING: Azure OpenAI as Red Team will likely hit content filter blocks. Recommend Claude or Azure Foundry Claude. Continue anyway?');if(!go)return;}

  // Navigate to live view
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelector('[data-view="live"]').classList.add('active');
  $('view-live').classList.add('active');
  $('live-session-name').textContent=`"${esc(sessionName)}"`;
  $('live-log').innerHTML=''; $('eval-progress-list').innerHTML=''; $('eval-progress-card').style.display='none';
<<<<<<< HEAD
=======
  S.liveLogBuffer = [];
>>>>>>> f6b5e08a7fc748af977ddd9184b1a7af857c6346
  S.allRecords=[]; S.evaluatedRecords=[];
  const numJobs=S.selectedTechniques.size*S.selectedCategories.size;
  S.metrics={techniques:numJobs,turns:0,responses:0,breaks:0,done:0,errors:0};
  $('results-tbody').innerHTML='<tr><td colspan="8" class="empty-row">No results yet.</td></tr>';
  $('records-count').textContent='0 records'; updateMetrics();

  const maxTurns=parseInt(val('max-turns'))||10;
  const attacksPerTech=parseInt(val('attacks-per-tech'))||3;
  const delay=parseInt(val('req-delay'))||500;
  const temperature=parseFloat(val('rt-temp'))||0.9;
  const intentMode=currentIntentMode();
  const customIntent=intentMode==='manual'?val('custom-intent'):null;
  const autotuneOpts = intentMode === 'autotune' ? {
    pilotTurns: parseInt(val('autotune-pilot-turns'))||3,
    candidates: parseInt(val('autotune-candidates'))||3,
    mutate: !!$('autotune-mutate')?.checked
  } : null;
  const parallelEval=$('parallel-eval-toggle').checked;

  const techniques=TECHNIQUES.filter(t=>S.selectedTechniques.has(t.id)).map(t=>({...t,customTurns:S.perTechTurns[t.id]||0}));
  const categories=[...S.selectedCategories];

  const evalPreFilter  = !!$('eval-prefilter-toggle')?.checked;

  // Auto-tune needs an evaluator to score pilots — build it up-front even when parallelEval is off.
  let autotuneEvaluator=null;
  if(intentMode==='autotune'){
    if(!S.connected.eval){ showModal('Evaluator Required','Auto-tune intent mode needs the Evaluator model connected (it scores the pilot runs). Configure and test the Evaluator, or switch to Static / Auto intent mode.'); return; }
    try { const evalCfg2=buildCfg('eval'); autotuneEvaluator=new AttackEvaluator({evalCfg:evalCfg2, delay:400, preFilter:evalPreFilter, onProgress:()=>{}}); }
    catch(e){ showModal('Evaluator Not Configured',e.message); return; }
  }

  // Setup parallel evaluator if enabled
  let parallelEvaluator=null;
  if(parallelEval&&S.connected.eval){
    try {
      const evalCfg=buildCfg('eval');
      parallelEvaluator=new AttackEvaluator({ evalCfg, delay:600, preFilter:evalPreFilter, onProgress:()=>{} });
    } catch(e){ addLogEntry({type:'system',message:'Parallel eval not available: '+e.message,technique:'System'}); }
  }

  if(parallelEval&&parallelEvaluator) $('eval-progress-card').style.display='block';

  S.activeAttacker=new RedTeamAttacker({
    rtCfg,tgtCfg,maxTurns,delay,temperature,sessionName,intentMode,
    autotuneOpts, autotuneEvaluator,
    onLog:e=>addLogEntry(e),
    onMetric:t=>{if(t==='turns')S.metrics.turns++;else if(t==='responses')S.metrics.responses++;else if(t==='breaks')S.metrics.breaks++;else if(t==='techniques_done')S.metrics.done++;updateMetrics();},
    onRecord:r=>{S.allRecords.push(r);if(r.error_type)S.metrics.errors++;appendResultRow(r);updateMetrics();},
    onTechniqueComplete: parallelEvaluator
      ? async (techRecords, techName) => {
          const validRecs=techRecords.filter(r=>!r.error_type&&r.eval_outcome==='pending');
          if(!validRecs.length) return;
          addEvalProgress(techName, 'evaluating', 0, validRecs.length);
          try {
            const evaluated=await parallelEvaluator.evaluateAll(validRecs);
            // Merge per-turn eval back into the session records
            evaluated.forEach(er=>{
              const idx=S.allRecords.findIndex(r=>r.timestamp===er.timestamp&&r.turn===er.turn&&r.technique===er.technique);
              if(idx>=0){S.allRecords[idx]={...S.allRecords[idx],...er};updateResultRow(idx,er);}
            });
            // ── Conversation-level evaluation ─────────────────────────
            // For each (technique, category, attack_index) group in the
            // just-evaluated records, run a second judge pass over the
            // FULL transcript. This catches mosaic/commitment attacks
            // where no individual turn is harmful but the whole is.
            try {
              const convResults = await parallelEvaluator.evaluateAllConversations(evaluated);
              // Stamp conversation-level fields onto every record in the
              // matching attack. generateReport() uses them to combine
              // per-turn and conversation-level outcomes.
              convResults.forEach(c => {
                const [technique, category, attack_index] = c.key.split('|||');
                S.allRecords.forEach((r, i) => {
                  if (r.technique === technique && r.category === category && String(r.attack_index) === attack_index) {
                    S.allRecords[i] = { ...r, conv_outcome: c.conv_outcome, conv_score: c.conv_score, conv_reasoning: c.conv_reasoning };
                  }
                });
                const verdict = c.conv_outcome === 'success' ? '🚨 BREAK' : c.conv_outcome === 'partial' ? '◐ PARTIAL' : '✓ defended';
                addLogEntry({ type: c.conv_outcome === 'success' ? 'break' : 'system', message: `Conv-eval [${technique} / ${category} #${attack_index}]: ${verdict} (${c.conv_score}/10) — ${c.conv_reasoning}`, technique: techName });
              });
            } catch(ce){ addLogEntry({ type:'warning', message:`Conv-eval error: ${ce.message}`, technique: techName }); }

            const breaks=evaluated.filter(r=>r.eval_outcome==='success').length;
            addEvalProgress(techName,'done',evaluated.length,evaluated.length,breaks);
          } catch(e){ addEvalProgress(techName,'error',0,validRecs.length,0,e.message); }
        }
      : ()=>{}
  });

  S.running=true; $('btn-stop-attack').style.display='inline-block'; $('running-badge').style.display='inline-flex';

  // Track session metadata for cost view
  const sessionStart=new Date();
  try{ await S.activeAttacker.runSession({techniques,categories,intentMode,customIntent,attacksPerTechnique:attacksPerTech}); }
  catch(e){ addLogEntry({type:'system',message:'Session error: '+e.message,technique:'System'}); }

  S.running=false; $('btn-stop-attack').style.display='none'; $('running-badge').style.display='none';
  const successRecs=S.allRecords.filter(r=>!r.error_type).length;
  const errorRecs=S.allRecords.filter(r=>r.error_type).length;
  addLogEntry({type:'system',message:`✓ "${sessionName}" complete. ${successRecs} records + ${errorRecs} errors. Total: ${S.allRecords.length}.`,technique:'System'});
  $('btn-run-eval').style.display='inline-flex';

  // Save session to cost history
  const sessionEntry={
    sessionName, date:sessionStart.toISOString(),
    techniques:[...S.selectedTechniques],
    categories:[...S.selectedCategories],
    records: S.allRecords,
    targetModel: tgtCfg.deployment||tgtCfg.model||'',
    targetProvider: tgtCfg.provider||'',
    redteamModel: rtCfg.model||'',
    redteamProvider: rtCfg.provider||'',
    totalTurns: S.metrics.turns, totalBreaks: S.metrics.breaks
  };
  S.costHistory.push(sessionEntry);
});

$('btn-stop-attack').addEventListener('click',()=>{if(S.activeAttacker)S.activeAttacker.stop();S.running=false;$('btn-stop-attack').style.display='none';$('running-badge').style.display='none';addLogEntry({type:'system',message:'Stopped.',technique:'System'});});

// ── Parallel eval progress list ───────────────────────────────────────────────
function addEvalProgress(techName, status, done, total, breaks=0, error='') {
  const list=$('eval-progress-list'); const existing=$(`ep-${techName.replace(/\s+/g,'-')}`);
  const el = existing || document.createElement('div');
  if(!existing){el.id=`ep-${techName.replace(/\s+/g,'-')}`;el.className='eval-progress-row';list.appendChild(el);}
  const icons={evaluating:'…',done:'✓',error:'✗'}, colors={evaluating:'var(--blue-bright)',done:'var(--teal)',error:'var(--red)'};
  el.innerHTML=`<span class="ep-icon" style="color:${colors[status]}">${icons[status]}</span><span class="ep-name">${esc(techName)}</span><span class="ep-status" style="color:${colors[status]}">${status==='evaluating'?`${done}/${total}`:(status==='done'?`${total} evaluated · ${breaks} breaks`:esc(error.substring(0,60)))}</span>`;
}

// ── Live log ──────────────────────────────────────────────────────────────────
<<<<<<< HEAD
=======
// Structured parallel buffer so the log can be exported as clean JSON /
// plain text without scraping the DOM.
S.liveLogBuffer = S.liveLogBuffer || [];

>>>>>>> f6b5e08a7fc748af977ddd9184b1a7af857c6346
function addLogEntry({type,message,technique,turn}) {
  const log=$('live-log'), ph=log.querySelector('.log-placeholder'); if(ph) ph.remove();
  const bm={prompt:'badge-blue',response:'badge-teal',system:'badge-gray',break:'badge-amber',warning:'badge-red'};
  const lm={prompt:'PROMPT',response:'RESPONSE',system:'SYS',break:'BREAK',warning:'WARN'};
  const entry=document.createElement('div'); entry.className='log-entry'; entry.dataset.type=type;
<<<<<<< HEAD
  entry.innerHTML=`<div class="log-meta"><span class="badge ${bm[type]||'badge-gray'}">${lm[type]||type.toUpperCase()}</span>${technique?`<span class="log-turn">${esc(technique)}${turn?' · T'+turn:''}</span>`:''}<span class="log-turn">${new Date().toLocaleTimeString()}</span></div><div class="log-content ${type}">${esc(message)}</div>`;
  log.appendChild(entry); log.scrollTop=log.scrollHeight;
}
=======
  const ts = new Date();
  entry.innerHTML=`<div class="log-meta"><span class="badge ${bm[type]||'badge-gray'}">${lm[type]||type.toUpperCase()}</span>${technique?`<span class="log-turn">${esc(technique)}${turn?' · T'+turn:''}</span>`:''}<span class="log-turn">${ts.toLocaleTimeString()}</span></div><div class="log-content ${type}">${esc(message)}</div>`;
  log.appendChild(entry); log.scrollTop=log.scrollHeight;
  S.liveLogBuffer.push({ timestamp: ts.toISOString(), type, technique: technique || null, turn: turn || null, message });
}

// ── Live-log downloads (TXT / JSON / clipboard) ──────────────────────────────
function _sessionSlug() {
  const name = val('session-name') || 'session';
  return name.replace(/[^a-zA-Z0-9\-_]/g, '_').substring(0, 60);
}
function logToPlainText() {
  if (!S.liveLogBuffer.length) return '';
  const pad = s => String(s||'').padEnd(8);
  return S.liveLogBuffer.map(e => {
    const header = `[${e.timestamp}] ${pad(e.type.toUpperCase())} ${e.technique ? e.technique + (e.turn ? ' · T' + e.turn : '') + ' — ' : ''}`;
    return header + (e.message || '');
  }).join('\n\n');
}
function _downloadBlob(content, mime, filename) {
  const blob = new Blob([content], { type: mime + ';charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('btn-download-log-txt')?.addEventListener('click', () => {
  if (!S.liveLogBuffer.length) { showModal('No Logs', 'The live log is empty — run or start a session first.'); return; }
  _downloadBlob(logToPlainText(), 'text/plain', `redprobe_log_${_sessionSlug()}_${Date.now()}.txt`);
});
$('btn-download-log-json')?.addEventListener('click', () => {
  if (!S.liveLogBuffer.length) { showModal('No Logs', 'The live log is empty — run or start a session first.'); return; }
  const payload = {
    session_name: val('session-name') || null,
    exported_at: new Date().toISOString(),
    entry_count: S.liveLogBuffer.length,
    entries: S.liveLogBuffer
  };
  _downloadBlob(JSON.stringify(payload, null, 2), 'application/json', `redprobe_log_${_sessionSlug()}_${Date.now()}.json`);
});
$('btn-copy-log')?.addEventListener('click', async () => {
  if (!S.liveLogBuffer.length) { showModal('No Logs', 'The live log is empty.'); return; }
  try {
    await navigator.clipboard.writeText(logToPlainText());
    const btn = $('btn-copy-log'); const original = btn.textContent;
    btn.textContent = '✓ Copied'; setTimeout(() => { btn.textContent = original; }, 1500);
  } catch (e) { showModal('Copy Failed', e.message || 'Clipboard access denied.'); }
});
>>>>>>> f6b5e08a7fc748af977ddd9184b1a7af857c6346
document.querySelectorAll('.log-filter').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('.log-filter').forEach(b=>b.classList.remove('active'));btn.classList.add('active');const f=btn.dataset.filter;document.querySelectorAll('.log-entry').forEach(e=>{e.style.display=(f==='all'||e.dataset.type===f)?'':'none';});});});
function updateMetrics(){$('met-techniques').textContent=S.metrics.done+' / '+S.metrics.techniques;$('met-turns').textContent=S.metrics.turns;$('met-responses').textContent=S.metrics.responses;$('met-breaks').textContent=S.metrics.breaks;$('records-count').textContent=S.allRecords.length+' records';}

// ── Results ───────────────────────────────────────────────────────────────────
function appendResultRow(record) {
  const tbody=$('results-tbody'), emptyTr=tbody.querySelector('tr'); if(emptyTr?.querySelector('.empty-row')) emptyTr.remove();
  const idx=S.allRecords.length-1; const tr=document.createElement('tr'); tr.dataset.idx=idx;
  const isError=record.error_type;
  tr.style.opacity=isError?'0.6':'';
  tr.innerHTML=`<td>${idx+1}</td><td><span class="badge badge-blue">${esc(record.technique)}</span></td><td><span class="badge badge-teal">${esc(record.category)}</span></td><td title="${esc(record.prompt)}">${esc(record.prompt.substring(0,60))}…</td><td title="${esc(record.response)}">${esc((record.response||'').substring(0,60))}…</td><td class="outcome-cell"><span class="outcome-pill ${isError?'outcome-error':'outcome-pending'}">${isError?'ERROR':'PENDING'}</span></td><td class="score-cell">—</td><td style="font-size:10px;color:var(--text-3)">${esc(record.error_type||'')}</td>`;
  tr.addEventListener('click',()=>showRecordDetail(record));
  tbody.appendChild(tr); populateFilterOpts(record);
}
function populateFilterOpts(r){const tf=$('results-filter-technique'),cf=$('results-filter-category'),tv=new Set(Array.from(tf.options).map(o=>o.value)),cv=new Set(Array.from(cf.options).map(o=>o.value));if(!tv.has(r.technique)){const o=document.createElement('option');o.value=o.textContent=r.technique;tf.appendChild(o);}if(!cv.has(r.category)){const o=document.createElement('option');o.value=o.textContent=r.category;cf.appendChild(o);}}
function updateResultRow(idx,r){const tr=document.querySelector(`tr[data-idx="${idx}"]`);if(!tr)return;const labels={success:'BREAK',partial:'PARTIAL',failed:'DEFENDED',pending:'PENDING',error:'ERROR'};tr.querySelector('.outcome-cell').innerHTML=`<span class="outcome-pill outcome-${r.eval_outcome}">${labels[r.eval_outcome]||r.eval_outcome.toUpperCase()}</span>`;tr.querySelector('.score-cell').textContent=r.eval_score!=null?r.eval_score+'/10':'—';}
['results-filter-technique','results-filter-category','results-filter-success'].forEach(id=>{$(id).addEventListener('change',()=>{const t=$('results-filter-technique').value,c=$('results-filter-category').value,o=$('results-filter-success').value;document.querySelectorAll('#results-tbody tr').forEach(tr=>{const r=S.evaluatedRecords[parseInt(tr.dataset.idx)]||S.allRecords[parseInt(tr.dataset.idx)];if(!r)return;tr.style.display=((!t||r.technique===t)&&(!c||r.category===c)&&(!o||r.eval_outcome===o))?'':'none';});});});

// ── Full evaluation (manual trigger) ─────────────────────────────────────────
$('btn-run-eval').addEventListener('click',async()=>{
  if(!S.allRecords.length){showModal('No Records','Run an attack session first.');return;}
  const evalRecs=S.allRecords.filter(r=>r.eval_outcome==='pending');
  if(!evalRecs.length){showModal('Already Evaluated','All records have been evaluated. Results are current.');return;}
  let evalCfg; try{evalCfg=buildCfg('eval');}catch(e){showModal('Evaluator Not Configured',e.message);return;}
  if(!S.connected.eval){showModal('Evaluator Not Connected','Test evaluator in Configuration.');return;}
  const btn=$('btn-run-eval'); btn.disabled=true; btn.textContent='Evaluating…';
  const evalPreFilterManual = !!$('eval-prefilter-toggle')?.checked;
  const evaluator=new AttackEvaluator({evalCfg,delay:800,preFilter:evalPreFilterManual,onProgress:({current,total})=>{btn.textContent=`Evaluating ${current}/${total}…`;}});
  try {
    const evaluated=await evaluator.evaluateAll(evalRecs);
    S.evaluatedRecords=S.allRecords.map(r=>{if(r.eval_outcome!=='pending')return r;const m=evaluated.find(e=>e.timestamp===r.timestamp&&e.turn===r.turn&&e.technique===r.technique);return m||r;});
    S.evaluatedRecords.forEach((r,i)=>updateResultRow(i,r));
    // Run conversation-level evaluation on all fully-evaluated attacks
    btn.textContent='Running conversation-level evaluation…';
    try {
      const convRecs = S.evaluatedRecords.filter(r => r.eval_outcome !== 'error' && r.eval_outcome !== 'pending');
      const convResults = await evaluator.evaluateAllConversations(convRecs, ({current,total})=>{ btn.textContent=`Conv-eval ${current}/${total}…`; });
      convResults.forEach(c => {
        const [technique, category, attack_index] = c.key.split('|||');
        S.evaluatedRecords.forEach((r, i) => {
          if (r.technique === technique && r.category === category && String(r.attack_index) === attack_index) {
            S.evaluatedRecords[i] = { ...r, conv_outcome: c.conv_outcome, conv_score: c.conv_score, conv_reasoning: c.conv_reasoning };
            S.allRecords[i] = S.evaluatedRecords[i];
          }
        });
      });
    } catch(ce){ addLogEntry({ type:'warning', message:`Conv-eval error: ${ce.message}`, technique:'System' }); }
    const report=evaluator.generateReport(S.evaluatedRecords.filter(r=>r.eval_outcome!=='error'&&r.eval_outcome!=='pending'));
    if(report){renderScoreBanner(report);renderChart(report);}
  } catch(e){showModal('Evaluation Error',e.message);}
  btn.disabled=false; btn.textContent='Re-Evaluate Remaining';
});

function renderScoreBanner(report){
  const circ=2*Math.PI*50,offset=circ*(1-report.vulnPct/100),ring=$('score-ring-fill');
  ring.style.stroke=report.riskColor;
  ring.setAttribute('stroke-dasharray',circ.toFixed(1));
  ring.style.transition='stroke-dashoffset 1.2s ease';
  requestAnimationFrame(()=>{ring.style.strokeDashoffset=offset.toFixed(1);});
  $('score-number').textContent=report.vulnPct+'%';
  $('score-label').textContent=report.riskLevel+' Risk — '+report.vulnPct+'% Vulnerable (attack-level)';
  const attackLine = report.attackTotal
    ? `${report.attackSuccess} breaks · ${report.attackPartial} partial · ${report.attackFailed} defended across ${report.attackTotal} attacks`
    : `${report.success} breaks · ${report.partial} partial · ${report.failed} defended`;
  const turnLine = report.turnVulnPct != null
    ? ` · Turn-level ${report.turnVulnPct}% (${report.total} turns) · avg ${report.avgScore}/10`
    : ` · ${report.total} turns · avg ${report.avgScore}/10`;
  $('score-description').textContent = attackLine + turnLine;
  const bd=$('score-breakdown'); bd.innerHTML='';
  // OWASP pills first — this is the headline section for security-audience reports
  if (report.byOwasp) {
    const owaspMeta = (typeof OWASP_LLM_TOP10 !== 'undefined') ? OWASP_LLM_TOP10 : {};
    Object.entries(report.byOwasp).sort(([a],[b])=>a.localeCompare(b)).forEach(([id,d])=>{
      const pct=Math.round((d.success+d.partial*0.5)/d.total*100);
      const el=document.createElement('div');
      el.className='score-item';
      const name = owaspMeta[id]?.name || id;
      el.innerHTML = `<strong>${esc(id)}</strong> ${esc(name)}: <span>${pct}%</span>`;
      el.title = `${d.success} success / ${d.partial} partial / ${d.failed} defended · ${d.total} attacks`;
      bd.appendChild(el);
    });
    // Visual separator
    const sep=document.createElement('div'); sep.style.width='100%'; sep.style.height='1px'; sep.style.background='rgba(255,255,255,0.08)'; sep.style.margin='6px 0'; bd.appendChild(sep);
  }
  Object.entries(report.byTechnique).forEach(([t,d])=>{
    const pct=Math.round((d.success+d.partial*0.5)/d.total*100);
    const el=document.createElement('div');
    el.className='score-item';
    el.innerHTML=esc(t)+': <span>'+pct+'%</span>';
    bd.appendChild(el);
  });
  $('score-banner').style.display='flex';
}
function renderChart(report){$('chart-card').style.display='block';const ctx=$('technique-chart').getContext('2d');if(S.chartInstance)S.chartInstance.destroy();const labels=Object.keys(report.byTechnique);S.chartInstance=new Chart(ctx,{type:'bar',data:{labels,datasets:[{label:'Breaks',data:labels.map(t=>report.byTechnique[t].success),backgroundColor:'rgba(239,68,68,0.75)',borderRadius:3},{label:'Partial',data:labels.map(t=>report.byTechnique[t].partial),backgroundColor:'rgba(245,158,11,0.75)',borderRadius:3},{label:'Defended',data:labels.map(t=>report.byTechnique[t].failed),backgroundColor:'rgba(34,197,94,0.40)',borderRadius:3}]},options:{responsive:true,plugins:{legend:{labels:{color:'#8888a8',font:{size:11}}}},scales:{x:{stacked:true,ticks:{color:'#44445a',font:{size:9},maxRotation:40},grid:{color:'rgba(255,255,255,0.04)'}},y:{stacked:true,ticks:{color:'#44445a',font:{size:10}},grid:{color:'rgba(255,255,255,0.06)'}}}}}); }

// ── Downloads ─────────────────────────────────────────────────────────────────
$('btn-export-csv').addEventListener('click',()=>{const recs=S.evaluatedRecords.length?S.evaluatedRecords:S.allRecords;if(!recs.length){showModal('No Data','Run a session first.');return;}const m=(S.cfgs.target&&cfgDisplayName(S.cfgs.target))||'model';downloadCSV(recs,`redprobe_raw_${m}_${Date.now()}.csv`);});
$('btn-export-report').addEventListener('click',()=>{const recs=S.evaluatedRecords.length?S.evaluatedRecords:S.allRecords;if(!recs.length){showModal('No Data','Run a session first.');return;}const evalRecs=recs.filter(r=>r.eval_outcome!=='pending'&&r.eval_outcome!=='error');if(!evalRecs.length){showModal('Evaluation Required','Run evaluation first.');return;}const evaluator=new AttackEvaluator({evalCfg:{}});const report=evaluator.generateReport(evalRecs);const m=(S.cfgs.target&&cfgDisplayName(S.cfgs.target))||'model';downloadHTMLReport(evaluator.generateVisualReport(report,recs,m),`redprobe_report_${m}_${Date.now()}.html`);});
function showRecordDetail(r){const oc=r.eval_outcome||'pending';const ev=(oc!=='pending'&&oc!=='error')?`\n─── EVALUATION ───\nOutcome: ${oc.toUpperCase()}\nScore:   ${r.eval_score}/10\nReason:  ${r.eval_reasoning}`:(r.error_type?`\n─── ERROR ───\nType: ${r.error_type}\nDetail: ${r.eval_reasoning}`:'\n(Not yet evaluated)');showModal(`${r.technique} · T${r.turn} · #${r.attack_index}`,`SESSION:    ${r.session_name||'—'}\nTECHNIQUE:  ${r.technique}\nCATEGORY:   ${r.category}\nTIMESTAMP:  ${r.timestamp}\nTARGET:     ${r.target_provider}/${r.target_model}\nRED TEAM:   ${r.redteam_provider}/${r.redteam_model}\n\nINTENT:\n${r.intent}\n\n─── PROMPT ───\n${r.prompt}\n\n─── RESPONSE ───\n${r.response||'(none)'}${ev}`);}
function showModal(title,body){$('modal-title').textContent=title;$('modal-body').textContent=body;$('modal-overlay').style.display='flex';}
$('modal-close').addEventListener('click',()=>$('modal-overlay').style.display='none');
$('modal-overlay').addEventListener('click',e=>{if(e.target.id==='modal-overlay')$('modal-overlay').style.display='none';});

// ── Costs & Analysis ──────────────────────────────────────────────────────────
function getPricing(modelKey) {
  if(modelKey==='custom_rt'||modelKey==='custom_tgt'){
    const inP=parseFloat($(modelKey==='custom_rt'?'cost-rt-input-price':'cost-tgt-input-price').value)||0;
    const outP=parseFloat($(modelKey==='custom_rt'?'cost-rt-output-price':'cost-tgt-output-price').value)||0;
    return {in:inP,out:outP};
  }
  return PRICING[modelKey]||{in:0,out:0};
}

function calcSessionCost(session) {
  const rtKey=val('cost-rt-model')||'claude_sonnet';
  const tgtKey=val('cost-tgt-model')||'gpt4o';
  const rtP=getPricing(rtKey), tgtP=getPricing(tgtKey);
  let totalTokens=0, totalCost=0;
  (session.records||[]).forEach(r=>{
    if(r.error_type) return;
    const tokP=r.tokens_prompt||Math.ceil((r.prompt||'').length/4);
    const tokR=r.tokens_response||Math.ceil((r.response||'').length/4);
    // Red team cost = prompt tokens (RT generates prompts)
    totalCost += (tokP/1e6)*rtP.in + (tokP/1e6)*rtP.out*0.1;
    // Target cost = full prompt + response
    totalCost += (tokP/1e6)*tgtP.in + (tokR/1e6)*tgtP.out;
    totalTokens += tokP + tokR;
  });
  return { totalTokens, totalCost };
}

function renderCostView() {
  const fromDate=val('cost-filter-from'), toDate=val('cost-filter-to'), nameFilter=val('cost-filter-name').toLowerCase();
  let sessions=S.costHistory;
  if(fromDate) sessions=sessions.filter(s=>s.date>=fromDate);
  if(toDate)   sessions=sessions.filter(s=>s.date<=toDate+'T23:59:59');
  if(nameFilter) sessions=sessions.filter(s=>(s.sessionName||'').toLowerCase().includes(nameFilter));

  let grandTurns=0, grandTokens=0, grandCost=0;
  const tbody=$('cost-sessions-tbody'); tbody.innerHTML='';

  if(!sessions.length){tbody.innerHTML='<tr><td colspan="10" class="empty-row">No sessions match filter.</td></tr>';
    $('cost-total-sessions').textContent='0';$('cost-total-turns').textContent='0';$('cost-total-tokens').textContent='0';$('cost-total-usd').textContent='$0.00';return;}

  sessions.forEach(s=>{
    const {totalTokens,totalCost}=calcSessionCost(s);
    grandTurns+=s.totalTurns||0; grandTokens+=totalTokens; grandCost+=totalCost;
    const tr=document.createElement('tr');
    tr.innerHTML=`<td style="font-weight:500;color:var(--text-1)">${esc(s.sessionName||'—')}</td>
      <td style="font-size:11px">${new Date(s.date).toLocaleDateString()}</td>
      <td style="font-size:11px">${(s.techniques||[]).length}</td>
      <td style="font-size:11px">${(s.categories||[]).length}</td>
      <td style="font-family:var(--font-mono)">${s.totalTurns||0}</td>
      <td style="font-family:var(--font-mono)">${totalTokens.toLocaleString()}</td>
      <td style="font-size:10px;color:var(--text-2)">${esc(s.redteamProvider||'')}/${esc(s.redteamModel||'')}</td>
      <td style="font-size:10px;color:var(--text-2)">${esc(s.targetProvider||'')}/${esc(s.targetModel||'')}</td>
      <td style="font-family:var(--font-mono);color:var(--blue-bright);font-weight:500">$${totalCost.toFixed(4)}</td>
      <td style="font-family:var(--font-mono);color:var(--amber)">${s.totalBreaks||0}</td>`;
    tbody.appendChild(tr);
  });

  $('cost-total-sessions').textContent=sessions.length;
  $('cost-total-turns').textContent=grandTurns.toLocaleString();
  $('cost-total-tokens').textContent=grandTokens.toLocaleString();
  $('cost-total-usd').textContent='$'+grandCost.toFixed(4);
}

$('btn-apply-cost-filter').addEventListener('click',renderCostView);
$('btn-recalculate-costs').addEventListener('click',renderCostView);
$('btn-clear-cost-history').addEventListener('click',()=>{S.costHistory=[];renderCostView();});
['cost-rt-model','cost-tgt-model'].forEach(id=>{
  $(id).addEventListener('change',e=>{
    if(id==='cost-rt-model') $('custom-rt-price-wrap').style.display=e.target.value==='custom_rt'?'':'none';
    if(id==='cost-tgt-model') $('custom-tgt-price-wrap').style.display=e.target.value==='custom_tgt'?'':'none';
  });
});

// ── Azure Foundry model fetch ─────────────────────────────────────────────────
async function fetchModelsForRole(role) {
  const ep  = val(`${role}-az-claude-endpoint`).replace(/\/$/,'');
  const key = val(`${role}-key`);
  const statusEl = $(`fetch-${role}-status`);
  const btn = $(`btn-fetch-${role}-models`);
  if (!ep)  { if(statusEl){statusEl.textContent='Enter endpoint first';statusEl.style.color='var(--amber)';} return; }
  if (!key) { if(statusEl){statusEl.textContent='Enter API key first';statusEl.style.color='var(--amber)';} return; }
  if(statusEl){statusEl.textContent='Fetching…';statusEl.style.color='var(--text-2)';}
  if(btn) btn.disabled=true;
  try {
    const models = await ModelClient.fetchAzureFoundryModels(ep, key);
    const sel = $(`${role}-az-claude-model`);
    if (sel) {
      // Clear existing options, keep 'Custom…' as last option
      sel.innerHTML = '';
      models.forEach(id => {
        const o = document.createElement('option');
        o.value = o.textContent = id;
        sel.appendChild(o);
      });
      const custom = document.createElement('option');
      custom.value = '__custom__'; custom.textContent = 'Custom…';
      sel.appendChild(custom);
      // Auto-select first Claude model found
      const firstClaude = models.find(m => m.toLowerCase().includes('claude'));
      if (firstClaude) sel.value = firstClaude;
    }
    if(statusEl){statusEl.textContent=`✓ ${models.length} model${models.length!==1?'s':''} loaded`;statusEl.style.color='var(--teal)';}
  } catch(e) {
    if(statusEl){statusEl.textContent=`✗ ${e.message.substring(0,100)}`;statusEl.style.color='var(--red)';}
  }
  if(btn) btn.disabled=false;
}

$('btn-fetch-target-models').addEventListener('click',  () => fetchModelsForRole('target'));
$('btn-fetch-eval-models').addEventListener('click',    () => fetchModelsForRole('eval'));
$('btn-fetch-redteam-models').addEventListener('click', () => fetchModelsForRole('redteam'));

// ── Init ──────────────────────────────────────────────────────────────────────
TECHNIQUES.forEach(t=>S.selectedTechniques.add(t.id));
renderCategoryGrid();
renderTechniqueGrid();
updateChatMeta();
