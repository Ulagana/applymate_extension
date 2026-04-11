/**
 * ApplyMate Content Script v2
 * - Detects & autofills job application forms (Workday, Greenhouse, Lever, etc.)
 * - Extracts job descriptions from Naukri, LinkedIn, Indeed, Glassdoor, Monster
 */

// ─── Platform Detection ────────────────────────────────────────────────────────
function detectPlatform() {
  const h = window.location.hostname.toLowerCase();
  if (h.includes('naukri'))          return 'Naukri';
  if (h.includes('linkedin'))        return 'LinkedIn';
  if (h.includes('indeed'))          return 'Indeed';
  if (h.includes('glassdoor'))       return 'Glassdoor';
  if (h.includes('monster'))         return 'Monster';
  if (h.includes('myworkdayjobs') || h.includes('workday')) return 'Workday';
  if (h.includes('greenhouse'))      return 'Greenhouse';
  if (h.includes('lever'))           return 'Lever';
  if (h.includes('ashbyhq'))         return 'Ashby';
  if (h.includes('jobvite'))         return 'Jobvite';
  if (h.includes('smartrecruiters')) return 'SmartRecruiters';
  return 'Job Page';
}

// ─── Job Description Extraction ───────────────────────────────────────────────
function extractJobData() {
  const platform = detectPlatform();
  let title = '', company = '', description = '', skills = [];

  const getText = (selectors) => {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim()) return el.innerText.trim();
    }
    return '';
  };

  if (platform === 'Naukri') {
    title       = getText(['.jd-header-title', 'h1.jnb-h1', '[class*="jobTitle"]', 'h1']);
    company     = getText(['.jd-header-comp-name', '.comp-name', '[class*="companyName"]']);
    description = getText(['[class*="job-desc"]', '#job-desc', '.dang-inner-html', '[class*="JD"]', '.description__text']);

    // Naukri key skills chips
    const skillEls = document.querySelectorAll('.chip, [class*="skill-chip"], [class*="tag"]');
    skills = [...skillEls].map(e => e.innerText.trim()).filter(Boolean).slice(0, 20);

    // Fallback: grab entire page body if nothing found
    if (!description) {
      description = document.body.innerText.slice(0, 3000);
    }
  }

  else if (platform === 'LinkedIn') {
    title       = getText(['.job-details-jobs-unified-top-card__job-title', '.topcard__title', 'h1']);
    company     = getText(['.job-details-jobs-unified-top-card__company-name', '.topcard__org-name-link', '.topcard__flavor--black-link']);
    description = getText(['.jobs-description__content', '.description__text', '.jobs-box__html-content', '[class*="description"]']);
    if (!description) description = document.body.innerText.slice(0, 3000);
  }

  else if (platform === 'Indeed') {
    title       = getText(['[data-testid="jobsearch-JobInfoHeader-title"]', 'h1.jobsearch-JobInfoHeader-title', 'h1']);
    company     = getText(['[data-testid="inlineHeader-companyName"]', '.jobsearch-InlineCompanyRating-companyHeader']);
    description = getText(['#jobDescriptionText', '.jobsearch-jobDescriptionText', '[class*="jobDescription"]']);
    if (!description) description = document.body.innerText.slice(0, 3000);
  }

  else if (platform === 'Glassdoor') {
    title       = getText(['[data-test="job-title"]', 'h1']);
    company     = getText(['[data-test="employer-name"]', '.employer-name']);
    description = getText(['[class*="JobDescription"]', '[class*="jobDescription"]', '.desc']);
    if (!description) description = document.body.innerText.slice(0, 3000);
  }

  else {
    // Generic fallback for any other platform
    title       = getText(['h1', '.job-title', '[class*="title"]']);
    company     = getText(['.company-name', '[class*="company"]', '[class*="employer"]']);
    description = document.body.innerText.slice(0, 3000);
  }

  return { platform, title, company, description, skills, url: window.location.hostname };
}

// ─── Form Detection (for autofill) ────────────────────────────────────────────
function detectForm() {
  const platform = detectPlatform();
  const inputs = document.querySelectorAll('input[type="text"], input[type="email"], textarea');
  if (inputs.length < 3) return { detected: false };

  const fields = detectFields(null);
  return { detected: true, platform, fields, url: window.location.hostname };
}

// ─── Field Finders ────────────────────────────────────────────────────────────
function findInputByHeuristic(keywords) {
  for (const input of document.querySelectorAll('input, textarea')) {
    const attrs = [input.name, input.id, input.placeholder, input.getAttribute('aria-label'), input.getAttribute('data-uxi-field-id')]
      .filter(Boolean).join(' ').toLowerCase();
    if (keywords.some(kw => attrs.includes(kw))) return input;
  }
  for (const label of document.querySelectorAll('label')) {
    const text = label.textContent.toLowerCase();
    if (keywords.some(kw => text.includes(kw))) {
      const el = label.getAttribute('for') ? document.getElementById(label.getAttribute('for')) : label.nextElementSibling;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return el;
    }
  }
  return null;
}

function detectFields(user) {
  const map = buildFieldMap(user || { name: 'Test User', email: 'test@test.com' });
  return map.filter(f => findInputByHeuristic(f.keywords)).map(f => f.keywords[0].replace(/\b\w/g, l => l.toUpperCase()));
}

function buildFieldMap(user) {
  const [firstName, ...rest] = (user.name || '').split(' ');
  return [
    { keywords: ['first name', 'firstname', 'given name', 'first_name'], value: firstName },
    { keywords: ['last name', 'lastname', 'surname', 'family name', 'last_name'], value: rest.join(' ') },
    { keywords: ['full name', 'fullname', 'name'], value: user.name },
    { keywords: ['email', 'e-mail', 'email address'], value: user.email },
    { keywords: ['phone', 'mobile', 'telephone', 'cell'], value: user.phone || '' },
    { keywords: ['address', 'street', 'location'], value: user.address || '' },
    { keywords: ['city'], value: user.city || '' },
    { keywords: ['state', 'province', 'region'], value: user.state || '' },
    { keywords: ['zip', 'postal', 'postcode'], value: user.zip || '' },
    { keywords: ['country'], value: user.country || '' },
    { keywords: ['linkedin', 'linkedin url'], value: user.linkedin || '' },
    { keywords: ['website', 'portfolio', 'github', 'personal url'], value: user.website || '' },
    { keywords: ['summary', 'cover letter', 'about me', 'bio', 'professional summary'], value: user.bio || '' },
  ];
}

// ─── Autofill ─────────────────────────────────────────────────────────────────
function fillInput(el, value) {
  if (!el || !value) return false;
  try {
    const setter = Object.getOwnPropertyDescriptor(
      el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
      'value'
    )?.set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur',   { bubbles: true }));
    el.style.transition  = 'box-shadow 0.3s';
    el.style.boxShadow   = '0 0 0 2px #4f46e5';
    setTimeout(() => { el.style.boxShadow = ''; }, 1200);
    return true;
  } catch { return false; }
}

function autofillPage(user) {
  let filled = 0;
  for (const field of buildFieldMap(user)) {
    if (!field.value) continue;
    const el = findInputByHeuristic(field.keywords);
    if (el && fillInput(el, field.value)) filled++;
  }
  return filled;
}

// ─── Message Listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'DETECT_FORM') {
    sendResponse(detectForm());
    return true;
  }

  if (msg.type === 'EXTRACT_JOB') {
    sendResponse(extractJobData());
    return true;
  }

  if (msg.type === 'AUTOFILL') {
    const filled = autofillPage(msg.user);
    sendResponse(filled > 0
      ? { success: true, filled }
      : { success: false, message: 'Could not detect fillable fields on this page.' }
    );
    return true;
  }
});

// ─── Auto-detect on load ───────────────────────────────────────────────────────
const jobData = extractJobData();
if (jobData.title || jobData.description) {
  chrome.runtime.sendMessage({ type: 'JOB_PAGE_DETECTED', ...jobData });
}
const form = detectForm();
if (form.detected) {
  chrome.runtime.sendMessage({ type: 'FORM_DETECTED', platform: form.platform, url: jobData.url });
}
