/**
 * ApplyMate Extension v2.1
 * Tabs: ATS Analyzer | My Resume (upload → extract → store) | Autofill
 */

const API_BASE = 'https://applmate-backend.onrender.com/api';

// ── Utils ──────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const el = t => document.createElement(t);

function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3200);
}

const store = {
  get: k => new Promise(r => chrome.storage.local.get(k, r)),
  set: o => new Promise(r => chrome.storage.local.set(o, r)),
  del: k => new Promise(r => chrome.storage.local.remove(k, r)),
};

// ── Tab switching ──────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.classList.contains('on')) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
    tab.classList.add('on');
    const name = tab.dataset.tab;
    ['analyze', 'resume', 'autofill'].forEach(n => {
      $(`tab-${n}`).classList.toggle('hidden', n !== name);
    });
    if (name === 'autofill') checkForm();
    if (name === 'analyze')  { loadJobFromPage(); checkResumeWarning(); }
    if (name === 'resume')   renderResumeTab();
  });
});

// ── API ────────────────────────────────────────────────────────────────────────
async function fetchUser(token) {
  const r = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error('invalid');
  return (await r.json()).user;
}

async function extractPdfFromBackend(file, token) {
  const fd = new FormData();
  fd.append('resume', file);
  const r = await fetch(`${API_BASE}/resume/extract`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!r.ok) throw new Error((await r.json()).message || 'Extraction failed');
  return (await r.json()).text;
}

// ── Login / shell ──────────────────────────────────────────────────────────────
function showLogin() {
  $('login-section').classList.remove('hidden');
  $('app-shell').classList.add('hidden');
}

function showApp(user) {
  $('login-section').classList.add('hidden');
  $('app-shell').classList.remove('hidden');
  const strip = $('profile-strip');
  strip.style.display = 'flex';
  const ini = (user.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  $('ps-avatar').textContent = ini;
  $('ps-name').textContent   = user.name  || '';
  $('ps-email').textContent  = user.email || '';
  $('resume-strip').style.display = 'flex';
  loadJobFromPage();
  refreshResumeStrip();
  checkResumeWarning();
}

// ── Resume Strip (top of every tab) ───────────────────────────────────────────
async function refreshResumeStrip() {
  const { resume_text, resume_filename } = await store.get(['resume_text', 'resume_filename']);
  if (resume_text) {
    $('rs-no').style.display = 'none';
    $('rs-ok').style.display = 'flex';
    $('rs-filename').textContent = resume_filename || 'resume.pdf';
    const words = resume_text.trim().split(/\s+/).length;
    $('rs-meta-text').textContent = `${words} words extracted · Ready`;
  } else {
    $('rs-no').style.display = 'flex';
    $('rs-ok').style.display = 'none';
  }
}

async function checkResumeWarning() {
  const { resume_text } = await store.get('resume_text');
  $('no-resume-warn').classList.toggle('hidden', !!resume_text);
}

// ── Resume Tab ─────────────────────────────────────────────────────────────────
const TECH_KEYWORDS_SHORT = [
  'react','vue','angular','javascript','typescript','python','java','node','express','django','flask',
  'html','css','tailwind','next.js','graphql','aws','docker','kubernetes','mongodb','postgresql','redis',
  'machine learning','tensorflow','pytorch','flutter','kotlin','swift','go','rust','c#','php','ruby',
  'git','figma','jest','cypress','firebase','linux','nginx','kafka','spark','pandas','numpy',
];
const ACTION_VERBS_SHORT = [
  'built','developed','designed','led','managed','optimized','improved','reduced','increased',
  'delivered','launched','architected','scaled','automated','migrated','refactored','shipped',
  'created','established','drove','collaborated','mentored','deployed','integrated',
];
const RESULT_PATTERNS = [
  /\d+\s*%/, /\d+x/i, /\$[\d,]+/, /\d+\+?\s*(users?|clients?|teams?)/i,
  /reduced.*by/i, /increased.*by/i, /saved.*hours?/i,
];

function computeResumeStats(text) {
  const lower = text.toLowerCase();
  return {
    words:   text.trim().split(/\s+/).length,
    skills:  TECH_KEYWORDS_SHORT.filter(k => lower.includes(k)).length,
    verbs:   ACTION_VERBS_SHORT.filter(v => lower.includes(v)).length,
    numbers: RESULT_PATTERNS.filter(p => p.test(text)).length,
  };
}

async function renderResumeTab() {
  const { resume_text, resume_filename } = await store.get(['resume_text', 'resume_filename']);
  if (resume_text) {
    $('upload-area-section').classList.add('hidden');
    $('resume-preview-section').classList.remove('hidden');
    $('rp-filename').textContent = resume_filename || 'resume.pdf';
    const stats = computeResumeStats(resume_text);
    $('stat-words').textContent   = stats.words;
    $('stat-skills').textContent  = stats.skills;
    $('stat-verbs').textContent   = stats.verbs;
    $('stat-numbers').textContent = stats.numbers;
    const words = resume_text.trim().split(/\s+/).length;
    $('rp-meta').textContent = `${words} words extracted · Stored locally`;
  } else {
    $('upload-area-section').classList.remove('hidden');
    $('resume-preview-section').classList.add('hidden');
  }
}

// ── File upload handler ────────────────────────────────────────────────────────
async function handleResumeFile(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast('File too large (max 5MB)', 'err'); return; }
  if (!['application/pdf', 'text/plain'].includes(file.type)) {
    toast('Only PDF or TXT files supported.', 'err'); return;
  }

  // Show progress
  const pb = $('upload-progress');
  const pf = $('upload-progress-fill');
  if (pb) { pb.style.display = 'block'; }

  toast('Uploading & extracting resume…');

  let pct = 0;
  const tick = setInterval(() => {
    pct = Math.min(pct + 10, 80);
    if (pf) pf.style.width = pct + '%';
  }, 200);

  try {
    const { applymate_token: token } = await store.get('applymate_token');
    let text = '';

    if (file.type === 'text/plain') {
      // Read directly, no backend needed
      text = await file.text();
    } else {
      text = await extractPdfFromBackend(file, token);
    }

    if (!text || text.trim().length < 50) throw new Error('Could not extract enough text from the file.');

    clearInterval(tick);
    if (pf) pf.style.width = '100%';

    await store.set({
      resume_text:     text.trim(),
      resume_filename: file.name,
    });

    toast(`✓ Resume stored! (${text.trim().split(/\s+/).length} words)`, 'ok');
    await refreshResumeStrip();
    await renderResumeTab();
    await checkResumeWarning();

  } catch (err) {
    clearInterval(tick);
    toast(err.message || 'Upload failed. Check backend connection.', 'err');
  } finally {
    if (pb) { setTimeout(() => { pb.style.display = 'none'; if (pf) pf.style.width = '0%'; }, 800); }
  }
}

// Wire all file inputs to the same handler
['resume-file-hidden', 'resume-file-tab', 'resume-file-replace', 'resume-file-replace-2'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('change', e => handleResumeFile(e.target.files[0]));
});

// ── Drag & drop on upload box ──────────────────────────────────────────────────
const ub = $('upload-box');
if (ub) {
  ub.addEventListener('dragover', e => { e.preventDefault(); ub.classList.add('drag'); });
  ub.addEventListener('dragleave', () => ub.classList.remove('drag'));
  ub.addEventListener('drop', e => {
    e.preventDefault();
    ub.classList.remove('drag');
    handleResumeFile(e.dataTransfer.files[0]);
  });
}

// Remove resume
$('rp-remove-btn')?.addEventListener('click', async () => {
  await store.del(['resume_text', 'resume_filename']);
  toast('Resume removed.');
  refreshResumeStrip();
  renderResumeTab();
  checkResumeWarning();
});

// ─── Content Script bridge ─────────────────────────────────────────────────────
function msgTab(payload) {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]) return resolve(null);
      chrome.tabs.sendMessage(tabs[0].id, payload, res => {
        if (chrome.runtime.lastError) return resolve(null);
        resolve(res || null);
      });
    });
  });
}

// ─── Job Detection ─────────────────────────────────────────────────────────────
let currentJob = null;

async function loadJobFromPage() {
  const res = await msgTab({ type: 'EXTRACT_JOB' });
  if (res && (res.title || res.description)) {
    currentJob = res;
    $('job-banner-none').classList.add('hidden');
    $('job-banner-data').classList.remove('hidden');
    $('job-banner').classList.add('on');
    $('jb-title').textContent = res.title || res.platform || '(Job Detected)';
    $('jb-co').textContent    = res.company || res.url || '';
    const lvEl = $('jb-level');
    const level = detectLevel(res.title + ' ' + res.description);
    lvEl.textContent  = level.label;
    lvEl.className    = `jb-level level-${level.cls}`;
    lvEl.classList.remove('hidden');
    $('page-badge').textContent = res.platform || 'Job Page';
    $('analyze-btn').querySelector('#analyze-label').textContent = '🎯 Run ATS Analysis';
  } else {
    currentJob = null;
    $('job-banner-none').classList.remove('hidden');
    $('job-banner-data').classList.add('hidden');
    $('job-banner').classList.remove('on');
    $('page-badge').textContent = 'No Job';
    $('analyze-btn').querySelector('#analyze-label').textContent = '⚠️ Open a job page first';
  }
}

function detectLevel(text) {
  const t = (text || '').toLowerCase();
  if (/senior|sr\.|lead|principal|staff|vp |director|head of/.test(t)) return { label: 'Senior Level', cls: 's' };
  if (/junior|jr\.|entry|fresher|graduate|intern/.test(t))              return { label: 'Junior Level', cls: 'j' };
  return { label: 'Mid Level', cls: 'm' };
}

// ── Autofill form detect ───────────────────────────────────────────────────────
async function checkForm() {
  const res = await msgTab({ type: 'DETECT_FORM' });
  if (res?.detected) {
    $('fb-ok').classList.remove('hidden');
    $('fb-no').classList.add('hidden');
    $('fb-platform').textContent = res.platform;
    $('fb-url').textContent      = res.url || '';
    $('autofill-btn').disabled = false;
    const fp = $('fb-fields'); fp.innerHTML = '';
    (res.fields || []).forEach(f => {
      const p = el('span'); p.className = 'pill b'; p.textContent = f; fp.appendChild(p);
    });
  } else {
    $('fb-ok').classList.add('hidden');
    $('fb-no').classList.remove('hidden');
    $('autofill-btn').disabled = true;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SMART ATS SCORING ENGINE  (5-dimensional weighted)
// ══════════════════════════════════════════════════════════════════════════════
const TECH_KW = [
  'react','vue','angular','svelte','next.js','remix','javascript','typescript','html','css','tailwind','sass',
  'webpack','vite','node','express','fastapi','django','flask','spring','laravel','rails','graphql','rest api',
  'python','java','go','golang','rust','c++','c#','.net','php','ruby','kotlin','swift',
  'mongodb','postgresql','mysql','redis','firebase','dynamodb','elasticsearch','prisma','supabase',
  'aws','azure','gcp','docker','kubernetes','terraform','ci/cd','github actions','jenkins','linux','nginx',
  'machine learning','deep learning','tensorflow','pytorch','nlp','llm','openai','langchain','data science',
  'pandas','numpy','scikit','spark','react native','flutter','android','ios',
  'jest','cypress','playwright','selenium','unit testing','tdd','git','github','jira','figma','postman',
  'microservices','kafka','rabbitmq','state management','redux','zustand','graphql','grpc',
];
const SOFT_KW = [
  'communication','collaboration','leadership','mentoring','stakeholder','agile','scrum','kanban',
  'problem solving','analytical','critical thinking','cross-functional','presentation','ownership',
  'proactive','self-motivated','deadline','initiative','adaptable','fast-paced','detail-oriented',
];
const ACTION_VERBS = [
  'built','developed','designed','implemented','led','managed','optimized','improved','reduced',
  'increased','delivered','launched','architected','scaled','automated','migrated','refactored',
  'collaborated','mentored','shipped','deployed','integrated','created','established','drove','owned',
];
const RESULTS_RE = [
  /\d+\s*%/, /\d+x/i, /\$[\d,]+/, /\d+\+?\s*(users?|customers?|clients?|teams?|members?|engineers?)/i,
  /reduced.*by/i, /increased.*by/i, /improved.*by/i, /saved.*hours?/i, /handled.*\d+/i,
];

function smartScore(resumeText, jobText, jobSkills = []) {
  const res = resumeText.toLowerCase();
  const job = (jobText + ' ' + jobSkills.join(' ')).toLowerCase();

  // 1. Tech keywords (35%)
  const jobTech  = TECH_KW.filter(k => job.includes(k));
  const matched  = jobTech.filter(k => res.includes(k));
  const missing  = jobTech.filter(k => !res.includes(k));
  const partial  = missing.filter(k => res.includes(k.split('.')[0].split(' ')[0]) && k.split('.')[0].split(' ')[0].length > 3);
  const strict   = missing.filter(k => !partial.includes(k));
  const techScore = jobTech.length > 0 ? matched.length / jobTech.length : 0.5;

  // 2. Soft skills (15%)
  const jobSoft  = SOFT_KW.filter(k => job.includes(k));
  const softHit  = jobSoft.filter(k => res.includes(k));
  const softScore = jobSoft.length > 0 ? softHit.length / jobSoft.length : 0.5;

  // 3. Action verbs (20%)
  const verbsHit = ACTION_VERBS.filter(v => res.includes(v));
  const verbScore = Math.min(verbsHit.length / 6, 1);

  // 4. Quantified results (15%)
  const resultsHit = RESULTS_RE.filter(p => p.test(resumeText));
  const resultsScore = Math.min(resultsHit.length / 3, 1);

  // 5. Level alignment (15%)
  const level = detectLevel(jobText);
  let levelScore = 0.7;
  if (level.cls === 's') {
    const seniorSig = ['lead','led','architected','principal','managed a team','mentor','ownership'];
    levelScore = Math.min(seniorSig.filter(s => res.includes(s)).length / 3, 1) || 0.5;
  } else if (level.cls === 'j') {
    levelScore = (res.includes('learn') || res.includes('graduate') || techScore > 0.3) ? 0.85 : 0.6;
  }

  const total = Math.round(techScore*35 + softScore*15 + verbScore*20 + resultsScore*15 + levelScore*15);

  return {
    total: Math.min(total, 99),
    categories: [
      { icon: '⚙️', name: 'Tech Keywords',     pct: Math.round(techScore*100),    color: '#6366f1' },
      { icon: '🤝', name: 'Soft Skills',        pct: Math.round(softScore*100),    color: '#8b5cf6' },
      { icon: '💬', name: 'Action Language',    pct: Math.round(verbScore*100),    color: '#0ea5e9' },
      { icon: '📊', name: 'Quantified Impact',  pct: Math.round(resultsScore*100), color: '#10b981' },
      { icon: '🏷️', name: 'Level Alignment',   pct: Math.round(levelScore*100),   color: '#f59e0b' },
    ],
    matched:  [...new Set(matched)],
    missing:  [...new Set(strict)].slice(0, 12),
    partial:  [...new Set(partial)].slice(0, 6),
    softFound: softHit,
    verbsFound: verbsHit,
    resultsCount: resultsHit.length,
    level,
  };
}

function getVerdict(score) {
  if (score >= 80) return { text: '🔥 Excellent — Apply now!',              tip: 'Strong match. Add the missing keywords to push past 90%.',                              color: '#10b981' };
  if (score >= 65) return { text: '✅ Good Match — Minor gaps to fix',      tip: 'Bridge keyword gaps below and add 1–2 quantified achievements to reach 80%+.',           color: '#6ee7b7' };
  if (score >= 45) return { text: '⚠️ Moderate — Tailor before applying',   tip: 'Add missing tech keywords to your resume and include numbers ("reduced load by 40%").',  color: '#f59e0b' };
  return                   { text: '❌ Low Match — Resume needs tailoring',   tip: 'Significant keyword gap. Rewrite using phrases from the job description.',              color: '#ef4444' };
}

function buildActions(analysis, userName) {
  const actions = [];
  if (analysis.missing.length > 0) {
    actions.push(`Add <b>${analysis.missing.slice(0,3).join(', ')}</b> to your resume — these keywords appear in the job description and ATS will filter for them.`);
  }
  if (analysis.resultsCount < 2) {
    actions.push(`Add <b>quantified achievements</b> — e.g. "Improved load time by 35%" or "Handled 50K daily requests". Numbers catch recruiter attention immediately.`);
  }
  if (analysis.verbsFound.length < 4) {
    actions.push(`Start bullet points with strong action verbs: <b>Built, Architected, Delivered, Reduced</b>. This signals ownership and boosts ATS ranking.`);
  } else if (analysis.softFound.length < 3) {
    actions.push(`Add soft-skill signals: mention <b>cross-functional collaboration, mentoring</b> or <b>stakeholder communication</b> — HR screens for team-fit before interviews.`);
  }
  if (actions.length === 0) actions.push(`Strong profile! Apply now and refresh your LinkedIn headline with the suggestion below.`);
  return actions.slice(0, 3);
}

function buildHeadline(user, analysis, jobRole) {
  const role = jobRole || 'Software Engineer';
  const kw   = analysis.matched.slice(0, 3).join(' · ') || 'Full-Stack Developer';
  return `${role} | ${kw} | Building scalable products that ship on time`;
}

// ── Render results ─────────────────────────────────────────────────────────────
let lastAnalysis = null;

function renderResults(analysis, score, user, jobRole) {
  lastAnalysis = analysis;

  // Gauge
  const CIRCUM = 188.5;
  const fill   = $('gauge-fill');
  const verdict = getVerdict(score);
  fill.style.strokeDashoffset = CIRCUM - (score / 100) * CIRCUM;
  fill.style.stroke            = verdict.color;
  $('gauge-num').textContent   = score + '%';
  $('ats-big').textContent     = score + '%';
  $('ats-verdict').textContent = verdict.text;
  $('ats-verdict').style.color = verdict.color;
  $('ats-tip').textContent     = verdict.tip;

  // Categories
  const cr = $('cat-rows'); cr.innerHTML = '';
  analysis.categories.forEach(c => {
    const row = el('div'); row.className = 'cat-row';
    row.innerHTML = `
      <span class="cat-icon">${c.icon}</span><span class="cat-name">${c.name}</span>
      <div class="cat-bar-bg"><div class="cat-bar-fg" style="width:${c.pct}%;background:${c.color}"></div></div>
      <span class="cat-pct" style="color:${c.color}">${c.pct}%</span>`;
    cr.appendChild(row);
  });

  // Pills
  const mkPills = (mid, words, cls) => {
    const c = $(mid); c.innerHTML = '';
    if (!words.length) { c.innerHTML = `<span style="font-size:10px;color:#3d4f6b">None detected</span>`; return; }
    words.forEach(w => { const p = el('span'); p.className = `pill ${cls}`; p.textContent = w; c.appendChild(p); });
  };
  mkPills('kw-matched', analysis.matched, 'g');
  mkPills('kw-missing', analysis.missing, 'r');
  mkPills('kw-partial', analysis.partial, 'a');
  $('kw-partial-group').classList.toggle('hidden', analysis.partial.length === 0);

  // Actions
  const al = $('action-list'); al.innerHTML = '';
  buildActions(analysis, user?.name).forEach((txt, i) => {
    const d = el('div'); d.className = 'action-item';
    d.innerHTML = `<div class="action-num">${i+1}</div><div class="action-text">${txt}</div>`;
    al.appendChild(d);
  });

  // Headline
  const hl = buildHeadline(user, analysis, jobRole);
  $('hl-text').textContent = hl;
  $('headline-box').onclick = () => {
    navigator.clipboard.writeText(hl).then(() => toast('Headline copied!', 'ok'));
  };

  $('results').classList.remove('hidden');
}

// ── Analyze button ─────────────────────────────────────────────────────────────
$('analyze-btn').addEventListener('click', async () => {
  const { resume_text } = await store.get('resume_text');
  if (!resume_text) {
    toast('Upload your resume first! Go to the "My Resume" tab.', 'err');
    // auto-switch to resume tab
    document.querySelector('[data-tab="resume"]').click();
    return;
  }
  if (!currentJob) { toast('Open a job listing page first.', 'err'); return; }

  $('analyze-spin').classList.remove('hidden');
  $('analyze-label').textContent = 'Analysing…';
  $('analyze-btn').disabled = true;
  $('results').classList.add('hidden');

  const { applymate_user: user } = await store.get('applymate_user');

  setTimeout(() => {
    const jobFull  = [currentJob.description, currentJob.title, currentJob.company, ...(currentJob.skills||[])].join(' ');
    const analysis = smartScore(resume_text, jobFull, currentJob.skills || []);
    renderResults(analysis, analysis.total, user, currentJob.title);

    $('analyze-spin').classList.add('hidden');
    $('analyze-label').textContent = '🎯 Run ATS Analysis';
    $('analyze-btn').disabled = false;
  }, 600);
});

// ── Quick Actions ──────────────────────────────────────────────────────────────
$('qa-copy-missing').addEventListener('click', () => {
  if (!lastAnalysis) return;
  const txt = lastAnalysis.missing.join(', ');
  if (!txt) { toast('No missing keywords found!'); return; }
  navigator.clipboard.writeText(txt).then(() => toast('Missing keywords copied!', 'ok'));
});

$('qa-open-profile').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://applymatee.netlify.app/profile' });
});

$('qa-re-analyze').addEventListener('click', () => {
  $('analyze-btn').click();
});

// ── Autofill ───────────────────────────────────────────────────────────────────
$('autofill-btn').addEventListener('click', async () => {
  const { applymate_user: user } = await store.get('applymate_user');
  if (!user) { toast('Profile not loaded.', 'err'); return; }
  $('fill-spin').classList.remove('hidden');
  $('autofill-btn').disabled = true;
  const res = await msgTab({ type: 'AUTOFILL', user });
  $('fill-spin').classList.add('hidden');
  $('autofill-btn').disabled = false;
  res?.success ? toast(`✓ Filled ${res.filled} fields!`, 'ok') : toast(res?.message || 'Could not fill.', 'err');
});

// ── Logout ─────────────────────────────────────────────────────────────────────
async function doLogout() {
  await store.del(['applymate_token', 'applymate_user']);
  showLogin();
  toast('Disconnected.');
}
$('logout-btn').addEventListener('click', doLogout);
$('logout-btn-tab').addEventListener('click', doLogout);

// ── Connect ────────────────────────────────────────────────────────────────────
$('save-token-btn').addEventListener('click', async () => {
  const tkn = $('token-input').value.trim();
  if (!tkn) { toast('Paste your token first.', 'err'); return; }
  $('save-token-btn').disabled = true;
  $('save-token-btn').textContent = 'Connecting…';
  try {
    const user = await fetchUser(tkn);
    await store.set({ applymate_token: tkn, applymate_user: user });
    showApp(user);
    toast('Connected! ✓', 'ok');
  } catch {
    toast('Invalid token. Try again.', 'err');
  } finally {
    $('save-token-btn').disabled = false;
    $('save-token-btn').textContent = '⚡ Connect Account';
  }
});

// ── Init ───────────────────────────────────────────────────────────────────────
async function init() {
  const { applymate_token: tkn } = await store.get('applymate_token');
  if (!tkn) { showLogin(); return; }
  try {
    const user = await fetchUser(tkn);
    await store.set({ applymate_user: user });
    showApp(user);
  } catch {
    await store.del(['applymate_token', 'applymate_user']);
    showLogin();
  }
}

init();
