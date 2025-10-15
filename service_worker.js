// service_worker.js

const ORCH = {
  ALARM_CHECK:  'mw-check',
  ALARM_DAILY:  'mw-daily',
  ALARM_INTERIM:'mw-interim',
  DWELL_MS: 25_000,   // garde-fou par site
  AWAIT_MS: 90_000,   // timeout attente CONTENT_DONE
};

async function getCfg(keys){ return await new Promise(res => chrome.storage.sync.get(keys, r => res(r||{}))); }
async function setLocal(o){ return await new Promise(res => chrome.storage.local.set(o, () => res())); }

async function openAndRun(url, regionLabel, task) {
  const runId = `${Date.now()}:${regionLabel}:${task}`;
  await setLocal({ mw_orchestrated_mode: true, mw_current_run: runId });

  const tab = await chrome.tabs.create({ url, active: false });

  // garde-fou fermeture forcée
  const hardClose = setTimeout(async () => { try { await chrome.tabs.remove(tab.id); } catch {} }, ORCH.DWELL_MS);

  // dès que le content est prêt, on lui envoie la tâche

Vous avez dit :
const ITERATION = 'Iteration 20.4.1';
console.log(Initializing monitor — ${ITERATION});

const escapeHtml = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
// === ntfy (override minimal; no flow change) ===
// Reads chrome.storage.sync keys set by your popup (if any):
//   useNtfy (bool, optional), ntfyUrl (string), ntfyAuth (string, optional),
//   ntfyTags (string, optional), ntfyPriority (1..5, optional)
async function __sendNtfyWithCfg(cfg, { title, text, imageUrl, clickUrl, tags, priority }) {
  // 💓 1) Ignorer le heartbeat
  if (text && text.includes('No new prints or downloads found.')) {
    console.debug('[MakerStats] ntfy: heartbeat suppressed');
    return true;
  }
    // Convertit un message HTML "léger" (Telegram) en Markdown (ntfy)
  const htmlToMd = (s="") =>
    String(s)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<b>/gi, '**').replace(/<\/b>/gi, '**')
      .replace(/<strong>/gi, '**').replace(/<\/strong>/gi, '**')
      .replace(/<i>/gi, '*').replace(/<\/i>/gi, '*')
      .replace(/<em>/gi, '*').replace(/<\/em>/gi, '*')
      // retire toute autre balise HTML résiduelle
      .replace(/<\/?[^>]+>/g, '');

  // 💬 2) URL du serveur ntfy
  const url = (cfg && cfg.ntfyUrl) ? String(cfg.ntfyUrl).trim() : "";
  if (!url) {
    console.error("[MakerStats] ntfy: ntfyUrl missing");
    return false;
  }

  // 🧹 3) Nettoyage minimal (évite erreurs Chrome sur headers non ASCII)
  const asciiOnly = (s) => (s || "").replace(/[^\x00-\x7F]/g, "");
  const asciiOrEmpty = (s) => asciiOnly(String(s || "")).trim();

  // 🔢 4) Détermination de la priorité
  const prio = (cfg && Number.isFinite(cfg.ntfyPriority))
    ? cfg.ntfyPriority
    : (Number.isFinite(priority) ? priority : 3);

  // 🧩 5) Headers de base (ASCII only)
  const baseHeaders = {
    "Priority": String(prio),
  };
  if (cfg && cfg.ntfyAuth) baseHeaders["Authorization"] = asciiOrEmpty(cfg.ntfyAuth);
  if (cfg && cfg.ntfyTags) baseHeaders["Tags"] = asciiOrEmpty(cfg.ntfyTags);
  if (clickUrl) baseHeaders["Click"] = asciiOrEmpty(clickUrl);
  if (title) baseHeaders["Title"] = asciiOrEmpty(title);
  baseHeaders["Markdown"] = "yes";

  try {
    // === 🖼️ CAS IMAGE (prévisualisable) ===
    if (imageUrl) {
      const headers = {
        ...baseHeaders,
        "Content-Type": "text/plain",
        "Attach": asciiOrEmpty(encodeURI(imageUrl)), // ntfy va télécharger et afficher la preview
      };

      const res = await fetch(url, {
        method: "POST",
        headers,
        body:  htmlToMd(text || ""), // le message peut contenir accents/émojis
      });

      if (!res.ok) {
        const t = await res.text().catch(() => res.statusText);
        console.error("[MakerStats] ntfy POST (Attach) HTTP", res.status, t);
        return false;
      }

      console.debug("[MakerStats] ntfy POST (Attach) OK — image preview enabled");
      return true;
    }

    // === ✉️ CAS TEXTE SEUL ===
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...baseHeaders,
        "Content-Type": "text/plain"
      },
      body: htmlToMd(text || ""),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => res.statusText);
      console.error("[MakerStats] ntfy POST (text) HTTP", res.status, t);
      return false;
    }

    console.debug("[MakerStats] ntfy POST (text) OK");
    return true;

  } catch (e) {
    console.error("[MakerStats] ntfy send error:", e);
    return false;
  }
}




const autoScrollToFullBottom = ({ step = 600, delay = 250, settle = 800 } = {}) => new Promise(resolve => {
  let timer;
  const scrollAndCheck = () => {
    window.scrollBy(0, step);
    const currentHeight = document.body.scrollHeight;
    const atBottom = (window.innerHeight + window.scrollY) >= (currentHeight - 2);
    if (atBottom) {
      clearInterval(timer);
      setTimeout(() => {
        if (document.body.scrollHeight > currentHeight) timer = setInterval(scrollAndCheck, delay);
        else resolve();
      }, settle);
    }
  };
  timer = setInterval(scrollAndCheck, delay);
});

class ValueMonitor {
  constructor() {
    // config/state
    this.telegramToken = '';
    this.chatId = '';
    this.previousValues = null;
    this.checkInterval = null;
    this._dailyTimerId = null;
    this.isChecking = false;
    // identity/keys/timeouts
    this._instanceId = Math.random().toString(36).slice(2);
    this._dailyLockKey = 'dailyLock';
    this._dailyStatsKey = 'dailyStats';
    this._lastSuccessfulKey = 'lastSuccessfulDailyReport';
    this._dailyRunningRewardKey = 'dailyRunningRewardPoints';
    this._dailyRunningRewardDayKey = 'dailyRunningRewardDay';
    this._dailyLockTimeoutMs = 2 * 60 * 1000;
    this._dailyMaxPreSendRetries = 5;
    this._dailyPreSendBaseBackoffMs = 300;
    this._dailyScheduleJitterMs = 30 * 1000;
    this._defaultFallbackHours = 48;
    this.notifySummaryMode = false;
    this._telegramMaxMessageChars = 4000;
    this._suspiciousDeltaLimit = 200;
	this._interimTimers = [];
	this._interimSlots = ['07:00','12:00','16:00','22:00']; // créneaux fixes
	this._interimJitterMs = 15_000; // ±15s pour désynchroniser
	this._interimClaimKey = 'lastInterimSentKey'; // anti-doublon cross-onglets
  }

  // logging shorthands (preserve outputs)
  log(...a){ console.log(...a); }
  warn(...a){ console.warn(...a); }
  error(...a){ console.error(...a); }
	 // --- ENVOI SNAPSHOT DE TOUS LES MODÈLES ---
  _nextOccurrenceFor(timeStr) {
  const [h, m] = String(timeStr).split(':').map(Number);
  const now = new Date();
  const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h||0, m||0, 0, 0);
  if (dt <= now) dt.setDate(dt.getDate() + 1);
  return dt;
}

_clearInterimTimers() {
  for (const t of this._interimTimers) clearTimeout(t);
  this._interimTimers = [];
}

// retournne une clé unique pour le créneau du jour (ex: "2025-10-14T09:00")
_makeInterimSlotKey(dateObj, timeStr) {
  const pad = n => String(n).padStart(2,'0');
  return ${dateObj.getFullYear()}-${pad(dateObj.getMonth()+1)}-${pad(dateObj.getDate())}T${timeStr};
}

// planifie un seul créneau (avec jitter & auto-reschedule)
_scheduleOneInterim(timeStr) {
  const target = this._nextOccurrenceFor(timeStr);
  const baseDelay = Math.max(0, target - Date.now());
  const jitter = Math.floor((Math.random() * 2 - 1) * this._interimJitterMs); // [-jitter;+jitter]
  const delay = Math.max(0, baseDelay + jitter);

  this.log(Interim "${timeStr}" prévu à ${new Date(Date.now()+delay).toLocaleString()} (base=${baseDelay}ms, jitter=${jitter}ms));

  const timerId = setTimeout(async () => {
    try {
      // anti-doublon inter-onglets : on "claim" la fenêtre de tir
      const slotKey = this._makeInterimSlotKey(new Date(), timeStr); // date du jour courant
      const store = await new Promise(res => chrome.storage.local.get([this._interimClaimKey], v => res(v||{})));
      const lastKey = store?.[this._interimClaimKey];

      if (lastKey === slotKey) {
        this.log(Interim ${timeStr}: déjà envoyé pour ce créneau (${slotKey}), on skip.);
      } else {
        // petit "claim" optimiste (meilleur-effort)
        await new Promise(r => chrome.storage.local.set({ [this._interimClaimKey]: slotKey }, () => r()));
        this.log(Interim ${timeStr}: envoi… (slot=${slotKey}));
        try {
          await this.handleInterimSummaryRequest();
        } catch (e) {
          this.warn(Interim ${timeStr}: échec d'envoi, e);
          // en cas d'échec on ne "déclaim" pas — ce n’est pas critique pour de la notif
        }
      }
    } catch (e) {
      this.error(Interim ${timeStr}: erreur inattendue, e);
    } finally {
      // replanifie ce créneau pour le lendemain
      this._scheduleOneInterim(timeStr);
    }
  }, delay);

  this._interimTimers.push(timerId);
}

// planifie les 4 interims du jour
scheduleInterimNotifications() {
  this._clearInterimTimers();
  const slots = Array.isArray(this._interimSlots) && this._interimSlots.length
    ? this._interimSlots
    : ['09:00','12:00','16:00','22:00'];

  for (const s of slots) this._scheduleOneInterim(s);
  this.log(Interim scheduling actif pour: ${slots.join(', ')});
}
  async sendModelsSnapshot() {
    const current = this.getCurrentValues();
    if (!current || !current.models || !Object.keys(current.models).length) {
      await this.sendTelegramMessage("No models found on the page.");
      return true;
    }

    // Tri par “popularité” (downloads + 2x prints) décroissant
    const models = Object.values(current.models)
      .map(m => ({
        ...m,
        totalEq: this.calculateDownloadsEquivalent(m.downloads, m.prints)
      }))
      .sort((a,b) => b.totalEq - a.totalEq);

    // En-tête
    const header = 📸 Models snapshot (${models.length} items)\nSorted by downloads + 2×prints\n;
    await this.sendTelegramMessage(header);

    // Envoi 1 message par modèle (avec image si dispo)
    for (const m of models) {
      const captionLines = [
        📦 ${m.name},
        ⬇️ Downloads: ${m.downloads},
        🖨️ Prints: ${m.prints},
        ⚡ Boosts: ${m.boosts},
        Σ Downloads eq: ${m.totalEq},
      ];
      if (m.permalink) captionLines.push(🔗 ${m.permalink});
      const caption = captionLines.join('\n');

      if (m.imageUrl) {
        await this.sendTelegramMessageWithPhoto(caption, m.imageUrl);
      } else {
        await this.sendTelegramMessage(caption);
      }

      // petit spacing pour éviter rate limit Telegram/ntfy
      await new Promise(r => setTimeout(r, 250));
    }

    return true;
  }
  // period key uses user's dailyNotificationTime or 12:00 default
  async getCurrentPeriodKey() {
    const cfg = await new Promise(res => chrome.storage.sync.get(['dailyNotificationTime'], r =>
      res(r && r.dailyNotificationTime ? r.dailyNotificationTime : '12:00')));
    const [hourStr, minuteStr] = String(cfg).split(':');
    const hour = Number.isFinite(Number(hourStr)) ? Number(hourStr) : 12;
    const minute = Number.isFinite(Number(minuteStr)) ? Number(minuteStr) : 0;
    const now = new Date();
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    if (candidate > now) candidate.setDate(candidate.getDate() - 1);
    const pad = n => String(n).padStart(2,'0');
    const offset = -candidate.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const offsetHours = pad(Math.floor(Math.abs(offset)/60));
    const offsetMins = pad(Math.abs(offset)%60);
    return ${candidate.getFullYear()}-${pad(candidate.getMonth()+1)}-${pad(candidate.getDate())}T${pad(candidate.getHours())}:${pad(candidate.getMinutes())}:00${sign}${offsetHours}:${offsetMins};
  }

  // split large telegram messages into parts keeping paragraphs
  _splitMessageIntoParts(message='', maxLen=this._telegramMaxMessageChars) {
    if (!message) return [];
    if (message.length <= maxLen) return [message];
    const parts=[]; const paragraphs = message.split('\n\n'); let current='';
    for (const p of paragraphs) {
      const chunk = (current ? '\n\n' : '') + p;
      if ((current + chunk).length > maxLen) {
        if (current) { parts.push(current); current = p; if (current.length > maxLen) { let s=0; while (s < current.length){ parts.push(current.slice(s, s+maxLen)); s+=maxLen;} current=''; } }
        else { let s=0; while (s < p.length){ parts.push(p.slice(s, s+maxLen)); s+=maxLen; } current=''; }
      } else current += chunk;
    }
    if (current) parts.push(current);
    return parts;
  }

  // Telegram send helpers with one retry
  async sendTelegramMessage(message, attempt=1) {
	    // --- ntfy override minimal ---
    try {
      const cfg = await new Promise(res =>
        chrome.storage.sync.get(['useNtfy','ntfyUrl','ntfyAuth','ntfyTags','ntfyPriority'], v => res(v||{}))
      );
      const enabled = (cfg.useNtfy === undefined ? !!cfg.ntfyUrl : !!cfg.useNtfy);
      if (enabled && cfg.ntfyUrl) {
        return await __sendNtfyWithCfg(cfg, { title:'MakerWorld', text: message, imageUrl:'', clickUrl:'', tags:'makerworld,update', priority:3 });
      }
    } catch(e) { /* fallback to Telegram */ }
    if (!this.telegramToken || !this.chatId) { this.error('Missing Token or Chat ID'); return false; }
    const parts = this._splitMessageIntoParts(message, this._telegramMaxMessageChars);
    for (const part of parts) {
      const payload = { chat_id: this.chatId, text: part, parse_mode: 'HTML' };
      this.log('→ Telegram payload (part):', { len: part.length });
      try {
        const res = await fetch(https://api.telegram.org/bot${this.telegramToken}/sendMessage, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        const body = await res.json();
        if (!res.ok) {
          this.error('← Telegram API error:', body);
          if (attempt < 2) { this.log('Retrying Telegram send...'); await new Promise(r=>setTimeout(r,1000)); return this.sendTelegramMessage(message, attempt+1); }
          return false;
        }
        this.log('← Telegram API ok:', body);
      } catch (err) {
        this.error('Error sending message:', err);
        if (attempt < 2) { this.log('Retrying Telegram send...'); await new Promise(r=>setTimeout(r,1000)); return this.sendTelegramMessage(message, attempt+1); }
        return false;
      }
      await new Promise(r=>setTimeout(r,200));
    }
    return true;
  }

  async sendTelegramMessageWithPhoto(message, photoUrl) {
	// --- ntfy override minimal ---
    try {
      const cfg = await new Promise(res =>
        chrome.storage.sync.get(['useNtfy','ntfyUrl','ntfyAuth','ntfyTags','ntfyPriority'], v => res(v||{}))
      );
      const enabled = (cfg.useNtfy === undefined ? !!cfg.ntfyUrl : !!cfg.useNtfy);
      if (enabled && cfg.ntfyUrl) {
        return await __sendNtfyWithCfg(cfg, { title:'MakerWorld', text: message, imageUrl:(photoUrl||''), clickUrl:'', tags:'makerworld,model,update', priority:4 });
      }
    } catch(e) { /* fallback to Telegram */ }
    if (!this.telegramToken || !this.chatId || !photoUrl) { this.log('Falling back to text message (missing token/chat/photo).'); return this.sendTelegramMessage(message); }
    try {
      this.log('Attempting to send photo:', { photoUrl, chatId: this.chatId });
      const imgRes = await fetch(photoUrl);
      if (!imgRes.ok) throw new Error(Image download failed: ${imgRes.status});
      const blob = await imgRes.blob();
      const form = new FormData(); form.append('chat_id', this.chatId); form.append('caption', message); form.append('photo', blob, 'model_image.jpg');
      const res = await fetch(https://api.telegram.org/bot${this.telegramToken}/sendPhoto, { method:'POST', body: form });
      const result = await res.json();
      this.log('Telegram response:', result);
      if (!res.ok) throw new Error(Telegram Error: ${res.status});
      return true;
    } catch (err) {
      this.error('Error sending photo:', err);
      return this.sendTelegramMessage(message);
    }
  }

  // scraping/parsing
  parseNumber(text){ if (!text) return 0; text = String(text).trim().toLowerCase(); if (text.includes('k')){ const base = parseFloat(text.replace('k','')); if (Number.isFinite(base)) return Math.round(base*1000); } const n = parseInt(text.replace(/[^\d]/g,''),10); return Number.isFinite(n)? n:0; }

  getCurrentValues() {
    try {
      const currentValues = { models: {}, points: 0, timestamp: Date.now() };
      try {
        const pointsContainer = document.querySelector('.mw-css-1541sxf');
        this.log('Found points container:', !!pointsContainer);
        if (pointsContainer) {
          const pts = pointsContainer.textContent.trim().match(/[\d,]+(\.\d+)?/);
          if (pts && pts[0]) { currentValues.points = parseFloat(pts[0].replace(/,/g,'')); this.log('Points found:', currentValues.points); }
        }
      } catch (e){ this.error('Error extracting points:', e); }
      const downloadElements = document.querySelectorAll('[data-trackid]');
      downloadElements.forEach(element => {
        const modelId = element.getAttribute('data-trackid');
        const modelTitle = element.querySelector('h3.translated-text');
        const name = modelTitle?.textContent.trim() || 'Model';
        const imageUrl = element.querySelector('img')?.getAttribute('src') || '';
        let permalink = null;
        const anchor = element.querySelector('a[href*="/models/"], a[href*="/model/"], a[href*="/models/"]');
        if (anchor?.href) permalink = anchor.href;
        const allMetrics = element.querySelectorAll('.mw-css-xlgty3 span');
        if (allMetrics.length >= 3) {
          const lastThree = Array.from(allMetrics).slice(-3);
          const boosts = this.parseNumber(lastThree[0]?.textContent || '0');
          const downloads = this.parseNumber(lastThree[1]?.textContent || '0');
          const prints = this.parseNumber(lastThree[2]?.textContent || '0');
          currentValues.models[modelId] = { id: modelId, permalink, name, boosts, downloads, prints, imageUrl };
          this.log(Model "${name}":, { id: modelId, boosts, downloads, prints, permalink });
        } else this.log(Not enough metrics for ${name} (found ${allMetrics.length}));
      });
      return currentValues;
    } catch (err) { this.error('Error extracting values:', err); return null; }
  }

  // reward math
  getRewardInterval(totalDownloads){ if (totalDownloads <= 50) return 10; if (totalDownloads <= 500) return 25; if (totalDownloads <= 1000) return 50; return 100; }
  nextRewardDownloads(totalDownloads){ const interval = this.getRewardInterval(totalDownloads); const mod = totalDownloads % interval; return (totalDownloads === 0 || mod === 0) ? totalDownloads + interval : totalDownloads + (interval - mod); }
  getRewardPointsForDownloads(thresholdDownloads){ if (thresholdDownloads <= 50) return 15+3; if (thresholdDownloads <= 500) return 12+3; if (thresholdDownloads <= 1000) return 20+5; return 30+8; }
  calculateDownloadsEquivalent(downloads, prints){ return Number(downloads||0) + (Number(prints||0) * 2); }

  // storage lock helpers
  async acquireDailyLock(timeoutMs = this._dailyLockTimeoutMs) {
    const now = Date.now();
    return new Promise(resolve => chrome.storage.local.get([this._dailyLockKey], res => {
      const lock = res?.[this._dailyLockKey] || null;
      if (!lock || (now - lock.ts) > timeoutMs) {
        if (lock && (now - lock.ts) > timeoutMs) {
          chrome.storage.local.remove([this._dailyLockKey], () => {
            const newLock = { ts: now, owner: this._instanceId };
            chrome.storage.local.set({ [this._dailyLockKey]: newLock }, () => {
              chrome.storage.local.get([this._dailyLockKey], r2 => {
                const confirmed = r2?.[this._dailyLockKey]?.owner === this._instanceId;
                this.log('acquireDailyLock (force unlock) result', { confirmed, owner: r2?.[this._dailyLockKey]?.owner, instance: this._instanceId });
                resolve(confirmed);
              });
            });
          });
        } else {
          const newLock = { ts: now, owner: this._instanceId };
          chrome.storage.local.set({ [this._dailyLockKey]: newLock }, () => {
            chrome.storage.local.get([this._dailyLockKey], r2 => {
              const confirmed = r2?.[this._dailyLockKey]?.owner === this._instanceId;
              this.log('acquireDailyLock result', { confirmed, owner: r2?.[this._dailyLockKey]?.owner, instance: this._instanceId });
              resolve(confirmed);
            });
          });
        }
      } else { this.log('acquireDailyLock failed, existing lock', lock); resolve(false); }
    }));
  }

  async releaseDailyLock() {
    return new Promise(resolve => chrome.storage.local.get([this._dailyLockKey], res => {
      const lock = res?.[this._dailyLockKey] || null;
      if (lock && lock.owner === this._instanceId) {
        chrome.storage.local.remove([this._dailyLockKey], () => { this.log('releaseDailyLock: released by', this._instanceId); resolve(true); });
      } else resolve(false);
    }));
  }

  // pre-send check to avoid duplicate daily sends
  async preSendCheckAndMaybeWait(startTime) {
    for (let attempt = 0; attempt < this._dailyMaxPreSendRetries; attempt++) {
      const latest = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null)));
      if (latest && latest.timestamp >= startTime) { this.log('preSendCheck: found newer dailyStats, aborting send', { latestTs: new Date(latest.timestamp).toISOString(), startTime: new Date(startTime).toISOString() }); return false; }
      const backoff = this._dailyPreSendBaseBackoffMs + Math.floor(Math.random()*700);
      await new Promise(r => setTimeout(r, backoff));
    }
    return true;
  }

  // robust daily summary computation and storage
  async getDailySummary() {
    const currentValues = this.getCurrentValues();
    if (!currentValues) { this.error('Unable to get current values'); return null; }
    this.log('getDailySummary START — now:', new Date().toISOString());
    this.log('getDailySummary: currentValues.models count =', Object.keys(currentValues.models || {}).length, 'timestamp=', new Date(currentValues.timestamp).toISOString());

    const [previousDayRaw, maxStaleMs] = await Promise.all([
      new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null))),
      new Promise(res => chrome.storage.sync.get(['dailyFallbackMaxAgeMs'], cfg => {
        const cfgVal = cfg?.dailyFallbackMaxAgeMs; res(Number.isFinite(cfgVal) ? cfgVal : (this._defaultFallbackHours*60*60*1000));
      }))
    ]);

    let raw = previousDayRaw;
    if (!raw) {
      for (let i=0;i<3 && !raw;i++){ this.log('getDailySummary: dailyStats missing — retrying read (attempt)', i+1); await new Promise(r=>setTimeout(r,1000)); raw = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r2 => res(r2?.[this._dailyStatsKey] || null))); }
    }
    if (raw) this.log('getDailySummary: read dailyStats from storage:', { ts: new Date(raw.timestamp).toISOString(), ageMs: Date.now()-raw.timestamp, modelsCount: Object.keys(raw.models || {}).length, points: raw.points, owner: raw.owner || null, periodKey: raw.periodKey || null });
    else this.log('getDailySummary: no dailyStats found in storage after retries.');

    const ONE_DAY_MS = 24*60*60*1000;
    let previousDay = null;
    if (raw) {
      const ageMs = Date.now() - raw.timestamp;
      if (ageMs <= ONE_DAY_MS) previousDay = raw, this.log('getDailySummary: using fresh snapshot', new Date(raw.timestamp).toISOString());
      else if (ageMs <= maxStaleMs) previousDay = raw, this.warn('getDailySummary: using STALE snapshot as fallback', new Date(raw.timestamp).toISOString(), ageMs=${ageMs});
      else this.log('getDailySummary: snapshot too old, treating as missing', new Date(raw.timestamp).toISOString(), ageMs=${ageMs});
    }

    if (!previousDay) {
      this.log('getDailySummary: No previous day data available or snapshot unusable. Writing current snapshot and returning empty summary.');
      const periodKey = await this.getCurrentPeriodKey();
      chrome.storage.local.set({ [this._dailyStatsKey]: { models: currentValues.models, points: currentValues.points, timestamp: Date.now(), owner: this._instanceId, periodKey } }, () => {
        this.log('getDailySummary: stored dailyStats ts=', new Date().toISOString(), 'modelsCount=', Object.keys(currentValues.models || {}).length, 'owner=', this._instanceId, 'periodKey=', periodKey);
      });
      chrome.storage.local.set({ [this._dailyRunningRewardKey]: 0, [this._dailyRunningRewardDayKey]: periodKey, [this._lastSuccessfulKey]: { state:'SENT', owner:this._instanceId, sentAt:Date.now(), periodKey, snapshot:{ models: currentValues.models, points: currentValues.points, timestamp: Date.now() }, rewardPointsTotal:0 } });
      return { dailyDownloads:0, dailyPrints:0, points: currentValues.points, pointsGained:0, top5Downloads:[], top5Prints:[], rewardsEarned:[], rewardPointsTotal:0, from:new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), to:new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) };
    }

    // compare
    const modelChanges = {};
    this.log('getDailySummary: comparing models; previousDay.models count', Object.keys(previousDay.models || {}).length);
    for (const [id, current] of Object.entries(currentValues.models)) {
      let previous = previousDay?.models?.[id] || null;
      if (!previous && current.permalink) previous = Object.values(previousDay.models || {}).find(m => m?.permalink === current.permalink) || null;
      if (!previous && current.name) { const norm = current.name.trim().toLowerCase(); previous = Object.values(previousDay.models || {}).find(m => m?.name?.trim().toLowerCase() === norm) || null; if (previous) this.log('getDailySummary: matched previous by name', { id, name: current.name }); }
      if (!previous) { this.log('New model found:', current.name, 'id=', id, 'permalink=', current.permalink); continue; }

      const prevDownloads = Number(previous.downloads || 0), prevPrints = Number(previous.prints || 0), currDownloads = Number(current.downloads || 0), currPrints = Number(current.prints || 0);
      let downloadsGained = currDownloads - prevDownloads, printsGained = currPrints - prevPrints;
      if (downloadsGained <= 0 && printsGained <= 0) continue;
      if (downloadsGained > this._suspiciousDeltaLimit || printsGained > this._suspiciousDeltaLimit) { this.warn('Suspiciously large delta detected, skipping reward calculation for', { id, name: current.name, downloadsGained, printsGained, prevTs: previous.timestamp || null }); continue; }

      modelChanges[id] = { id, name: current.name, downloadsGained, printsGained, previousDownloads: prevDownloads, previousPrints: prevPrints, currentDownloads: currDownloads, currentPrints: currPrints, permalink: current.permalink || previous?.permalink || null };
    }

    const dailyDownloads = Object.values(modelChanges).reduce((s,m)=>s+m.downloadsGained,0);
    const dailyPrints = Object.values(modelChanges).reduce((s,m)=>s+m.printsGained,0);
    const top5Downloads = Object.values(modelChanges).filter(m=>m.downloadsGained>0).sort((a,b)=>b.downloadsGained-a.downloadsGained).slice(0,5);
    const top5Prints = Object.values(modelChanges).filter(m=>m.printsGained>0).sort((a,b)=>b.printsGained-a.printsGained).slice(0,5);

    // compute rewards
    const rewardsEarned = []; let rewardPointsTotal = 0;
    for (const m of Object.values(modelChanges)) {
      const prevDownloadsTotal = this.calculateDownloadsEquivalent(m.previousDownloads, m.previousPrints);
      const currDownloadsTotal = this.calculateDownloadsEquivalent(m.currentDownloads, m.currentPrints);
      let cursor = prevDownloadsTotal; const thresholdsHit = []; const maxThresholdsPerModel = 200; let thresholdsCount = 0;
      while (cursor < currDownloadsTotal && thresholdsCount < maxThresholdsPerModel) {
        const interval = this.getRewardInterval(cursor);
        const mod = cursor % interval;
        const nextThreshold = (cursor === 0 || mod === 0) ? cursor + interval : cursor + (interval - mod);
        if (nextThreshold <= currDownloadsTotal) {
          const rewardPoints = this.getRewardPointsForDownloads(nextThreshold)*1.25;
          thresholdsHit.push({ threshold: nextThreshold, rewardPoints });
          rewardPointsTotal += rewardPoints;
          cursor = nextThreshold; thresholdsCount++;
        } else break;
      }
      if (thresholdsHit.length) rewardsEarned.push({ id:m.id, name:m.name, thresholds:thresholdsHit.map(t=>t.threshold), rewardPointsTotalForModel:thresholdsHit.reduce((s,t)=>s+t.rewardPoints,0) });
    }

    const periodKey = await this.getCurrentPeriodKey();
    chrome.storage.local.set({ [this._dailyStatsKey]: { models: currentValues.models, points: currentValues.points, timestamp: Date.now(), owner: this._instanceId, periodKey } }, () => {
      this.log('getDailySummary: updated dailyStats ts=', new Date().toISOString(), 'modelsCount=', Object.keys(currentValues.models || {}).length, 'owner=', this._instanceId, 'periodKey', periodKey);
    });
    chrome.storage.local.set({ [this._dailyRunningRewardKey]: 0, [this._dailyRunningRewardDayKey]: periodKey, [this._lastSuccessfulKey]: { state:'SENT', owner:this._instanceId, sentAt:Date.now(), periodKey, snapshot:{ models: currentValues.models, points: currentValues.points, timestamp: Date.now() }, rewardPointsTotal:0 } });

    return { dailyDownloads, dailyPrints, points: currentValues.points, pointsGained: currentValues.points - previousDay.points, top5Downloads, top5Prints, rewardsEarned, rewardPointsTotal, from: new Date(previousDay.timestamp).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), to: new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) };
  }

  // schedule daily report with locking/claiming
  scheduleDailyNotification() {
    if (this._dailyTimerId) { clearTimeout(this._dailyTimerId); this._dailyTimerId = null; }
    chrome.storage.sync.get(['dailyReport','dailyNotificationTime'], (config) => {
      const dailyReport = config.dailyReport || 'yes';
      if (dailyReport === 'no') { this.log('Daily report disabled'); return; }
      const dailyTime = config.dailyNotificationTime || '23:30';
      const [hour, minute] = dailyTime.split(':').map(Number);
      const now = new Date(); const nextNotification = new Date(); nextNotification.setHours(hour, minute, 0, 0); if (nextNotification <= now) nextNotification.setDate(nextNotification.getDate()+1);
      const jitter = Math.floor((Math.random()*2 -1) * this._dailyScheduleJitterMs);
      const delay = Math.max(0, nextNotification - now + jitter);
      this.log(Daily report scheduled for: ${new Date(Date.now()+delay)}. Delay: ${delay}ms; jitterMs=${jitter});
      this._dailyTimerId = setTimeout(async () => {
        const startTime = Date.now(); this.log(scheduleDailyNotification: firing attempt at ${new Date().toISOString()});
        const claimantKey = this._lastSuccessfulKey; let clearPending=false, wrotePending=false, periodKey=null;
        const gotLock = await this.acquireDailyLock();
        if (!gotLock) { this.log('scheduleDailyNotification: could not acquire lock, another instance likely running. Aborting this attempt.'); this.scheduleDailyNotification(); return; }
        try {
          const latestAfterLock = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null)));
          if (latestAfterLock && latestAfterLock.timestamp >= startTime) { this.log('scheduleDailyNotification: dailyStats updated by another instance after lock; aborting this send.'); return; }
          const nowMs = Date.now(); periodKey = await this.getCurrentPeriodKey();
          const claimResult = await new Promise(res => {
            chrome.storage.local.get([claimantKey], r => {
              const existing = r?.[claimantKey] || null;
              if (existing && existing.state === 'SENT' && existing.periodKey === periodKey) { res({ ok:false, reason:'already-sent', existing }); return; }
              const PENDING_STALE_MS = 5 * 60 * 1000;
              if (existing && existing.state === 'PENDING' && (nowMs - (existing.claimAt || 0)) < PENDING_STALE_MS && existing.periodKey === periodKey) { res({ ok:false, reason:'pending-claim', existing }); return; }
              const claim = { state:'PENDING', owner:this._instanceId, claimAt: nowMs, periodKey };
              chrome.storage.local.set({ [claimantKey]: claim }, () => { chrome.storage.local.get([claimantKey], v => { const confirmed = v?.[claimantKey]?.owner === this._instanceId && v[claimantKey].state === 'PENDING' && v[claimantKey].periodKey === periodKey; res({ ok:confirmed, claim }); }); });
            });
          });
          if (!claimResult.ok) { this.log('scheduleDailyNotification: aborting send due to claim failure', claimResult.reason, claimResult.existing); return; }
          wrotePending = true;
          const okToSend = await this.preSendCheckAndMaybeWait(startTime);
          if (!okToSend) { this.log('scheduleDailyNotification: preSendCheck indicates newer snapshot; aborting this send.'); clearPending = true; return; }
          this.log(Sending daily report: ${new Date()});
          const summary = await this.getDailySummary();
          if (summary) {
            let rewardsSection = 'No rewards earned in the prior 24 hours';
            if (summary.rewardsEarned?.length) rewardsSection = summary.rewardsEarned.map(r => ${r.name}: +${r.rewardPointsTotalForModel} points (thresholds: ${r.thresholds.join(', ')})).join('\n');
            const totalEquivalent = summary.dailyDownloads + (summary.dailyPrints * 2);
            const topDownloadsList = summary.top5Downloads.length ? summary.top5Downloads.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.downloadsGained}).join('\n') : 'No new downloads today';
            const topPrintsList = summary.top5Prints.length ? summary.top5Prints.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.printsGained}).join('\n') : 'No new prints today';
            const message = 
📊 24-Hour Summary (${summary.from} - ${summary.to}):

Total Download points: ${totalEquivalent}

🏆 Today's Most Downloaded:
${topDownloadsList}

🖨️ Today's Most Printed:
${topPrintsList}

🎁 Rewards earned in last 24 hours:
${rewardsSection}
Total Reward Points: ${summary.rewardPointsTotal}
.trim();
            const sent = await this.sendTelegramMessage(message);
            if (sent) {
              const sentAt = Date.now();
              const runningRewardPoints = await new Promise(res => chrome.storage.local.get([this._dailyRunningRewardKey], r => res(r?.[this._dailyRunningRewardKey] || 0)));
              const finalRecord = { state:'SENT', owner:this._instanceId, sentAt, periodKey, snapshot:{ models: summary.top5Downloads.concat(summary.top5Prints).reduce((acc,m)=>{acc[m.id]=m;return acc;},{}), points: summary.points, timestamp: Date.now() }, rewardPointsTotal: runningRewardPoints };
              await new Promise(resolve => chrome.storage.local.set({ [this._lastSuccessfulKey]: finalRecord }, () => { this.log('scheduleDailyNotification: wrote lastSuccessfulDailyReport SENT by', this._instanceId, 'sentAt=', new Date(sentAt).toISOString(), 'periodKey=', periodKey); resolve(); }));
              try { chrome.storage.local.set({ [this._dailyRunningRewardKey]:0, [this._dailyRunningRewardDayKey]: periodKey }, () => { this.log('scheduleDailyNotification: reset running reward counter for period', { periodKey }); }); } catch (err) { this.error('Error resetting running reward counter for period', err); }
            } else clearPending = true;
          } else clearPending = true;
        } finally {
          try {
            if (clearPending && claimantKey) {
              chrome.storage.local.get([claimantKey], r => {
                const existing = r?.[claimantKey] || null;
                if (existing && existing.state === 'PENDING' && existing.owner === this._instanceId) chrome.storage.local.remove([claimantKey], () => { this.log('scheduleDailyNotification: cleared PENDING claim during cleanup'); });
                else this.log('scheduleDailyNotification: skip clearing PENDING (not owner or not pending)', { existing });
              });
            }
          } finally {
            await this.releaseDailyLock();
            this.scheduleDailyNotification();
          }
        }
      }, delay);
    });
  }

  // main periodic check (per-model messages or summary)
  async checkAndNotify() {
    if (this.isChecking) { this.log('Check already in progress, skipping...'); return; }
    this.log(checkAndNotify start — ${ITERATION}); this.isChecking = true;
    try {
      this.log('Starting change check...');
      let anyNotification = false;
      const currentValues = this.getCurrentValues();
      if (!currentValues) { this.log('No current values found'); await this.savePreviousValues({}); return; }
      if (!this.previousValues) await this.loadPreviousValues();
      if (!this.previousValues) { this.log('First run or no previous values, saving initial values'); this.previousValues = currentValues; await this.savePreviousValues(currentValues); return; }
      if (this.previousValues && !this.previousValues.models) { this.previousValues.models = {}; await this.savePreviousValues(this.previousValues); }
      if (currentValues.points > (this.previousValues.points || 0)) this.log('Global account points increased, ignoring for per-model-only Telegram notifications.');

      const modelsActivity = []; let modelUpdateCount = 0;
      for (const [id, current] of Object.entries(currentValues.models)) {
        const previous = this.previousValues.models[id];
        if (!previous) continue;
        const previousDownloadsRaw = Number(previous.downloads) || 0, previousPrints = Number(previous.prints) || 0, previousBoosts = Number(previous.boosts) || 0;
        const previousDownloadsTotal = this.calculateDownloadsEquivalent(previousDownloadsRaw, previousPrints);
        const currentDownloadsRaw = Number(current.downloads) || 0, currentPrints = Number(current.prints) || 0, currentBoosts = Number(current.boosts) || 0;
        const currentDownloadsTotal = this.calculateDownloadsEquivalent(currentDownloadsRaw, currentPrints);
        const downloadsDeltaRaw = currentDownloadsRaw - previousDownloadsRaw, printsDelta = currentPrints - previousPrints, boostsDelta = currentBoosts - previousBoosts;
        const downloadsDeltaEquivalent = downloadsDeltaRaw + (printsDelta * 2);
        const hasActivity = (downloadsDeltaRaw !== 0) || (printsDelta !== 0) || (boostsDelta > 0);
        if (hasActivity) modelUpdateCount++;
        const modelSummary = { id, name: current.name, imageUrl: current.imageUrl, downloadsDeltaRaw, printsDelta, boostsDelta, previousDownloadsTotal, currentDownloadsTotal, downloadsDeltaEquivalent, rewards: [] };

        if (currentDownloadsTotal > previousDownloadsTotal) {
          let cursor = previousDownloadsTotal, maxRewardsToReport = 50, rewardsFound = 0;
          while (cursor < currentDownloadsTotal && rewardsFound < maxRewardsToReport) {
            const interval = this.getRewardInterval(cursor), mod = cursor % interval;
            const nextThreshold = (cursor === 0 || mod === 0) ? cursor + interval : cursor + (interval - mod);
            this.log(REWARD-LOOP ${current.name} cursor=${cursor} interval=${interval} nextThreshold=${nextThreshold} currDownloads=${currentDownloadsTotal});
            if (nextThreshold <= currentDownloadsTotal) { const rewardPoints = this.getRewardPointsForDownloads(nextThreshold)*1.25; modelSummary.rewards.push({ thresholdDownloads: nextThreshold, points: rewardPoints }); cursor = nextThreshold; rewardsFound++; } else break;
          }
          if (rewardsFound >= maxRewardsToReport) this.log(Many rewards earned for ${current.name}. Listed first ${maxRewardsToReport} in summary.);
        }

        const boostOnly = (boostsDelta > 0) && (downloadsDeltaRaw === 0 && printsDelta === 0 && modelSummary.rewards.length === 0);
        if (!this.notifySummaryMode) {
          if (boostOnly) {
            const lines = [];
            lines.push(⚡ Boost Update for: ${current.name}, '', ⚡ Boosts: +${boostsDelta} (now ${currentBoosts}));
            const message = lines.join('\n');
            this.log('MESSAGE-BRANCH', { iteration: ITERATION, name: current.name, branch: 'boost-only', downloadsDeltaEquivalent, boostsDelta, rewardsFound: modelSummary.rewards.length });
            this.log(Sending boost-only message for ${current.name});
            const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
            anyNotification = true; continue;
          }

          const hasActivity2 = (downloadsDeltaRaw !== 0) || (printsDelta !== 0) || (modelSummary.rewards.length > 0) || (boostsDelta > 0);
          if (hasActivity2) {
            this.log('MESSAGE-BRANCH', { iteration: ITERATION, name: current.name, branch: 'milestone', downloadsDeltaEquivalent, boostsDelta, rewardsFound: modelSummary.rewards.length });
            const lines = []; const equivalentTotal = currentDownloadsTotal;
            lines.push(📦 Update for: ${current.name}, '', ${downloadsDeltaEquivalent > 0 ? '+' : ''}${downloadsDeltaEquivalent} Downloads (total ${equivalentTotal}), '');
			lines.push(⬇️ Downloads: ${currentDownloadsRaw} (${downloadsDeltaRaw > 0 ? '+' : ''}${downloadsDeltaRaw}));
            lines.push(🖨️ Prints: ${currentPrints} (${printsDelta > 0 ? '+' : ''}${printsDelta}));
            if (modelSummary.rewards.length > 0) { modelSummary.rewards.forEach(r => lines.push(🎁 Reward Earned! +${r.points} points at ${r.thresholdDownloads} downloads)); lines.push(''); }
            const nextThresholdAfterCurrent = this.nextRewardDownloads(equivalentTotal);
            const downloadsUntilNext = Math.max(0, nextThresholdAfterCurrent - equivalentTotal);
            lines.push(🎯 Next Reward: ${downloadsUntilNext} more downloads (${nextThresholdAfterCurrent} total), '', 🔁 Reward Interval: every ${this.getRewardInterval(equivalentTotal)} downloads);
            if (boostsDelta > 0) lines.push('', ⚡ Boosts: +${boostsDelta} (now ${currentBoosts}));
            let warning = '';
            if (Math.abs(downloadsDeltaRaw) > this._suspiciousDeltaLimit || Math.abs(printsDelta) > this._suspiciousDeltaLimit) {
              warning = "\n\n⚠️ The number of downloads or prints during this period is very high. This could be because your model is very popular (good job!). Or it could be an error. You may want to shorten the refresh interval.";
            }
            const message = lines.join('\n') + warning;
            this.log(Sending milestone message for ${current.name});
            const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
            if (sent && modelSummary.rewards.length > 0) { const pts = modelSummary.rewards.reduce((s,r)=>s+r.points,0); await this._accumulateDailyRewardPoints(pts); }
            anyNotification = true;
          }
        } else {
          const hasActivity3 = (downloadsDeltaRaw !== 0) || (printsDelta !== 0) || (modelSummary.rewards.length > 0) || (boostsDelta > 0);
          if (hasActivity3) modelsActivity.push({
            id,
            name: current.name,
            downloadsDeltaEquivalent,
            currentDownloadsTotal,
            rewardPointsForThisModel: modelSummary.rewards.reduce((s,r)=>s+r.points,0),
            boostsDelta,
            // 👉 Ajout minimal pour le rendu
            currentDownloadsRaw,
            currentPrints,
            downloadsDeltaRaw,
            printsDelta
          });
        }
      }

      // dynamic summary mode switch
      let forceSummaryMode = false;
      const SUMMARY_MODE_THRESHOLD = 15;
      if (!this.notifySummaryMode && modelUpdateCount >= SUMMARY_MODE_THRESHOLD) { forceSummaryMode = true; this.log(Switching to summary mode for this check due to ${modelUpdateCount} updates.); }
      const useSummaryMode = this.notifySummaryMode || forceSummaryMode;

      if (useSummaryMode) {
        if (forceSummaryMode) await this.sendTelegramMessage("Switching to summary mode due to the high number of updates this period. This ensures Telegram limits are not reached.");
        if (modelsActivity.length === 0) {
          await this.sendTelegramMessage("No new prints or downloads found."); anyNotification = true;
          const prevString = JSON.stringify(this.previousValues||{}), currString = JSON.stringify(currentValues||{});
          if (prevString !== currString) { this.previousValues = currentValues; await this.savePreviousValues(currentValues); }
          this.isChecking = false; return;
        }

        const totalEquivalent = modelsActivity.reduce((s,m)=>s + (m.downloadsDeltaEquivalent||0),0);
        const rewardPointsThisRun = modelsActivity.reduce((s,m)=>s + (m.rewardPointsForThisModel||0),0);
        await this._accumulateDailyRewardPoints(rewardPointsThisRun);

        const persisted = await new Promise(res => chrome.storage.local.get([this._dailyRunningRewardKey, this._dailyRunningRewardDayKey, this._dailyStatsKey, this._lastSuccessfulKey], r => res(r)));
        let running = Number.isFinite(persisted?.[this._dailyRunningRewardKey]) ? persisted[this._dailyRunningRewardKey] : 0;
        const runningDay = persisted?.[this._dailyRunningRewardDayKey] || null;
        const lastDaily = persisted?.[this._lastSuccessfulKey] || null;
        const lastDailyPoints = Number.isFinite(lastDaily?.rewardPointsTotal) ? lastDaily.rewardPointsTotal : 0;
        const currentPeriod = await this.getCurrentPeriodKey();

        if (!running || runningDay !== currentPeriod) {
          this.log('Periodic summary: running counter missing or mismatched; computing fallback via getDailySummary');
          try {
            const computed = await this.getDailySummary();
            if (computed && Number.isFinite(computed.rewardPointsTotal)) {
              running = computed.rewardPointsTotal;
              try { chrome.storage.local.set({ [this._dailyRunningRewardKey]: running, [this._dailyRunningRewardDayKey]: currentPeriod }, () => { this.log('Periodic summary: persisted computed running counter', { running, period: currentPeriod }); }); } catch (err) { this.warn('Periodic summary: failed to persist computed running counter', err); }
            } else this.warn('Periodic summary: computed fallback missing rewardPointsTotal; leaving persisted running as-is', { running, runningDay });
          } catch (err) { this.warn('Periodic summary: fallback computation failed', err); }
        }

        let rewardsToday = running - lastDailyPoints; if (rewardsToday < 0) rewardsToday = running;
        const fromTs = new Date(this.previousValues.timestamp).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), toTs = new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });
        const headerLines = [📊 Summary (${fromTs} - ${toTs}):, '', Download points this period: ${totalEquivalent} , '', 'Model updates:', ''];
        const maxModelsInMessage = 200;
        const list = modelsActivity.slice(0, maxModelsInMessage);
        const modelLines=[]; let anyLargeDelta=false;
        list.forEach((m,i) => {
          const downloadsDelta = m.downloadsDeltaEquivalent || 0, total = m.currentDownloadsTotal || 0, interval = m.rewardInterval || this.getRewardInterval(total), nextThreshold = this.nextRewardDownloads(total), remaining = Math.max(0, nextThreshold - total), ptsEarned = m.rewardPointsForThisModel || 0;
           let line = ${i+1}. <b>${escapeHtml(m.name)}</b>: +${downloadsDelta} (total ${total});
          // 👉 Ajout minimal : détails réels
          const dl = m.currentDownloadsRaw || 0;
          const pr = m.currentPrints || 0;
          const dld = m.downloadsDeltaRaw || 0;
          const prd = m.printsDelta || 0;
          line +=  — DL: ${dl} (${dld >= 0 ? '+' : ''}${dld}), PR: ${pr} (${prd >= 0 ? '+' : ''}${prd}); 
		  if (ptsEarned>0) line +=   🎉 +${ptsEarned} pts; line +=  (needs ${remaining} for next 🎁, interval ${interval});
          if (Math.abs(downloadsDelta) > this._suspiciousDeltaLimit) { line += \n⚠️ The number of downloads during this period is very high. This could be because your model is very popular (good job!). Or it could be an error. You may want to shorten the refresh interval.; anyLargeDelta=true; }
          if ((m.boostsDelta || 0) > 0) {
            line += 
⚡ Boosts: +${m.boostsDelta};
          }

          modelLines.push(line);
        });
        const spacedModels = modelLines.join('\n\n');
		// Count models within 2 downloads (downloads + 2×prints) of next reward across all models on the page
		let closeToGiftCount = 0;
		const allModels = Object.values(currentValues?.models || {});
		for (const cm of allModels) {
		  const downloads = Number(cm.downloads || 0);
		  const prints = Number(cm.prints || 0);
		  const total = this.calculateDownloadsEquivalent(downloads, prints); // downloads + 2*prints
		  const next = this.nextRewardDownloads(total);
		  const remaining = Math.max(0, next - total);
		  if (remaining <= 2) closeToGiftCount++;
		}
		const footerLines = [
		  '',
		  Rewards this period: ${rewardPointsThisRun} pts,
		  Rewards today: ${rewardsToday} pts,
		  Models close to 🎁: ${closeToGiftCount}
		];

        const message = headerLines.join('\n') + '\n' + spacedModels + '\n' + footerLines.join('\n');
        this.log('Aggregated summary message length:', message.length);
        const sent = await this.sendTelegramMessage(message); if (sent) anyNotification = true;
      } else {
        // per-model logic already executed inside loop
      }

      const prevString = JSON.stringify(this.previousValues || {}), currString = JSON.stringify(currentValues || {});
      if (prevString !== currString) { this.previousValues = currentValues; await this.savePreviousValues(currentValues); } else this.log('No changes detected, skipping savePreviousValues to reduce storage writes.');
      if (!anyNotification && !useSummaryMode) { const heartbeatMsg = 'No new prints or downloads found.'; this.log(heartbeatMsg); await this.sendTelegramMessage(heartbeatMsg); }
    } catch (err) { this.error('Error during check:', err); }
    finally { this.isChecking = false; }
  }

  // accumulate running points with lock and retries
  async _accumulateDailyRewardPoints(pointsToAdd, attempt = 1) {
    if (!Number.isFinite(pointsToAdd) || pointsToAdd <= 0) return;
    const MAX_ATTEMPTS = 3, BASE_DELAY_MS = 300, MAX_BACKOFF_MS = 3000, lockTimeoutMs = 1500;
    while (attempt <= MAX_ATTEMPTS) {
      const lockAcquired = await this.acquireDailyLock(lockTimeoutMs);
      if (!lockAcquired) {
        if (attempt >= MAX_ATTEMPTS) { this.warn(_accumulateDailyRewardPoints: lock not acquired after ${MAX_ATTEMPTS} attempts; skipping this accumulation.); return; }
        const backoff = Math.min(MAX_BACKOFF_MS, BASE_DELAY_MS * Math.pow(2, attempt-1));
        const jitter = Math.floor(Math.random() * Math.min(500, Math.floor(backoff/2)));
        const delay = backoff + jitter; this.log(_accumulateDailyRewardPoints: lock not acquired (attempt ${attempt}). Waiting ${delay}ms then retrying.); await new Promise(r=>setTimeout(r, delay)); attempt++; continue;
      }

      try {
        const periodKey = await this.getCurrentPeriodKey();
        const local = await new Promise(res => chrome.storage.local.get([this._dailyRunningRewardKey, this._dailyRunningRewardDayKey], r => res(r)));
        let running = (local && local[this._dailyRunningRewardKey]) ? local[this._dailyRunningRewardKey] : 0;
        const runningDay = (local && local[this._dailyRunningRewardDayKey]) ? local[this._dailyRunningRewardDayKey] : null;
        this.log('_accumulateDailyRewardPoints read', { running, runningDay, periodKey, pointsToAdd, attempt });

        if (runningDay && runningDay !== periodKey) {
          const runningDayTs = new Date(runningDay).getTime(), periodKeyTs = new Date(periodKey).getTime();
          if (Number.isFinite(runningDayTs) && Number.isFinite(periodKeyTs)) {
            if (runningDayTs > periodKeyTs) { this.log('_accumulateDailyRewardPoints: stored runningDay is in the future; resetting running to 0 and continuing', { runningDay, periodKey }); running = 0; }
            else { this.warn('_accumulateDailyRewardPoints: stored runningDay older than current period; aborting to avoid joining wrong window', { runningDay, periodKey }); return; }
          } else { this.log('_accumulateDailyRewardPoints: could not parse runningDay/periodKey; resetting running to 0 and continuing', { runningDay, periodKey }); running = 0; }
        }
        if (!runningDay) { this.log('_accumulateDailyRewardPoints resetting running counter for new period', { oldDay: runningDay, newPeriod: periodKey }); running = 0; }
        running += pointsToAdd;
        await new Promise(resolve => {
          chrome.storage.local.set({ [this._dailyRunningRewardKey]: running, [this._dailyRunningRewardDayKey]: periodKey }, (err) => {
            if (chrome.runtime.lastError || err) this.warn('Storage set failed (quota or other error):', chrome.runtime.lastError || err);
            else this.log(_accumulateDailyRewardPoints: added ${pointsToAdd}, running=${running}, period=${periodKey});
            resolve();
          });
        });
        return;
      } finally { await this.releaseDailyLock(); }
    }
  }

  // previousValues persistence
  async loadPreviousValues(){ return new Promise(resolve => chrome.storage.local.get(['previousValues'], result => { if (result?.previousValues) { this.log('Previous values loaded:', result.previousValues); this.previousValues = result.previousValues; } resolve(); })); }
  async savePreviousValues(values){ return new Promise(resolve => chrome.storage.local.set({ previousValues: values }, () => { this.log('Values saved to storage'); resolve(); })); }

  // lifecycle
  async start() {
    this.log('Starting monitor...');
    if (this.checkInterval) { this.log('Monitor already running, skipping duplicate start.'); return; }
    chrome.storage.sync.get(['telegramToken','chatId','refreshInterval','dailyReport','dailyNotificationTime','notifySummaryMode'], async (config) => {
      if (!config || !config.telegramToken || !config.chatId) { this.error('Missing Telegram configuration'); return; }
      this.telegramToken = config.telegramToken; this.chatId = config.chatId; this.notifySummaryMode = !!config.notifySummaryMode;
      const refreshInterval = config.refreshInterval || 900000;
      this.log(Configured refresh interval: ${refreshInterval}ms); this.log(Notify summary mode: ${this.notifySummaryMode});
      let intervalToUse = refreshInterval; const ONE_HOUR = 60*60*1000; const COMPENSATION_MS = 60*1000;
      if (refreshInterval > ONE_HOUR) { intervalToUse = Math.max(0, refreshInterval - COMPENSATION_MS); this.log(Interval adjusted for overhead: using ${intervalToUse}ms instead of configured ${refreshInterval}ms); }
      else this.log(Interval not adjusted (configured <= 1 hour): using ${intervalToUse}ms);
      await autoScrollToFullBottom();
      await this.loadPreviousValues();
      await this.checkAndNotify();
      if (this.checkInterval) { clearInterval(this.checkInterval); this.checkInterval = null; }
      const STORAGE_KEY = 'monitorNextScheduledTime';
      let nextScheduled = Number(sessionStorage.getItem(STORAGE_KEY));

      if (!nextScheduled) {
        nextScheduled = Date.now() + intervalToUse;
        this.log('Initializing schedule. First run at:', new Date(nextScheduled).toLocaleString());
        sessionStorage.setItem(STORAGE_KEY, nextScheduled);
      }

      const scheduleNext = () => {
        const now = Date.now();

        if (now > nextScheduled) {
          this.warn(Missed scheduled time by ${Math.round((now - nextScheduled)/1000)}s. Running now.);
          while (nextScheduled < now) {
            nextScheduled += intervalToUse;
          }
          sessionStorage.setItem(STORAGE_KEY, nextScheduled);
        }

        const delay = Math.max(0, nextScheduled - now);
        this.log(Next check scheduled for ${new Date(nextScheduled).toLocaleString()} (in ${Math.round(delay/1000)}s));

        this.checkInterval = setTimeout(async () => {
          try {
            this.log('Scrolling before refresh...');
            await autoScrollToFullBottom();
            this.log('Refreshing page...');
          } catch (err) {
            this.error('Error during pre-refresh tasks:', err);
          }

          const newNextScheduled = nextScheduled + intervalToUse;
          sessionStorage.setItem(STORAGE_KEY, newNextScheduled);

          try { scheduleNext(); } catch (e) { this.error('Failed to schedule next run:', e); }
          try { window.location.reload(); } catch (e) { this.error('Reload failed:', e); }
        }, delay);
      };

      scheduleNext();
      if (config.dailyReport !== 'no') this.scheduleDailyNotification();
	  this.scheduleInterimNotifications();
      this.log(Monitor started, refresh every ${intervalToUse/60000} minutes (configured ${refreshInterval/60000} minutes));
    });
  }

  stop() {
    if (this.checkInterval) { clearInterval(this.checkInterval); this.checkInterval = null; }
    if (this._dailyTimerId) { clearTimeout(this._dailyTimerId); this._dailyTimerId = null; }
    this.isChecking = false;
    this.log('Monitor stopped');
  }

  async restart() {
    this.log('Restarting monitor on request...');
    this.stop();
    await autoScrollToFullBottom();
    await this.checkAndNotify();
    this.start();
  }

  // interim summary (manual request)
  async handleInterimSummaryRequest() {
    this.log('Interim summary requested');
    const currentValues = this.getCurrentValues();
    if (!currentValues) { this.error('Interim summary aborted: could not extract current values'); throw new Error('No current values'); }
    const baseline = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null)));
    if (!baseline) { this.error('Interim summary aborted: no baseline dailyStats found'); throw new Error('No baseline dailyStats found'); }

    const previousDay = baseline;
    const modelChanges = {};
    for (const [id, current] of Object.entries(currentValues.models)) {
      let previous = previousDay?.models?.[id] || null;
      if (!previous && current.permalink) previous = Object.values(previousDay.models || {}).find(m => m && m.permalink === current.permalink) || null;
      if (!previous && current.name) previous = Object.values(previousDay.models || {}).find(m => m?.name?.trim().toLowerCase() === current.name.trim().toLowerCase()) || null;
      if (!previous) { this.log('New model found (interim):', current.name); continue; }
      const downloadsGained = Math.max(0, (Number(current.downloads) || 0) - (Number(previous.downloads) || 0));
      const printsGained = Math.max(0, (Number(current.prints) || 0) - (Number(previous.prints) || 0));
      if (downloadsGained > 0 || printsGained > 0) modelChanges[id] = { id, name: current.name, downloadsGained, printsGained, previousDownloads: previous.downloads || 0, previousPrints: previous.prints || 0, currentDownloads: current.downloads || 0, currentPrints: current.prints || 0, imageUrl: current.imageUrl || '' };
    }

    const dailyDownloads = Object.values(modelChanges).reduce((s,m)=>s+m.downloadsGained,0);
    const dailyPrints = Object.values(modelChanges).reduce((s,m)=>s+m.printsGained,0);
    const top5Downloads = Object.values(modelChanges).filter(m=>m.downloadsGained>0).sort((a,b)=>b.downloadsGained-a.downloadsGained).slice(0,5);
    const top5Prints = Object.values(modelChanges).filter(m=>m.printsGained>0).sort((a,b)=>b.printsGained-a.printsGained).slice(0,5);

    let rewardsEarned = [], rewardPointsTotal = 0;
    for (const m of Object.values(modelChanges)) {
      const prevTotal = this.calculateDownloadsEquivalent(m.previousDownloads, m.previousPrints);
      const currTotal = this.calculateDownloadsEquivalent(m.currentDownloads, m.currentPrints);
      let cursor = prevTotal; const thresholdsHit=[]; const maxThresholdsPerModel=50; let count=0;
      while (cursor < currTotal && count < maxThresholdsPerModel) {
        const interval = this.getRewardInterval(cursor), mod = cursor % interval;
        const nextThreshold = (cursor===0 || mod===0) ? cursor+interval : cursor+(interval-mod);
        if (nextThreshold <= currTotal) { const pts = this.getRewardPointsForDownloads(nextThreshold)*1.25; thresholdsHit.push({ threshold: nextThreshold, points: pts }); rewardPointsTotal += pts; cursor = nextThreshold; count++; } else break;
      }
      if (thresholdsHit.length) rewardsEarned.push({ id:m.id, name:m.name, thresholds:thresholdsHit.map(t=>t.threshold), rewardPointsTotalForModel:thresholdsHit.reduce((s,t)=>s+t.points,0) });
    }

    const totalEquivalent = dailyDownloads + (dailyPrints * 2);
    const topDownloadsList = top5Downloads.length ? top5Downloads.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.downloadsGained}).join('\n') : 'No new downloads so far';
    const topPrintsList = top5Prints.length ? top5Prints.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.printsGained}).join('\n') : 'No new prints so far';
    const fromTs = new Date(previousDay.timestamp).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), toTs = new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const message = 
🔔 Interim Summary (${fromTs} - ${toTs}):

Total Download points: ${totalEquivalent}

🏆 Top Downloads:
${topDownloadsList}

🖨️ Top Prints:
${topPrintsList}

🎁 Rewards earned so far:
${rewardsEarned.length > 0 ? rewardsEarned.map(r => ${r.name}: +${r.rewardPointsTotalForModel} points (thresholds: ${r.thresholds.join(', ')})).join('\n') : 'No rewards earned so far'}
.trim();
    this.log('Interim message:', message);
    const sent = await this.sendTelegramMessage(message);
    if (!sent) { this.error('Interim summary: failed to send via Telegram'); throw new Error('Telegram send failed'); }
    this.log('Interim summary: sent successfully');
    return true;
  }
}

// Startup
this.log = console.log.bind(console);
this.warn = console.warn.bind(console);
this.error = console.error.bind(console);

console.log('Initializing monitor...');
const monitor = new ValueMonitor();
monitor.start();

// Listen for popup messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'INTERIM_SUMMARY_REQUEST') {
    monitor.handleInterimSummaryRequest().then(()=>sendResponse({ok:true})).catch(err=>{ console.error('interim summary error', err); sendResponse({ok:false, error: err?.message}); });
    return true;
  }
  if (msg?.type === 'REFRESH_INTERVAL_UPDATED') {
    monitor.restart().then(()=>sendResponse({ok:true})).catch(err=>{ console.error('restart error', err); sendResponse({ok:false, error: err?.message}); });
    return true;
  }
  if (msg?.type === 'CONFIG_SAVED') {
    chrome.storage.sync.get(['notifySummaryMode'], cfg => { monitor.notifySummaryMode = !!(cfg?.notifySummaryMode); monitor.log('CONFIG_SAVED received. notifySummaryMode =', monitor.notifySummaryMode); monitor.restart().then(()=>sendResponse({ok:true})).catch(err=>sendResponse({ok:false, error: err?.message})); });
    return true;
  }
    if (msg?.type === 'DUMP_MODELS') {
    monitor.sendModelsSnapshot()
      .then(()=>sendResponse({ok:true}))
      .catch(err => { console.error('dump models error', err); sendResponse({ok:false, error: err?.message}); });
    return true;
  }

});



tu vois ici on a une notif interim qui intervient plusieurs fois par jour a des horaires précises

tu peux me dire ce que contient cette notif
ChatGPT a dit :

Réflexion durant 12s
Yes—cette “interim” est un récap express envoyé plusieurs fois par jour. Son contenu est construit dans handleInterimSummaryRequest() et ressemble à ceci :

🔔 Interim Summary (MM/DD/YYYY, HH:MM - MM/DD/YYYY, HH:MM):

Total Download points: <downloads + 2×prints sur la période>

🏆 Top Downloads:
1. <b>Nom modèle A</b>: +<downloads gagnés>
2. <b>Nom modèle B</b>: +<downloads gagnés>
... (jusqu’à 5)

🖨️ Top Prints:
1. <b>Nom modèle X</b>: +<prints gagnés>
2. <b>Nom modèle Y</b>: +<prints gagnés>
... (jusqu’à 5)

🎁 Rewards earned so far:
Nom modèle …: +<points> points (thresholds: <seuil1>, <seuil2>, …)
… ou “No rewards earned so far”
Détails importants :

La période affichée va du timestamp du snapshot “dailyStats” courant (previousDay.timestamp) jusqu’à “maintenant”.

“Total Download points” = dailyDownloads + 2*dailyPrints.

“Top Downloads” = top 5 modèles triés par downloads gagnés depuis le snapshot.

“Top Prints” = top 5 par prints gagnés.

La section “Rewards” liste, par modèle, les points cumulés et les seuils de “download points” franchis pendant la période.

Le message est envoyé en HTML (Telegram) avec <b>…</b> pour le gras ; si ntfy est activé, il est converti en Markdown avant envoi.

Vous avez dit :
alors oui normalement c'est ca c'est depuis le previousDay au moment de la notif

sauf que là aujourhdui je recois les notifs interim et a chaque fois elles sont depuis la dernière notifs normal (pas la daily)
ChatGPT a dit :
Tu as raison : ton “interim” repart souvent depuis… la dernière exécution “normale” (le check périodique), pas depuis le début de la journée. La cause est dans ce duo :

handleInterimSummaryRequest() lit le baseline dans chrome.storage.local.get([this._dailyStatsKey]).

Or getDailySummary() ré-écrit systématiquement this._dailyStatsKey (au tout début si absent, et aussi à la fin), et tu l’appelles ailleurs (ex. fallback en “summary mode” dans checkAndNotify). Donc, à chaque appel “normal” qui passe par getDailySummary(), ton baseline est rafraîchi → l’interim commence alors “depuis la dernière notif normale”.

Où ça bouge le baseline
Dans getDailySummary() :

quand pas de snapshot précédent → set(this._dailyStatsKey, {…current…})

à la fin → set(this._dailyStatsKey, {…current…})

Dans checkAndNotify() (summary mode), tu fais un fallback :

const computed = await this.getDailySummary();
→ ça met à jour _dailyStatsKey et décale le point de départ de l’interim.

Correctifs simples (au choix)
Option A — Rendre getDailySummary “non destructif” sur demande
Ajoute un flag persist=true et ne touche pas au storage quand persist=false.

async getDailySummary({ persist = true } = {}) {
  // … calculs inchangés …

  if (persist) {
    chrome.storage.local.set({ [this._dailyStatsKey]: { /* snapshot courant */ } });
    chrome.storage.local.set({ [this._dailyRunningRewardKey]: 0, [this._dailyRunningRewardDayKey]: periodKey, /* … */ });
  }

  return { /* résumé */ };
}
Puis, partout où tu appelles getDailySummary() pour juste “lire/calculer” (ex. fallback dans checkAndNotify), fais :

const computed = await this.getDailySummary({ persist: false });
Ainsi, l’interim restera basé sur le dernier snapshot “de début de journée” (ou le plus ancien du jour), et ne bougera plus à cause d’un check périodique.

Option B — Baseline dédié pour la journée
Garde _dailyStatsKey comme “snapshot courant”, mais crée une clé immuable par jour (ex. _dailyBaselineKey) fixée une seule fois (au premier run après l’heure de coupure, ou juste après l’envoi du daily). Les interims lisent uniquement ce baseline, jamais _dailyStatsKey.

À l’initialisation de période :

const baselineKey = this._dailyBaselineKey; // e.g. "dailyBaseline"
const existing = await get(baselineKey);
if (!existing || existing.periodKey !== currentPeriodKey) {
  set(baselineKey, { models: current.models, points: current.points, timestamp: Date.now(), periodKey: currentPeriodKey });
}
Dans handleInterimSummaryRequest() :

const previousDay = await get(this._dailyBaselineKey);
// fallback si absent: _lastSuccessfulKey.snapshot ou _dailyStatsKey
Bonus : tu peux aussi réutiliser this._lastSuccessfulKey.snapshot (écrit au daily) comme baseline du jour quand il existe — c’est exactement la “photo” de départ souhaitée.

Variante “patch rapide”
Sans tout refondre, tu peux déjà éviter que le fallback en “summary mode” décale l’interim :

- const computed = await this.getDailySummary();
+ const computed = await this.getDailySummary({ persist: false });
Et, si tu veux verrouiller l’interim sur le vrai début de journée sans gros chantier, lis d’abord :

const baseline = (await get(this._lastSuccessfulKey))?.snapshot
              || (await get(this._dailyStatsKey))  // fallback historique
Si tu veux, je te fais le diff complet prêt à coller (avec le flag persist + changement d’appel + lecture de baseline pour l’interim).

Vous avez dit :
la dernière version me plait bien
ChatGPT a dit :
Parfait — voilà le patch rapide “prêt à coller” qui fige le baseline de la journée (il ne sera plus réécrit par les calculs intermédiaires) :

1) Ajouter un flag persist à getDailySummary (et ne rien écrire si persist:false)
-  async getDailySummary() {
+  async getDailySummary({ persist = true } = {}) {
     const currentValues = this.getCurrentValues();
     if (!currentValues) { this.error('Unable to get current values'); return null; }
@@
-    if (!previousDay) {
+    if (!previousDay) {
       this.log('getDailySummary: No previous day data available or snapshot unusable. Writing current snapshot and returning empty summary.');
-      const periodKey = await this.getCurrentPeriodKey();
-      chrome.storage.local.set({ [this._dailyStatsKey]: { models: currentValues.models, points: currentValues.points, timestamp: Date.now(), owner: this._instanceId, periodKey } }, () => {
-        this.log('getDailySummary: stored dailyStats ts=', new Date().toISOString(), 'modelsCount=', Object.keys(currentValues.models || {}).length, 'owner=', this._instanceId, 'periodKey=', periodKey);
-      });
-      chrome.storage.local.set({ [this._dailyRunningRewardKey]: 0, [this._dailyRunningRewardDayKey]: periodKey, [this._lastSuccessfulKey]: { state:'SENT', owner:this._instanceId, sentAt:Date.now(), periodKey, snapshot:{ models: currentValues.models, points: currentValues.points, timestamp: Date.now() }, rewardPointsTotal:0 } });
+      const periodKey = await this.getCurrentPeriodKey();
+      if (persist) {
+        chrome.storage.local.set({ [this._dailyStatsKey]: { models: currentValues.models, points: currentValues.points, timestamp: Date.now(), owner: this._instanceId, periodKey } }, () => {
+          this.log('getDailySummary: stored dailyStats ts=', new Date().toISOString(), 'modelsCount=', Object.keys(currentValues.models || {}).length, 'owner=', this._instanceId, 'periodKey=', periodKey);
+        });
+        chrome.storage.local.set({ [this._dailyRunningRewardKey]: 0, [this._dailyRunningRewardDayKey]: periodKey, [this._lastSuccessfulKey]: { state:'SENT', owner:this._instanceId, sentAt:Date.now(), periodKey, snapshot:{ models: currentValues.models, points: currentValues.points, timestamp: Date.now() }, rewardPointsTotal:0 } });
+      }
       return { dailyDownloads:0, dailyPrints:0, points: currentValues.points, pointsGained:0, top5Downloads:[], top5Prints:[], rewardsEarned:[], rewardPointsTotal:0, from:new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), to:new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) };
     }
@@
-    const periodKey = await this.getCurrentPeriodKey();
-    chrome.storage.local.set({ [this._dailyStatsKey]: { models: currentValues.models, points: currentValues.points, timestamp: Date.now(), owner: this._instanceId, periodKey } }, () => {
-      this.log('getDailySummary: updated dailyStats ts=', new Date().toISOString(), 'modelsCount=', Object.keys(currentValues.models || {}).length, 'owner=', this._instanceId, 'periodKey', periodKey);
-    });
-    chrome.storage.local.set({ [this._dailyRunningRewardKey]: 0, [this._dailyRunningRewardDayKey]: periodKey, [this._lastSuccessfulKey]: { state:'SENT', owner:this._instanceId, sentAt:Date.now(), periodKey, snapshot:{ models: currentValues.models, points: currentValues.points, timestamp: Date.now() }, rewardPointsTotal:0 } });
+    const periodKey = await this.getCurrentPeriodKey();
+    if (persist) {
+      chrome.storage.local.set({ [this._dailyStatsKey]: { models: currentValues.models, points: currentValues.points, timestamp: Date.now(), owner: this._instanceId, periodKey } }, () => {
+        this.log('getDailySummary: updated dailyStats ts=', new Date().toISOString(), 'modelsCount=', Object.keys(currentValues.models || {}).length, 'owner=', this._instanceId, 'periodKey', periodKey);
+      });
+      chrome.storage.local.set({ [this._dailyRunningRewardKey]: 0, [this._dailyRunningRewardDayKey]: periodKey, [this._lastSuccessfulKey]: { state:'SENT', owner:this._instanceId, sentAt:Date.now(), periodKey, snapshot:{ models: currentValues.models, points: currentValues.points, timestamp: Date.now() }, rewardPointsTotal:0 } });
+    }
 
     return { dailyDownloads, dailyPrints, points: currentValues.points, pointsGained: currentValues.points - previousDay.points, top5Downloads, top5Prints, rewardsEarned, rewardPointsTotal, from: new Date(previousDay.timestamp).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), to: new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) };
   }
2) Ne pas toucher au baseline quand on calcule un fallback en “summary mode”
Dans checkAndNotify() (bloc Periodic summary: running counter missing or mismatched; computing fallback via getDailySummary), remplace l’appel :

- const computed = await this.getDailySummary();
+ const computed = await this.getDailySummary({ persist: false });
Il y a un appel à cet endroit précis (dans la branche if (!running || runningDay !== currentPeriod) { ... }). Assure-toi qu’il est bien modifié.

Ce que ça change concrètement
Les interim liront toujours le snapshot stocké dans _dailyStatsKey sans que les calculs intermédiaires viennent le réécrire.

Le baseline ne bougera donc plus au gré des checks “normaux” → tes interims repartent bien depuis le début de la période quotidienne, comme voulu.

Le daily reste inchangé : quand il tourne, il persiste le nouveau snapshot (c’est logique).

Si tu veux, je peux aussi te fournir une variante avec une clé baseline dédiée (immuable par jour) — mais avec ce patch, tu devrais déjà voir le comportement correct sans refonte.

Vous avez dit :
const baseline = (await get(this._lastSuccessfulKey))?.snapshot
              || (await get(this._dailyStatsKey))  // fallback historique

et ça on le fait pas ?
ChatGPT a dit :

Réflexion durant 27s
Bonne question. Tel quel, je ne te conseille pas d’utiliser _lastSuccessfulKey.snapshot comme baseline.
Dans ta version actuelle, quand le daily est envoyé, tu sauves dans _lastSuccessfulKey.snapshot… uniquement un sous-ensemble des modèles (top downloads/prints). Si on s’en sert de baseline, tes interims risquent d’ignorer des modèles.

Le plus propre est d’avoir un baseline dédié et complet pour la journée, immuable : _dailyBaselineKey.
Voici le patch minimal pour ça (en plus du flag persist qu’on a ajouté) :

1) Déclare une clé baseline dédiée (dans le constructor)
 class ValueMonitor {
   constructor() {
@@
     this._lastSuccessfulKey = 'lastSuccessfulDailyReport';
+    this._dailyBaselineKey = 'dailyBaselineSnapshot';
2) Quand on n’a pas encore de snapshot du jour (branche “no previousDay” dans getDailySummary), on persiste aussi le baseline du jour si persist === true
-    if (!previousDay) {
+    if (!previousDay) {
       this.log('getDailySummary: No previous day data available or snapshot unusable. Writing current snapshot and returning empty summary.');
       const periodKey = await this.getCurrentPeriodKey();
-      if (persist) {
+      if (persist) {
         chrome.storage.local.set({ [this._dailyStatsKey]: { models: currentValues.models, points: currentValues.points, timestamp: Date.now(), owner: this._instanceId, periodKey } }, () => {
           this.log('getDailySummary: stored dailyStats ts=', new Date().toISOString(), 'modelsCount=', Object.keys(currentValues.models || {}).length, 'owner=', this._instanceId, 'periodKey=', periodKey);
         });
+        // Baseline complet et immuable pour les interims du jour
+        chrome.storage.local.set({ [this._dailyBaselineKey]: { models: currentValues.models, points: currentValues.points, timestamp: Date.now(), owner: this._instanceId, periodKey } });
         chrome.storage.local.set({ [this._dailyRunningRewardKey]: 0, [this._dailyRunningRewardDayKey]: periodKey, [this._lastSuccessfulKey]: { state:'SENT', owner:this._instanceId, sentAt:Date.now(), periodKey, snapshot:{ models: currentValues.models, points: currentValues.points, timestamp: Date.now() }, rewardPointsTotal:0 } });
       }
       return { /* … */ };
     }
3) Les interims lisent uniquement ce baseline (avec fallback historique)
Dans handleInterimSummaryRequest() remplace la lecture du baseline :

- const baseline = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null)));
+ const baseline = await new Promise(res => chrome.storage.local.get([this._dailyBaselineKey, this._dailyStatsKey], r =>
+   res(r?.[this._dailyBaselineKey] || r?.[this._dailyStatsKey] || null)
+ ));
Résultat : tes interims repartent toujours du même point fixe de la journée (le vrai snapshot de départ), sans être “raccourcis” par d’autres calculs.
Et on évite _lastSuccessfulKey.snapshot qui peut être incomplet.

Si tu préfères absolument la forme que tu proposais, on peut l’utiliser à condition de garantir que _lastSuccessfulKey.snapshot contient bien tous les modèles (il faudrait alors modifier l’écriture dans scheduleDailyNotification pour ne plus tronquer à top5). Mais la voie “baseline dédiée” au-dessus est plus robuste et ne touche pas à la logique du daily.

Vous avez dit :
ok donc voila mon fichier maintenant


j'ai deux trois autres choses que je veux faire

const ITERATION = 'Iteration 20.4.1';
console.log(Initializing monitor — ${ITERATION});

const escapeHtml = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
// === ntfy (override minimal; no flow change) ===
// Reads chrome.storage.sync keys set by your popup (if any):
//   useNtfy (bool, optional), ntfyUrl (string), ntfyAuth (string, optional),
//   ntfyTags (string, optional), ntfyPriority (1..5, optional)
async function __sendNtfyWithCfg(cfg, { title, text, imageUrl, clickUrl, tags, priority }) {
  // 💓 1) Ignorer le heartbeat
  if (text && text.includes('No new prints or downloads found.')) {
    console.debug('[MakerStats] ntfy: heartbeat suppressed');
    return true;
  }
    // Convertit un message HTML "léger" (Telegram) en Markdown (ntfy)
  const htmlToMd = (s="") =>
    String(s)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<b>/gi, '**').replace(/<\/b>/gi, '**')
      .replace(/<strong>/gi, '**').replace(/<\/strong>/gi, '**')
      .replace(/<i>/gi, '*').replace(/<\/i>/gi, '*')
      .replace(/<em>/gi, '*').replace(/<\/em>/gi, '*')
      // retire toute autre balise HTML résiduelle
      .replace(/<\/?[^>]+>/g, '');

  // 💬 2) URL du serveur ntfy
  const url = (cfg && cfg.ntfyUrl) ? String(cfg.ntfyUrl).trim() : "";
  if (!url) {
    console.error("[MakerStats] ntfy: ntfyUrl missing");
    return false;
  }

  // 🧹 3) Nettoyage minimal (évite erreurs Chrome sur headers non ASCII)
  const asciiOnly = (s) => (s || "").replace(/[^\x00-\x7F]/g, "");
  const asciiOrEmpty = (s) => asciiOnly(String(s || "")).trim();

  // 🔢 4) Détermination de la priorité
  const prio = (cfg && Number.isFinite(cfg.ntfyPriority))
    ? cfg.ntfyPriority
    : (Number.isFinite(priority) ? priority : 3);

  // 🧩 5) Headers de base (ASCII only)
  const baseHeaders = {
    "Priority": String(prio),
  };
  if (cfg && cfg.ntfyAuth) baseHeaders["Authorization"] = asciiOrEmpty(cfg.ntfyAuth);
  if (cfg && cfg.ntfyTags) baseHeaders["Tags"] = asciiOrEmpty(cfg.ntfyTags);
  if (clickUrl) baseHeaders["Click"] = asciiOrEmpty(clickUrl);
  if (title) baseHeaders["Title"] = asciiOrEmpty(title);
  baseHeaders["Markdown"] = "yes";

  try {
    // === 🖼️ CAS IMAGE (prévisualisable) ===
    if (imageUrl) {
      const headers = {
        ...baseHeaders,
        "Content-Type": "text/plain",
        "Attach": asciiOrEmpty(encodeURI(imageUrl)), // ntfy va télécharger et afficher la preview
      };

      const res = await fetch(url, {
        method: "POST",
        headers,
        body:  htmlToMd(text || ""), // le message peut contenir accents/émojis
      });

      if (!res.ok) {
        const t = await res.text().catch(() => res.statusText);
        console.error("[MakerStats] ntfy POST (Attach) HTTP", res.status, t);
        return false;
      }

      console.debug("[MakerStats] ntfy POST (Attach) OK — image preview enabled");
      return true;
    }

    // === ✉️ CAS TEXTE SEUL ===
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...baseHeaders,
        "Content-Type": "text/plain"
      },
      body: htmlToMd(text || ""),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => res.statusText);
      console.error("[MakerStats] ntfy POST (text) HTTP", res.status, t);
      return false;
    }

    console.debug("[MakerStats] ntfy POST (text) OK");
    return true;

  } catch (e) {
    console.error("[MakerStats] ntfy send error:", e);
    return false;
  }
}




const autoScrollToFullBottom = ({ step = 600, delay = 250, settle = 800 } = {}) => new Promise(resolve => {
  let timer;
  const scrollAndCheck = () => {
    window.scrollBy(0, step);
    const currentHeight = document.body.scrollHeight;
    const atBottom = (window.innerHeight + window.scrollY) >= (currentHeight - 2);
    if (atBottom) {
      clearInterval(timer);
      setTimeout(() => {
        if (document.body.scrollHeight > currentHeight) timer = setInterval(scrollAndCheck, delay);
        else resolve();
      }, settle);
    }
  };
  timer = setInterval(scrollAndCheck, delay);
});

class ValueMonitor {
  constructor() {
    // config/state
    this.telegramToken = '';
    this.chatId = '';
    this.previousValues = null;
    this.checkInterval = null;
    this._dailyTimerId = null;
    this.isChecking = false;
    // identity/keys/timeouts
    this._instanceId = Math.random().toString(36).slice(2);
    this._dailyLockKey = 'dailyLock';
    this._dailyStatsKey = 'dailyStats';
    this._lastSuccessfulKey = 'lastSuccessfulDailyReport';
    this._dailyRunningRewardKey = 'dailyRunningRewardPoints';
    this._dailyRunningRewardDayKey = 'dailyRunningRewardDay';
    this._dailyLockTimeoutMs = 2 * 60 * 1000;
    this._dailyMaxPreSendRetries = 5;
    this._dailyPreSendBaseBackoffMs = 300;
    this._dailyScheduleJitterMs = 30 * 1000;
    this._defaultFallbackHours = 48;
    this.notifySummaryMode = false;
    this._telegramMaxMessageChars = 4000;
    this._suspiciousDeltaLimit = 200;
	this._interimTimers = [];
	this._interimSlots = ['07:00','12:00','16:00','22:00']; // créneaux fixes
	this._interimJitterMs = 15_000; // ±15s pour désynchroniser
	this._interimClaimKey = 'lastInterimSentKey'; // anti-doublon cross-onglets
  }

  // logging shorthands (preserve outputs)
  log(...a){ console.log(...a); }
  warn(...a){ console.warn(...a); }
  error(...a){ console.error(...a); }
	 // --- ENVOI SNAPSHOT DE TOUS LES MODÈLES ---
  _nextOccurrenceFor(timeStr) {
  const [h, m] = String(timeStr).split(':').map(Number);
  const now = new Date();
  const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h||0, m||0, 0, 0);
  if (dt <= now) dt.setDate(dt.getDate() + 1);
  return dt;
}

_clearInterimTimers() {
  for (const t of this._interimTimers) clearTimeout(t);
  this._interimTimers = [];
}

// retournne une clé unique pour le créneau du jour (ex: "2025-10-14T09:00")
_makeInterimSlotKey(dateObj, timeStr) {
  const pad = n => String(n).padStart(2,'0');
  return ${dateObj.getFullYear()}-${pad(dateObj.getMonth()+1)}-${pad(dateObj.getDate())}T${timeStr};
}

// planifie un seul créneau (avec jitter & auto-reschedule)
_scheduleOneInterim(timeStr) {
  const target = this._nextOccurrenceFor(timeStr);
  const baseDelay = Math.max(0, target - Date.now());
  const jitter = Math.floor((Math.random() * 2 - 1) * this._interimJitterMs); // [-jitter;+jitter]
  const delay = Math.max(0, baseDelay + jitter);

  this.log(Interim "${timeStr}" prévu à ${new Date(Date.now()+delay).toLocaleString()} (base=${baseDelay}ms, jitter=${jitter}ms));

  const timerId = setTimeout(async () => {
    try {
      // anti-doublon inter-onglets : on "claim" la fenêtre de tir
      const slotKey = this._makeInterimSlotKey(new Date(), timeStr); // date du jour courant
      const store = await new Promise(res => chrome.storage.local.get([this._interimClaimKey], v => res(v||{})));
      const lastKey = store?.[this._interimClaimKey];

      if (lastKey === slotKey) {
        this.log(Interim ${timeStr}: déjà envoyé pour ce créneau (${slotKey}), on skip.);
      } else {
        // petit "claim" optimiste (meilleur-effort)
        await new Promise(r => chrome.storage.local.set({ [this._interimClaimKey]: slotKey }, () => r()));
        this.log(Interim ${timeStr}: envoi… (slot=${slotKey}));
        try {
          await this.handleInterimSummaryRequest();
        } catch (e) {
          this.warn(Interim ${timeStr}: échec d'envoi, e);
          // en cas d'échec on ne "déclaim" pas — ce n’est pas critique pour de la notif
        }
      }
    } catch (e) {
      this.error(Interim ${timeStr}: erreur inattendue, e);
    } finally {
      // replanifie ce créneau pour le lendemain
      this._scheduleOneInterim(timeStr);
    }
  }, delay);

  this._interimTimers.push(timerId);
}

// planifie les 4 interims du jour
scheduleInterimNotifications() {
  this._clearInterimTimers();
  const slots = Array.isArray(this._interimSlots) && this._interimSlots.length
    ? this._interimSlots
    : ['09:00','12:00','16:00','22:00'];

  for (const s of slots) this._scheduleOneInterim(s);
  this.log(Interim scheduling actif pour: ${slots.join(', ')});
}
  async sendModelsSnapshot() {
    const current = this.getCurrentValues();
    if (!current || !current.models || !Object.keys(current.models).length) {
      await this.sendTelegramMessage("No models found on the page.");
      return true;
    }

    // Tri par “popularité” (downloads + 2x prints) décroissant
    const models = Object.values(current.models)
      .map(m => ({
        ...m,
        totalEq: this.calculateDownloadsEquivalent(m.downloads, m.prints)
      }))
      .sort((a,b) => b.totalEq - a.totalEq);

    // En-tête
    const header = 📸 Models snapshot (${models.length} items)\nSorted by downloads + 2×prints\n;
    await this.sendTelegramMessage(header);

    // Envoi 1 message par modèle (avec image si dispo)
    for (const m of models) {
      const captionLines = [
        📦 ${m.name},
        ⬇️ Downloads: ${m.downloads},
        🖨️ Prints: ${m.prints},
        ⚡ Boosts: ${m.boosts},
        Σ Downloads eq: ${m.totalEq},
      ];
      if (m.permalink) captionLines.push(🔗 ${m.permalink});
      const caption = captionLines.join('\n');

      if (m.imageUrl) {
        await this.sendTelegramMessageWithPhoto(caption, m.imageUrl);
      } else {
        await this.sendTelegramMessage(caption);
      }

      // petit spacing pour éviter rate limit Telegram/ntfy
      await new Promise(r => setTimeout(r, 250));
    }

    return true;
  }
  // period key uses user's dailyNotificationTime or 12:00 default
  async getCurrentPeriodKey() {
    const cfg = await new Promise(res => chrome.storage.sync.get(['dailyNotificationTime'], r =>
      res(r && r.dailyNotificationTime ? r.dailyNotificationTime : '12:00')));
    const [hourStr, minuteStr] = String(cfg).split(':');
    const hour = Number.isFinite(Number(hourStr)) ? Number(hourStr) : 12;
    const minute = Number.isFinite(Number(minuteStr)) ? Number(minuteStr) : 0;
    const now = new Date();
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    if (candidate > now) candidate.setDate(candidate.getDate() - 1);
    const pad = n => String(n).padStart(2,'0');
    const offset = -candidate.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const offsetHours = pad(Math.floor(Math.abs(offset)/60));
    const offsetMins = pad(Math.abs(offset)%60);
    return ${candidate.getFullYear()}-${pad(candidate.getMonth()+1)}-${pad(candidate.getDate())}T${pad(candidate.getHours())}:${pad(candidate.getMinutes())}:00${sign}${offsetHours}:${offsetMins};
  }

  // split large telegram messages into parts keeping paragraphs
  _splitMessageIntoParts(message='', maxLen=this._telegramMaxMessageChars) {
    if (!message) return [];
    if (message.length <= maxLen) return [message];
    const parts=[]; const paragraphs = message.split('\n\n'); let current='';
    for (const p of paragraphs) {
      const chunk = (current ? '\n\n' : '') + p;
      if ((current + chunk).length > maxLen) {
        if (current) { parts.push(current); current = p; if (current.length > maxLen) { let s=0; while (s < current.length){ parts.push(current.slice(s, s+maxLen)); s+=maxLen;} current=''; } }
        else { let s=0; while (s < p.length){ parts.push(p.slice(s, s+maxLen)); s+=maxLen; } current=''; }
      } else current += chunk;
    }
    if (current) parts.push(current);
    return parts;
  }

  // Telegram send helpers with one retry
  async sendTelegramMessage(message, attempt=1) {
	    // --- ntfy override minimal ---
    try {
      const cfg = await new Promise(res =>
        chrome.storage.sync.get(['useNtfy','ntfyUrl','ntfyAuth','ntfyTags','ntfyPriority'], v => res(v||{}))
      );
      const enabled = (cfg.useNtfy === undefined ? !!cfg.ntfyUrl : !!cfg.useNtfy);
      if (enabled && cfg.ntfyUrl) {
        return await __sendNtfyWithCfg(cfg, { title:'MakerWorld', text: message, imageUrl:'', clickUrl:'', tags:'makerworld,update', priority:3 });
      }
    } catch(e) { /* fallback to Telegram */ }
    if (!this.telegramToken || !this.chatId) { this.error('Missing Token or Chat ID'); return false; }
    const parts = this._splitMessageIntoParts(message, this._telegramMaxMessageChars);
    for (const part of parts) {
      const payload = { chat_id: this.chatId, text: part, parse_mode: 'HTML' };
      this.log('→ Telegram payload (part):', { len: part.length });
      try {
        const res = await fetch(https://api.telegram.org/bot${this.telegramToken}/sendMessage, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        const body = await res.json();
        if (!res.ok) {
          this.error('← Telegram API error:', body);
          if (attempt < 2) { this.log('Retrying Telegram send...'); await new Promise(r=>setTimeout(r,1000)); return this.sendTelegramMessage(message, attempt+1); }
          return false;
        }
        this.log('← Telegram API ok:', body);
      } catch (err) {
        this.error('Error sending message:', err);
        if (attempt < 2) { this.log('Retrying Telegram send...'); await new Promise(r=>setTimeout(r,1000)); return this.sendTelegramMessage(message, attempt+1); }
        return false;
      }
      await new Promise(r=>setTimeout(r,200));
    }
    return true;
  }

  async sendTelegramMessageWithPhoto(message, photoUrl) {
	// --- ntfy override minimal ---
    try {
      const cfg = await new Promise(res =>
        chrome.storage.sync.get(['useNtfy','ntfyUrl','ntfyAuth','ntfyTags','ntfyPriority'], v => res(v||{}))
      );
      const enabled = (cfg.useNtfy === undefined ? !!cfg.ntfyUrl : !!cfg.useNtfy);
      if (enabled && cfg.ntfyUrl) {
        return await __sendNtfyWithCfg(cfg, { title:'MakerWorld', text: message, imageUrl:(photoUrl||''), clickUrl:'', tags:'makerworld,model,update', priority:4 });
      }
    } catch(e) { /* fallback to Telegram */ }
    if (!this.telegramToken || !this.chatId || !photoUrl) { this.log('Falling back to text message (missing token/chat/photo).'); return this.sendTelegramMessage(message); }
    try {
      this.log('Attempting to send photo:', { photoUrl, chatId: this.chatId });
      const imgRes = await fetch(photoUrl);
      if (!imgRes.ok) throw new Error(Image download failed: ${imgRes.status});
      const blob = await imgRes.blob();
      const form = new FormData(); form.append('chat_id', this.chatId); form.append('caption', message); form.append('photo', blob, 'model_image.jpg');
      const res = await fetch(https://api.telegram.org/bot${this.telegramToken}/sendPhoto, { method:'POST', body: form });
      const result = await res.json();
      this.log('Telegram response:', result);
      if (!res.ok) throw new Error(Telegram Error: ${res.status});
      return true;
    } catch (err) {
      this.error('Error sending photo:', err);
      return this.sendTelegramMessage(message);
    }
  }

  // scraping/parsing
  parseNumber(text){ if (!text) return 0; text = String(text).trim().toLowerCase(); if (text.includes('k')){ const base = parseFloat(text.replace('k','')); if (Number.isFinite(base)) return Math.round(base*1000); } const n = parseInt(text.replace(/[^\d]/g,''),10); return Number.isFinite(n)? n:0; }

  getCurrentValues() {
    try {
      const currentValues = { models: {}, points: 0, timestamp: Date.now() };
      try {
        const pointsContainer = document.querySelector('.mw-css-1541sxf');
        this.log('Found points container:', !!pointsContainer);
        if (pointsContainer) {
          const pts = pointsContainer.textContent.trim().match(/[\d,]+(\.\d+)?/);
          if (pts && pts[0]) { currentValues.points = parseFloat(pts[0].replace(/,/g,'')); this.log('Points found:', currentValues.points); }
        }
      } catch (e){ this.error('Error extracting points:', e); }
      const downloadElements = document.querySelectorAll('[data-trackid]');
      downloadElements.forEach(element => {
        const modelId = element.getAttribute('data-trackid');
        const modelTitle = element.querySelector('h3.translated-text');
        const name = modelTitle?.textContent.trim() || 'Model';
        const imageUrl = element.querySelector('img')?.getAttribute('src') || '';
        let permalink = null;
        const anchor = element.querySelector('a[href*="/models/"], a[href*="/model/"], a[href*="/models/"]');
        if (anchor?.href) permalink = anchor.href;
        const allMetrics = element.querySelectorAll('.mw-css-xlgty3 span');
        if (allMetrics.length >= 3) {
          const lastThree = Array.from(allMetrics).slice(-3);
          const boosts = this.parseNumber(lastThree[0]?.textContent || '0');
          const downloads = this.parseNumber(lastThree[1]?.textContent || '0');
          const prints = this.parseNumber(lastThree[2]?.textContent || '0');
          currentValues.models[modelId] = { id: modelId, permalink, name, boosts, downloads, prints, imageUrl };
          this.log(Model "${name}":, { id: modelId, boosts, downloads, prints, permalink });
        } else this.log(Not enough metrics for ${name} (found ${allMetrics.length}));
      });
      return currentValues;
    } catch (err) { this.error('Error extracting values:', err); return null; }
  }

  // reward math
  getRewardInterval(totalDownloads){ if (totalDownloads <= 50) return 10; if (totalDownloads <= 500) return 25; if (totalDownloads <= 1000) return 50; return 100; }
  nextRewardDownloads(totalDownloads){ const interval = this.getRewardInterval(totalDownloads); const mod = totalDownloads % interval; return (totalDownloads === 0 || mod === 0) ? totalDownloads + interval : totalDownloads + (interval - mod); }
  getRewardPointsForDownloads(thresholdDownloads){ if (thresholdDownloads <= 50) return 15+3; if (thresholdDownloads <= 500) return 12+3; if (thresholdDownloads <= 1000) return 20+5; return 30+8; }
  calculateDownloadsEquivalent(downloads, prints){ return Number(downloads||0) + (Number(prints||0) * 2); }

  // storage lock helpers
  async acquireDailyLock(timeoutMs = this._dailyLockTimeoutMs) {
    const now = Date.now();
    return new Promise(resolve => chrome.storage.local.get([this._dailyLockKey], res => {
      const lock = res?.[this._dailyLockKey] || null;
      if (!lock || (now - lock.ts) > timeoutMs) {
        if (lock && (now - lock.ts) > timeoutMs) {
          chrome.storage.local.remove([this._dailyLockKey], () => {
            const newLock = { ts: now, owner: this._instanceId };
            chrome.storage.local.set({ [this._dailyLockKey]: newLock }, () => {
              chrome.storage.local.get([this._dailyLockKey], r2 => {
                const confirmed = r2?.[this._dailyLockKey]?.owner === this._instanceId;
                this.log('acquireDailyLock (force unlock) result', { confirmed, owner: r2?.[this._dailyLockKey]?.owner, instance: this._instanceId });
                resolve(confirmed);
              });
            });
          });
        } else {
          const newLock = { ts: now, owner: this._instanceId };
          chrome.storage.local.set({ [this._dailyLockKey]: newLock }, () => {
            chrome.storage.local.get([this._dailyLockKey], r2 => {
              const confirmed = r2?.[this._dailyLockKey]?.owner === this._instanceId;
              this.log('acquireDailyLock result', { confirmed, owner: r2?.[this._dailyLockKey]?.owner, instance: this._instanceId });
              resolve(confirmed);
            });
          });
        }
      } else { this.log('acquireDailyLock failed, existing lock', lock); resolve(false); }
    }));
  }

  async releaseDailyLock() {
    return new Promise(resolve => chrome.storage.local.get([this._dailyLockKey], res => {
      const lock = res?.[this._dailyLockKey] || null;
      if (lock && lock.owner === this._instanceId) {
        chrome.storage.local.remove([this._dailyLockKey], () => { this.log('releaseDailyLock: released by', this._instanceId); resolve(true); });
      } else resolve(false);
    }));
  }

  // pre-send check to avoid duplicate daily sends
  async preSendCheckAndMaybeWait(startTime) {
    for (let attempt = 0; attempt < this._dailyMaxPreSendRetries; attempt++) {
      const latest = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null)));
      if (latest && latest.timestamp >= startTime) { this.log('preSendCheck: found newer dailyStats, aborting send', { latestTs: new Date(latest.timestamp).toISOString(), startTime: new Date(startTime).toISOString() }); return false; }
      const backoff = this._dailyPreSendBaseBackoffMs + Math.floor(Math.random()*700);
      await new Promise(r => setTimeout(r, backoff));
    }
    return true;
  }

  // robust daily summary computation and storage
  async getDailySummary({ persist = true } = {}) {
    const currentValues = this.getCurrentValues();
    if (!currentValues) { this.error('Unable to get current values'); return null; }
    this.log('getDailySummary START — now:', new Date().toISOString());
    this.log('getDailySummary: currentValues.models count =', Object.keys(currentValues.models || {}).length, 'timestamp=', new Date(currentValues.timestamp).toISOString());

    const [previousDayRaw, maxStaleMs] = await Promise.all([
      new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null))),
      new Promise(res => chrome.storage.sync.get(['dailyFallbackMaxAgeMs'], cfg => {
        const cfgVal = cfg?.dailyFallbackMaxAgeMs; res(Number.isFinite(cfgVal) ? cfgVal : (this._defaultFallbackHours*60*60*1000));
      }))
    ]);

    let raw = previousDayRaw;
    if (!raw) {
      for (let i=0;i<3 && !raw;i++){ this.log('getDailySummary: dailyStats missing — retrying read (attempt)', i+1); await new Promise(r=>setTimeout(r,1000)); raw = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r2 => res(r2?.[this._dailyStatsKey] || null))); }
    }
    if (raw) this.log('getDailySummary: read dailyStats from storage:', { ts: new Date(raw.timestamp).toISOString(), ageMs: Date.now()-raw.timestamp, modelsCount: Object.keys(raw.models || {}).length, points: raw.points, owner: raw.owner || null, periodKey: raw.periodKey || null });
    else this.log('getDailySummary: no dailyStats found in storage after retries.');

    const ONE_DAY_MS = 24*60*60*1000;
    let previousDay = null;
    if (raw) {
      const ageMs = Date.now() - raw.timestamp;
      if (ageMs <= ONE_DAY_MS) previousDay = raw, this.log('getDailySummary: using fresh snapshot', new Date(raw.timestamp).toISOString());
      else if (ageMs <= maxStaleMs) previousDay = raw, this.warn('getDailySummary: using STALE snapshot as fallback', new Date(raw.timestamp).toISOString(), ageMs=${ageMs});
      else this.log('getDailySummary: snapshot too old, treating as missing', new Date(raw.timestamp).toISOString(), ageMs=${ageMs});
    }

    if (!previousDay) {
      this.log('getDailySummary: No previous day data available or snapshot unusable. Writing current snapshot and returning empty summary.');
      const periodKey = await this.getCurrentPeriodKey();
      if (persist) {
        chrome.storage.local.set({ [this._dailyStatsKey]: { models: currentValues.models, points: currentValues.points, timestamp: Date.now(), owner: this._instanceId, periodKey } }, () => {
          this.log('getDailySummary: stored dailyStats ts=', new Date().toISOString(), 'modelsCount=', Object.keys(currentValues.models || {}).length, 'owner=', this._instanceId, 'periodKey=', periodKey);
        });
        chrome.storage.local.set({ [this._dailyRunningRewardKey]: 0, [this._dailyRunningRewardDayKey]: periodKey, [this._lastSuccessfulKey]: { state:'SENT', owner:this._instanceId, sentAt:Date.now(), periodKey, snapshot:{ models: currentValues.models, points: currentValues.points, timestamp: Date.now() }, rewardPointsTotal:0 } });
      }
      return { dailyDownloads:0, dailyPrints:0, points: currentValues.points, pointsGained:0, top5Downloads:[], top5Prints:[], rewardsEarned:[], rewardPointsTotal:0, from:new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), to:new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) };
    }

    // compare
    const modelChanges = {};
    this.log('getDailySummary: comparing models; previousDay.models count', Object.keys(previousDay.models || {}).length);
    for (const [id, current] of Object.entries(currentValues.models)) {
      let previous = previousDay?.models?.[id] || null;
      if (!previous && current.permalink) previous = Object.values(previousDay.models || {}).find(m => m?.permalink === current.permalink) || null;
      if (!previous && current.name) { const norm = current.name.trim().toLowerCase(); previous = Object.values(previousDay.models || {}).find(m => m?.name?.trim().toLowerCase() === norm) || null; if (previous) this.log('getDailySummary: matched previous by name', { id, name: current.name }); }
      if (!previous) { this.log('New model found:', current.name, 'id=', id, 'permalink=', current.permalink); continue; }

      const prevDownloads = Number(previous.downloads || 0), prevPrints = Number(previous.prints || 0), currDownloads = Number(current.downloads || 0), currPrints = Number(current.prints || 0);
      let downloadsGained = currDownloads - prevDownloads, printsGained = currPrints - prevPrints;
      if (downloadsGained <= 0 && printsGained <= 0) continue;
      if (downloadsGained > this._suspiciousDeltaLimit || printsGained > this._suspiciousDeltaLimit) { this.warn('Suspiciously large delta detected, skipping reward calculation for', { id, name: current.name, downloadsGained, printsGained, prevTs: previous.timestamp || null }); continue; }

      modelChanges[id] = { id, name: current.name, downloadsGained, printsGained, previousDownloads: prevDownloads, previousPrints: prevPrints, currentDownloads: currDownloads, currentPrints: currPrints, permalink: current.permalink || previous?.permalink || null };
    }

    const dailyDownloads = Object.values(modelChanges).reduce((s,m)=>s+m.downloadsGained,0);
    const dailyPrints = Object.values(modelChanges).reduce((s,m)=>s+m.printsGained,0);
    const top5Downloads = Object.values(modelChanges).filter(m=>m.downloadsGained>0).sort((a,b)=>b.downloadsGained-a.downloadsGained).slice(0,5);
    const top5Prints = Object.values(modelChanges).filter(m=>m.printsGained>0).sort((a,b)=>b.printsGained-a.printsGained).slice(0,5);

    // compute rewards
    const rewardsEarned = []; let rewardPointsTotal = 0;
    for (const m of Object.values(modelChanges)) {
      const prevDownloadsTotal = this.calculateDownloadsEquivalent(m.previousDownloads, m.previousPrints);
      const currDownloadsTotal = this.calculateDownloadsEquivalent(m.currentDownloads, m.currentPrints);
      let cursor = prevDownloadsTotal; const thresholdsHit = []; const maxThresholdsPerModel = 200; let thresholdsCount = 0;
      while (cursor < currDownloadsTotal && thresholdsCount < maxThresholdsPerModel) {
        const interval = this.getRewardInterval(cursor);
        const mod = cursor % interval;
        const nextThreshold = (cursor === 0 || mod === 0) ? cursor + interval : cursor + (interval - mod);
        if (nextThreshold <= currDownloadsTotal) {
          const rewardPoints = this.getRewardPointsForDownloads(nextThreshold)*1.25;
          thresholdsHit.push({ threshold: nextThreshold, rewardPoints });
          rewardPointsTotal += rewardPoints;
          cursor = nextThreshold; thresholdsCount++;
        } else break;
      }
      if (thresholdsHit.length) rewardsEarned.push({ id:m.id, name:m.name, thresholds:thresholdsHit.map(t=>t.threshold), rewardPointsTotalForModel:thresholdsHit.reduce((s,t)=>s+t.rewardPoints,0) });
    }

    const periodKey = await this.getCurrentPeriodKey();
    if (persist) {
      chrome.storage.local.set({ [this._dailyStatsKey]: { models: currentValues.models, points: currentValues.points, timestamp: Date.now(), owner: this._instanceId, periodKey } }, () => {
        this.log('getDailySummary: updated dailyStats ts=', new Date().toISOString(), 'modelsCount=', Object.keys(currentValues.models || {}).length, 'owner=', this._instanceId, 'periodKey', periodKey);
      });
      chrome.storage.local.set({ [this._dailyRunningRewardKey]: 0, [this._dailyRunningRewardDayKey]: periodKey, [this._lastSuccessfulKey]: { state:'SENT', owner:this._instanceId, sentAt:Date.now(), periodKey, snapshot:{ models: currentValues.models, points: currentValues.points, timestamp: Date.now() }, rewardPointsTotal:0 } });
    }

    return { dailyDownloads, dailyPrints, points: currentValues.points, pointsGained: currentValues.points - previousDay.points, top5Downloads, top5Prints, rewardsEarned, rewardPointsTotal, from: new Date(previousDay.timestamp).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), to: new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) };
  }

  // schedule daily report with locking/claiming
  scheduleDailyNotification() {
    if (this._dailyTimerId) { clearTimeout(this._dailyTimerId); this._dailyTimerId = null; }
    chrome.storage.sync.get(['dailyReport','dailyNotificationTime'], (config) => {
      const dailyReport = config.dailyReport || 'yes';
      if (dailyReport === 'no') { this.log('Daily report disabled'); return; }
      const dailyTime = config.dailyNotificationTime || '23:30';
      const [hour, minute] = dailyTime.split(':').map(Number);
      const now = new Date(); const nextNotification = new Date(); nextNotification.setHours(hour, minute, 0, 0); if (nextNotification <= now) nextNotification.setDate(nextNotification.getDate()+1);
      const jitter = Math.floor((Math.random()*2 -1) * this._dailyScheduleJitterMs);
      const delay = Math.max(0, nextNotification - now + jitter);
      this.log(Daily report scheduled for: ${new Date(Date.now()+delay)}. Delay: ${delay}ms; jitterMs=${jitter});
      this._dailyTimerId = setTimeout(async () => {
        const startTime = Date.now(); this.log(scheduleDailyNotification: firing attempt at ${new Date().toISOString()});
        const claimantKey = this._lastSuccessfulKey; let clearPending=false, wrotePending=false, periodKey=null;
        const gotLock = await this.acquireDailyLock();
        if (!gotLock) { this.log('scheduleDailyNotification: could not acquire lock, another instance likely running. Aborting this attempt.'); this.scheduleDailyNotification(); return; }
        try {
          const latestAfterLock = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null)));
          if (latestAfterLock && latestAfterLock.timestamp >= startTime) { this.log('scheduleDailyNotification: dailyStats updated by another instance after lock; aborting this send.'); return; }
          const nowMs = Date.now(); periodKey = await this.getCurrentPeriodKey();
          const claimResult = await new Promise(res => {
            chrome.storage.local.get([claimantKey], r => {
              const existing = r?.[claimantKey] || null;
              if (existing && existing.state === 'SENT' && existing.periodKey === periodKey) { res({ ok:false, reason:'already-sent', existing }); return; }
              const PENDING_STALE_MS = 5 * 60 * 1000;
              if (existing && existing.state === 'PENDING' && (nowMs - (existing.claimAt || 0)) < PENDING_STALE_MS && existing.periodKey === periodKey) { res({ ok:false, reason:'pending-claim', existing }); return; }
              const claim = { state:'PENDING', owner:this._instanceId, claimAt: nowMs, periodKey };
              chrome.storage.local.set({ [claimantKey]: claim }, () => { chrome.storage.local.get([claimantKey], v => { const confirmed = v?.[claimantKey]?.owner === this._instanceId && v[claimantKey].state === 'PENDING' && v[claimantKey].periodKey === periodKey; res({ ok:confirmed, claim }); }); });
            });
          });
          if (!claimResult.ok) { this.log('scheduleDailyNotification: aborting send due to claim failure', claimResult.reason, claimResult.existing); return; }
          wrotePending = true;
          const okToSend = await this.preSendCheckAndMaybeWait(startTime);
          if (!okToSend) { this.log('scheduleDailyNotification: preSendCheck indicates newer snapshot; aborting this send.'); clearPending = true; return; }
          this.log(Sending daily report: ${new Date()});
          const summary = await this.getDailySummary();
          if (summary) {
            let rewardsSection = 'No rewards earned in the prior 24 hours';
            if (summary.rewardsEarned?.length) rewardsSection = summary.rewardsEarned.map(r => ${r.name}: +${r.rewardPointsTotalForModel} points (thresholds: ${r.thresholds.join(', ')})).join('\n');
            const totalEquivalent = summary.dailyDownloads + (summary.dailyPrints * 2);
            const topDownloadsList = summary.top5Downloads.length ? summary.top5Downloads.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.downloadsGained}).join('\n') : 'No new downloads today';
            const topPrintsList = summary.top5Prints.length ? summary.top5Prints.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.printsGained}).join('\n') : 'No new prints today';
            const message = 
📊 24-Hour Summary (${summary.from} - ${summary.to}):

Total Download points: ${totalEquivalent}

🏆 Today's Most Downloaded:
${topDownloadsList}

🖨️ Today's Most Printed:
${topPrintsList}

🎁 Rewards earned in last 24 hours:
${rewardsSection}
Total Reward Points: ${summary.rewardPointsTotal}
.trim();
            const sent = await this.sendTelegramMessage(message);
            if (sent) {
              const sentAt = Date.now();
              const runningRewardPoints = await new Promise(res => chrome.storage.local.get([this._dailyRunningRewardKey], r => res(r?.[this._dailyRunningRewardKey] || 0)));
              const finalRecord = { state:'SENT', owner:this._instanceId, sentAt, periodKey, snapshot:{ models: summary.top5Downloads.concat(summary.top5Prints).reduce((acc,m)=>{acc[m.id]=m;return acc;},{}), points: summary.points, timestamp: Date.now() }, rewardPointsTotal: runningRewardPoints };
              await new Promise(resolve => chrome.storage.local.set({ [this._lastSuccessfulKey]: finalRecord }, () => { this.log('scheduleDailyNotification: wrote lastSuccessfulDailyReport SENT by', this._instanceId, 'sentAt=', new Date(sentAt).toISOString(), 'periodKey=', periodKey); resolve(); }));
              try { chrome.storage.local.set({ [this._dailyRunningRewardKey]:0, [this._dailyRunningRewardDayKey]: periodKey }, () => { this.log('scheduleDailyNotification: reset running reward counter for period', { periodKey }); }); } catch (err) { this.error('Error resetting running reward counter for period', err); }
            } else clearPending = true;
          } else clearPending = true;
        } finally {
          try {
            if (clearPending && claimantKey) {
              chrome.storage.local.get([claimantKey], r => {
                const existing = r?.[claimantKey] || null;
                if (existing && existing.state === 'PENDING' && existing.owner === this._instanceId) chrome.storage.local.remove([claimantKey], () => { this.log('scheduleDailyNotification: cleared PENDING claim during cleanup'); });
                else this.log('scheduleDailyNotification: skip clearing PENDING (not owner or not pending)', { existing });
              });
            }
          } finally {
            await this.releaseDailyLock();
            this.scheduleDailyNotification();
          }
        }
      }, delay);
    });
  }

  // main periodic check (per-model messages or summary)
  async checkAndNotify() {
    if (this.isChecking) { this.log('Check already in progress, skipping...'); return; }
    this.log(checkAndNotify start — ${ITERATION}); this.isChecking = true;
    try {
      this.log('Starting change check...');
      let anyNotification = false;
      const currentValues = this.getCurrentValues();
      if (!currentValues) { this.log('No current values found'); await this.savePreviousValues({}); return; }
      if (!this.previousValues) await this.loadPreviousValues();
      if (!this.previousValues) { this.log('First run or no previous values, saving initial values'); this.previousValues = currentValues; await this.savePreviousValues(currentValues); return; }
      if (this.previousValues && !this.previousValues.models) { this.previousValues.models = {}; await this.savePreviousValues(this.previousValues); }
      if (currentValues.points > (this.previousValues.points || 0)) this.log('Global account points increased, ignoring for per-model-only Telegram notifications.');

      const modelsActivity = []; let modelUpdateCount = 0;
      for (const [id, current] of Object.entries(currentValues.models)) {
        const previous = this.previousValues.models[id];
        if (!previous) continue;
        const previousDownloadsRaw = Number(previous.downloads) || 0, previousPrints = Number(previous.prints) || 0, previousBoosts = Number(previous.boosts) || 0;
        const previousDownloadsTotal = this.calculateDownloadsEquivalent(previousDownloadsRaw, previousPrints);
        const currentDownloadsRaw = Number(current.downloads) || 0, currentPrints = Number(current.prints) || 0, currentBoosts = Number(current.boosts) || 0;
        const currentDownloadsTotal = this.calculateDownloadsEquivalent(currentDownloadsRaw, currentPrints);
        const downloadsDeltaRaw = currentDownloadsRaw - previousDownloadsRaw, printsDelta = currentPrints - previousPrints, boostsDelta = currentBoosts - previousBoosts;
        const downloadsDeltaEquivalent = downloadsDeltaRaw + (printsDelta * 2);
        const hasActivity = (downloadsDeltaRaw !== 0) || (printsDelta !== 0) || (boostsDelta > 0);
        if (hasActivity) modelUpdateCount++;
        const modelSummary = { id, name: current.name, imageUrl: current.imageUrl, downloadsDeltaRaw, printsDelta, boostsDelta, previousDownloadsTotal, currentDownloadsTotal, downloadsDeltaEquivalent, rewards: [] };

        if (currentDownloadsTotal > previousDownloadsTotal) {
          let cursor = previousDownloadsTotal, maxRewardsToReport = 50, rewardsFound = 0;
          while (cursor < currentDownloadsTotal && rewardsFound < maxRewardsToReport) {
            const interval = this.getRewardInterval(cursor), mod = cursor % interval;
            const nextThreshold = (cursor === 0 || mod === 0) ? cursor + interval : cursor + (interval - mod);
            this.log(REWARD-LOOP ${current.name} cursor=${cursor} interval=${interval} nextThreshold=${nextThreshold} currDownloads=${currentDownloadsTotal});
            if (nextThreshold <= currentDownloadsTotal) { const rewardPoints = this.getRewardPointsForDownloads(nextThreshold)*1.25; modelSummary.rewards.push({ thresholdDownloads: nextThreshold, points: rewardPoints }); cursor = nextThreshold; rewardsFound++; } else break;
          }
          if (rewardsFound >= maxRewardsToReport) this.log(Many rewards earned for ${current.name}. Listed first ${maxRewardsToReport} in summary.);
        }

        const boostOnly = (boostsDelta > 0) && (downloadsDeltaRaw === 0 && printsDelta === 0 && modelSummary.rewards.length === 0);
        if (!this.notifySummaryMode) {
          if (boostOnly) {
            const lines = [];
            lines.push(⚡ Boost Update for: ${current.name}, '', ⚡ Boosts: +${boostsDelta} (now ${currentBoosts}));
            const message = lines.join('\n');
            this.log('MESSAGE-BRANCH', { iteration: ITERATION, name: current.name, branch: 'boost-only', downloadsDeltaEquivalent, boostsDelta, rewardsFound: modelSummary.rewards.length });
            this.log(Sending boost-only message for ${current.name});
            const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
            anyNotification = true; continue;
          }

          const hasActivity2 = (downloadsDeltaRaw !== 0) || (printsDelta !== 0) || (modelSummary.rewards.length > 0) || (boostsDelta > 0);
          if (hasActivity2) {
            this.log('MESSAGE-BRANCH', { iteration: ITERATION, name: current.name, branch: 'milestone', downloadsDeltaEquivalent, boostsDelta, rewardsFound: modelSummary.rewards.length });
            const lines = []; const equivalentTotal = currentDownloadsTotal;
            lines.push(📦 Update for: ${current.name}, '', ${downloadsDeltaEquivalent > 0 ? '+' : ''}${downloadsDeltaEquivalent} Downloads (total ${equivalentTotal}), '');
			lines.push(⬇️ Downloads: ${currentDownloadsRaw} (${downloadsDeltaRaw > 0 ? '+' : ''}${downloadsDeltaRaw}));
            lines.push(🖨️ Prints: ${currentPrints} (${printsDelta > 0 ? '+' : ''}${printsDelta}));
            if (modelSummary.rewards.length > 0) { modelSummary.rewards.forEach(r => lines.push(🎁 Reward Earned! +${r.points} points at ${r.thresholdDownloads} downloads)); lines.push(''); }
            const nextThresholdAfterCurrent = this.nextRewardDownloads(equivalentTotal);
            const downloadsUntilNext = Math.max(0, nextThresholdAfterCurrent - equivalentTotal);
            lines.push(🎯 Next Reward: ${downloadsUntilNext} more downloads (${nextThresholdAfterCurrent} total), '', 🔁 Reward Interval: every ${this.getRewardInterval(equivalentTotal)} downloads);
            if (boostsDelta > 0) lines.push('', ⚡ Boosts: +${boostsDelta} (now ${currentBoosts}));
            let warning = '';
            if (Math.abs(downloadsDeltaRaw) > this._suspiciousDeltaLimit || Math.abs(printsDelta) > this._suspiciousDeltaLimit) {
              warning = "\n\n⚠️ The number of downloads or prints during this period is very high. This could be because your model is very popular (good job!). Or it could be an error. You may want to shorten the refresh interval.";
            }
            const message = lines.join('\n') + warning;
            this.log(Sending milestone message for ${current.name});
            const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
            if (sent && modelSummary.rewards.length > 0) { const pts = modelSummary.rewards.reduce((s,r)=>s+r.points,0); await this._accumulateDailyRewardPoints(pts); }
            anyNotification = true;
          }
        } else {
		  if (boostOnly) {
            const lines = [];
            lines.push(⚡ Boost Update for: ${current.name}, '', ⚡ Boosts: +${boostsDelta} (now ${currentBoosts}));
            const message = lines.join('\n');
            this.log('MESSAGE-BRANCH', { iteration: ITERATION, name: current.name, branch: 'boost-only', downloadsDeltaEquivalent, boostsDelta, rewardsFound: modelSummary.rewards.length });
            this.log(Sending boost-only message for ${current.name});
            const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
            anyNotification = true; continue;
          }
          const hasActivity3 = (downloadsDeltaRaw !== 0) || (printsDelta !== 0) || (modelSummary.rewards.length > 0) || (boostsDelta > 0);
          if (hasActivity3) modelsActivity.push({
            id,
            name: current.name,
            downloadsDeltaEquivalent,
            currentDownloadsTotal,
            rewardPointsForThisModel: modelSummary.rewards.reduce((s,r)=>s+r.points,0),
            boostsDelta,
            // 👉 Ajout minimal pour le rendu
            currentDownloadsRaw,
            currentPrints,
            downloadsDeltaRaw,
            printsDelta
          });
        }
      }

      // dynamic summary mode switch
      let forceSummaryMode = false;
      const SUMMARY_MODE_THRESHOLD = 15;
      if (!this.notifySummaryMode && modelUpdateCount >= SUMMARY_MODE_THRESHOLD) { forceSummaryMode = true; this.log(Switching to summary mode for this check due to ${modelUpdateCount} updates.); }
      const useSummaryMode = this.notifySummaryMode || forceSummaryMode;

      if (useSummaryMode) {
        if (forceSummaryMode) await this.sendTelegramMessage("Switching to summary mode due to the high number of updates this period. This ensures Telegram limits are not reached.");
        if (modelsActivity.length === 0) {
          await this.sendTelegramMessage("No new prints or downloads found."); anyNotification = true;
          const prevString = JSON.stringify(this.previousValues||{}), currString = JSON.stringify(currentValues||{});
          if (prevString !== currString) { this.previousValues = currentValues; await this.savePreviousValues(currentValues); }
          this.isChecking = false; return;
        }

        const totalEquivalent = modelsActivity.reduce((s,m)=>s + (m.downloadsDeltaEquivalent||0),0);
        const rewardPointsThisRun = modelsActivity.reduce((s,m)=>s + (m.rewardPointsForThisModel||0),0);
        await this._accumulateDailyRewardPoints(rewardPointsThisRun);

        const persisted = await new Promise(res => chrome.storage.local.get([this._dailyRunningRewardKey, this._dailyRunningRewardDayKey, this._dailyStatsKey, this._lastSuccessfulKey], r => res(r)));
        let running = Number.isFinite(persisted?.[this._dailyRunningRewardKey]) ? persisted[this._dailyRunningRewardKey] : 0;
        const runningDay = persisted?.[this._dailyRunningRewardDayKey] || null;
        const lastDaily = persisted?.[this._lastSuccessfulKey] || null;
        const lastDailyPoints = Number.isFinite(lastDaily?.rewardPointsTotal) ? lastDaily.rewardPointsTotal : 0;
        const currentPeriod = await this.getCurrentPeriodKey();

        if (!running || runningDay !== currentPeriod) {
          this.log('Periodic summary: running counter missing or mismatched; computing fallback via getDailySummary');
          try {
            const computed = await this.getDailySummary({ persist: false });
            if (computed && Number.isFinite(computed.rewardPointsTotal)) {
              running = computed.rewardPointsTotal;
              try { chrome.storage.local.set({ [this._dailyRunningRewardKey]: running, [this._dailyRunningRewardDayKey]: currentPeriod }, () => { this.log('Periodic summary: persisted computed running counter', { running, period: currentPeriod }); }); } catch (err) { this.warn('Periodic summary: failed to persist computed running counter', err); }
            } else this.warn('Periodic summary: computed fallback missing rewardPointsTotal; leaving persisted running as-is', { running, runningDay });
          } catch (err) { this.warn('Periodic summary: fallback computation failed', err); }
        }

        let rewardsToday = running - lastDailyPoints; if (rewardsToday < 0) rewardsToday = running;
        const fromTs = new Date(this.previousValues.timestamp).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), toTs = new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });
        const headerLines = [📊 Summary (${fromTs} - ${toTs}):, '', Download points this period: ${totalEquivalent} , '', 'Model updates:', ''];
        const maxModelsInMessage = 200;
        const list = modelsActivity.slice(0, maxModelsInMessage);
        const modelLines=[]; let anyLargeDelta=false;
        list.forEach((m,i) => {
          const downloadsDelta = m.downloadsDeltaEquivalent || 0, total = m.currentDownloadsTotal || 0, interval = m.rewardInterval || this.getRewardInterval(total), nextThreshold = this.nextRewardDownloads(total), remaining = Math.max(0, nextThreshold - total), ptsEarned = m.rewardPointsForThisModel || 0;
           let line = ${i+1}. <b>${escapeHtml(m.name)}</b>: +${downloadsDelta} (total ${total});
          // 👉 Ajout minimal : détails réels
          const dl = m.currentDownloadsRaw || 0;
          const pr = m.currentPrints || 0;
          const dld = m.downloadsDeltaRaw || 0;
          const prd = m.printsDelta || 0;
          line +=  — DL: ${dl} (${dld >= 0 ? '+' : ''}${dld}), PR: ${pr} (${prd >= 0 ? '+' : ''}${prd}); 
		  if (ptsEarned>0) line +=   🎉 +${ptsEarned} pts; line +=  (needs ${remaining} for next 🎁, interval ${interval});
          if (Math.abs(downloadsDelta) > this._suspiciousDeltaLimit) { line += \n⚠️ The number of downloads during this period is very high. This could be because your model is very popular (good job!). Or it could be an error. You may want to shorten the refresh interval.; anyLargeDelta=true; }
          if ((m.boostsDelta || 0) > 0) {
            line += 
⚡ Boosts: +${m.boostsDelta};
          }

          modelLines.push(line);
        });
        const spacedModels = modelLines.join('\n\n');
		// Count models within 2 downloads (downloads + 2×prints) of next reward across all models on the page
		let closeToGiftCount = 0;
		const allModels = Object.values(currentValues?.models || {});
		for (const cm of allModels) {
		  const downloads = Number(cm.downloads || 0);
		  const prints = Number(cm.prints || 0);
		  const total = this.calculateDownloadsEquivalent(downloads, prints); // downloads + 2*prints
		  const next = this.nextRewardDownloads(total);
		  const remaining = Math.max(0, next - total);
		  if (remaining <= 2) closeToGiftCount++;
		}
		const footerLines = [
		  '',
		  Rewards this period: ${rewardPointsThisRun} pts,
		  Rewards today: ${rewardsToday} pts,
		  Models close to 🎁: ${closeToGiftCount}
		];

        const message = headerLines.join('\n') + '\n' + spacedModels + '\n' + footerLines.join('\n');
        this.log('Aggregated summary message length:', message.length);
        const sent = await this.sendTelegramMessage(message); if (sent) anyNotification = true;
      } else {
        // per-model logic already executed inside loop
      }

      const prevString = JSON.stringify(this.previousValues || {}), currString = JSON.stringify(currentValues || {});
      if (prevString !== currString) { this.previousValues = currentValues; await this.savePreviousValues(currentValues); } else this.log('No changes detected, skipping savePreviousValues to reduce storage writes.');
      if (!anyNotification && !useSummaryMode) { const heartbeatMsg = 'No new prints or downloads found.'; this.log(heartbeatMsg); await this.sendTelegramMessage(heartbeatMsg); }
    } catch (err) { this.error('Error during check:', err); }
    finally { this.isChecking = false; }
  }

  // accumulate running points with lock and retries
  async _accumulateDailyRewardPoints(pointsToAdd, attempt = 1) {
    if (!Number.isFinite(pointsToAdd) || pointsToAdd <= 0) return;
    const MAX_ATTEMPTS = 3, BASE_DELAY_MS = 300, MAX_BACKOFF_MS = 3000, lockTimeoutMs = 1500;
    while (attempt <= MAX_ATTEMPTS) {
      const lockAcquired = await this.acquireDailyLock(lockTimeoutMs);
      if (!lockAcquired) {
        if (attempt >= MAX_ATTEMPTS) { this.warn(_accumulateDailyRewardPoints: lock not acquired after ${MAX_ATTEMPTS} attempts; skipping this accumulation.); return; }
        const backoff = Math.min(MAX_BACKOFF_MS, BASE_DELAY_MS * Math.pow(2, attempt-1));
        const jitter = Math.floor(Math.random() * Math.min(500, Math.floor(backoff/2)));
        const delay = backoff + jitter; this.log(_accumulateDailyRewardPoints: lock not acquired (attempt ${attempt}). Waiting ${delay}ms then retrying.); await new Promise(r=>setTimeout(r, delay)); attempt++; continue;
      }

      try {
        const periodKey = await this.getCurrentPeriodKey();
        const local = await new Promise(res => chrome.storage.local.get([this._dailyRunningRewardKey, this._dailyRunningRewardDayKey], r => res(r)));
        let running = (local && local[this._dailyRunningRewardKey]) ? local[this._dailyRunningRewardKey] : 0;
        const runningDay = (local && local[this._dailyRunningRewardDayKey]) ? local[this._dailyRunningRewardDayKey] : null;
        this.log('_accumulateDailyRewardPoints read', { running, runningDay, periodKey, pointsToAdd, attempt });

        if (runningDay && runningDay !== periodKey) {
          const runningDayTs = new Date(runningDay).getTime(), periodKeyTs = new Date(periodKey).getTime();
          if (Number.isFinite(runningDayTs) && Number.isFinite(periodKeyTs)) {
            if (runningDayTs > periodKeyTs) { this.log('_accumulateDailyRewardPoints: stored runningDay is in the future; resetting running to 0 and continuing', { runningDay, periodKey }); running = 0; }
            else { this.warn('_accumulateDailyRewardPoints: stored runningDay older than current period; aborting to avoid joining wrong window', { runningDay, periodKey }); return; }
          } else { this.log('_accumulateDailyRewardPoints: could not parse runningDay/periodKey; resetting running to 0 and continuing', { runningDay, periodKey }); running = 0; }
        }
        if (!runningDay) { this.log('_accumulateDailyRewardPoints resetting running counter for new period', { oldDay: runningDay, newPeriod: periodKey }); running = 0; }
        running += pointsToAdd;
        await new Promise(resolve => {
          chrome.storage.local.set({ [this._dailyRunningRewardKey]: running, [this._dailyRunningRewardDayKey]: periodKey }, (err) => {
            if (chrome.runtime.lastError || err) this.warn('Storage set failed (quota or other error):', chrome.runtime.lastError || err);
            else this.log(_accumulateDailyRewardPoints: added ${pointsToAdd}, running=${running}, period=${periodKey});
            resolve();
          });
        });
        return;
      } finally { await this.releaseDailyLock(); }
    }
  }

  // previousValues persistence
  async loadPreviousValues(){ return new Promise(resolve => chrome.storage.local.get(['previousValues'], result => { if (result?.previousValues) { this.log('Previous values loaded:', result.previousValues); this.previousValues = result.previousValues; } resolve(); })); }
  async savePreviousValues(values){ return new Promise(resolve => chrome.storage.local.set({ previousValues: values }, () => { this.log('Values saved to storage'); resolve(); })); }

  // lifecycle
  async start() {
    this.log('Starting monitor...');
    if (this.checkInterval) { this.log('Monitor already running, skipping duplicate start.'); return; }
    chrome.storage.sync.get(['telegramToken','chatId','refreshInterval','dailyReport','dailyNotificationTime','notifySummaryMode'], async (config) => {
      if (!config || !config.telegramToken || !config.chatId) { this.error('Missing Telegram configuration'); return; }
      this.telegramToken = config.telegramToken; this.chatId = config.chatId; this.notifySummaryMode = !!config.notifySummaryMode;
      const refreshInterval = config.refreshInterval || 900000;
      this.log(Configured refresh interval: ${refreshInterval}ms); this.log(Notify summary mode: ${this.notifySummaryMode});
      let intervalToUse = refreshInterval; const ONE_HOUR = 60*60*1000; const COMPENSATION_MS = 60*1000;
      if (refreshInterval > ONE_HOUR) { intervalToUse = Math.max(0, refreshInterval - COMPENSATION_MS); this.log(Interval adjusted for overhead: using ${intervalToUse}ms instead of configured ${refreshInterval}ms); }
      else this.log(Interval not adjusted (configured <= 1 hour): using ${intervalToUse}ms);
      await autoScrollToFullBottom();
      await this.loadPreviousValues();
      await this.checkAndNotify();
      if (this.checkInterval) { clearInterval(this.checkInterval); this.checkInterval = null; }
      const STORAGE_KEY = 'monitorNextScheduledTime';
      let nextScheduled = Number(sessionStorage.getItem(STORAGE_KEY));

      if (!nextScheduled) {
        nextScheduled = Date.now() + intervalToUse;
        this.log('Initializing schedule. First run at:', new Date(nextScheduled).toLocaleString());
        sessionStorage.setItem(STORAGE_KEY, nextScheduled);
      }

      const scheduleNext = () => {
        const now = Date.now();

        if (now > nextScheduled) {
          this.warn(Missed scheduled time by ${Math.round((now - nextScheduled)/1000)}s. Running now.);
          while (nextScheduled < now) {
            nextScheduled += intervalToUse;
          }
          sessionStorage.setItem(STORAGE_KEY, nextScheduled);
        }

        const delay = Math.max(0, nextScheduled - now);
        this.log(Next check scheduled for ${new Date(nextScheduled).toLocaleString()} (in ${Math.round(delay/1000)}s));

        this.checkInterval = setTimeout(async () => {
          try {
            this.log('Scrolling before refresh...');
            await autoScrollToFullBottom();
            this.log('Refreshing page...');
          } catch (err) {
            this.error('Error during pre-refresh tasks:', err);
          }

          const newNextScheduled = nextScheduled + intervalToUse;
          sessionStorage.setItem(STORAGE_KEY, newNextScheduled);

          try { scheduleNext(); } catch (e) { this.error('Failed to schedule next run:', e); }
          try { window.location.reload(); } catch (e) { this.error('Reload failed:', e); }
        }, delay);
      };

      scheduleNext();
      if (config.dailyReport !== 'no') this.scheduleDailyNotification();
	  this.scheduleInterimNotifications();
      this.log(Monitor started, refresh every ${intervalToUse/60000} minutes (configured ${refreshInterval/60000} minutes));
    });
  }

  stop() {
    if (this.checkInterval) { clearInterval(this.checkInterval); this.checkInterval = null; }
    if (this._dailyTimerId) { clearTimeout(this._dailyTimerId); this._dailyTimerId = null; }
    this.isChecking = false;
    this.log('Monitor stopped');
  }

  async restart() {
    this.log('Restarting monitor on request...');
    this.stop();
    await autoScrollToFullBottom();
    await this.checkAndNotify();
    this.start();
  }

  // interim summary (manual request)
  async handleInterimSummaryRequest() {
    this.log('Interim summary requested');
    const currentValues = this.getCurrentValues();
    if (!currentValues) { this.error('Interim summary aborted: could not extract current values'); throw new Error('No current values'); }
    const baseline = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null)));
    if (!baseline) { this.error('Interim summary aborted: no baseline dailyStats found'); throw new Error('No baseline dailyStats found'); }

    const previousDay = baseline;
    const modelChanges = {};
    for (const [id, current] of Object.entries(currentValues.models)) {
      let previous = previousDay?.models?.[id] || null;
      if (!previous && current.permalink) previous = Object.values(previousDay.models || {}).find(m => m && m.permalink === current.permalink) || null;
      if (!previous && current.name) previous = Object.values(previousDay.models || {}).find(m => m?.name?.trim().toLowerCase() === current.name.trim().toLowerCase()) || null;
      if (!previous) { this.log('New model found (interim):', current.name); continue; }
      const downloadsGained = Math.max(0, (Number(current.downloads) || 0) - (Number(previous.downloads) || 0));
      const printsGained = Math.max(0, (Number(current.prints) || 0) - (Number(previous.prints) || 0));
      if (downloadsGained > 0 || printsGained > 0) modelChanges[id] = { id, name: current.name, downloadsGained, printsGained, previousDownloads: previous.downloads || 0, previousPrints: previous.prints || 0, currentDownloads: current.downloads || 0, currentPrints: current.prints || 0, imageUrl: current.imageUrl || '' };
    }

    const dailyDownloads = Object.values(modelChanges).reduce((s,m)=>s+m.downloadsGained,0);
    const dailyPrints = Object.values(modelChanges).reduce((s,m)=>s+m.printsGained,0);
    const top5Downloads = Object.values(modelChanges).filter(m=>m.downloadsGained>0).sort((a,b)=>b.downloadsGained-a.downloadsGained).slice(0,5);
    const top5Prints = Object.values(modelChanges).filter(m=>m.printsGained>0).sort((a,b)=>b.printsGained-a.printsGained).slice(0,5);

    let rewardsEarned = [], rewardPointsTotal = 0;
    for (const m of Object.values(modelChanges)) {
      const prevTotal = this.calculateDownloadsEquivalent(m.previousDownloads, m.previousPrints);
      const currTotal = this.calculateDownloadsEquivalent(m.currentDownloads, m.currentPrints);
      let cursor = prevTotal; const thresholdsHit=[]; const maxThresholdsPerModel=50; let count=0;
      while (cursor < currTotal && count < maxThresholdsPerModel) {
        const interval = this.getRewardInterval(cursor), mod = cursor % interval;
        const nextThreshold = (cursor===0 || mod===0) ? cursor+interval : cursor+(interval-mod);
        if (nextThreshold <= currTotal) { const pts = this.getRewardPointsForDownloads(nextThreshold)*1.25; thresholdsHit.push({ threshold: nextThreshold, points: pts }); rewardPointsTotal += pts; cursor = nextThreshold; count++; } else break;
      }
      if (thresholdsHit.length) rewardsEarned.push({ id:m.id, name:m.name, thresholds:thresholdsHit.map(t=>t.threshold), rewardPointsTotalForModel:thresholdsHit.reduce((s,t)=>s+t.points,0) });
    }

    const totalEquivalent = dailyDownloads + (dailyPrints * 2);
    const topDownloadsList = top5Downloads.length ? top5Downloads.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.downloadsGained}).join('\n') : 'No new downloads so far';
    const topPrintsList = top5Prints.length ? top5Prints.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.printsGained}).join('\n') : 'No new prints so far';
    const fromTs = new Date(previousDay.timestamp).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), toTs = new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const message = 
🔔 Interim Summary (${fromTs} - ${toTs}):

Total Download points: ${totalEquivalent}

🏆 Top Downloads:
${topDownloadsList}

🖨️ Top Prints:
${topPrintsList}

🎁 Rewards earned so far:
${rewardsEarned.length > 0 ? rewardsEarned.map(r => ${r.name}: +${r.rewardPointsTotalForModel} points (thresholds: ${r.thresholds.join(', ')})).join('\n') : 'No rewards earned so far'}
.trim();
    this.log('Interim message:', message);
    const sent = await this.sendTelegramMessage(message);
    if (!sent) { this.error('Interim summary: failed to send via Telegram'); throw new Error('Telegram send failed'); }
    this.log('Interim summary: sent successfully');
    return true;
  }
}

// Startup
this.log = console.log.bind(console);
this.warn = console.warn.bind(console);
this.error = console.error.bind(console);

console.log('Initializing monitor...');
const monitor = new ValueMonitor();
monitor.start();

// Listen for popup messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'INTERIM_SUMMARY_REQUEST') {
    monitor.handleInterimSummaryRequest().then(()=>sendResponse({ok:true})).catch(err=>{ console.error('interim summary error', err); sendResponse({ok:false, error: err?.message}); });
    return true;
  }
  if (msg?.type === 'REFRESH_INTERVAL_UPDATED') {
    monitor.restart().then(()=>sendResponse({ok:true})).catch(err=>{ console.error('restart error', err); sendResponse({ok:false, error: err?.message}); });
    return true;
  }
  if (msg?.type === 'CONFIG_SAVED') {
    chrome.storage.sync.get(['notifySummaryMode'], cfg => { monitor.notifySummaryMode = !!(cfg?.notifySummaryMode); monitor.log('CONFIG_SAVED received. notifySummaryMode =', monitor.notifySummaryMode); monitor.restart().then(()=>sendResponse({ok:true})).catch(err=>sendResponse({ok:false, error: err?.message})); });
    return true;
  }
    if (msg?.type === 'DUMP_MODELS') {
    monitor.sendModelsSnapshot()
      .then(()=>sendResponse({ok:true}))
      .catch(err => { console.error('dump models error', err); sendResponse({ok:false, error: err?.message}); });
    return true;
  }

});
ChatGPT a dit :

Réflexion durant 16s
top—je vois bien ta base. Voilà 2 améliorations nettes et concrètes (avec diffs prêts à coller) qui collent à ce que tu voulais faire juste après :

1) Baseline immuable pour les interims
Objectif : tes interims repartent toujours du même snapshot du jour, jamais d’un snapshot réécrit par d’autres calculs.

a) Ajoute une clé dédiée
 class ValueMonitor {
   constructor() {
@@
-    this._lastSuccessfulKey = 'lastSuccessfulDailyReport';
+    this._lastSuccessfulKey = 'lastSuccessfulDailyReport';
+    this._dailyBaselineKey = 'dailyBaselineSnapshot';
b) Quand il n’y a pas encore de snapshot du jour, on fixe aussi le baseline (si persist===true)
Dans getDailySummary({ persist = true } = {}), branche “!previousDay” :

     if (!previousDay) {
       this.log('getDailySummary: No previous day data available or snapshot unusable. Writing current snapshot and returning empty summary.');
       const periodKey = await this.getCurrentPeriodKey();
       if (persist) {
         chrome.storage.local.set({ [this._dailyStatsKey]: { models: currentValues.models, points: currentValues.points, timestamp: Date.now(), owner: this._instanceId, periodKey } }, () => {
           this.log('getDailySummary: stored dailyStats ts=', new Date().toISOString(), 'modelsCount=', Object.keys(currentValues.models || {}).length, 'owner=', this._instanceId, 'periodKey=', periodKey);
         });
+        // 🔒 Baseline du jour (immuable, lu par les interims)
+        chrome.storage.local.set({ [this._dailyBaselineKey]: { models: currentValues.models, points: currentValues.points, timestamp: Date.now(), owner: this._instanceId, periodKey } });
         chrome.storage.local.set({ [this._dailyRunningRewardKey]: 0, [this._dailyRunningRewardDayKey]: periodKey, [this._lastSuccessfulKey]: { state:'SENT', owner:this._instanceId, sentAt:Date.now(), periodKey, snapshot:{ models: currentValues.models, points: currentValues.points, timestamp: Date.now() }, rewardPointsTotal:0 } });
       }
       return { ... };
     }
c) Les interims lisent le baseline (avec fallback)
Dans handleInterimSummaryRequest() :

-    const baseline = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null)));
+    const baseline = await new Promise(res =>
+      chrome.storage.local.get([this._dailyBaselineKey, this._dailyStatsKey], r =>
+        res(r?.[this._dailyBaselineKey] || r?.[this._dailyStatsKey] || null)
+      )
+    );
Tu as déjà mis getDailySummary({ persist:false }) pour les fallbacks en summary mode — parfait : ça garantit que le baseline ne bouge pas.

2) Ajouter le lien cliquable (ntfy “Click”) quand on a un permalink
Objectif : sur ntfy, taper la notif ouvre le modèle. On “plombe” le clickUrl jusque dans __sendNtfyWithCfg (déjà prévu).

a) Étendre les helpers d’envoi pour accepter clickUrl
-  async sendTelegramMessage(message, attempt=1) {
+  async sendTelegramMessage(message, attempt=1, { clickUrl } = {}) {
@@
-      if (enabled && cfg.ntfyUrl) {
-        return await __sendNtfyWithCfg(cfg, { title:'MakerWorld', text: message, imageUrl:'', clickUrl:'', tags:'makerworld,update', priority:3 });
+      if (enabled && cfg.ntfyUrl) {
+        return await __sendNtfyWithCfg(cfg, { title:'MakerWorld', text: message, imageUrl:'', clickUrl: (clickUrl||''), tags:'makerworld,update', priority:3 });
       }
-  async sendTelegramMessageWithPhoto(message, photoUrl) {
+  async sendTelegramMessageWithPhoto(message, photoUrl, { clickUrl } = {}) {
@@
-      if (enabled && cfg.ntfyUrl) {
-        return await __sendNtfyWithCfg(cfg, { title:'MakerWorld', text: message, imageUrl:(photoUrl||''), clickUrl:'', tags:'makerworld,model,update', priority:4 });
+      if (enabled && cfg.ntfyUrl) {
+        return await __sendNtfyWithCfg(cfg, { title:'MakerWorld', text: message, imageUrl:(photoUrl||''), clickUrl:(clickUrl||''), tags:'makerworld,model,update', priority:4 });
       }
b) Passer le permalink quand on en a un
Dans sendModelsSnapshot() :

-      if (m.imageUrl) {
-        await this.sendTelegramMessageWithPhoto(caption, m.imageUrl);
-      } else {
-        await this.sendTelegramMessage(caption);
-      }
+      const clickUrl = m.permalink || '';
+      if (m.imageUrl) {
+        await this.sendTelegramMessageWithPhoto(caption, m.imageUrl, { clickUrl });
+      } else {
+        await this.sendTelegramMessage(caption, 1, { clickUrl });
+      }
Dans la branche “milestone” (et “boost-only”) de checkAndNotify() :

- const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
+ const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl, { clickUrl: (current.permalink || '') });
Dans la branche summary-mode “boost-only” :

- const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
+ const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl, { clickUrl: (current.permalink || '') });
Pour l’interim (message global), il n’y a pas d’URL unique — on laisse sans clickUrl.

Si tu veux, je peux te donner une version “monobloc” du fichier avec ces patches déjà intégrés, mais là tu as les diffs ciblés pour avancer vite sans risquer de casser le reste.

Vous avez dit :
non ca je veux pas le faire

dans ce que j'aimerai


UN boost ca donne des points, il faut que ces points soient comptés dans les notifs et dans le cumul journalier

Traduitre toutes les notifs en francais a la place de anglais et mise en forme clair
ChatGPT a dit :

Réflexion durant 28s
parfait. je te propose un patch en 2 volets :

Ajouter des points pour les boosts (configurable) et les compter partout (notifs + cumul journalier).

Tout traduire en français avec une mise en forme claire – et ajuster le “heartbeat” ntfy.

Je te donne des diffs ciblés, prêts à coller.

1) Points de boost (configurable) + cumul
a) Déclarer la config & helper
Dans le constructor() :

     this._interimClaimKey = 'lastInterimSentKey'; // anti-doublon cross-onglets
+    // points par boost (configurable via chrome.storage.sync -> boostPointsValue)
+    this._boostPointsDefault = 5;
Ajoute ce helper dans la classe :

+  async _getBoostPointsValue() {
+    try {
+      const cfg = await new Promise(res => chrome.storage.sync.get(['boostPointsValue'], r => res(r||{})));
+      const v = Number(cfg?.boostPointsValue);
+      return Number.isFinite(v) && v >= 0 ? v : this._boostPointsDefault;
+    } catch { return this._boostPointsDefault; }
+  }
b) Compter les boosts dans getDailySummary() (journalier)
Dans la boucle “compare”, enregistre aussi les boosts gagnés :

-      const prevDownloads = Number(previous.downloads || 0), prevPrints = Number(previous.prints || 0), currDownloads = Number(current.downloads || 0), currPrints = Number(current.prints || 0);
-      let downloadsGained = currDownloads - prevDownloads, printsGained = currPrints - prevPrints;
+      const prevDownloads = Number(previous.downloads || 0), prevPrints = Number(previous.prints || 0), prevBoosts = Number(previous.boosts || 0);
+      const currDownloads = Number(current.downloads || 0), currPrints = Number(current.prints || 0), currBoosts = Number(current.boosts || 0);
+      let downloadsGained = currDownloads - prevDownloads, printsGained = currPrints - prevPrints, boostsGained = currBoosts - prevBoosts;
-      if (downloadsGained <= 0 && printsGained <= 0) continue;
+      if (downloadsGained <= 0 && printsGained <= 0 && boostsGained <= 0) continue;
       if (downloadsGained > this._suspiciousDeltaLimit || printsGained > this._suspiciousDeltaLimit) { ... }
-      modelChanges[id] = { id, name: current.name, downloadsGained, printsGained, previousDownloads: prevDownloads, previousPrints: prevPrints, currentDownloads: currDownloads, currentPrints: currPrints, permalink: current.permalink || previous?.permalink || null };
+      modelChanges[id] = { id, name: current.name, downloadsGained, printsGained, boostsGained, previousDownloads: prevDownloads, previousPrints: prevPrints, currentDownloads: currDownloads, currentPrints: currPrints, permalink: current.permalink || previous?.permalink || null };
Après le calcul rewardsEarned/rewardPointsTotal, ajoute les points de boosts :

-    const rewardsEarned = []; let rewardPointsTotal = 0;
+    const rewardsEarned = []; let rewardPointsTotal = 0;
@@
-    return { dailyDownloads, dailyPrints, points: currentValues.points, pointsGained: currentValues.points - previousDay.points, top5Downloads, top5Prints, rewardsEarned, rewardPointsTotal, ... };
+    // points de boosts (agrégés)
+    const boostPointsVal = await this._getBoostPointsValue();
+    const totalBoostsGained = Object.values(modelChanges).reduce((s,m)=>s + (m.boostsGained||0), 0);
+    const boostPointsTotal = totalBoostsGained * boostPointsVal;
+    rewardPointsTotal += boostPointsTotal;
+
+    return {
+      dailyDownloads, dailyPrints,
+      points: currentValues.points,
+      pointsGained: currentValues.points - previousDay.points,
+      top5Downloads, top5Prints,
+      rewardsEarned,
+      rewardPointsTotal,
+      totalBoostsGained, boostPointsTotal, boostPointsVal,
+      from: new Date(previousDay.timestamp)....,
+      to: new Date()....
+    };
c) Compter les boosts dans l’interim (depuis baseline)
Dans handleInterimSummaryRequest() :

capter boostsGained :

-      const downloadsGained = Math.max(0, (Number(current.downloads) || 0) - (Number(previous.downloads) || 0));
-      const printsGained = Math.max(0, (Number(current.prints) || 0) - (Number(previous.prints) || 0));
-      if (downloadsGained > 0 || printsGained > 0) modelChanges[id] = { ... };
+      const downloadsGained = Math.max(0, (Number(current.downloads)||0) - (Number(previous.downloads)||0));
+      const printsGained = Math.max(0, (Number(current.prints)||0) - (Number(previous.prints)||0));
+      const boostsGained = Math.max(0, (Number(current.boosts)||0) - (Number(previous.boosts)||0));
+      if (downloadsGained > 0 || printsGained > 0 || boostsGained > 0)
+        modelChanges[id] = {
+          id, name: current.name,
+          downloadsGained, printsGained, boostsGained,
+          previousDownloads: previous.downloads || 0, previousPrints: previous.prints || 0,
+          currentDownloads: current.downloads || 0, currentPrints: current.prints || 0,
+          imageUrl: current.imageUrl || ''
+        };
additionner les points de boosts :

-    let rewardsEarned = [], rewardPointsTotal = 0;
+    let rewardsEarned = [], rewardPointsTotal = 0;
@@
-    const totalEquivalent = dailyDownloads + (dailyPrints * 2);
+    const totalEquivalent = dailyDownloads + (dailyPrints * 2);
+    const boostPointsVal = await this._getBoostPointsValue();
+    const totalBoostsGained = Object.values(modelChanges).reduce((s,m)=>s + (m.boostsGained||0), 0);
+    const boostPointsTotal = totalBoostsGained * boostPointsVal;
+    rewardPointsTotal += boostPointsTotal;
afficher les boosts dans le message (voir section “Traduction” ci-dessous).

d) Compter les boosts dans les notifs per-model et summary mode
Dans checkAndNotify() :

Branche boost-only (hors summary-mode) :

- const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
+ const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
+ if (sent) {
+   const boostPts = (await this._getBoostPointsValue()) * Math.max(0, boostsDelta);
+   if (boostPts > 0) await this._accumulateDailyRewardPoints(boostPts);
+ }
Branche milestone (hors summary-mode) – après l’envoi :

- if (sent && modelSummary.rewards.length > 0) { const pts = modelSummary.rewards.reduce((s,r)=>s+r.points,0); await this._accumulateDailyRewardPoints(pts); }
+ if (sent) {
+   const pts = modelSummary.rewards.reduce((s,r)=>s+r.points,0);
+   const boostPts = (await this._getBoostPointsValue()) * Math.max(0, boostsDelta);
+   const totalPts = pts + boostPts;
+   if (totalPts > 0) await this._accumulateDailyRewardPoints(totalPts);
+}
summary-mode (agrégat) :

stocker les points de boost par modèle :

- if (hasActivity3) modelsActivity.push({
+ if (hasActivity3) modelsActivity.push({
    ...
-   boostsDelta,
+   boostsDelta,
+   boostPointsForThisModel: Math.max(0, boostsDelta) * (await this._getBoostPointsValue()),
inclure dans les totaux de la période :

- const rewardPointsThisRun = modelsActivity.reduce((s,m)=>s + (m.rewardPointsForThisModel||0),0);
+ const rewardPointsThisRun = modelsActivity.reduce((s,m)=>s + (m.rewardPointsForThisModel||0) + (m.boostPointsForThisModel||0), 0);
et dans l’affichage (voir “Traduction” juste après).

2) Traduction FR + mise en forme claire
a) ntfy : ignorer aussi le heartbeat en FR
Dans __sendNtfyWithCfg :

-  if (text && text.includes('No new prints or downloads found.')) {
+  if (text && (text.includes('No new prints or downloads found.') || text.includes('Aucune nouvelle impression ni téléchargement.'))) {
b) Heartbeat et logs FR
Dans checkAndNotify() :

- if (!anyNotification && !useSummaryMode) { const heartbeatMsg = 'No new prints or downloads found.'; ...
+ if (!anyNotification && !useSummaryMode) {
+   const heartbeatMsg = 'Aucune nouvelle impression ni téléchargement.';
+   ...
c) Messages FR – per-model (milestone / boost-only)
Dans la construction des messages (milestone) :

- lines.push(`📦 Update for: ${current.name}`, '', `${downloadsDeltaEquivalent > 0 ? '+' : ''}${downloadsDeltaEquivalent} Downloads (total ${equivalentTotal})`, '');
- lines.push(`⬇️ Downloads: ${currentDownloadsRaw} (${downloadsDeltaRaw > 0 ? '+' : ''}${downloadsDeltaRaw})`);
- lines.push(`🖨️ Prints: ${currentPrints} (${printsDelta > 0 ? '+' : ''}${printsDelta})`);
+ lines.push(`📦 Mise à jour : ${current.name}`, '');
+ lines.push(`${downloadsDeltaEquivalent > 0 ? '+' : ''}${downloadsDeltaEquivalent} points de téléchargement (total ${equivalentTotal})`, '');
+ lines.push(`⬇️ Téléchargements : ${currentDownloadsRaw} (${downloadsDeltaRaw > 0 ? '+' : ''}${downloadsDeltaRaw})`);
+ lines.push(`🖨️ Impressions : ${currentPrints} (${printsDelta > 0 ? '+' : ''}${printsDelta})`);
@@
- if (modelSummary.rewards.length > 0) { modelSummary.rewards.forEach(r => lines.push(`🎁 Reward Earned! +${r.points} points at ${r.thresholdDownloads} downloads`)); lines.push(''); }
+ if (modelSummary.rewards.length > 0) {
+   modelSummary.rewards.forEach(r => lines.push(`🎁 Palier atteint ! +${r.points} pts à ${r.thresholdDownloads}`));
+   lines.push('');
+ }
@@
- lines.push(`🎯 Next Reward: ${downloadsUntilNext} more downloads (${nextThresholdAfterCurrent} total)`, '', `🔁 Reward Interval: every ${this.getRewardInterval(equivalentTotal)} downloads`);
- if (boostsDelta > 0) lines.push('', `⚡ Boosts: +${boostsDelta} (now ${currentBoosts})`);
+ lines.push(`🎯 Prochain palier : encore ${downloadsUntilNext} (objectif ${nextThresholdAfterCurrent})`, '');
+ lines.push(`🔁 Intervalle : tous les ${this.getRewardInterval(equivalentTotal)}`);
+ if (boostsDelta > 0) {
+   const boostPts = Math.max(0, boostsDelta) * (await this._getBoostPointsValue());
+   lines.push('', `⚡ Boosts : +${boostsDelta} → +${boostPts} pts`);
+ }
@@
- warning = "\n\n⚠️ The number of downloads or prints during this period is very high. ...";
+ warning = "\n\n⚠️ Volume très élevé sur la période. C’est peut-être un pic de popularité (bravo !) ou un artefact. Tu peux réduire l’intervalle de rafraîchissement si besoin.";
Branche boost-only :

- lines.push(`⚡ Boost Update for: ${current.name}`, '', `⚡ Boosts: +${boostsDelta} (now ${currentBoosts})`);
+ const boostPts = Math.max(0, boostsDelta) * (await this._getBoostPointsValue());
+ lines.push(`⚡ Boost sur : ${current.name}`, '', `⚡ Boosts : +${boostsDelta} → +${boostPts} pts`);
d) Messages FR – summary-mode (agrégat)
Intro + lignes modèle :

- if (forceSummaryMode) await this.sendTelegramMessage("Switching to summary mode due to the high number of updates this period. This ensures Telegram limits are not reached.");
+ if (forceSummaryMode) await this.sendTelegramMessage("Beaucoup d’activité : passage en mode récap pour éviter les limites Telegram.");
@@
- const headerLines = [`📊 Summary (${fromTs} - ${toTs}):`, '', `Download points this period: ${totalEquivalent} `, '', 'Model updates:', ''];
+ const headerLines = [
+  `📊 Récap (${fromTs} → ${toTs})`,
+  '',
+  `Points de téléchargement sur la période : ${totalEquivalent}`,
+  '',
+  'Mises à jour de modèles :',
+  ''
+];
@@
- let line = `${i+1}. <b>${escapeHtml(m.name)}</b>: +${downloadsDelta} (total ${total})`;
+ let line = `${i+1}. <b>${escapeHtml(m.name)}</b> : +${downloadsDelta} (total ${total})`;
@@
- line += ` — DL: ${dl} (${dld >= 0 ? '+' : ''}${dld}), PR: ${pr} (${prd >= 0 ? '+' : ''}${prd})`;
- if (ptsEarned>0) line += `  🎉 +${ptsEarned} pts`; line += ` (needs ${remaining} for next 🎁, interval ${interval})`;
+ line += ` — Téléch. : ${dl} (${dld >= 0 ? '+' : ''}${dld}), Impr. : ${pr} (${prd >= 0 ? '+' : ''}${prd})`;
+ if (ptsEarned>0) line += `  🎉 +${ptsEarned} pts`;
+ if ((m.boostPointsForThisModel||0) > 0) line += `  ⚡ +${m.boostPointsForThisModel} pts (boosts)`;
+ line += `  — reste ${remaining} pour 🎁 (palier ${interval})`;
@@
- if ((m.boostsDelta || 0) > 0) {
-   line += `\n⚡ Boosts: +${m.boostsDelta}`;
- }
+ if ((m.boostsDelta || 0) > 0) {
+   line += `\n⚡ Boosts : +${m.boostsDelta}`;
+ }
Footer :

- const footerLines = [
-   '',
-   `Rewards this period: ${rewardPointsThisRun} pts`,
-   `Rewards today: ${rewardsToday} pts`,
-   `Models close to 🎁: ${closeToGiftCount}`
- ];
+ const footerLines = [
+   '',
+   `🎁 Points (période) : ${rewardPointsThisRun} pts`,
+   `🎁 Points (aujourd’hui) : ${rewardsToday} pts`,
+   `🎯 Modèles proches du prochain palier (≤2) : ${closeToGiftCount}`
+ ];
e) Messages FR – Interim
Construis le message en FR + ajoute les boosts :

- const message = `
-🔔 Interim Summary (${fromTs} - ${toTs}):
-
-Total Download points: ${totalEquivalent}
-
-🏆 Top Downloads:
-${topDownloadsList}
-
-🖨️ Top Prints:
-${topPrintsList}
-
-🎁 Rewards earned so far:
-${rewardsEarned.length > 0 ? ... : 'No rewards earned so far'}
-`.trim();
+ const message = `
+🔔 Récap intermédiaire (${fromTs} → ${toTs})
+
+Points de téléchargement : ${totalEquivalent}
+⚡ Boosts gagnés : +${totalBoostsGained} → +${boostPointsTotal} pts
+
+🏆 Top téléchargements :
+${topDownloadsList}
+
+🖨️ Top impressions :
+${topPrintsList}
+
+🎁 Points gagnés jusque-là :
+${(rewardPointsTotal > 0)
+  ? `${rewardsEarned.length ? rewardsEarned.map(r => `${r.name} : +${r.rewardPointsTotalForModel} pts (seuils : ${r.thresholds.join(', ')})`).join('\n')+'\n' : ''}Total : ${rewardPointsTotal} pts`
+  : 'Aucun point pour l’instant'}
+`.trim();
f) Messages FR – Daily
Dans scheduleDailyNotification() (message 24-Hour Summary), remplace le bloc par :

- const message = `
-📊 24-Hour Summary (${summary.from} - ${summary.to}):
-
-Total Download points: ${totalEquivalent}
-
-🏆 Today's Most Downloaded:
-${topDownloadsList}
-
-🖨️ Today's Most Printed:
-${topPrintsList}
-
-🎁 Rewards earned in last 24 hours:
-${rewardsSection}
-Total Reward Points: ${summary.rewardPointsTotal}
-`.trim();
+ const message = `
+📊 Récap 24h (${summary.from} → ${summary.to})
+
+Points de téléchargement : ${totalEquivalent}
+⚡ Boosts gagnés : +${summary.totalBoostsGained||0} → +${summary.boostPointsTotal||0} pts
+
+🏆 Top téléchargements :
+${topDownloadsList}
+
+🖨️ Top impressions :
+${topPrintsList}
+
+🎁 Points gagnés (24h) :
+${summary.rewardsEarned?.length
+  ? summary.rewardsEarned.map(r => `${r.name} : +${r.rewardPointsTotalForModel} pts (seuils : ${r.thresholds.join(', ')})`).join('\n')
+  : 'Aucun palier atteint'}
+
+Total points (24h) : ${summary.rewardPointsTotal}
+`.trim();
Résultat
Chaque boost ajoute boostPointsValue points (par défaut 5) :

inclus dans les notifs “boost-only”, “milestone”, interim, summary-mode, et daily ;

consolidé dans le compteur journalier via _accumulateDailyRewardPoints.

Toutes les notifs sont en français, avec vocabulaire homogène :

“Points de téléchargement” pour downloads + 2×prints (métrique historique),

“⚡ Boosts : +N → +M pts” quand applicable,

Paliers : “🎯/🎁”.

Si tu veux, je peux te faire un fichier complet (monobloc) avec ces patches déjà fusionnés.

Vous avez dit :
[Report Only] Refused to execute inline script because it violates the following Content Security Policy directive: "script-src 'none'". Either the 'unsafe-inline' keyword, a hash ('sha256-WHD9ZtgXNW8ss2JbAWTLz+bNRjbCM6bRqweRpFyZkNY='), or a nonce ('nonce-...') is required to enable inline execution.

16[Report Only] Refused to connect to '<URL>' because it violates the following Content Security Policy directive: "connect-src 'none'".

chrome-extension://aâ€¦olke/content.js:887 Uncaught SyntaxError: Unexpected token 'catch'
ChatGPT a dit :

Réflexion durant 45s
OK, tu as trois messages distincts :

[Report Only] script-src 'none'

[Report Only] connect-src 'none'

Uncaught SyntaxError: Unexpected token 'catch' (dans ton content.js)

Voici ce que ça veut dire et comment corriger, concrètement.

1) CSP “script-src 'none'” (Report Only)
Ce message vient de la page visitée : elle interdit l’exécution de scripts inline.

Comme c’est en Report Only, c’est juste un avertissement (ça ne bloque pas ton content script d’extension, tant qu’il est injecté via le manifest).

À ne pas faire : injecter du <script>…</script> inline dans la page ou utiliser eval/new Function.

À faire : continuer d’exécuter ton code en content script déclaré dans manifest.json. C’est ce que tu fais déjà.

👉 Conclusion : ce log est “bruyant” mais sans effet bloquant sur l’extension (en mode report-only).

2) CSP “connect-src 'none'” (Report Only) — et pourquoi tes fetch doivent passer par le SW
Les content scripts héritent du CSP réseau de la page : tes fetch() vers ntfy / Telegram peuvent être bloqués si la page a un connect-src strict (et quand ce ne sera plus “report-only”, ce sera bloquant).

Solution robuste
Déplace tous les fetch() réseau dans le service worker (background) et appelle-les depuis le content script via chrome.runtime.sendMessage. Le SW n’est pas soumis au CSP de la page.

Patch minimal
manifest.json (MV3)

{
  "background": { "service_worker": "background.js" },
  "permissions": ["storage"],
  "host_permissions": [
    "https://api.telegram.org/*",
    "https://ntfy.*/*",
    "https://*/*"          // ou restreins à ton domaine ntfy exact
  ]
}
background.js (nouveau)

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'BG_FETCH') {
    (async () => {
      try {
        const res = await fetch(msg.url, msg.options || {});
        const body = await res.text(); // ou arrayBuffer si binaire
        sendResponse({ ok: res.ok, status: res.status, body });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true; // keep channel open (async)
  }
});
helper côté content script

async function bgFetch(url, options) {
  const resp = await chrome.runtime.sendMessage({ type: 'BG_FETCH', url, options });
  if (!resp || !resp.ok) throw new Error(resp?.error || `BG_FETCH failed (${resp?.status})`);
  return resp;
}
remplace tes fetch() réseau côté content script :

ntfy dans __sendNtfyWithCfg :

- const res = await fetch(url, { method:"POST", headers, body: htmlToMd(text||"") });
+ const res = await bgFetch(url, { method:"POST", headers, body: htmlToMd(text||"") });
+ res.ok = true; res.status = 200; // on a déjà jeté si pas ok; garde la logique existante simple
Telegram sendMessage / sendPhoto :

- const res = await fetch(`https://api.telegram.org/bot${this.telegramToken}/sendMessage`, {...});
+ const res = await bgFetch(`https://api.telegram.org/bot${this.telegramToken}/sendMessage`, {...});

- const imgRes = await fetch(photoUrl);
+ const imgRes = await bgFetch(photoUrl);
Pour sendPhoto, comme tu envoies un FormData avec un binaire, deux options simples :

soit tu continues d’envoyer la légende texte via Telegram et l’image via ntfy (tu le fais déjà) ;

soit tu fais tout dans le SW : télécharge l’image (fetch → arrayBuffer), reconstruis FormData dans background.js, puis fetch vers Telegram. (Un peu plus de code, mais toujours viable.)

3) “Uncaught SyntaxError: Unexpected token 'catch'”
Ça, c’est du parsing : Chrome tombe sur un catch là où il n’attend pas de bloc catch. Deux causes ultra-courantes :

❌ Un catch sans try juste avant (souvent après une accolade mal fermée).

❌ Une chaîne de promesse écrite comme await quelqueChose(); catch(e) {…} (le . devant catch a sauté après un retour à la ligne) :

// ❌ cassera le parseur si un point/parenthèse manque
const t = await res.text()
catch(() => res.statusText);
Il faut que ce soit sur la même ligne que l’appel ou bien garder le point :

// ✔️ correct
const t = await res.text().catch(() => res.statusText);
Ce que je vois dans ton code : tu utilises la forme correcte (await res.text().catch(...)).
Mais l’erreur dit content.js:887 — souvent c’est un fichier bundlé/minifié où un point a sauté ou une accolade est en trop.

Pour le corriger vite :
Ouvre content.js dans DevTools, clique sur Pretty Print {}, va à la ligne 887.

Vérifie le bloc juste avant catch :

y a-t-il bien un try { … } catch (...) ?

si c’est une promesse, y a-t-il bien .catch( (avec un point) collé à l’appel précédent ?

Cherche des catch orphelins :

Ctrl+F → \bcatch\b

remonte de quelques lignes pour vérifier l’équilibre des accolades.

Bonus : tu utilises des nombres avec séparateurs (15_000). Chrome les gère, mais un vieux transpileur peut casser le bundle. Si ton bundler transpile mal, enlève les _ par sécurité.

Récap actions
✅ Aucun inline script (garde tout via manifest, pas d’injection HTML).

✅ Déplacer les fetch() du content script → service worker (contourne connect-src de la page).

✅ Réparer le catch : vérifier le point avant .catch( ou l’équilibre try { } catch { }.

(Optionnel) enlève les séparateurs numériques si ton bundler transpile mal.

Si tu veux, je te prépare une version compacte de background.js qui gère ntfy + Telegram proprement (texte + image) pour que tu n’aies qu’à remplacer 3 appels côté content.

Vous avez dit :
const ITERATION = 'Iteration 20.4.1';
console.log(Initializing monitor — ${ITERATION});

const escapeHtml = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
// === ntfy (override minimal; no flow change) ===
// Reads chrome.storage.sync keys set by your popup (if any):
//   useNtfy (bool, optional), ntfyUrl (string), ntfyAuth (string, optional),
//   ntfyTags (string, optional), ntfyPriority (1..5, optional)
async function __sendNtfyWithCfg(cfg, { title, text, imageUrl, clickUrl, tags, priority }) {
  // 💓 1) Ignorer le heartbeat
  if (text && (text.includes('No new prints or downloads found.') || text.includes('Aucune nouvelle impression ni téléchargement.'))) {
    console.debug('[MakerStats] ntfy: heartbeat suppressed');
    return true;
  }
    // Convertit un message HTML "léger" (Telegram) en Markdown (ntfy)
  const htmlToMd = (s="") =>
    String(s)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<b>/gi, '**').replace(/<\/b>/gi, '**')
      .replace(/<strong>/gi, '**').replace(/<\/strong>/gi, '**')
      .replace(/<i>/gi, '*').replace(/<\/i>/gi, '*')
      .replace(/<em>/gi, '*').replace(/<\/em>/gi, '*')
      // retire toute autre balise HTML résiduelle
      .replace(/<\/?[^>]+>/g, '');

  // 💬 2) URL du serveur ntfy
  const url = (cfg && cfg.ntfyUrl) ? String(cfg.ntfyUrl).trim() : "";
  if (!url) {
    console.error("[MakerStats] ntfy: ntfyUrl missing");
    return false;
  }

  // 🧹 3) Nettoyage minimal (évite erreurs Chrome sur headers non ASCII)
  const asciiOnly = (s) => (s || "").replace(/[^\x00-\x7F]/g, "");
  const asciiOrEmpty = (s) => asciiOnly(String(s || "")).trim();

  // 🔢 4) Détermination de la priorité
  const prio = (cfg && Number.isFinite(cfg.ntfyPriority))
    ? cfg.ntfyPriority
    : (Number.isFinite(priority) ? priority : 3);

  // 🧩 5) Headers de base (ASCII only)
  const baseHeaders = {
    "Priority": String(prio),
  };
  if (cfg && cfg.ntfyAuth) baseHeaders["Authorization"] = asciiOrEmpty(cfg.ntfyAuth);
  if (cfg && cfg.ntfyTags) baseHeaders["Tags"] = asciiOrEmpty(cfg.ntfyTags);
  if (clickUrl) baseHeaders["Click"] = asciiOrEmpty(clickUrl);
  if (title) baseHeaders["Title"] = asciiOrEmpty(title);
  baseHeaders["Markdown"] = "yes";

  try {
    // === 🖼️ CAS IMAGE (prévisualisable) ===
    if (imageUrl) {
      const headers = {
        ...baseHeaders,
        "Content-Type": "text/plain",
        "Attach": asciiOrEmpty(encodeURI(imageUrl)), // ntfy va télécharger et afficher la preview
      };

      const res = await fetch(url, {
        method: "POST",
        headers,
        body:  htmlToMd(text || ""), // le message peut contenir accents/émojis
      });

      if (!res.ok) {
        const t = await res.text().catch(() => res.statusText);
        console.error("[MakerStats] ntfy POST (Attach) HTTP", res.status, t);
        return false;
      }

      console.debug("[MakerStats] ntfy POST (Attach) OK — image preview enabled");
      return true;
    }

    // === ✉️ CAS TEXTE SEUL ===
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...baseHeaders,
        "Content-Type": "text/plain"
      },
      body: htmlToMd(text || ""),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => res.statusText);
      console.error("[MakerStats] ntfy POST (text) HTTP", res.status, t);
      return false;
    }

    console.debug("[MakerStats] ntfy POST (text) OK");
    return true;

  } catch (e) {
    console.error("[MakerStats] ntfy send error:", e);
    return false;
  }
}




const autoScrollToFullBottom = ({ step = 600, delay = 250, settle = 800 } = {}) => new Promise(resolve => {
  let timer;
  const scrollAndCheck = () => {
    window.scrollBy(0, step);
    const currentHeight = document.body.scrollHeight;
    const atBottom = (window.innerHeight + window.scrollY) >= (currentHeight - 2);
    if (atBottom) {
      clearInterval(timer);
      setTimeout(() => {
        if (document.body.scrollHeight > currentHeight) timer = setInterval(scrollAndCheck, delay);
        else resolve();
      }, settle);
    }
  };
  timer = setInterval(scrollAndCheck, delay);
});

class ValueMonitor {
  constructor() {
    // config/state
    this.telegramToken = '';
    this.chatId = '';
    this.previousValues = null;
    this.checkInterval = null;
    this._dailyTimerId = null;
    this.isChecking = false;
    // identity/keys/timeouts
    this._instanceId = Math.random().toString(36).slice(2);
    this._dailyLockKey = 'dailyLock';
    this._dailyStatsKey = 'dailyStats';
    this._lastSuccessfulKey = 'lastSuccessfulDailyReport';
    this._dailyRunningRewardKey = 'dailyRunningRewardPoints';
    this._dailyRunningRewardDayKey = 'dailyRunningRewardDay';
    this._dailyLockTimeoutMs = 2 * 60 * 1000;
    this._dailyMaxPreSendRetries = 5;
    this._dailyPreSendBaseBackoffMs = 300;
    this._dailyScheduleJitterMs = 30 * 1000;
    this._defaultFallbackHours = 48;
    this.notifySummaryMode = false;
    this._telegramMaxMessageChars = 4000;
    this._suspiciousDeltaLimit = 200;
	this._interimTimers = [];
	this._interimSlots = ['07:00','12:00','16:00','22:00']; // créneaux fixes
	this._interimJitterMs = 15_000; // ±15s pour désynchroniser
	this._interimClaimKey = 'lastInterimSentKey'; // anti-doublon cross-onglets
	this._boostPointsDefault = 15;
  }

  // logging shorthands (preserve outputs)
  log(...a){ console.log(...a); }
  warn(...a){ console.warn(...a); }
  error(...a){ console.error(...a); }
	 // --- ENVOI SNAPSHOT DE TOUS LES MODÈLES ---
  _nextOccurrenceFor(timeStr) {
  const [h, m] = String(timeStr).split(':').map(Number);
  const now = new Date();
  const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h||0, m||0, 0, 0);
  if (dt <= now) dt.setDate(dt.getDate() + 1);
  return dt;
}
  async _getBoostPointsValue() {
    try {
      const cfg = await new Promise(res => chrome.storage.sync.get(['boostPointsValue'], r => res(r||{})));
      const v = Number(cfg?.boostPointsValue);
      return Number.isFinite(v) && v >= 0 ? v : this._boostPointsDefault;
    } catch { return this._boostPointsDefault; }
  }


_clearInterimTimers() {
  for (const t of this._interimTimers) clearTimeout(t);
  this._interimTimers = [];
}

// retournne une clé unique pour le créneau du jour (ex: "2025-10-14T09:00")
_makeInterimSlotKey(dateObj, timeStr) {
  const pad = n => String(n).padStart(2,'0');
  return ${dateObj.getFullYear()}-${pad(dateObj.getMonth()+1)}-${pad(dateObj.getDate())}T${timeStr};
}

// planifie un seul créneau (avec jitter & auto-reschedule)
_scheduleOneInterim(timeStr) {
  const target = this._nextOccurrenceFor(timeStr);
  const baseDelay = Math.max(0, target - Date.now());
  const jitter = Math.floor((Math.random() * 2 - 1) * this._interimJitterMs); // [-jitter;+jitter]
  const delay = Math.max(0, baseDelay + jitter);

  this.log(Interim "${timeStr}" prévu à ${new Date(Date.now()+delay).toLocaleString()} (base=${baseDelay}ms, jitter=${jitter}ms));

  const timerId = setTimeout(async () => {
    try {
      // anti-doublon inter-onglets : on "claim" la fenêtre de tir
      const slotKey = this._makeInterimSlotKey(new Date(), timeStr); // date du jour courant
      const store = await new Promise(res => chrome.storage.local.get([this._interimClaimKey], v => res(v||{})));
      const lastKey = store?.[this._interimClaimKey];

      if (lastKey === slotKey) {
        this.log(Interim ${timeStr}: déjà envoyé pour ce créneau (${slotKey}), on skip.);
      } else {
        // petit "claim" optimiste (meilleur-effort)
        await new Promise(r => chrome.storage.local.set({ [this._interimClaimKey]: slotKey }, () => r()));
        this.log(Interim ${timeStr}: envoi… (slot=${slotKey}));
        try {
          await this.handleInterimSummaryRequest();
        } catch (e) {
          this.warn(Interim ${timeStr}: échec d'envoi, e);
          // en cas d'échec on ne "déclaim" pas — ce n’est pas critique pour de la notif
        }
      }
    } catch (e) {
      this.error(Interim ${timeStr}: erreur inattendue, e);
    } finally {
      // replanifie ce créneau pour le lendemain
      this._scheduleOneInterim(timeStr);
    }
  }, delay);

  this._interimTimers.push(timerId);
}

// planifie les 4 interims du jour
scheduleInterimNotifications() {
  this._clearInterimTimers();
  const slots = Array.isArray(this._interimSlots) && this._interimSlots.length
    ? this._interimSlots
    : ['09:00','12:00','16:00','22:00'];

  for (const s of slots) this._scheduleOneInterim(s);
  this.log(Interim scheduling actif pour: ${slots.join(', ')});
}
  async sendModelsSnapshot() {
    const current = this.getCurrentValues();
    if (!current || !current.models || !Object.keys(current.models).length) {
      await this.sendTelegramMessage("No models found on the page.");
      return true;
    }

    // Tri par “popularité” (downloads + 2x prints) décroissant
    const models = Object.values(current.models)
      .map(m => ({
        ...m,
        totalEq: this.calculateDownloadsEquivalent(m.downloads, m.prints)
      }))
      .sort((a,b) => b.totalEq - a.totalEq);

    // En-tête
    const header = 📸 Models snapshot (${models.length} items)\nSorted by downloads + 2×prints\n;
    await this.sendTelegramMessage(header);

    // Envoi 1 message par modèle (avec image si dispo)
    for (const m of models) {
      const captionLines = [
        📦 ${m.name},
        ⬇️ Downloads: ${m.downloads},
        🖨️ Prints: ${m.prints},
        ⚡ Boosts: ${m.boosts},
        Σ Downloads eq: ${m.totalEq},
      ];
      if (m.permalink) captionLines.push(🔗 ${m.permalink});
      const caption = captionLines.join('\n');

      if (m.imageUrl) {
        await this.sendTelegramMessageWithPhoto(caption, m.imageUrl);
      } else {
        await this.sendTelegramMessage(caption);
      }

      // petit spacing pour éviter rate limit Telegram/ntfy
      await new Promise(r => setTimeout(r, 250));
    }

    return true;
  }
  // period key uses user's dailyNotificationTime or 12:00 default
  async getCurrentPeriodKey() {
    const cfg = await new Promise(res => chrome.storage.sync.get(['dailyNotificationTime'], r =>
      res(r && r.dailyNotificationTime ? r.dailyNotificationTime : '12:00')));
    const [hourStr, minuteStr] = String(cfg).split(':');
    const hour = Number.isFinite(Number(hourStr)) ? Number(hourStr) : 12;
    const minute = Number.isFinite(Number(minuteStr)) ? Number(minuteStr) : 0;
    const now = new Date();
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    if (candidate > now) candidate.setDate(candidate.getDate() - 1);
    const pad = n => String(n).padStart(2,'0');
    const offset = -candidate.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const offsetHours = pad(Math.floor(Math.abs(offset)/60));
    const offsetMins = pad(Math.abs(offset)%60);
    return ${candidate.getFullYear()}-${pad(candidate.getMonth()+1)}-${pad(candidate.getDate())}T${pad(candidate.getHours())}:${pad(candidate.getMinutes())}:00${sign}${offsetHours}:${offsetMins};
  }

  // split large telegram messages into parts keeping paragraphs
  _splitMessageIntoParts(message='', maxLen=this._telegramMaxMessageChars) {
    if (!message) return [];
    if (message.length <= maxLen) return [message];
    const parts=[]; const paragraphs = message.split('\n\n'); let current='';
    for (const p of paragraphs) {
      const chunk = (current ? '\n\n' : '') + p;
      if ((current + chunk).length > maxLen) {
        if (current) { parts.push(current); current = p; if (current.length > maxLen) { let s=0; while (s < current.length){ parts.push(current.slice(s, s+maxLen)); s+=maxLen;} current=''; } }
        else { let s=0; while (s < p.length){ parts.push(p.slice(s, s+maxLen)); s+=maxLen; } current=''; }
      } else current += chunk;
    }
    if (current) parts.push(current);
    return parts;
  }

  // Telegram send helpers with one retry
  async sendTelegramMessage(message, attempt=1) {
	    // --- ntfy override minimal ---
    try {
      const cfg = await new Promise(res =>
        chrome.storage.sync.get(['useNtfy','ntfyUrl','ntfyAuth','ntfyTags','ntfyPriority'], v => res(v||{}))
      );
      const enabled = (cfg.useNtfy === undefined ? !!cfg.ntfyUrl : !!cfg.useNtfy);
      if (enabled && cfg.ntfyUrl) {
        return await __sendNtfyWithCfg(cfg, { title:'MakerWorld', text: message, imageUrl:'', clickUrl:'', tags:'makerworld,update', priority:3 });
      }
    } catch(e) { /* fallback to Telegram */ }
    if (!this.telegramToken || !this.chatId) { this.error('Missing Token or Chat ID'); return false; }
    const parts = this._splitMessageIntoParts(message, this._telegramMaxMessageChars);
    for (const part of parts) {
      const payload = { chat_id: this.chatId, text: part, parse_mode: 'HTML' };
      this.log('→ Telegram payload (part):', { len: part.length });
      try {
        const res = await fetch(https://api.telegram.org/bot${this.telegramToken}/sendMessage, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        const body = await res.json();
        if (!res.ok) {
          this.error('← Telegram API error:', body);
          if (attempt < 2) { this.log('Retrying Telegram send...'); await new Promise(r=>setTimeout(r,1000)); return this.sendTelegramMessage(message, attempt+1); }
          return false;
        }
        this.log('← Telegram API ok:', body);
      } catch (err) {
        this.error('Error sending message:', err);
        if (attempt < 2) { this.log('Retrying Telegram send...'); await new Promise(r=>setTimeout(r,1000)); return this.sendTelegramMessage(message, attempt+1); }
        return false;
      }
      await new Promise(r=>setTimeout(r,200));
    }
    return true;
  }

  async sendTelegramMessageWithPhoto(message, photoUrl) {
	// --- ntfy override minimal ---
    try {
      const cfg = await new Promise(res =>
        chrome.storage.sync.get(['useNtfy','ntfyUrl','ntfyAuth','ntfyTags','ntfyPriority'], v => res(v||{}))
      );
      const enabled = (cfg.useNtfy === undefined ? !!cfg.ntfyUrl : !!cfg.useNtfy);
      if (enabled && cfg.ntfyUrl) {
        return await __sendNtfyWithCfg(cfg, { title:'MakerWorld', text: message, imageUrl:(photoUrl||''), clickUrl:'', tags:'makerworld,model,update', priority:4 });
      }
    } catch(e) { /* fallback to Telegram */ }
    if (!this.telegramToken || !this.chatId || !photoUrl) { this.log('Falling back to text message (missing token/chat/photo).'); return this.sendTelegramMessage(message); }
    try {
      this.log('Attempting to send photo:', { photoUrl, chatId: this.chatId });
      const imgRes = await fetch(photoUrl);
      if (!imgRes.ok) throw new Error(Image download failed: ${imgRes.status});
      const blob = await imgRes.blob();
      const form = new FormData(); form.append('chat_id', this.chatId); form.append('caption', message); form.append('photo', blob, 'model_image.jpg');
      const res = await fetch(https://api.telegram.org/bot${this.telegramToken}/sendPhoto, { method:'POST', body: form });
      const result = await res.json();
      this.log('Telegram response:', result);
      if (!res.ok) throw new Error(Telegram Error: ${res.status});
      return true;
    } catch (err) {
      this.error('Error sending photo:', err);
      return this.sendTelegramMessage(message);
    }
  }

  // scraping/parsing
  parseNumber(text){ if (!text) return 0; text = String(text).trim().toLowerCase(); if (text.includes('k')){ const base = parseFloat(text.replace('k','')); if (Number.isFinite(base)) return Math.round(base*1000); } const n = parseInt(text.replace(/[^\d]/g,''),10); return Number.isFinite(n)? n:0; }

  getCurrentValues() {
    try {
      const currentValues = { models: {}, points: 0, timestamp: Date.now() };
      try {
        const pointsContainer = document.querySelector('.mw-css-1541sxf');
        this.log('Found points container:', !!pointsContainer);
        if (pointsContainer) {
          const pts = pointsContainer.textContent.trim().match(/[\d,]+(\.\d+)?/);
          if (pts && pts[0]) { currentValues.points = parseFloat(pts[0].replace(/,/g,'')); this.log('Points found:', currentValues.points); }
        }
      } catch (e){ this.error('Error extracting points:', e); }
      const downloadElements = document.querySelectorAll('[data-trackid]');
      downloadElements.forEach(element => {
        const modelId = element.getAttribute('data-trackid');
        const modelTitle = element.querySelector('h3.translated-text');
        const name = modelTitle?.textContent.trim() || 'Model';
        const imageUrl = element.querySelector('img')?.getAttribute('src') || '';
        let permalink = null;
        const anchor = element.querySelector('a[href*="/models/"], a[href*="/model/"], a[href*="/models/"]');
        if (anchor?.href) permalink = anchor.href;
        const allMetrics = element.querySelectorAll('.mw-css-xlgty3 span');
        if (allMetrics.length >= 3) {
          const lastThree = Array.from(allMetrics).slice(-3);
          const boosts = this.parseNumber(lastThree[0]?.textContent || '0');
          const downloads = this.parseNumber(lastThree[1]?.textContent || '0');
          const prints = this.parseNumber(lastThree[2]?.textContent || '0');
          currentValues.models[modelId] = { id: modelId, permalink, name, boosts, downloads, prints, imageUrl };
          this.log(Model "${name}":, { id: modelId, boosts, downloads, prints, permalink });
        } else this.log(Not enough metrics for ${name} (found ${allMetrics.length}));
      });
      return currentValues;
    } catch (err) { this.error('Error extracting values:', err); return null; }
  }

  // reward math
  getRewardInterval(totalDownloads){ if (totalDownloads <= 50) return 10; if (totalDownloads <= 500) return 25; if (totalDownloads <= 1000) return 50; return 100; }
  nextRewardDownloads(totalDownloads){ const interval = this.getRewardInterval(totalDownloads); const mod = totalDownloads % interval; return (totalDownloads === 0 || mod === 0) ? totalDownloads + interval : totalDownloads + (interval - mod); }
  getRewardPointsForDownloads(thresholdDownloads){ if (thresholdDownloads <= 50) return 15+3; if (thresholdDownloads <= 500) return 12+3; if (thresholdDownloads <= 1000) return 20+5; return 30+8; }
  calculateDownloadsEquivalent(downloads, prints){ return Number(downloads||0) + (Number(prints||0) * 2); }

  // storage lock helpers
  async acquireDailyLock(timeoutMs = this._dailyLockTimeoutMs) {
    const now = Date.now();
    return new Promise(resolve => chrome.storage.local.get([this._dailyLockKey], res => {
      const lock = res?.[this._dailyLockKey] || null;
      if (!lock || (now - lock.ts) > timeoutMs) {
        if (lock && (now - lock.ts) > timeoutMs) {
          chrome.storage.local.remove([this._dailyLockKey], () => {
            const newLock = { ts: now, owner: this._instanceId };
            chrome.storage.local.set({ [this._dailyLockKey]: newLock }, () => {
              chrome.storage.local.get([this._dailyLockKey], r2 => {
                const confirmed = r2?.[this._dailyLockKey]?.owner === this._instanceId;
                this.log('acquireDailyLock (force unlock) result', { confirmed, owner: r2?.[this._dailyLockKey]?.owner, instance: this._instanceId });
                resolve(confirmed);
              });
            });
          });
        } else {
          const newLock = { ts: now, owner: this._instanceId };
          chrome.storage.local.set({ [this._dailyLockKey]: newLock }, () => {
            chrome.storage.local.get([this._dailyLockKey], r2 => {
              const confirmed = r2?.[this._dailyLockKey]?.owner === this._instanceId;
              this.log('acquireDailyLock result', { confirmed, owner: r2?.[this._dailyLockKey]?.owner, instance: this._instanceId });
              resolve(confirmed);
            });
          });
        }
      } else { this.log('acquireDailyLock failed, existing lock', lock); resolve(false); }
    }));
  }

  async releaseDailyLock() {
    return new Promise(resolve => chrome.storage.local.get([this._dailyLockKey], res => {
      const lock = res?.[this._dailyLockKey] || null;
      if (lock && lock.owner === this._instanceId) {
        chrome.storage.local.remove([this._dailyLockKey], () => { this.log('releaseDailyLock: released by', this._instanceId); resolve(true); });
      } else resolve(false);
    }));
  }

  // pre-send check to avoid duplicate daily sends
  async preSendCheckAndMaybeWait(startTime) {
    for (let attempt = 0; attempt < this._dailyMaxPreSendRetries; attempt++) {
      const latest = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null)));
      if (latest && latest.timestamp >= startTime) { this.log('preSendCheck: found newer dailyStats, aborting send', { latestTs: new Date(latest.timestamp).toISOString(), startTime: new Date(startTime).toISOString() }); return false; }
      const backoff = this._dailyPreSendBaseBackoffMs + Math.floor(Math.random()*700);
      await new Promise(r => setTimeout(r, backoff));
    }
    return true;
  }

  // robust daily summary computation and storage
  async getDailySummary({ persist = true } = {}) {
    const currentValues = this.getCurrentValues();
    if (!currentValues) { this.error('Unable to get current values'); return null; }
    this.log('getDailySummary START — now:', new Date().toISOString());
    this.log('getDailySummary: currentValues.models count =', Object.keys(currentValues.models || {}).length, 'timestamp=', new Date(currentValues.timestamp).toISOString());

    const [previousDayRaw, maxStaleMs] = await Promise.all([
      new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null))),
      new Promise(res => chrome.storage.sync.get(['dailyFallbackMaxAgeMs'], cfg => {
        const cfgVal = cfg?.dailyFallbackMaxAgeMs; res(Number.isFinite(cfgVal) ? cfgVal : (this._defaultFallbackHours*60*60*1000));
      }))
    ]);

    let raw = previousDayRaw;
    if (!raw) {
      for (let i=0;i<3 && !raw;i++){ this.log('getDailySummary: dailyStats missing — retrying read (attempt)', i+1); await new Promise(r=>setTimeout(r,1000)); raw = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r2 => res(r2?.[this._dailyStatsKey] || null))); }
    }
    if (raw) this.log('getDailySummary: read dailyStats from storage:', { ts: new Date(raw.timestamp).toISOString(), ageMs: Date.now()-raw.timestamp, modelsCount: Object.keys(raw.models || {}).length, points: raw.points, owner: raw.owner || null, periodKey: raw.periodKey || null });
    else this.log('getDailySummary: no dailyStats found in storage after retries.');

    const ONE_DAY_MS = 24*60*60*1000;
    let previousDay = null;
    if (raw) {
      const ageMs = Date.now() - raw.timestamp;
      if (ageMs <= ONE_DAY_MS) previousDay = raw, this.log('getDailySummary: using fresh snapshot', new Date(raw.timestamp).toISOString());
      else if (ageMs <= maxStaleMs) previousDay = raw, this.warn('getDailySummary: using STALE snapshot as fallback', new Date(raw.timestamp).toISOString(), ageMs=${ageMs});
      else this.log('getDailySummary: snapshot too old, treating as missing', new Date(raw.timestamp).toISOString(), ageMs=${ageMs});
    }

    if (!previousDay) {
      this.log('getDailySummary: No previous day data available or snapshot unusable. Writing current snapshot and returning empty summary.');
      const periodKey = await this.getCurrentPeriodKey();
      if (persist) {
        chrome.storage.local.set({ [this._dailyStatsKey]: { models: currentValues.models, points: currentValues.points, timestamp: Date.now(), owner: this._instanceId, periodKey } }, () => {
          this.log('getDailySummary: stored dailyStats ts=', new Date().toISOString(), 'modelsCount=', Object.keys(currentValues.models || {}).length, 'owner=', this._instanceId, 'periodKey=', periodKey);
        });
        chrome.storage.local.set({ [this._dailyRunningRewardKey]: 0, [this._dailyRunningRewardDayKey]: periodKey, [this._lastSuccessfulKey]: { state:'SENT', owner:this._instanceId, sentAt:Date.now(), periodKey, snapshot:{ models: currentValues.models, points: currentValues.points, timestamp: Date.now() }, rewardPointsTotal:0 } });
      }
      return { dailyDownloads:0, dailyPrints:0, points: currentValues.points, pointsGained:0, top5Downloads:[], top5Prints:[], rewardsEarned:[], rewardPointsTotal:0, from:new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), to:new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) };
    }

    // compare
    const modelChanges = {};
    this.log('getDailySummary: comparing models; previousDay.models count', Object.keys(previousDay.models || {}).length);
    for (const [id, current] of Object.entries(currentValues.models)) {
      let previous = previousDay?.models?.[id] || null;
      if (!previous && current.permalink) previous = Object.values(previousDay.models || {}).find(m => m?.permalink === current.permalink) || null;
      if (!previous && current.name) { const norm = current.name.trim().toLowerCase(); previous = Object.values(previousDay.models || {}).find(m => m?.name?.trim().toLowerCase() === norm) || null; if (previous) this.log('getDailySummary: matched previous by name', { id, name: current.name }); }
      if (!previous) { this.log('New model found:', current.name, 'id=', id, 'permalink=', current.permalink); continue; }

      const prevDownloads = Number(previous.downloads || 0), prevPrints = Number(previous.prints || 0), prevBoosts = Number(previous.boosts || 0);
	  const currDownloads = Number(current.downloads || 0), currPrints = Number(current.prints || 0), currBoosts = Number(current.boosts || 0);
      let downloadsGained = currDownloads - prevDownloads, printsGained = currPrints - prevPrints, boostsGained = currBoosts - prevBoosts;
      if (downloadsGained <= 0 && printsGained <= 0 && boostsGained <= 0) continue;
      if (downloadsGained > this._suspiciousDeltaLimit || printsGained > this._suspiciousDeltaLimit) { this.warn('Suspiciously large delta detected, skipping reward calculation for', { id, name: current.name, downloadsGained, printsGained, prevTs: previous.timestamp || null }); continue; }

      modelChanges[id] = { id, name: current.name, downloadsGained, printsGained, boostsGained, previousDownloads: prevDownloads, previousPrints: prevPrints, currentDownloads: currDownloads, currentPrints: currPrints, permalink: current.permalink || previous?.permalink || null };
    }

    const dailyDownloads = Object.values(modelChanges).reduce((s,m)=>s+m.downloadsGained,0);
    const dailyPrints = Object.values(modelChanges).reduce((s,m)=>s+m.printsGained,0);
    const top5Downloads = Object.values(modelChanges).filter(m=>m.downloadsGained>0).sort((a,b)=>b.downloadsGained-a.downloadsGained).slice(0,5);
    const top5Prints = Object.values(modelChanges).filter(m=>m.printsGained>0).sort((a,b)=>b.printsGained-a.printsGained).slice(0,5);

    // compute rewards
    const rewardsEarned = []; let rewardPointsTotal = 0;
    for (const m of Object.values(modelChanges)) {
      const prevDownloadsTotal = this.calculateDownloadsEquivalent(m.previousDownloads, m.previousPrints);
      const currDownloadsTotal = this.calculateDownloadsEquivalent(m.currentDownloads, m.currentPrints);
      let cursor = prevDownloadsTotal; const thresholdsHit = []; const maxThresholdsPerModel = 200; let thresholdsCount = 0;
      while (cursor < currDownloadsTotal && thresholdsCount < maxThresholdsPerModel) {
        const interval = this.getRewardInterval(cursor);
        const mod = cursor % interval;
        const nextThreshold = (cursor === 0 || mod === 0) ? cursor + interval : cursor + (interval - mod);
        if (nextThreshold <= currDownloadsTotal) {
          const rewardPoints = this.getRewardPointsForDownloads(nextThreshold)*1.25;
          thresholdsHit.push({ threshold: nextThreshold, rewardPoints });
          rewardPointsTotal += rewardPoints;
          cursor = nextThreshold; thresholdsCount++;
        } else break;
      }
      if (thresholdsHit.length) rewardsEarned.push({ id:m.id, name:m.name, thresholds:thresholdsHit.map(t=>t.threshold), rewardPointsTotalForModel:thresholdsHit.reduce((s,t)=>s+t.rewardPoints,0) });
    }

    const periodKey = await this.getCurrentPeriodKey();
    if (persist) {
      chrome.storage.local.set({ [this._dailyStatsKey]: { models: currentValues.models, points: currentValues.points, timestamp: Date.now(), owner: this._instanceId, periodKey } }, () => {
        this.log('getDailySummary: updated dailyStats ts=', new Date().toISOString(), 'modelsCount=', Object.keys(currentValues.models || {}).length, 'owner=', this._instanceId, 'periodKey', periodKey);
      });
      chrome.storage.local.set({ [this._dailyRunningRewardKey]: 0, [this._dailyRunningRewardDayKey]: periodKey, [this._lastSuccessfulKey]: { state:'SENT', owner:this._instanceId, sentAt:Date.now(), periodKey, snapshot:{ models: currentValues.models, points: currentValues.points, timestamp: Date.now() }, rewardPointsTotal:0 } });
    }
	    // points de boosts (agrégés)
    const boostPointsVal = await this._getBoostPointsValue();
    const totalBoostsGained = Object.values(modelChanges).reduce((s,m)=>s + (m.boostsGained||0), 0);
    const boostPointsTotal = totalBoostsGained * boostPointsVal;
    rewardPointsTotal += boostPointsTotal;

    return { dailyDownloads, dailyPrints, points: currentValues.points, pointsGained: currentValues.points - previousDay.points, top5Downloads, top5Prints, rewardsEarned, rewardPointsTotal,totalBoostsGained, boostPointsTotal, boostPointsVal, from: new Date(previousDay.timestamp).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), to: new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) };
  }

  // schedule daily report with locking/claiming
  scheduleDailyNotification() {
    if (this._dailyTimerId) { clearTimeout(this._dailyTimerId); this._dailyTimerId = null; }
    chrome.storage.sync.get(['dailyReport','dailyNotificationTime'], (config) => {
      const dailyReport = config.dailyReport || 'yes';
      if (dailyReport === 'no') { this.log('Daily report disabled'); return; }
      const dailyTime = config.dailyNotificationTime || '23:30';
      const [hour, minute] = dailyTime.split(':').map(Number);
      const now = new Date(); const nextNotification = new Date(); nextNotification.setHours(hour, minute, 0, 0); if (nextNotification <= now) nextNotification.setDate(nextNotification.getDate()+1);
      const jitter = Math.floor((Math.random()*2 -1) * this._dailyScheduleJitterMs);
      const delay = Math.max(0, nextNotification - now + jitter);
      this.log(Daily report scheduled for: ${new Date(Date.now()+delay)}. Delay: ${delay}ms; jitterMs=${jitter});
      this._dailyTimerId = setTimeout(async () => {
        const startTime = Date.now(); this.log(scheduleDailyNotification: firing attempt at ${new Date().toISOString()});
        const claimantKey = this._lastSuccessfulKey; let clearPending=false, wrotePending=false, periodKey=null;
        const gotLock = await this.acquireDailyLock();
        if (!gotLock) { this.log('scheduleDailyNotification: could not acquire lock, another instance likely running. Aborting this attempt.'); this.scheduleDailyNotification(); return; }
        try {
          const latestAfterLock = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null)));
          if (latestAfterLock && latestAfterLock.timestamp >= startTime) { this.log('scheduleDailyNotification: dailyStats updated by another instance after lock; aborting this send.'); return; }
          const nowMs = Date.now(); periodKey = await this.getCurrentPeriodKey();
          const claimResult = await new Promise(res => {
            chrome.storage.local.get([claimantKey], r => {
              const existing = r?.[claimantKey] || null;
              if (existing && existing.state === 'SENT' && existing.periodKey === periodKey) { res({ ok:false, reason:'already-sent', existing }); return; }
              const PENDING_STALE_MS = 5 * 60 * 1000;
              if (existing && existing.state === 'PENDING' && (nowMs - (existing.claimAt || 0)) < PENDING_STALE_MS && existing.periodKey === periodKey) { res({ ok:false, reason:'pending-claim', existing }); return; }
              const claim = { state:'PENDING', owner:this._instanceId, claimAt: nowMs, periodKey };
              chrome.storage.local.set({ [claimantKey]: claim }, () => { chrome.storage.local.get([claimantKey], v => { const confirmed = v?.[claimantKey]?.owner === this._instanceId && v[claimantKey].state === 'PENDING' && v[claimantKey].periodKey === periodKey; res({ ok:confirmed, claim }); }); });
            });
          });
          if (!claimResult.ok) { this.log('scheduleDailyNotification: aborting send due to claim failure', claimResult.reason, claimResult.existing); return; }
          wrotePending = true;
          const okToSend = await this.preSendCheckAndMaybeWait(startTime);
          if (!okToSend) { this.log('scheduleDailyNotification: preSendCheck indicates newer snapshot; aborting this send.'); clearPending = true; return; }
          this.log(Sending daily report: ${new Date()});
          const summary = await this.getDailySummary();
          if (summary) {
            let rewardsSection = 'No rewards earned in the prior 24 hours';
            if (summary.rewardsEarned?.length) rewardsSection = summary.rewardsEarned.map(r => ${r.name}: +${r.rewardPointsTotalForModel} points (thresholds: ${r.thresholds.join(', ')})).join('\n');
            const totalEquivalent = summary.dailyDownloads + (summary.dailyPrints * 2);
            const topDownloadsList = summary.top5Downloads.length ? summary.top5Downloads.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.downloadsGained}).join('\n') : 'No new downloads today';
            const topPrintsList = summary.top5Prints.length ? summary.top5Prints.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.printsGained}).join('\n') : 'No new prints today';
 const message = 
📊 Récap 24h (${summary.from} → ${summary.to})

Points de téléchargement : ${totalEquivalent}
⚡ Boosts gagnés : +${summary.totalBoostsGained||0} → +${summary.boostPointsTotal||0} pts

🏆 Top téléchargements :
${topDownloadsList}

🖨️ Top impressions :
${topPrintsList}

🎁 Points gagnés (24h) :
${summary.rewardsEarned?.length
  ? summary.rewardsEarned.map(r => ${r.name} : +${r.rewardPointsTotalForModel} pts (seuils : ${r.thresholds.join(', ')})).join('\n')
  : 'Aucun palier atteint'}

Total points (24h) : ${summary.rewardPointsTotal}
.trim();
            const sent = await this.sendTelegramMessage(message);
            if (sent) {
              const sentAt = Date.now();
              const runningRewardPoints = await new Promise(res => chrome.storage.local.get([this._dailyRunningRewardKey], r => res(r?.[this._dailyRunningRewardKey] || 0)));
              const finalRecord = { state:'SENT', owner:this._instanceId, sentAt, periodKey, snapshot:{ models: summary.top5Downloads.concat(summary.top5Prints).reduce((acc,m)=>{acc[m.id]=m;return acc;},{}), points: summary.points, timestamp: Date.now() }, rewardPointsTotal: runningRewardPoints };
              await new Promise(resolve => chrome.storage.local.set({ [this._lastSuccessfulKey]: finalRecord }, () => { this.log('scheduleDailyNotification: wrote lastSuccessfulDailyReport SENT by', this._instanceId, 'sentAt=', new Date(sentAt).toISOString(), 'periodKey=', periodKey); resolve(); }));
              try { chrome.storage.local.set({ [this._dailyRunningRewardKey]:0, [this._dailyRunningRewardDayKey]: periodKey }, () => { this.log('scheduleDailyNotification: reset running reward counter for period', { periodKey }); }); } catch (err) { this.error('Error resetting running reward counter for period', err); }
            } else clearPending = true;
          } else clearPending = true;
        } finally {
          try {
            if (clearPending && claimantKey) {
              chrome.storage.local.get([claimantKey], r => {
                const existing = r?.[claimantKey] || null;
                if (existing && existing.state === 'PENDING' && existing.owner === this._instanceId) chrome.storage.local.remove([claimantKey], () => { this.log('scheduleDailyNotification: cleared PENDING claim during cleanup'); });
                else this.log('scheduleDailyNotification: skip clearing PENDING (not owner or not pending)', { existing });
              });
            }
          } finally {
            await this.releaseDailyLock();
            this.scheduleDailyNotification();
          }
        }
      }, delay);
    });
  }

  // main periodic check (per-model messages or summary)
  async checkAndNotify() {
    if (this.isChecking) { this.log('Check already in progress, skipping...'); return; }
    this.log(checkAndNotify start — ${ITERATION}); this.isChecking = true;
    try {
      this.log('Starting change check...');
      let anyNotification = false;
      const currentValues = this.getCurrentValues();
      if (!currentValues) { this.log('No current values found'); await this.savePreviousValues({}); return; }
      if (!this.previousValues) await this.loadPreviousValues();
      if (!this.previousValues) { this.log('First run or no previous values, saving initial values'); this.previousValues = currentValues; await this.savePreviousValues(currentValues); return; }
      if (this.previousValues && !this.previousValues.models) { this.previousValues.models = {}; await this.savePreviousValues(this.previousValues); }
      if (currentValues.points > (this.previousValues.points || 0)) this.log('Global account points increased, ignoring for per-model-only Telegram notifications.');

      const modelsActivity = []; let modelUpdateCount = 0;
      for (const [id, current] of Object.entries(currentValues.models)) {
        const previous = this.previousValues.models[id];
        if (!previous) continue;
        const previousDownloadsRaw = Number(previous.downloads) || 0, previousPrints = Number(previous.prints) || 0, previousBoosts = Number(previous.boosts) || 0;
        const previousDownloadsTotal = this.calculateDownloadsEquivalent(previousDownloadsRaw, previousPrints);
        const currentDownloadsRaw = Number(current.downloads) || 0, currentPrints = Number(current.prints) || 0, currentBoosts = Number(current.boosts) || 0;
        const currentDownloadsTotal = this.calculateDownloadsEquivalent(currentDownloadsRaw, currentPrints);
        const downloadsDeltaRaw = currentDownloadsRaw - previousDownloadsRaw, printsDelta = currentPrints - previousPrints, boostsDelta = currentBoosts - previousBoosts;
        const downloadsDeltaEquivalent = downloadsDeltaRaw + (printsDelta * 2);
        const hasActivity = (downloadsDeltaRaw !== 0) || (printsDelta !== 0) || (boostsDelta > 0);
        if (hasActivity) modelUpdateCount++;
        const modelSummary = { id, name: current.name, imageUrl: current.imageUrl, downloadsDeltaRaw, printsDelta, boostsDelta, previousDownloadsTotal, currentDownloadsTotal, downloadsDeltaEquivalent, rewards: [] };

        if (currentDownloadsTotal > previousDownloadsTotal) {
          let cursor = previousDownloadsTotal, maxRewardsToReport = 50, rewardsFound = 0;
          while (cursor < currentDownloadsTotal && rewardsFound < maxRewardsToReport) {
            const interval = this.getRewardInterval(cursor), mod = cursor % interval;
            const nextThreshold = (cursor === 0 || mod === 0) ? cursor + interval : cursor + (interval - mod);
            this.log(REWARD-LOOP ${current.name} cursor=${cursor} interval=${interval} nextThreshold=${nextThreshold} currDownloads=${currentDownloadsTotal});
            if (nextThreshold <= currentDownloadsTotal) { const rewardPoints = this.getRewardPointsForDownloads(nextThreshold)*1.25; modelSummary.rewards.push({ thresholdDownloads: nextThreshold, points: rewardPoints }); cursor = nextThreshold; rewardsFound++; } else break;
          }
          if (rewardsFound >= maxRewardsToReport) this.log(Many rewards earned for ${current.name}. Listed first ${maxRewardsToReport} in summary.);
        }

        const boostOnly = (boostsDelta > 0) && (downloadsDeltaRaw === 0 && printsDelta === 0 && modelSummary.rewards.length === 0);
        if (!this.notifySummaryMode) {
          if (boostOnly) {
            const lines = [];
            const boostPts = Math.max(0, boostsDelta) * (await this._getBoostPointsValue());
lines.push(⚡ Boost sur : ${current.name}, '', ⚡ Boosts : +${boostsDelta} → +${boostPts} pts);
            const message = lines.join('\n');
            this.log('MESSAGE-BRANCH', { iteration: ITERATION, name: current.name, branch: 'boost-only', downloadsDeltaEquivalent, boostsDelta, rewardsFound: modelSummary.rewards.length });
            this.log(Sending boost-only message for ${current.name});
            const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
 if (sent) {
   const boostPts = (await this._getBoostPointsValue()) * Math.max(0, boostsDelta);
   if (boostPts > 0) await this._accumulateDailyRewardPoints(boostPts);
 }
            anyNotification = true; continue;
          }

          const hasActivity2 = (downloadsDeltaRaw !== 0) || (printsDelta !== 0) || (modelSummary.rewards.length > 0) || (boostsDelta > 0);
          if (hasActivity2) {
            this.log('MESSAGE-BRANCH', { iteration: ITERATION, name: current.name, branch: 'milestone', downloadsDeltaEquivalent, boostsDelta, rewardsFound: modelSummary.rewards.length });
            const lines = []; const equivalentTotal = currentDownloadsTotal;
             lines.push(📦 Mise à jour : ${current.name}, '');
 lines.push(${downloadsDeltaEquivalent > 0 ? '+' : ''}${downloadsDeltaEquivalent} points de téléchargement (total ${equivalentTotal}), '');
 lines.push(⬇️ Téléchargements : ${currentDownloadsRaw} (${downloadsDeltaRaw > 0 ? '+' : ''}${downloadsDeltaRaw}));
 lines.push(🖨️ Impressions : ${currentPrints} (${printsDelta > 0 ? '+' : ''}${printsDelta}));
            if (modelSummary.rewards.length > 0) { modelSummary.rewards.forEach(r => lines.push(🎁 Palier atteint ! +${r.points} pts à ${r.thresholdDownloads}));
   lines.push('');
            const nextThresholdAfterCurrent = this.nextRewardDownloads(equivalentTotal);
            const downloadsUntilNext = Math.max(0, nextThresholdAfterCurrent - equivalentTotal);
            lines.push(🎯 Prochain palier : encore ${downloadsUntilNext} (objectif ${nextThresholdAfterCurrent}), '');
 lines.push(🔁 Intervalle : tous les ${this.getRewardInterval(equivalentTotal)});
 if (boostsDelta > 0) {
   const boostPts = Math.max(0, boostsDelta) * (await this._getBoostPointsValue());
   lines.push('', ⚡ Boosts : +${boostsDelta} → +${boostPts} pts);
 }
            let warning = '';
            if (Math.abs(downloadsDeltaRaw) > this._suspiciousDeltaLimit || Math.abs(printsDelta) > this._suspiciousDeltaLimit) {
              warning = "\n\n⚠️ Volume très élevé sur la période. C’est peut-être un pic de popularité (bravo !) ou un artefact. Tu peux réduire l’intervalle de rafraîchissement si besoin.";
            }
            const message = lines.join('\n') + warning;
            this.log(Sending milestone message for ${current.name});
            const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
            if (sent) {
   const pts = modelSummary.rewards.reduce((s,r)=>s+r.points,0);
   const boostPts = (await this._getBoostPointsValue()) * Math.max(0, boostsDelta);
   const totalPts = pts + boostPts;
   if (totalPts > 0) await this._accumulateDailyRewardPoints(totalPts);
}
            anyNotification = true;
          }
        } else {
		  if (boostOnly) {
            const lines = [];
			const boostPts = Math.max(0, boostsDelta) * (await this._getBoostPointsValue());
 lines.push(⚡ Boost sur : ${current.name}, '', ⚡ Boosts : +${boostsDelta} → +${boostPts} pts);
            const message = lines.join('\n');
            this.log('MESSAGE-BRANCH', { iteration: ITERATION, name: current.name, branch: 'boost-only', downloadsDeltaEquivalent, boostsDelta, rewardsFound: modelSummary.rewards.length });
            this.log(Sending boost-only message for ${current.name});
            const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
 if (sent) {
   const boostPts = (await this._getBoostPointsValue()) * Math.max(0, boostsDelta);
   if (boostPts > 0) await this._accumulateDailyRewardPoints(boostPts);
 }
            anyNotification = true; continue;
          }
          const hasActivity3 = (downloadsDeltaRaw !== 0) || (printsDelta !== 0) || (modelSummary.rewards.length > 0) || (boostsDelta > 0);
          if (hasActivity3) modelsActivity.push({
            id,
            name: current.name,
            downloadsDeltaEquivalent,
            currentDownloadsTotal,
            rewardPointsForThisModel: modelSummary.rewards.reduce((s,r)=>s+r.points,0),
            boostsDelta,
			boostPointsForThisModel: Math.max(0, boostsDelta) * (await this._getBoostPointsValue()),
            // 👉 Ajout minimal pour le rendu
            currentDownloadsRaw,
            currentPrints,
            downloadsDeltaRaw,
            printsDelta
          });
        }
      }

      // dynamic summary mode switch
      let forceSummaryMode = false;
      const SUMMARY_MODE_THRESHOLD = 15;
      if (!this.notifySummaryMode && modelUpdateCount >= SUMMARY_MODE_THRESHOLD) { forceSummaryMode = true; this.log(Switching to summary mode for this check due to ${modelUpdateCount} updates.); }
      const useSummaryMode = this.notifySummaryMode || forceSummaryMode;

      if (useSummaryMode) {
        if (forceSummaryMode) await this.sendTelegramMessage("Beaucoup d’activité : passage en mode récap pour éviter les limites Telegram.");
        if (modelsActivity.length === 0) {
          await this.sendTelegramMessage("No new prints or downloads found."); anyNotification = true;
          const prevString = JSON.stringify(this.previousValues||{}), currString = JSON.stringify(currentValues||{});
          if (prevString !== currString) { this.previousValues = currentValues; await this.savePreviousValues(currentValues); }
          this.isChecking = false; return;
        }

        const totalEquivalent = modelsActivity.reduce((s,m)=>s + (m.downloadsDeltaEquivalent||0),0);
        const rewardPointsThisRun = modelsActivity.reduce((s,m)=>s + (m.rewardPointsForThisModel||0) + (m.boostPointsForThisModel||0), 0);
        await this._accumulateDailyRewardPoints(rewardPointsThisRun);

        const persisted = await new Promise(res => chrome.storage.local.get([this._dailyRunningRewardKey, this._dailyRunningRewardDayKey, this._dailyStatsKey, this._lastSuccessfulKey], r => res(r)));
        let running = Number.isFinite(persisted?.[this._dailyRunningRewardKey]) ? persisted[this._dailyRunningRewardKey] : 0;
        const runningDay = persisted?.[this._dailyRunningRewardDayKey] || null;
        const lastDaily = persisted?.[this._lastSuccessfulKey] || null;
        const lastDailyPoints = Number.isFinite(lastDaily?.rewardPointsTotal) ? lastDaily.rewardPointsTotal : 0;
        const currentPeriod = await this.getCurrentPeriodKey();

        if (!running || runningDay !== currentPeriod) {
          this.log('Periodic summary: running counter missing or mismatched; computing fallback via getDailySummary');
          try {
            const computed = await this.getDailySummary({ persist: false });
            if (computed && Number.isFinite(computed.rewardPointsTotal)) {
              running = computed.rewardPointsTotal;
              try { chrome.storage.local.set({ [this._dailyRunningRewardKey]: running, [this._dailyRunningRewardDayKey]: currentPeriod }, () => { this.log('Periodic summary: persisted computed running counter', { running, period: currentPeriod }); }); } catch (err) { this.warn('Periodic summary: failed to persist computed running counter', err); }
            } else this.warn('Periodic summary: computed fallback missing rewardPointsTotal; leaving persisted running as-is', { running, runningDay });
          } catch (err) { this.warn('Periodic summary: fallback computation failed', err); }
        }

        let rewardsToday = running - lastDailyPoints; if (rewardsToday < 0) rewardsToday = running;
        const fromTs = new Date(this.previousValues.timestamp).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), toTs = new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });
        const headerLines = [
  📊 Récap (${fromTs} → ${toTs}),
  '',
  Points de téléchargement sur la période : ${totalEquivalent},
  '',
  'Mises à jour de modèles :',
  ''
];const maxModelsInMessage = 200;
        const list = modelsActivity.slice(0, maxModelsInMessage);
        const modelLines=[]; let anyLargeDelta=false;
        list.forEach((m,i) => {
          const downloadsDelta = m.downloadsDeltaEquivalent || 0, total = m.currentDownloadsTotal || 0, interval = m.rewardInterval || this.getRewardInterval(total), nextThreshold = this.nextRewardDownloads(total), remaining = Math.max(0, nextThreshold - total), ptsEarned = m.rewardPointsForThisModel || 0;
           let line = ${i+1}. <b>${escapeHtml(m.name)}</b> : +${downloadsDelta} (total ${total});
          // 👉 Ajout minimal : détails réels
          const dl = m.currentDownloadsRaw || 0;
          const pr = m.currentPrints || 0;
          const dld = m.downloadsDeltaRaw || 0;
          const prd = m.printsDelta || 0;
           line +=  — Téléch. : ${dl} (${dld >= 0 ? '+' : ''}${dld}), Impr. : ${pr} (${prd >= 0 ? '+' : ''}${prd});
 if (ptsEarned>0) line +=   🎉 +${ptsEarned} pts;
 if ((m.boostPointsForThisModel||0) > 0) line +=   ⚡ +${m.boostPointsForThisModel} pts (boosts);
 line +=   — reste ${remaining} pour 🎁 (palier ${interval});
          if (Math.abs(downloadsDelta) > this._suspiciousDeltaLimit) { line += \n⚠️ The number of downloads during this period is very high. This could be because your model is very popular (good job!). Or it could be an error. You may want to shorten the refresh interval.; anyLargeDelta=true; }
          if ((m.boostsDelta || 0) > 0) {
            line += 
⚡ Boosts : +${m.boostsDelta};
          }

          modelLines.push(line);
        });
        const spacedModels = modelLines.join('\n\n');
		// Count models within 2 downloads (downloads + 2×prints) of next reward across all models on the page
		let closeToGiftCount = 0;
		const allModels = Object.values(currentValues?.models || {});
		for (const cm of allModels) {
		  const downloads = Number(cm.downloads || 0);
		  const prints = Number(cm.prints || 0);
		  const total = this.calculateDownloadsEquivalent(downloads, prints); // downloads + 2*prints
		  const next = this.nextRewardDownloads(total);
		  const remaining = Math.max(0, next - total);
		  if (remaining <= 2) closeToGiftCount++;
		}
		 const footerLines = [
   '',
   🎁 Points (période) : ${rewardPointsThisRun} pts,
   🎁 Points (aujourd’hui) : ${rewardsToday} pts,
   🎯 Modèles proches du prochain palier (≤2) : ${closeToGiftCount}
 ];

        const message = headerLines.join('\n') + '\n' + spacedModels + '\n' + footerLines.join('\n');
        this.log('Aggregated summary message length:', message.length);
        const sent = await this.sendTelegramMessage(message); if (sent) anyNotification = true;
      } else {
        // per-model logic already executed inside loop
      }

      const prevString = JSON.stringify(this.previousValues || {}), currString = JSON.stringify(currentValues || {});
      if (prevString !== currString) { this.previousValues = currentValues; await this.savePreviousValues(currentValues); } else this.log('No changes detected, skipping savePreviousValues to reduce storage writes.');
      if (!anyNotification && !useSummaryMode) { const heartbeatMsg = 'Aucune nouvelle impression ni téléchargement.'; this.log(heartbeatMsg); await this.sendTelegramMessage(heartbeatMsg); }
    } catch (err) { this.error('Error during check:', err); }
    finally { this.isChecking = false; }
  }

  // accumulate running points with lock and retries
  async _accumulateDailyRewardPoints(pointsToAdd, attempt = 1) {
    if (!Number.isFinite(pointsToAdd) || pointsToAdd <= 0) return;
    const MAX_ATTEMPTS = 3, BASE_DELAY_MS = 300, MAX_BACKOFF_MS = 3000, lockTimeoutMs = 1500;
    while (attempt <= MAX_ATTEMPTS) {
      const lockAcquired = await this.acquireDailyLock(lockTimeoutMs);
      if (!lockAcquired) {
        if (attempt >= MAX_ATTEMPTS) { this.warn(_accumulateDailyRewardPoints: lock not acquired after ${MAX_ATTEMPTS} attempts; skipping this accumulation.); return; }
        const backoff = Math.min(MAX_BACKOFF_MS, BASE_DELAY_MS * Math.pow(2, attempt-1));
        const jitter = Math.floor(Math.random() * Math.min(500, Math.floor(backoff/2)));
        const delay = backoff + jitter; this.log(_accumulateDailyRewardPoints: lock not acquired (attempt ${attempt}). Waiting ${delay}ms then retrying.); await new Promise(r=>setTimeout(r, delay)); attempt++; continue;
      }

      try {
        const periodKey = await this.getCurrentPeriodKey();
        const local = await new Promise(res => chrome.storage.local.get([this._dailyRunningRewardKey, this._dailyRunningRewardDayKey], r => res(r)));
        let running = (local && local[this._dailyRunningRewardKey]) ? local[this._dailyRunningRewardKey] : 0;
        const runningDay = (local && local[this._dailyRunningRewardDayKey]) ? local[this._dailyRunningRewardDayKey] : null;
        this.log('_accumulateDailyRewardPoints read', { running, runningDay, periodKey, pointsToAdd, attempt });

        if (runningDay && runningDay !== periodKey) {
          const runningDayTs = new Date(runningDay).getTime(), periodKeyTs = new Date(periodKey).getTime();
          if (Number.isFinite(runningDayTs) && Number.isFinite(periodKeyTs)) {
            if (runningDayTs > periodKeyTs) { this.log('_accumulateDailyRewardPoints: stored runningDay is in the future; resetting running to 0 and continuing', { runningDay, periodKey }); running = 0; }
            else { this.warn('_accumulateDailyRewardPoints: stored runningDay older than current period; aborting to avoid joining wrong window', { runningDay, periodKey }); return; }
          } else { this.log('_accumulateDailyRewardPoints: could not parse runningDay/periodKey; resetting running to 0 and continuing', { runningDay, periodKey }); running = 0; }
        }
        if (!runningDay) { this.log('_accumulateDailyRewardPoints resetting running counter for new period', { oldDay: runningDay, newPeriod: periodKey }); running = 0; }
        running += pointsToAdd;
        await new Promise(resolve => {
          chrome.storage.local.set({ [this._dailyRunningRewardKey]: running, [this._dailyRunningRewardDayKey]: periodKey }, (err) => {
            if (chrome.runtime.lastError || err) this.warn('Storage set failed (quota or other error):', chrome.runtime.lastError || err);
            else this.log(_accumulateDailyRewardPoints: added ${pointsToAdd}, running=${running}, period=${periodKey});
            resolve();
          });
        });
        return;
      } finally { await this.releaseDailyLock(); }
    }
  }

  // previousValues persistence
  async loadPreviousValues(){ return new Promise(resolve => chrome.storage.local.get(['previousValues'], result => { if (result?.previousValues) { this.log('Previous values loaded:', result.previousValues); this.previousValues = result.previousValues; } resolve(); })); }
  async savePreviousValues(values){ return new Promise(resolve => chrome.storage.local.set({ previousValues: values }, () => { this.log('Values saved to storage'); resolve(); })); }

  // lifecycle
  async start() {
    this.log('Starting monitor...');
    if (this.checkInterval) { this.log('Monitor already running, skipping duplicate start.'); return; }
    chrome.storage.sync.get(['telegramToken','chatId','refreshInterval','dailyReport','dailyNotificationTime','notifySummaryMode'], async (config) => {
      if (!config || !config.telegramToken || !config.chatId) { this.error('Missing Telegram configuration'); return; }
      this.telegramToken = config.telegramToken; this.chatId = config.chatId; this.notifySummaryMode = !!config.notifySummaryMode;
      const refreshInterval = config.refreshInterval || 900000;
      this.log(Configured refresh interval: ${refreshInterval}ms); this.log(Notify summary mode: ${this.notifySummaryMode});
      let intervalToUse = refreshInterval; const ONE_HOUR = 60*60*1000; const COMPENSATION_MS = 60*1000;
      if (refreshInterval > ONE_HOUR) { intervalToUse = Math.max(0, refreshInterval - COMPENSATION_MS); this.log(Interval adjusted for overhead: using ${intervalToUse}ms instead of configured ${refreshInterval}ms); }
      else this.log(Interval not adjusted (configured <= 1 hour): using ${intervalToUse}ms);
      await autoScrollToFullBottom();
      await this.loadPreviousValues();
      await this.checkAndNotify();
      if (this.checkInterval) { clearInterval(this.checkInterval); this.checkInterval = null; }
      const STORAGE_KEY = 'monitorNextScheduledTime';
      let nextScheduled = Number(sessionStorage.getItem(STORAGE_KEY));

      if (!nextScheduled) {
        nextScheduled = Date.now() + intervalToUse;
        this.log('Initializing schedule. First run at:', new Date(nextScheduled).toLocaleString());
        sessionStorage.setItem(STORAGE_KEY, nextScheduled);
      }

      const scheduleNext = () => {
        const now = Date.now();

        if (now > nextScheduled) {
          this.warn(Missed scheduled time by ${Math.round((now - nextScheduled)/1000)}s. Running now.);
          while (nextScheduled < now) {
            nextScheduled += intervalToUse;
          }
          sessionStorage.setItem(STORAGE_KEY, nextScheduled);
        }

        const delay = Math.max(0, nextScheduled - now);
        this.log(Next check scheduled for ${new Date(nextScheduled).toLocaleString()} (in ${Math.round(delay/1000)}s));

        this.checkInterval = setTimeout(async () => {
          try {
            this.log('Scrolling before refresh...');
            await autoScrollToFullBottom();
            this.log('Refreshing page...');
          } catch (err) {
            this.error('Error during pre-refresh tasks:', err);
          }

          const newNextScheduled = nextScheduled + intervalToUse;
          sessionStorage.setItem(STORAGE_KEY, newNextScheduled);

          try { scheduleNext(); } catch (e) { this.error('Failed to schedule next run:', e); }
          try { window.location.reload(); } catch (e) { this.error('Reload failed:', e); }
        }, delay);
      };

      scheduleNext();
      if (config.dailyReport !== 'no') this.scheduleDailyNotification();
	  this.scheduleInterimNotifications();
      this.log(Monitor started, refresh every ${intervalToUse/60000} minutes (configured ${refreshInterval/60000} minutes));
    });
  }

  stop() {
    if (this.checkInterval) { clearInterval(this.checkInterval); this.checkInterval = null; }
    if (this._dailyTimerId) { clearTimeout(this._dailyTimerId); this._dailyTimerId = null; }
    this.isChecking = false;
    this.log('Monitor stopped');
  }

  async restart() {
    this.log('Restarting monitor on request...');
    this.stop();
    await autoScrollToFullBottom();
    await this.checkAndNotify();
    this.start();
  }

  // interim summary (manual request)
  async handleInterimSummaryRequest() {
    this.log('Interim summary requested');
    const currentValues = this.getCurrentValues();
    if (!currentValues) { this.error('Interim summary aborted: could not extract current values'); throw new Error('No current values'); }
    const baseline = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null)));
    if (!baseline) { this.error('Interim summary aborted: no baseline dailyStats found'); throw new Error('No baseline dailyStats found'); }

    const previousDay = baseline;
    const modelChanges = {};
    for (const [id, current] of Object.entries(currentValues.models)) {
      let previous = previousDay?.models?.[id] || null;
      if (!previous && current.permalink) previous = Object.values(previousDay.models || {}).find(m => m && m.permalink === current.permalink) || null;
      if (!previous && current.name) previous = Object.values(previousDay.models || {}).find(m => m?.name?.trim().toLowerCase() === current.name.trim().toLowerCase()) || null;
      if (!previous) { this.log('New model found (interim):', current.name); continue; }
      const downloadsGained = Math.max(0, (Number(current.downloads)||0) - (Number(previous.downloads)||0));
      const printsGained = Math.max(0, (Number(current.prints)||0) - (Number(previous.prints)||0));
      const boostsGained = Math.max(0, (Number(current.boosts)||0) - (Number(previous.boosts)||0));
      if (downloadsGained > 0 || printsGained > 0 || boostsGained > 0)
        modelChanges[id] = {
          id, name: current.name,
          downloadsGained, printsGained, boostsGained,
          previousDownloads: previous.downloads || 0, previousPrints: previous.prints || 0,
          currentDownloads: current.downloads || 0, currentPrints: current.prints || 0,
          imageUrl: current.imageUrl || ''
        };
    }

    const dailyDownloads = Object.values(modelChanges).reduce((s,m)=>s+m.downloadsGained,0);
    const dailyPrints = Object.values(modelChanges).reduce((s,m)=>s+m.printsGained,0);
    const top5Downloads = Object.values(modelChanges).filter(m=>m.downloadsGained>0).sort((a,b)=>b.downloadsGained-a.downloadsGained).slice(0,5);
    const top5Prints = Object.values(modelChanges).filter(m=>m.printsGained>0).sort((a,b)=>b.printsGained-a.printsGained).slice(0,5);

    let rewardsEarned = [], rewardPointsTotal = 0;
    for (const m of Object.values(modelChanges)) {
      const prevTotal = this.calculateDownloadsEquivalent(m.previousDownloads, m.previousPrints);
      const currTotal = this.calculateDownloadsEquivalent(m.currentDownloads, m.currentPrints);
      let cursor = prevTotal; const thresholdsHit=[]; const maxThresholdsPerModel=50; let count=0;
      while (cursor < currTotal && count < maxThresholdsPerModel) {
        const interval = this.getRewardInterval(cursor), mod = cursor % interval;
        const nextThreshold = (cursor===0 || mod===0) ? cursor+interval : cursor+(interval-mod);
        if (nextThreshold <= currTotal) { const pts = this.getRewardPointsForDownloads(nextThreshold)*1.25; thresholdsHit.push({ threshold: nextThreshold, points: pts }); rewardPointsTotal += pts; cursor = nextThreshold; count++; } else break;
      }
      if (thresholdsHit.length) rewardsEarned.push({ id:m.id, name:m.name, thresholds:thresholdsHit.map(t=>t.threshold), rewardPointsTotalForModel:thresholdsHit.reduce((s,t)=>s+t.points,0) });
    }

     const totalEquivalent = dailyDownloads + (dailyPrints * 2);
    const boostPointsVal = await this._getBoostPointsValue();
    const totalBoostsGained = Object.values(modelChanges).reduce((s,m)=>s + (m.boostsGained||0), 0);
    const boostPointsTotal = totalBoostsGained * boostPointsVal;
    rewardPointsTotal += boostPointsTotal;
    const topDownloadsList = top5Downloads.length ? top5Downloads.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.downloadsGained}).join('\n') : 'No new downloads so far';
    const topPrintsList = top5Prints.length ? top5Prints.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.printsGained}).join('\n') : 'No new prints so far';
    const fromTs = new Date(previousDay.timestamp).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), toTs = new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });
 const message = 
🔔 Récap intermédiaire (${fromTs} → ${toTs})

Points de téléchargement : ${totalEquivalent}
⚡ Boosts gagnés : +${totalBoostsGained} → +${boostPointsTotal} pts

🏆 Top téléchargements :
${topDownloadsList}

🖨️ Top impressions :
${topPrintsList}

🎁 Points gagnés jusque-là :
${(rewardPointsTotal > 0)
  ? ${rewardsEarned.length ? rewardsEarned.map(r => ${r.name} : +${r.rewardPointsTotalForModel} pts (seuils : ${r.thresholds.join(', ')})).join('\n')+'\n' : ''}Total : ${rewardPointsTotal} pts
  : 'Aucun point pour l’instant'}
.trim();
    this.log('Interim message:', message);
    const sent = await this.sendTelegramMessage(message);
    if (!sent) { this.error('Interim summary: failed to send via Telegram'); throw new Error('Telegram send failed'); }
    this.log('Interim summary: sent successfully');
    return true;
  }
}

// Startup
this.log = console.log.bind(console);
this.warn = console.warn.bind(console);
this.error = console.error.bind(console);

console.log('Initializing monitor...');
const monitor = new ValueMonitor();
monitor.start();

// Listen for popup messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'INTERIM_SUMMARY_REQUEST') {
    monitor.handleInterimSummaryRequest().then(()=>sendResponse({ok:true})).catch(err=>{ console.error('interim summary error', err); sendResponse({ok:false, error: err?.message}); });
    return true;
  }
  if (msg?.type === 'REFRESH_INTERVAL_UPDATED') {
    monitor.restart().then(()=>sendResponse({ok:true})).catch(err=>{ console.error('restart error', err); sendResponse({ok:false, error: err?.message}); });
    return true;
  }
  if (msg?.type === 'CONFIG_SAVED') {
    chrome.storage.sync.get(['notifySummaryMode'], cfg => { monitor.notifySummaryMode = !!(cfg?.notifySummaryMode); monitor.log('CONFIG_SAVED received. notifySummaryMode =', monitor.notifySummaryMode); monitor.restart().then(()=>sendResponse({ok:true})).catch(err=>sendResponse({ok:false, error: err?.message})); });
    return true;
  }
    if (msg?.type === 'DUMP_MODELS') {
    monitor.sendModelsSnapshot()
      .then(()=>sendResponse({ok:true}))
      .catch(err => { console.error('dump models error', err); sendResponse({ok:false, error: err?.message}); });
    return true;
  }

});
ChatGPT a dit :

Réflexion durant 23s
top, t’as déjà branché les boosts dans les points + francisé beaucoup de trucs 👌
il reste 4 petites corrections pour être clean et 100% FR :

1) Bug de bloc if (...) { ... } (palier) → variables hors scope
Dans la branche “milestone”, tu ouvres un if (modelSummary.rewards.length > 0) { ... } puis tu continues à construire le message (prochain palier, warning, etc.) toujours à l’intérieur du if.
Si un modèle n’a pas de paliers, warning n’est jamais défini ⇒ risque d’erreur et le message est amputé.

Patch (déplace le calcul “prochain palier” + warning hors du if)
-            if (modelSummary.rewards.length > 0) {
-              modelSummary.rewards.forEach(r => lines.push(`🎁 Palier atteint ! +${r.points} pts à ${r.thresholdDownloads}`));
-              lines.push('');
-              const nextThresholdAfterCurrent = this.nextRewardDownloads(equivalentTotal);
-              const downloadsUntilNext = Math.max(0, nextThresholdAfterCurrent - equivalentTotal);
-              lines.push(`🎯 Prochain palier : encore ${downloadsUntilNext} (objectif ${nextThresholdAfterCurrent})`, '');
-              lines.push(`🔁 Intervalle : tous les ${this.getRewardInterval(equivalentTotal)}`);
-              if (boostsDelta > 0) {
-                const boostPts = Math.max(0, boostsDelta) * (await this._getBoostPointsValue());
-                lines.push('', `⚡ Boosts : +${boostsDelta} → +${boostPts} pts`);
-              }
-              let warning = '';
-              if (Math.abs(downloadsDeltaRaw) > this._suspiciousDeltaLimit || Math.abs(printsDelta) > this._suspiciousDeltaLimit) {
-                warning = "\n\n⚠️ Volume très élevé sur la période. C’est peut-être un pic de popularité (bravo !) ou un artefact. Tu peux réduire l’intervalle de rafraîchissement si besoin.";
-              }
-              const message = lines.join('\n') + warning;
-              this.log(`Sending milestone message for ${current.name}`);
-              const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
-              if (sent) {
-                const pts = modelSummary.rewards.reduce((s,r)=>s+r.points,0);
-                const boostPts = (await this._getBoostPointsValue()) * Math.max(0, boostsDelta);
-                const totalPts = pts + boostPts;
-                if (totalPts > 0) await this._accumulateDailyRewardPoints(totalPts);
-              }
-              anyNotification = true;
-            }
+            if (modelSummary.rewards.length > 0) {
+              modelSummary.rewards.forEach(r =>
+                lines.push(`🎁 Palier atteint ! +${r.points} pts à ${r.thresholdDownloads}`)
+              );
+              lines.push('');
+            }
+            const nextThresholdAfterCurrent = this.nextRewardDownloads(equivalentTotal);
+            const downloadsUntilNext = Math.max(0, nextThresholdAfterCurrent - equivalentTotal);
+            lines.push(`🎯 Prochain palier : encore ${downloadsUntilNext} (objectif ${nextThresholdAfterCurrent})`, '');
+            lines.push(`🔁 Intervalle : tous les ${this.getRewardInterval(equivalentTotal)}`);
+            if (boostsDelta > 0) {
+              const boostPts = Math.max(0, boostsDelta) * (await this._getBoostPointsValue());
+              lines.push('', `⚡ Boosts : +${boostsDelta} → +${boostPts} pts`);
+            }
+            let warning = '';
+            if (Math.abs(downloadsDeltaRaw) > this._suspiciousDeltaLimit || Math.abs(printsDelta) > this._suspiciousDeltaLimit) {
+              warning = "\n\n⚠️ Volume très élevé sur la période. C’est peut-être un pic de popularité (bravo !) ou un artefact. Tu peux réduire l’intervalle de rafraîchissement si besoin.";
+            }
+            const message = lines.join('\n') + warning;
+            this.log(`Sending milestone message for ${current.name}`);
+            const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
+            if (sent) {
+              const pts = modelSummary.rewards.reduce((s,r)=>s+r.points,0);
+              const boostPts = (await this._getBoostPointsValue()) * Math.max(0, boostsDelta);
+              const totalPts = pts + boostPts;
+              if (totalPts > 0) await this._accumulateDailyRewardPoints(totalPts);
+            }
+            anyNotification = true;
2) Une phrase reste en anglais (zéro activité en mode récap)
Dans checkAndNotify() → useSummaryMode quand aucune activité, tu envoies encore :

await this.sendTelegramMessage("No new prints or downloads found.");
Passe-la en FR (et ton filtre ntfy la reconnaîtra déjà) :

- await this.sendTelegramMessage("No new prints or downloads found.");
+ await this.sendTelegramMessage("Aucune nouvelle impression ni téléchargement.");
3) Traduire le warning “very high downloads” en FR (mode récap)
Dans la construction modelLines, tu gardes :

`⚠️ The number of downloads during this period is very high...`
Remplace par :

- if (Math.abs(downloadsDelta) > this._suspiciousDeltaLimit) { line += `\n⚠️ The number of downloads during this period is very high. This could be because your model is very popular (good job!). Or it could be an error. You may want to shorten the refresh interval.`; anyLargeDelta=true; }
+ if (Math.abs(downloadsDelta) > this._suspiciousDeltaLimit) {
+   line += `\n⚠️ Volume de téléchargements très élevé sur la période. Possible pic de popularité (bravo !) ou artefact. Tu peux réduire l’intervalle de rafraîchissement si besoin.`;
+   anyLargeDelta = true;
+ }
4) Franciser le “dump models” (optionnel mais cohérent)
Dans sendModelsSnapshot() :

- await this.sendTelegramMessage("No models found on the page.");
+ await this.sendTelegramMessage("Aucun modèle trouvé sur la page.");

- const header = `📸 Models snapshot (${models.length} items)\nSorted by downloads + 2×prints\n`;
+ const header = `📸 Instantané des modèles (${models.length})\nTri : téléchargements + 2× impressions\n`;

- `⬇️ Downloads: ${m.downloads}`
- `🖨️ Prints: ${m.prints}`
- `⚡ Boosts: ${m.boosts}`
- `Σ Downloads eq: ${m.totalEq}`
- `🔗 ${m.permalink}`
+ `⬇️ Téléchargements : ${m.downloads}`
+ `🖨️ Impressions : ${m.prints}`
+ `⚡ Boosts : ${m.boosts}`
+ `Σ Points téléchargement : ${m.totalEq}`
+ `🔗 ${m.permalink}`
Bonus (réseau/CSP)
Tu fais encore les fetch() réseau depuis le content script. Sur certaines pages avec un connect-src strict, ça peut être bloqué. Le contournement propre : déporter les fetch vers le service worker (background) et appeler via chrome.runtime.sendMessage (je peux te filer le mini background.js si tu veux).

Si tu appliques ces diffs, tu auras :

les boosts correctement comptés (déjà OK chez toi) et additionnés dans les notifs (per-modèle, récap, quotidien) ;

aucune chaîne résiduelle en anglais ;

plus de risque de bloc “palier” mal fermé.

Vous avez dit :
oui mais ou est l'erreur catch c'est ca que je cherche
ChatGPT a dit :

Réflexion durant 57s
Yes — that “Unexpected token 'catch'” isn’t about .catch(...) itself. It means the parser hit a catch while it was still “inside” a block that never got closed earlier (usually a missing } or a backtick in a template string).

In your file, the risky spot is the milestone branch you just added (FR version). You open:

if (modelSummary.rewards.length > 0) {
  modelSummary.rewards.forEach(...);
  lines.push('');
  const nextThresholdAfterCurrent = ...
  ...
  let warning = '';
  ...
  const message = lines.join('\n') + warning;
  ...
  const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
  if (sent) { ... }
  anyNotification = true;
}
Because the “next palier / warning / message / send” logic lives inside that if (...) { ... }, any tiny brace/backtick mismatch there leaves the parser unclosed until the next catch elsewhere in the file — and that’s where Chrome flags catch as “unexpected”.

Fix (also safer logic)
Move the “prochain palier / intervalle / warning / send” outside the if (rewards.length > 0) and only keep the “palier atteint” lines inside. That both avoids the scope footgun and will close the block correctly:

if (modelSummary.rewards.length > 0) {
  modelSummary.rewards.forEach(r =>
    lines.push(`🎁 Palier atteint ! +${r.points} pts à ${r.thresholdDownloads}`)
  );
  lines.push('');
}

const nextThresholdAfterCurrent = this.nextRewardDownloads(equivalentTotal);
const downloadsUntilNext = Math.max(0, nextThresholdAfterCurrent - equivalentTotal);
lines.push(`🎯 Prochain palier : encore ${downloadsUntilNext} (objectif ${nextThresholdAfterCurrent})`, '');
lines.push(`🔁 Intervalle : tous les ${this.getRewardInterval(equivalentTotal)}`);

if (boostsDelta > 0) {
  const boostPts = Math.max(0, boostsDelta) * (await this._getBoostPointsValue());
  lines.push('', `⚡ Boosts : +${boostsDelta} → +${boostPts} pts`);
}

let warning = '';
if (Math.abs(downloadsDeltaRaw) > this._suspiciousDeltaLimit || Math.abs(printsDelta) > this._suspiciousDeltaLimit) {
  warning = "\n\n⚠️ Volume très élevé sur la période. C’est peut-être un pic de popularité (bravo !) ou un artefact. Tu peux réduire l’intervalle de rafraîchissement si besoin.";
}

const message = lines.join('\n') + warning;
this.log(`Sending milestone message for ${current.name}`);
const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
if (sent) {
  const pts = modelSummary.rewards.reduce((s,r)=>s+r.points,0);
  const boostPts = (await this._getBoostPointsValue()) * Math.max(0, boostsDelta);
  const totalPts = pts + boostPts;
  if (totalPts > 0) await this._accumulateDailyRewardPoints(totalPts);
}
anyNotification = true;
Two extra sanity checks (these also commonly trigger the same error):
Make sure every multi-line template string is closed with a backtick before the trailing ).trim() (e.g. your daily/interim messages).

In the recap section you have ];const maxModelsInMessage = 200; — it’s valid, but if a ] or backtick above is missing, that’s exactly the kind of place the parser keeps “hanging” until it meets a catch.

If you patch the milestone block as above, the stray brace/backtick pitfall goes away and that catch error should disappear with it.

Vous avez dit :
tu peux me faire la modfi clairement stp
ChatGPT a dit :

Réflexion durant 9s
yes! voici un patch clair pour corriger le bloc “milestone” (la cause du Unexpected token 'catch').
Remplace entièrement le bloc ci-dessous dans checkAndNotify() — c’est le if (hasActivity2) { ... } à l’intérieur de if (!this.notifySummaryMode) { ... }.

🔁 À remplacer (bloc milestone)
if (hasActivity2) {
  this.log('MESSAGE-BRANCH', { iteration: ITERATION, name: current.name, branch: 'milestone', downloadsDeltaEquivalent, boostsDelta, rewardsFound: modelSummary.rewards.length });
  const lines = []; const equivalentTotal = currentDownloadsTotal;
  lines.push(`📦 Mise à jour : ${current.name}`, '');
  lines.push(`${downloadsDeltaEquivalent > 0 ? '+' : ''}${downloadsDeltaEquivalent} points de téléchargement (total ${equivalentTotal})`, '');
  lines.push(`⬇️ Téléchargements : ${currentDownloadsRaw} (${downloadsDeltaRaw > 0 ? '+' : ''}${downloadsDeltaRaw})`);
  lines.push(`🖨️ Impressions : ${currentPrints} (${printsDelta > 0 ? '+' : ''}${printsDelta})`);
  if (modelSummary.rewards.length > 0) { 
    modelSummary.rewards.forEach(r => lines.push(`🎁 Palier atteint ! +${r.points} pts à ${r.thresholdDownloads}`));
    lines.push('');
    const nextThresholdAfterCurrent = this.nextRewardDownloads(equivalentTotal);
    const downloadsUntilNext = Math.max(0, nextThresholdAfterCurrent - equivalentTotal);
    lines.push(`🎯 Prochain palier : encore ${downloadsUntilNext} (objectif ${nextThresholdAfterCurrent})`, '');
    lines.push(`🔁 Intervalle : tous les ${this.getRewardInterval(equivalentTotal)}`);
    if (boostsDelta > 0) {
      const boostPts = Math.max(0, boostsDelta) * (await this._getBoostPointsValue());
      lines.push('', `⚡ Boosts : +${boostsDelta} → +${boostPts} pts`);
    }
    let warning = '';
    if (Math.abs(downloadsDeltaRaw) > this._suspiciousDeltaLimit || Math.abs(printsDelta) > this._suspiciousDeltaLimit) {
      warning = "\n\n⚠️ Volume très élevé sur la période. C’est peut-être un pic de popularité (bravo !) ou un artefact. Tu peux réduire l’intervalle de rafraîchissement si besoin.";
    }
    const message = lines.join('\n') + warning;
    this.log(`Sending milestone message for ${current.name}`);
    const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
    if (sent) {
      const pts = modelSummary.rewards.reduce((s,r)=>s+r.points,0);
      const boostPts = (await this._getBoostPointsValue()) * Math.max(0, boostsDelta);
      const totalPts = pts + boostPts;
      if (totalPts > 0) await this._accumulateDailyRewardPoints(totalPts);
    }
    anyNotification = true;
  }
}
✅ Par ceci (bloc milestone corrigé)
(On sort le calcul “prochain palier / intervalle / warning / envoi” en dehors du if (rewards.length > 0) pour fermer correctement les blocs et éviter le piège qui déclenche l’erreur catch.)

if (hasActivity2) {
  this.log('MESSAGE-BRANCH', {
    iteration: ITERATION,
    name: current.name,
    branch: 'milestone',
    downloadsDeltaEquivalent,
    boostsDelta,
    rewardsFound: modelSummary.rewards.length
  });

  const lines = [];
  const equivalentTotal = currentDownloadsTotal;

  // En-tête + deltas bruts
  lines.push(`📦 Mise à jour : ${current.name}`, '');
  lines.push(`${downloadsDeltaEquivalent > 0 ? '+' : ''}${downloadsDeltaEquivalent} points de téléchargement (total ${equivalentTotal})`, '');
  lines.push(`⬇️ Téléchargements : ${currentDownloadsRaw} (${downloadsDeltaRaw > 0 ? '+' : ''}${downloadsDeltaRaw})`);
  lines.push(`🖨️ Impressions : ${currentPrints} (${printsDelta > 0 ? '+' : ''}${printsDelta})`);

  // Paliers atteints (seulement si présents)
  if (modelSummary.rewards.length > 0) {
    modelSummary.rewards.forEach(r =>
      lines.push(`🎁 Palier atteint ! +${r.points} pts à ${r.thresholdDownloads}`)
    );
    lines.push('');
  }

  // Toujours afficher prochain palier / intervalle
  const nextThresholdAfterCurrent = this.nextRewardDownloads(equivalentTotal);
  const downloadsUntilNext = Math.max(0, nextThresholdAfterCurrent - equivalentTotal);
  lines.push(`🎯 Prochain palier : encore ${downloadsUntilNext} (objectif ${nextThresholdAfterCurrent})`, '');
  lines.push(`🔁 Intervalle : tous les ${this.getRewardInterval(equivalentTotal)}`);

  // Boosts (si présents)
  if (boostsDelta > 0) {
    const boostPts = Math.max(0, boostsDelta) * (await this._getBoostPointsValue());
    lines.push('', `⚡ Boosts : +${boostsDelta} → +${boostPts} pts`);
  }

  // Avertissement si deltas suspects
  let warning = '';
  if (Math.abs(downloadsDeltaRaw) > this._suspiciousDeltaLimit || Math.abs(printsDelta) > this._suspiciousDeltaLimit) {
    warning = "\n\n⚠️ Volume très élevé sur la période. C’est peut-être un pic de popularité (bravo !) ou un artefact. Tu peux réduire l’intervalle de rafraîchissement si besoin.";
  }

  const message = lines.join('\n') + warning;

  this.log(`Sending milestone message for ${current.name}`);
  const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);

  if (sent) {
    const pts = modelSummary.rewards.reduce((s, r) => s + r.points, 0);
    const boostPts = (await this._getBoostPointsValue()) * Math.max(0, boostsDelta);
    const totalPts = pts + boostPts;
    if (totalPts > 0) await this._accumulateDailyRewardPoints(totalPts);
  }

  anyNotification = true;
}
Ça règle le bloc non-fermé qui faisait “déborder” le parseur jusqu’au prochain catch.
Si tu veux, je peux aussi te fournir un mini-diff patch (style unified diff) pour coller direct.

Vous avez dit :
const ITERATION = 'Iteration 20.4.1';
console.log(Initializing monitor — ${ITERATION});

const escapeHtml = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
// === ntfy (override minimal; no flow change) ===
// Reads chrome.storage.sync keys set by your popup (if any):
//   useNtfy (bool, optional), ntfyUrl (string), ntfyAuth (string, optional),
//   ntfyTags (string, optional), ntfyPriority (1..5, optional)
async function __sendNtfyWithCfg(cfg, { title, text, imageUrl, clickUrl, tags, priority }) {
  // 💓 1) Ignorer le heartbeat
  if (text && (text.includes('No new prints or downloads found.') || text.includes('Aucune nouvelle impression ni téléchargement.'))) {
    console.debug('[MakerStats] ntfy: heartbeat suppressed');
    return true;
  }
    // Convertit un message HTML "léger" (Telegram) en Markdown (ntfy)
  const htmlToMd = (s="") =>
    String(s)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<b>/gi, '**').replace(/<\/b>/gi, '**')
      .replace(/<strong>/gi, '**').replace(/<\/strong>/gi, '**')
      .replace(/<i>/gi, '*').replace(/<\/i>/gi, '*')
      .replace(/<em>/gi, '*').replace(/<\/em>/gi, '*')
      // retire toute autre balise HTML résiduelle
      .replace(/<\/?[^>]+>/g, '');

  // 💬 2) URL du serveur ntfy
  const url = (cfg && cfg.ntfyUrl) ? String(cfg.ntfyUrl).trim() : "";
  if (!url) {
    console.error("[MakerStats] ntfy: ntfyUrl missing");
    return false;
  }

  // 🧹 3) Nettoyage minimal (évite erreurs Chrome sur headers non ASCII)
  const asciiOnly = (s) => (s || "").replace(/[^\x00-\x7F]/g, "");
  const asciiOrEmpty = (s) => asciiOnly(String(s || "")).trim();

  // 🔢 4) Détermination de la priorité
  const prio = (cfg && Number.isFinite(cfg.ntfyPriority))
    ? cfg.ntfyPriority
    : (Number.isFinite(priority) ? priority : 3);

  // 🧩 5) Headers de base (ASCII only)
  const baseHeaders = {
    "Priority": String(prio),
  };
  if (cfg && cfg.ntfyAuth) baseHeaders["Authorization"] = asciiOrEmpty(cfg.ntfyAuth);
  if (cfg && cfg.ntfyTags) baseHeaders["Tags"] = asciiOrEmpty(cfg.ntfyTags);
  if (clickUrl) baseHeaders["Click"] = asciiOrEmpty(clickUrl);
  if (title) baseHeaders["Title"] = asciiOrEmpty(title);
  baseHeaders["Markdown"] = "yes";

  try {
    // === 🖼️ CAS IMAGE (prévisualisable) ===
    if (imageUrl) {
      const headers = {
        ...baseHeaders,
        "Content-Type": "text/plain",
        "Attach": asciiOrEmpty(encodeURI(imageUrl)), // ntfy va télécharger et afficher la preview
      };

      const res = await fetch(url, {
        method: "POST",
        headers,
        body:  htmlToMd(text || ""), // le message peut contenir accents/émojis
      });

      if (!res.ok) {
        const t = await res.text().catch(() => res.statusText);
        console.error("[MakerStats] ntfy POST (Attach) HTTP", res.status, t);
        return false;
      }

      console.debug("[MakerStats] ntfy POST (Attach) OK — image preview enabled");
      return true;
    }

    // === ✉️ CAS TEXTE SEUL ===
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...baseHeaders,
        "Content-Type": "text/plain"
      },
      body: htmlToMd(text || ""),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => res.statusText);
      console.error("[MakerStats] ntfy POST (text) HTTP", res.status, t);
      return false;
    }

    console.debug("[MakerStats] ntfy POST (text) OK");
    return true;

  } catch (e) {
    console.error("[MakerStats] ntfy send error:", e);
    return false;
  }
}




const autoScrollToFullBottom = ({ step = 600, delay = 250, settle = 800 } = {}) => new Promise(resolve => {
  let timer;
  const scrollAndCheck = () => {
    window.scrollBy(0, step);
    const currentHeight = document.body.scrollHeight;
    const atBottom = (window.innerHeight + window.scrollY) >= (currentHeight - 2);
    if (atBottom) {
      clearInterval(timer);
      setTimeout(() => {
        if (document.body.scrollHeight > currentHeight) timer = setInterval(scrollAndCheck, delay);
        else resolve();
      }, settle);
    }
  };
  timer = setInterval(scrollAndCheck, delay);
});

class ValueMonitor {
  constructor() {
    // config/state
    this.telegramToken = '';
    this.chatId = '';
    this.previousValues = null;
    this.checkInterval = null;
    this._dailyTimerId = null;
    this.isChecking = false;
    // identity/keys/timeouts
    this._instanceId = Math.random().toString(36).slice(2);
    this._dailyLockKey = 'dailyLock';
    this._dailyStatsKey = 'dailyStats';
    this._lastSuccessfulKey = 'lastSuccessfulDailyReport';
    this._dailyRunningRewardKey = 'dailyRunningRewardPoints';
    this._dailyRunningRewardDayKey = 'dailyRunningRewardDay';
    this._dailyLockTimeoutMs = 2 * 60 * 1000;
    this._dailyMaxPreSendRetries = 5;
    this._dailyPreSendBaseBackoffMs = 300;
    this._dailyScheduleJitterMs = 30 * 1000;
    this._defaultFallbackHours = 48;
    this.notifySummaryMode = false;
    this._telegramMaxMessageChars = 4000;
    this._suspiciousDeltaLimit = 200;
	this._interimTimers = [];
	this._interimSlots = ['07:00','12:00','16:00','22:00']; // créneaux fixes
	this._interimJitterMs = 15_000; // ±15s pour désynchroniser
	this._interimClaimKey = 'lastInterimSentKey'; // anti-doublon cross-onglets
	this._boostPointsDefault = 15;
  }

  // logging shorthands (preserve outputs)
  log(...a){ console.log(...a); }
  warn(...a){ console.warn(...a); }
  error(...a){ console.error(...a); }
	 // --- ENVOI SNAPSHOT DE TOUS LES MODÈLES ---
  _nextOccurrenceFor(timeStr) {
  const [h, m] = String(timeStr).split(':').map(Number);
  const now = new Date();
  const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h||0, m||0, 0, 0);
  if (dt <= now) dt.setDate(dt.getDate() + 1);
  return dt;
}
  async _getBoostPointsValue() {
    try {
      const cfg = await new Promise(res => chrome.storage.sync.get(['boostPointsValue'], r => res(r||{})));
      const v = Number(cfg?.boostPointsValue);
      return Number.isFinite(v) && v >= 0 ? v : this._boostPointsDefault;
    } catch { return this._boostPointsDefault; }
  }


_clearInterimTimers() {
  for (const t of this._interimTimers) clearTimeout(t);
  this._interimTimers = [];
}

// retournne une clé unique pour le créneau du jour (ex: "2025-10-14T09:00")
_makeInterimSlotKey(dateObj, timeStr) {
  const pad = n => String(n).padStart(2,'0');
  return ${dateObj.getFullYear()}-${pad(dateObj.getMonth()+1)}-${pad(dateObj.getDate())}T${timeStr};
}

// planifie un seul créneau (avec jitter & auto-reschedule)
_scheduleOneInterim(timeStr) {
  const target = this._nextOccurrenceFor(timeStr);
  const baseDelay = Math.max(0, target - Date.now());
  const jitter = Math.floor((Math.random() * 2 - 1) * this._interimJitterMs); // [-jitter;+jitter]
  const delay = Math.max(0, baseDelay + jitter);

  this.log(Interim "${timeStr}" prévu à ${new Date(Date.now()+delay).toLocaleString()} (base=${baseDelay}ms, jitter=${jitter}ms));

  const timerId = setTimeout(async () => {
    try {
      // anti-doublon inter-onglets : on "claim" la fenêtre de tir
      const slotKey = this._makeInterimSlotKey(new Date(), timeStr); // date du jour courant
      const store = await new Promise(res => chrome.storage.local.get([this._interimClaimKey], v => res(v||{})));
      const lastKey = store?.[this._interimClaimKey];

      if (lastKey === slotKey) {
        this.log(Interim ${timeStr}: déjà envoyé pour ce créneau (${slotKey}), on skip.);
      } else {
        // petit "claim" optimiste (meilleur-effort)
        await new Promise(r => chrome.storage.local.set({ [this._interimClaimKey]: slotKey }, () => r()));
        this.log(Interim ${timeStr}: envoi… (slot=${slotKey}));
        try {
          await this.handleInterimSummaryRequest();
        } catch (e) {
          this.warn(Interim ${timeStr}: échec d'envoi, e);
          // en cas d'échec on ne "déclaim" pas — ce n’est pas critique pour de la notif
        }
      }
    } catch (e) {
      this.error(Interim ${timeStr}: erreur inattendue, e);
    } finally {
      // replanifie ce créneau pour le lendemain
      this._scheduleOneInterim(timeStr);
    }
  }, delay);

  this._interimTimers.push(timerId);
}

// planifie les 4 interims du jour
scheduleInterimNotifications() {
  this._clearInterimTimers();
  const slots = Array.isArray(this._interimSlots) && this._interimSlots.length
    ? this._interimSlots
    : ['09:00','12:00','16:00','22:00'];

  for (const s of slots) this._scheduleOneInterim(s);
  this.log(Interim scheduling actif pour: ${slots.join(', ')});
}
  async sendModelsSnapshot() {
    const current = this.getCurrentValues();
    if (!current || !current.models || !Object.keys(current.models).length) {
      await this.sendTelegramMessage("No models found on the page.");
      return true;
    }

    // Tri par “popularité” (downloads + 2x prints) décroissant
    const models = Object.values(current.models)
      .map(m => ({
        ...m,
        totalEq: this.calculateDownloadsEquivalent(m.downloads, m.prints)
      }))
      .sort((a,b) => b.totalEq - a.totalEq);

    // En-tête
    const header = 📸 Models snapshot (${models.length} items)\nSorted by downloads + 2×prints\n;
    await this.sendTelegramMessage(header);

    // Envoi 1 message par modèle (avec image si dispo)
    for (const m of models) {
      const captionLines = [
        📦 ${m.name},
        ⬇️ Downloads: ${m.downloads},
        🖨️ Prints: ${m.prints},
        ⚡ Boosts: ${m.boosts},
        Σ Downloads eq: ${m.totalEq},
      ];
      if (m.permalink) captionLines.push(🔗 ${m.permalink});
      const caption = captionLines.join('\n');

      if (m.imageUrl) {
        await this.sendTelegramMessageWithPhoto(caption, m.imageUrl);
      } else {
        await this.sendTelegramMessage(caption);
      }

      // petit spacing pour éviter rate limit Telegram/ntfy
      await new Promise(r => setTimeout(r, 250));
    }

    return true;
  }
  // period key uses user's dailyNotificationTime or 12:00 default
  async getCurrentPeriodKey() {
    const cfg = await new Promise(res => chrome.storage.sync.get(['dailyNotificationTime'], r =>
      res(r && r.dailyNotificationTime ? r.dailyNotificationTime : '12:00')));
    const [hourStr, minuteStr] = String(cfg).split(':');
    const hour = Number.isFinite(Number(hourStr)) ? Number(hourStr) : 12;
    const minute = Number.isFinite(Number(minuteStr)) ? Number(minuteStr) : 0;
    const now = new Date();
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    if (candidate > now) candidate.setDate(candidate.getDate() - 1);
    const pad = n => String(n).padStart(2,'0');
    const offset = -candidate.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const offsetHours = pad(Math.floor(Math.abs(offset)/60));
    const offsetMins = pad(Math.abs(offset)%60);
    return ${candidate.getFullYear()}-${pad(candidate.getMonth()+1)}-${pad(candidate.getDate())}T${pad(candidate.getHours())}:${pad(candidate.getMinutes())}:00${sign}${offsetHours}:${offsetMins};
  }

  // split large telegram messages into parts keeping paragraphs
  _splitMessageIntoParts(message='', maxLen=this._telegramMaxMessageChars) {
    if (!message) return [];
    if (message.length <= maxLen) return [message];
    const parts=[]; const paragraphs = message.split('\n\n'); let current='';
    for (const p of paragraphs) {
      const chunk = (current ? '\n\n' : '') + p;
      if ((current + chunk).length > maxLen) {
        if (current) { parts.push(current); current = p; if (current.length > maxLen) { let s=0; while (s < current.length){ parts.push(current.slice(s, s+maxLen)); s+=maxLen;} current=''; } }
        else { let s=0; while (s < p.length){ parts.push(p.slice(s, s+maxLen)); s+=maxLen; } current=''; }
      } else current += chunk;
    }
    if (current) parts.push(current);
    return parts;
  }

  // Telegram send helpers with one retry
  async sendTelegramMessage(message, attempt=1) {
	    // --- ntfy override minimal ---
    try {
      const cfg = await new Promise(res =>
        chrome.storage.sync.get(['useNtfy','ntfyUrl','ntfyAuth','ntfyTags','ntfyPriority'], v => res(v||{}))
      );
      const enabled = (cfg.useNtfy === undefined ? !!cfg.ntfyUrl : !!cfg.useNtfy);
      if (enabled && cfg.ntfyUrl) {
        return await __sendNtfyWithCfg(cfg, { title:'MakerWorld', text: message, imageUrl:'', clickUrl:'', tags:'makerworld,update', priority:3 });
      }
    } catch(e) { /* fallback to Telegram */ }
    if (!this.telegramToken || !this.chatId) { this.error('Missing Token or Chat ID'); return false; }
    const parts = this._splitMessageIntoParts(message, this._telegramMaxMessageChars);
    for (const part of parts) {
      const payload = { chat_id: this.chatId, text: part, parse_mode: 'HTML' };
      this.log('→ Telegram payload (part):', { len: part.length });
      try {
        const res = await fetch(https://api.telegram.org/bot${this.telegramToken}/sendMessage, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        const body = await res.json();
        if (!res.ok) {
          this.error('← Telegram API error:', body);
          if (attempt < 2) { this.log('Retrying Telegram send...'); await new Promise(r=>setTimeout(r,1000)); return this.sendTelegramMessage(message, attempt+1); }
          return false;
        }
        this.log('← Telegram API ok:', body);
      } catch (err) {
        this.error('Error sending message:', err);
        if (attempt < 2) { this.log('Retrying Telegram send...'); await new Promise(r=>setTimeout(r,1000)); return this.sendTelegramMessage(message, attempt+1); }
        return false;
      }
      await new Promise(r=>setTimeout(r,200));
    }
    return true;
  }

  async sendTelegramMessageWithPhoto(message, photoUrl) {
	// --- ntfy override minimal ---
    try {
      const cfg = await new Promise(res =>
        chrome.storage.sync.get(['useNtfy','ntfyUrl','ntfyAuth','ntfyTags','ntfyPriority'], v => res(v||{}))
      );
      const enabled = (cfg.useNtfy === undefined ? !!cfg.ntfyUrl : !!cfg.useNtfy);
      if (enabled && cfg.ntfyUrl) {
        return await __sendNtfyWithCfg(cfg, { title:'MakerWorld', text: message, imageUrl:(photoUrl||''), clickUrl:'', tags:'makerworld,model,update', priority:4 });
      }
    } catch(e) { /* fallback to Telegram */ }
    if (!this.telegramToken || !this.chatId || !photoUrl) { this.log('Falling back to text message (missing token/chat/photo).'); return this.sendTelegramMessage(message); }
    try {
      this.log('Attempting to send photo:', { photoUrl, chatId: this.chatId });
      const imgRes = await fetch(photoUrl);
      if (!imgRes.ok) throw new Error(Image download failed: ${imgRes.status});
      const blob = await imgRes.blob();
      const form = new FormData(); form.append('chat_id', this.chatId); form.append('caption', message); form.append('photo', blob, 'model_image.jpg');
      const res = await fetch(https://api.telegram.org/bot${this.telegramToken}/sendPhoto, { method:'POST', body: form });
      const result = await res.json();
      this.log('Telegram response:', result);
      if (!res.ok) throw new Error(Telegram Error: ${res.status});
      return true;
    } catch (err) {
      this.error('Error sending photo:', err);
      return this.sendTelegramMessage(message);
    }
  }

  // scraping/parsing
  parseNumber(text){ if (!text) return 0; text = String(text).trim().toLowerCase(); if (text.includes('k')){ const base = parseFloat(text.replace('k','')); if (Number.isFinite(base)) return Math.round(base*1000); } const n = parseInt(text.replace(/[^\d]/g,''),10); return Number.isFinite(n)? n:0; }

  getCurrentValues() {
    try {
      const currentValues = { models: {}, points: 0, timestamp: Date.now() };
      try {
        const pointsContainer = document.querySelector('.mw-css-1541sxf');
        this.log('Found points container:', !!pointsContainer);
        if (pointsContainer) {
          const pts = pointsContainer.textContent.trim().match(/[\d,]+(\.\d+)?/);
          if (pts && pts[0]) { currentValues.points = parseFloat(pts[0].replace(/,/g,'')); this.log('Points found:', currentValues.points); }
        }
      } catch (e){ this.error('Error extracting points:', e); }
      const downloadElements = document.querySelectorAll('[data-trackid]');
      downloadElements.forEach(element => {
        const modelId = element.getAttribute('data-trackid');
        const modelTitle = element.querySelector('h3.translated-text');
        const name = modelTitle?.textContent.trim() || 'Model';
        const imageUrl = element.querySelector('img')?.getAttribute('src') || '';
        let permalink = null;
        const anchor = element.querySelector('a[href*="/models/"], a[href*="/model/"], a[href*="/models/"]');
        if (anchor?.href) permalink = anchor.href;
        const allMetrics = element.querySelectorAll('.mw-css-xlgty3 span');
        if (allMetrics.length >= 3) {
          const lastThree = Array.from(allMetrics).slice(-3);
          const boosts = this.parseNumber(lastThree[0]?.textContent || '0');
          const downloads = this.parseNumber(lastThree[1]?.textContent || '0');
          const prints = this.parseNumber(lastThree[2]?.textContent || '0');
          currentValues.models[modelId] = { id: modelId, permalink, name, boosts, downloads, prints, imageUrl };
          this.log(Model "${name}":, { id: modelId, boosts, downloads, prints, permalink });
        } else this.log(Not enough metrics for ${name} (found ${allMetrics.length}));
      });
      return currentValues;
    } catch (err) { this.error('Error extracting values:', err); return null; }
  }

  // reward math
  getRewardInterval(totalDownloads){ if (totalDownloads <= 50) return 10; if (totalDownloads <= 500) return 25; if (totalDownloads <= 1000) return 50; return 100; }
  nextRewardDownloads(totalDownloads){ const interval = this.getRewardInterval(totalDownloads); const mod = totalDownloads % interval; return (totalDownloads === 0 || mod === 0) ? totalDownloads + interval : totalDownloads + (interval - mod); }
  getRewardPointsForDownloads(thresholdDownloads){ if (thresholdDownloads <= 50) return 15+3; if (thresholdDownloads <= 500) return 12+3; if (thresholdDownloads <= 1000) return 20+5; return 30+8; }
  calculateDownloadsEquivalent(downloads, prints){ return Number(downloads||0) + (Number(prints||0) * 2); }

  // storage lock helpers
  async acquireDailyLock(timeoutMs = this._dailyLockTimeoutMs) {
    const now = Date.now();
    return new Promise(resolve => chrome.storage.local.get([this._dailyLockKey], res => {
      const lock = res?.[this._dailyLockKey] || null;
      if (!lock || (now - lock.ts) > timeoutMs) {
        if (lock && (now - lock.ts) > timeoutMs) {
          chrome.storage.local.remove([this._dailyLockKey], () => {
            const newLock = { ts: now, owner: this._instanceId };
            chrome.storage.local.set({ [this._dailyLockKey]: newLock }, () => {
              chrome.storage.local.get([this._dailyLockKey], r2 => {
                const confirmed = r2?.[this._dailyLockKey]?.owner === this._instanceId;
                this.log('acquireDailyLock (force unlock) result', { confirmed, owner: r2?.[this._dailyLockKey]?.owner, instance: this._instanceId });
                resolve(confirmed);
              });
            });
          });
        } else {
          const newLock = { ts: now, owner: this._instanceId };
          chrome.storage.local.set({ [this._dailyLockKey]: newLock }, () => {
            chrome.storage.local.get([this._dailyLockKey], r2 => {
              const confirmed = r2?.[this._dailyLockKey]?.owner === this._instanceId;
              this.log('acquireDailyLock result', { confirmed, owner: r2?.[this._dailyLockKey]?.owner, instance: this._instanceId });
              resolve(confirmed);
            });
          });
        }
      } else { this.log('acquireDailyLock failed, existing lock', lock); resolve(false); }
    }));
  }

  async releaseDailyLock() {
    return new Promise(resolve => chrome.storage.local.get([this._dailyLockKey], res => {
      const lock = res?.[this._dailyLockKey] || null;
      if (lock && lock.owner === this._instanceId) {
        chrome.storage.local.remove([this._dailyLockKey], () => { this.log('releaseDailyLock: released by', this._instanceId); resolve(true); });
      } else resolve(false);
    }));
  }

  // pre-send check to avoid duplicate daily sends
  async preSendCheckAndMaybeWait(startTime) {
    for (let attempt = 0; attempt < this._dailyMaxPreSendRetries; attempt++) {
      const latest = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null)));
      if (latest && latest.timestamp >= startTime) { this.log('preSendCheck: found newer dailyStats, aborting send', { latestTs: new Date(latest.timestamp).toISOString(), startTime: new Date(startTime).toISOString() }); return false; }
      const backoff = this._dailyPreSendBaseBackoffMs + Math.floor(Math.random()*700);
      await new Promise(r => setTimeout(r, backoff));
    }
    return true;
  }

  // robust daily summary computation and storage
  async getDailySummary({ persist = true } = {}) {
    const currentValues = this.getCurrentValues();
    if (!currentValues) { this.error('Unable to get current values'); return null; }
    this.log('getDailySummary START — now:', new Date().toISOString());
    this.log('getDailySummary: currentValues.models count =', Object.keys(currentValues.models || {}).length, 'timestamp=', new Date(currentValues.timestamp).toISOString());

    const [previousDayRaw, maxStaleMs] = await Promise.all([
      new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null))),
      new Promise(res => chrome.storage.sync.get(['dailyFallbackMaxAgeMs'], cfg => {
        const cfgVal = cfg?.dailyFallbackMaxAgeMs; res(Number.isFinite(cfgVal) ? cfgVal : (this._defaultFallbackHours*60*60*1000));
      }))
    ]);

    let raw = previousDayRaw;
    if (!raw) {
      for (let i=0;i<3 && !raw;i++){ this.log('getDailySummary: dailyStats missing — retrying read (attempt)', i+1); await new Promise(r=>setTimeout(r,1000)); raw = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r2 => res(r2?.[this._dailyStatsKey] || null))); }
    }
    if (raw) this.log('getDailySummary: read dailyStats from storage:', { ts: new Date(raw.timestamp).toISOString(), ageMs: Date.now()-raw.timestamp, modelsCount: Object.keys(raw.models || {}).length, points: raw.points, owner: raw.owner || null, periodKey: raw.periodKey || null });
    else this.log('getDailySummary: no dailyStats found in storage after retries.');

    const ONE_DAY_MS = 24*60*60*1000;
    let previousDay = null;
    if (raw) {
      const ageMs = Date.now() - raw.timestamp;
      if (ageMs <= ONE_DAY_MS) previousDay = raw, this.log('getDailySummary: using fresh snapshot', new Date(raw.timestamp).toISOString());
      else if (ageMs <= maxStaleMs) previousDay = raw, this.warn('getDailySummary: using STALE snapshot as fallback', new Date(raw.timestamp).toISOString(), ageMs=${ageMs});
      else this.log('getDailySummary: snapshot too old, treating as missing', new Date(raw.timestamp).toISOString(), ageMs=${ageMs});
    }

    if (!previousDay) {
      this.log('getDailySummary: No previous day data available or snapshot unusable. Writing current snapshot and returning empty summary.');
      const periodKey = await this.getCurrentPeriodKey();
      if (persist) {
        chrome.storage.local.set({ [this._dailyStatsKey]: { models: currentValues.models, points: currentValues.points, timestamp: Date.now(), owner: this._instanceId, periodKey } }, () => {
          this.log('getDailySummary: stored dailyStats ts=', new Date().toISOString(), 'modelsCount=', Object.keys(currentValues.models || {}).length, 'owner=', this._instanceId, 'periodKey=', periodKey);
        });
        chrome.storage.local.set({ [this._dailyRunningRewardKey]: 0, [this._dailyRunningRewardDayKey]: periodKey, [this._lastSuccessfulKey]: { state:'SENT', owner:this._instanceId, sentAt:Date.now(), periodKey, snapshot:{ models: currentValues.models, points: currentValues.points, timestamp: Date.now() }, rewardPointsTotal:0 } });
      }
      return { dailyDownloads:0, dailyPrints:0, points: currentValues.points, pointsGained:0, top5Downloads:[], top5Prints:[], rewardsEarned:[], rewardPointsTotal:0, from:new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), to:new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) };
    }

    // compare
    const modelChanges = {};
    this.log('getDailySummary: comparing models; previousDay.models count', Object.keys(previousDay.models || {}).length);
    for (const [id, current] of Object.entries(currentValues.models)) {
      let previous = previousDay?.models?.[id] || null;
      if (!previous && current.permalink) previous = Object.values(previousDay.models || {}).find(m => m?.permalink === current.permalink) || null;
      if (!previous && current.name) { const norm = current.name.trim().toLowerCase(); previous = Object.values(previousDay.models || {}).find(m => m?.name?.trim().toLowerCase() === norm) || null; if (previous) this.log('getDailySummary: matched previous by name', { id, name: current.name }); }
      if (!previous) { this.log('New model found:', current.name, 'id=', id, 'permalink=', current.permalink); continue; }

      const prevDownloads = Number(previous.downloads || 0), prevPrints = Number(previous.prints || 0), prevBoosts = Number(previous.boosts || 0);
	  const currDownloads = Number(current.downloads || 0), currPrints = Number(current.prints || 0), currBoosts = Number(current.boosts || 0);
      let downloadsGained = currDownloads - prevDownloads, printsGained = currPrints - prevPrints, boostsGained = currBoosts - prevBoosts;
      if (downloadsGained <= 0 && printsGained <= 0 && boostsGained <= 0) continue;
      if (downloadsGained > this._suspiciousDeltaLimit || printsGained > this._suspiciousDeltaLimit) { this.warn('Suspiciously large delta detected, skipping reward calculation for', { id, name: current.name, downloadsGained, printsGained, prevTs: previous.timestamp || null }); continue; }

      modelChanges[id] = { id, name: current.name, downloadsGained, printsGained, boostsGained, previousDownloads: prevDownloads, previousPrints: prevPrints, currentDownloads: currDownloads, currentPrints: currPrints, permalink: current.permalink || previous?.permalink || null };
    }

    const dailyDownloads = Object.values(modelChanges).reduce((s,m)=>s+m.downloadsGained,0);
    const dailyPrints = Object.values(modelChanges).reduce((s,m)=>s+m.printsGained,0);
    const top5Downloads = Object.values(modelChanges).filter(m=>m.downloadsGained>0).sort((a,b)=>b.downloadsGained-a.downloadsGained).slice(0,5);
    const top5Prints = Object.values(modelChanges).filter(m=>m.printsGained>0).sort((a,b)=>b.printsGained-a.printsGained).slice(0,5);

    // compute rewards
    const rewardsEarned = []; let rewardPointsTotal = 0;
    for (const m of Object.values(modelChanges)) {
      const prevDownloadsTotal = this.calculateDownloadsEquivalent(m.previousDownloads, m.previousPrints);
      const currDownloadsTotal = this.calculateDownloadsEquivalent(m.currentDownloads, m.currentPrints);
      let cursor = prevDownloadsTotal; const thresholdsHit = []; const maxThresholdsPerModel = 200; let thresholdsCount = 0;
      while (cursor < currDownloadsTotal && thresholdsCount < maxThresholdsPerModel) {
        const interval = this.getRewardInterval(cursor);
        const mod = cursor % interval;
        const nextThreshold = (cursor === 0 || mod === 0) ? cursor + interval : cursor + (interval - mod);
        if (nextThreshold <= currDownloadsTotal) {
          const rewardPoints = this.getRewardPointsForDownloads(nextThreshold)*1.25;
          thresholdsHit.push({ threshold: nextThreshold, rewardPoints });
          rewardPointsTotal += rewardPoints;
          cursor = nextThreshold; thresholdsCount++;
        } else break;
      }
      if (thresholdsHit.length) rewardsEarned.push({ id:m.id, name:m.name, thresholds:thresholdsHit.map(t=>t.threshold), rewardPointsTotalForModel:thresholdsHit.reduce((s,t)=>s+t.rewardPoints,0) });
    }

    const periodKey = await this.getCurrentPeriodKey();
    if (persist) {
      chrome.storage.local.set({ [this._dailyStatsKey]: { models: currentValues.models, points: currentValues.points, timestamp: Date.now(), owner: this._instanceId, periodKey } }, () => {
        this.log('getDailySummary: updated dailyStats ts=', new Date().toISOString(), 'modelsCount=', Object.keys(currentValues.models || {}).length, 'owner=', this._instanceId, 'periodKey', periodKey);
      });
      chrome.storage.local.set({ [this._dailyRunningRewardKey]: 0, [this._dailyRunningRewardDayKey]: periodKey, [this._lastSuccessfulKey]: { state:'SENT', owner:this._instanceId, sentAt:Date.now(), periodKey, snapshot:{ models: currentValues.models, points: currentValues.points, timestamp: Date.now() }, rewardPointsTotal:0 } });
    }
	    // points de boosts (agrégés)
    const boostPointsVal = await this._getBoostPointsValue();
    const totalBoostsGained = Object.values(modelChanges).reduce((s,m)=>s + (m.boostsGained||0), 0);
    const boostPointsTotal = totalBoostsGained * boostPointsVal;
    rewardPointsTotal += boostPointsTotal;

    return { dailyDownloads, dailyPrints, points: currentValues.points, pointsGained: currentValues.points - previousDay.points, top5Downloads, top5Prints, rewardsEarned, rewardPointsTotal,totalBoostsGained, boostPointsTotal, boostPointsVal, from: new Date(previousDay.timestamp).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), to: new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) };
  }

  // schedule daily report with locking/claiming
  scheduleDailyNotification() {
    if (this._dailyTimerId) { clearTimeout(this._dailyTimerId); this._dailyTimerId = null; }
    chrome.storage.sync.get(['dailyReport','dailyNotificationTime'], (config) => {
      const dailyReport = config.dailyReport || 'yes';
      if (dailyReport === 'no') { this.log('Daily report disabled'); return; }
      const dailyTime = config.dailyNotificationTime || '23:30';
      const [hour, minute] = dailyTime.split(':').map(Number);
      const now = new Date(); const nextNotification = new Date(); nextNotification.setHours(hour, minute, 0, 0); if (nextNotification <= now) nextNotification.setDate(nextNotification.getDate()+1);
      const jitter = Math.floor((Math.random()*2 -1) * this._dailyScheduleJitterMs);
      const delay = Math.max(0, nextNotification - now + jitter);
      this.log(Daily report scheduled for: ${new Date(Date.now()+delay)}. Delay: ${delay}ms; jitterMs=${jitter});
      this._dailyTimerId = setTimeout(async () => {
        const startTime = Date.now(); this.log(scheduleDailyNotification: firing attempt at ${new Date().toISOString()});
        const claimantKey = this._lastSuccessfulKey; let clearPending=false, wrotePending=false, periodKey=null;
        const gotLock = await this.acquireDailyLock();
        if (!gotLock) { this.log('scheduleDailyNotification: could not acquire lock, another instance likely running. Aborting this attempt.'); this.scheduleDailyNotification(); return; }
        try {
          const latestAfterLock = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null)));
          if (latestAfterLock && latestAfterLock.timestamp >= startTime) { this.log('scheduleDailyNotification: dailyStats updated by another instance after lock; aborting this send.'); return; }
          const nowMs = Date.now(); periodKey = await this.getCurrentPeriodKey();
          const claimResult = await new Promise(res => {
            chrome.storage.local.get([claimantKey], r => {
              const existing = r?.[claimantKey] || null;
              if (existing && existing.state === 'SENT' && existing.periodKey === periodKey) { res({ ok:false, reason:'already-sent', existing }); return; }
              const PENDING_STALE_MS = 5 * 60 * 1000;
              if (existing && existing.state === 'PENDING' && (nowMs - (existing.claimAt || 0)) < PENDING_STALE_MS && existing.periodKey === periodKey) { res({ ok:false, reason:'pending-claim', existing }); return; }
              const claim = { state:'PENDING', owner:this._instanceId, claimAt: nowMs, periodKey };
              chrome.storage.local.set({ [claimantKey]: claim }, () => { chrome.storage.local.get([claimantKey], v => { const confirmed = v?.[claimantKey]?.owner === this._instanceId && v[claimantKey].state === 'PENDING' && v[claimantKey].periodKey === periodKey; res({ ok:confirmed, claim }); }); });
            });
          });
          if (!claimResult.ok) { this.log('scheduleDailyNotification: aborting send due to claim failure', claimResult.reason, claimResult.existing); return; }
          wrotePending = true;
          const okToSend = await this.preSendCheckAndMaybeWait(startTime);
          if (!okToSend) { this.log('scheduleDailyNotification: preSendCheck indicates newer snapshot; aborting this send.'); clearPending = true; return; }
          this.log(Sending daily report: ${new Date()});
          const summary = await this.getDailySummary();
          if (summary) {
            let rewardsSection = 'No rewards earned in the prior 24 hours';
            if (summary.rewardsEarned?.length) rewardsSection = summary.rewardsEarned.map(r => ${r.name}: +${r.rewardPointsTotalForModel} points (thresholds: ${r.thresholds.join(', ')})).join('\n');
            const totalEquivalent = summary.dailyDownloads + (summary.dailyPrints * 2);
            const topDownloadsList = summary.top5Downloads.length ? summary.top5Downloads.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.downloadsGained}).join('\n') : 'No new downloads today';
            const topPrintsList = summary.top5Prints.length ? summary.top5Prints.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.printsGained}).join('\n') : 'No new prints today';
 const message = 
📊 Récap 24h (${summary.from} → ${summary.to})

Points de téléchargement : ${totalEquivalent}
⚡ Boosts gagnés : +${summary.totalBoostsGained||0} → +${summary.boostPointsTotal||0} pts

🏆 Top téléchargements :
${topDownloadsList}

🖨️ Top impressions :
${topPrintsList}

🎁 Points gagnés (24h) :
${summary.rewardsEarned?.length
  ? summary.rewardsEarned.map(r => ${r.name} : +${r.rewardPointsTotalForModel} pts (seuils : ${r.thresholds.join(', ')})).join('\n')
  : 'Aucun palier atteint'}

Total points (24h) : ${summary.rewardPointsTotal}
.trim();
            const sent = await this.sendTelegramMessage(message);
            if (sent) {
              const sentAt = Date.now();
              const runningRewardPoints = await new Promise(res => chrome.storage.local.get([this._dailyRunningRewardKey], r => res(r?.[this._dailyRunningRewardKey] || 0)));
              const finalRecord = { state:'SENT', owner:this._instanceId, sentAt, periodKey, snapshot:{ models: summary.top5Downloads.concat(summary.top5Prints).reduce((acc,m)=>{acc[m.id]=m;return acc;},{}), points: summary.points, timestamp: Date.now() }, rewardPointsTotal: runningRewardPoints };
              await new Promise(resolve => chrome.storage.local.set({ [this._lastSuccessfulKey]: finalRecord }, () => { this.log('scheduleDailyNotification: wrote lastSuccessfulDailyReport SENT by', this._instanceId, 'sentAt=', new Date(sentAt).toISOString(), 'periodKey=', periodKey); resolve(); }));
              try { chrome.storage.local.set({ [this._dailyRunningRewardKey]:0, [this._dailyRunningRewardDayKey]: periodKey }, () => { this.log('scheduleDailyNotification: reset running reward counter for period', { periodKey }); }); } catch (err) { this.error('Error resetting running reward counter for period', err); }
            } else clearPending = true;
          } else clearPending = true;
        } finally {
          try {
            if (clearPending && claimantKey) {
              chrome.storage.local.get([claimantKey], r => {
                const existing = r?.[claimantKey] || null;
                if (existing && existing.state === 'PENDING' && existing.owner === this._instanceId) chrome.storage.local.remove([claimantKey], () => { this.log('scheduleDailyNotification: cleared PENDING claim during cleanup'); });
                else this.log('scheduleDailyNotification: skip clearing PENDING (not owner or not pending)', { existing });
              });
            }
          } finally {
            await this.releaseDailyLock();
            this.scheduleDailyNotification();
          }
        }
      }, delay);
    });
  }

  // main periodic check (per-model messages or summary)
  async checkAndNotify() {
    if (this.isChecking) { this.log('Check already in progress, skipping...'); return; }
    this.log(checkAndNotify start — ${ITERATION}); this.isChecking = true;
    try {
      this.log('Starting change check...');
      let anyNotification = false;
      const currentValues = this.getCurrentValues();
      if (!currentValues) { this.log('No current values found'); await this.savePreviousValues({}); return; }
      if (!this.previousValues) await this.loadPreviousValues();
      if (!this.previousValues) { this.log('First run or no previous values, saving initial values'); this.previousValues = currentValues; await this.savePreviousValues(currentValues); return; }
      if (this.previousValues && !this.previousValues.models) { this.previousValues.models = {}; await this.savePreviousValues(this.previousValues); }
      if (currentValues.points > (this.previousValues.points || 0)) this.log('Global account points increased, ignoring for per-model-only Telegram notifications.');

      const modelsActivity = []; let modelUpdateCount = 0;
      for (const [id, current] of Object.entries(currentValues.models)) {
        const previous = this.previousValues.models[id];
        if (!previous) continue;
        const previousDownloadsRaw = Number(previous.downloads) || 0, previousPrints = Number(previous.prints) || 0, previousBoosts = Number(previous.boosts) || 0;
        const previousDownloadsTotal = this.calculateDownloadsEquivalent(previousDownloadsRaw, previousPrints);
        const currentDownloadsRaw = Number(current.downloads) || 0, currentPrints = Number(current.prints) || 0, currentBoosts = Number(current.boosts) || 0;
        const currentDownloadsTotal = this.calculateDownloadsEquivalent(currentDownloadsRaw, currentPrints);
        const downloadsDeltaRaw = currentDownloadsRaw - previousDownloadsRaw, printsDelta = currentPrints - previousPrints, boostsDelta = currentBoosts - previousBoosts;
        const downloadsDeltaEquivalent = downloadsDeltaRaw + (printsDelta * 2);
        const hasActivity = (downloadsDeltaRaw !== 0) || (printsDelta !== 0) || (boostsDelta > 0);
        if (hasActivity) modelUpdateCount++;
        const modelSummary = { id, name: current.name, imageUrl: current.imageUrl, downloadsDeltaRaw, printsDelta, boostsDelta, previousDownloadsTotal, currentDownloadsTotal, downloadsDeltaEquivalent, rewards: [] };

        if (currentDownloadsTotal > previousDownloadsTotal) {
          let cursor = previousDownloadsTotal, maxRewardsToReport = 50, rewardsFound = 0;
          while (cursor < currentDownloadsTotal && rewardsFound < maxRewardsToReport) {
            const interval = this.getRewardInterval(cursor), mod = cursor % interval;
            const nextThreshold = (cursor === 0 || mod === 0) ? cursor + interval : cursor + (interval - mod);
            this.log(REWARD-LOOP ${current.name} cursor=${cursor} interval=${interval} nextThreshold=${nextThreshold} currDownloads=${currentDownloadsTotal});
            if (nextThreshold <= currentDownloadsTotal) { const rewardPoints = this.getRewardPointsForDownloads(nextThreshold)*1.25; modelSummary.rewards.push({ thresholdDownloads: nextThreshold, points: rewardPoints }); cursor = nextThreshold; rewardsFound++; } else break;
          }
          if (rewardsFound >= maxRewardsToReport) this.log(Many rewards earned for ${current.name}. Listed first ${maxRewardsToReport} in summary.);
        }

        const boostOnly = (boostsDelta > 0) && (downloadsDeltaRaw === 0 && printsDelta === 0 && modelSummary.rewards.length === 0);
        if (!this.notifySummaryMode) {
          if (boostOnly) {
            const lines = [];
            const boostPts = Math.max(0, boostsDelta) * (await this._getBoostPointsValue());
lines.push(⚡ Boost sur : ${current.name}, '', ⚡ Boosts : +${boostsDelta} → +${boostPts} pts);
            const message = lines.join('\n');
            this.log('MESSAGE-BRANCH', { iteration: ITERATION, name: current.name, branch: 'boost-only', downloadsDeltaEquivalent, boostsDelta, rewardsFound: modelSummary.rewards.length });
            this.log(Sending boost-only message for ${current.name});
            const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
 if (sent) {
   const boostPts = (await this._getBoostPointsValue()) * Math.max(0, boostsDelta);
   if (boostPts > 0) await this._accumulateDailyRewardPoints(boostPts);
 }
            anyNotification = true; continue;
          }

          const hasActivity2 = (downloadsDeltaRaw !== 0) || (printsDelta !== 0) || (modelSummary.rewards.length > 0) || (boostsDelta > 0);
          if (hasActivity2) {
  this.log('MESSAGE-BRANCH', {
    iteration: ITERATION,
    name: current.name,
    branch: 'milestone',
    downloadsDeltaEquivalent,
    boostsDelta,
    rewardsFound: modelSummary.rewards.length
  });

  const lines = [];
  const equivalentTotal = currentDownloadsTotal;

  // En-tête + deltas bruts
  lines.push(📦 Mise à jour : ${current.name}, '');
  lines.push(${downloadsDeltaEquivalent > 0 ? '+' : ''}${downloadsDeltaEquivalent} points de téléchargement (total ${equivalentTotal}), '');
  lines.push(⬇️ Téléchargements : ${currentDownloadsRaw} (${downloadsDeltaRaw > 0 ? '+' : ''}${downloadsDeltaRaw}));
  lines.push(🖨️ Impressions : ${currentPrints} (${printsDelta > 0 ? '+' : ''}${printsDelta}));

  // Paliers atteints (seulement si présents)
  if (modelSummary.rewards.length > 0) {
    modelSummary.rewards.forEach(r =>
      lines.push(🎁 Palier atteint ! +${r.points} pts à ${r.thresholdDownloads})
    );
    lines.push('');
  }

  // Toujours afficher prochain palier / intervalle
  const nextThresholdAfterCurrent = this.nextRewardDownloads(equivalentTotal);
  const downloadsUntilNext = Math.max(0, nextThresholdAfterCurrent - equivalentTotal);
  lines.push(🎯 Prochain palier : encore ${downloadsUntilNext} (objectif ${nextThresholdAfterCurrent}), '');
  lines.push(🔁 Intervalle : tous les ${this.getRewardInterval(equivalentTotal)});

  // Boosts (si présents)
  if (boostsDelta > 0) {
    const boostPts = Math.max(0, boostsDelta) * (await this._getBoostPointsValue());
    lines.push('', ⚡ Boosts : +${boostsDelta} → +${boostPts} pts);
  }

  // Avertissement si deltas suspects
  let warning = '';
  if (Math.abs(downloadsDeltaRaw) > this._suspiciousDeltaLimit || Math.abs(printsDelta) > this._suspiciousDeltaLimit) {
    warning = "\n\n⚠️ Volume très élevé sur la période. C’est peut-être un pic de popularité (bravo !) ou un artefact. Tu peux réduire l’intervalle de rafraîchissement si besoin.";
  }

  const message = lines.join('\n') + warning;

  this.log(Sending milestone message for ${current.name});
  const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);

  if (sent) {
    const pts = modelSummary.rewards.reduce((s, r) => s + r.points, 0);
    const boostPts = (await this._getBoostPointsValue()) * Math.max(0, boostsDelta);
    const totalPts = pts + boostPts;
    if (totalPts > 0) await this._accumulateDailyRewardPoints(totalPts);
  }

  anyNotification = true;
} else {
		  if (boostOnly) {
            const lines = [];
			const boostPts = Math.max(0, boostsDelta) * (await this._getBoostPointsValue());
 lines.push(⚡ Boost sur : ${current.name}, '', ⚡ Boosts : +${boostsDelta} → +${boostPts} pts);
            const message = lines.join('\n');
            this.log('MESSAGE-BRANCH', { iteration: ITERATION, name: current.name, branch: 'boost-only', downloadsDeltaEquivalent, boostsDelta, rewardsFound: modelSummary.rewards.length });
            this.log(Sending boost-only message for ${current.name});
            const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
 if (sent) {
   const boostPts = (await this._getBoostPointsValue()) * Math.max(0, boostsDelta);
   if (boostPts > 0) await this._accumulateDailyRewardPoints(boostPts);
 }
            anyNotification = true; continue;
          }
          const hasActivity3 = (downloadsDeltaRaw !== 0) || (printsDelta !== 0) || (modelSummary.rewards.length > 0) || (boostsDelta > 0);
          if (hasActivity3) modelsActivity.push({
            id,
            name: current.name,
            downloadsDeltaEquivalent,
            currentDownloadsTotal,
            rewardPointsForThisModel: modelSummary.rewards.reduce((s,r)=>s+r.points,0),
            boostsDelta,
			boostPointsForThisModel: Math.max(0, boostsDelta) * (await this._getBoostPointsValue()),
            // 👉 Ajout minimal pour le rendu
            currentDownloadsRaw,
            currentPrints,
            downloadsDeltaRaw,
            printsDelta
          });
        }
      }

      // dynamic summary mode switch
      let forceSummaryMode = false;
      const SUMMARY_MODE_THRESHOLD = 15;
      if (!this.notifySummaryMode && modelUpdateCount >= SUMMARY_MODE_THRESHOLD) { forceSummaryMode = true; this.log(Switching to summary mode for this check due to ${modelUpdateCount} updates.); }
      const useSummaryMode = this.notifySummaryMode || forceSummaryMode;

      if (useSummaryMode) {
        if (forceSummaryMode) await this.sendTelegramMessage("Beaucoup d’activité : passage en mode récap pour éviter les limites Telegram.");
        if (modelsActivity.length === 0) {
          await this.sendTelegramMessage("No new prints or downloads found."); anyNotification = true;
          const prevString = JSON.stringify(this.previousValues||{}), currString = JSON.stringify(currentValues||{});
          if (prevString !== currString) { this.previousValues = currentValues; await this.savePreviousValues(currentValues); }
          this.isChecking = false; return;
        }

        const totalEquivalent = modelsActivity.reduce((s,m)=>s + (m.downloadsDeltaEquivalent||0),0);
        const rewardPointsThisRun = modelsActivity.reduce((s,m)=>s + (m.rewardPointsForThisModel||0) + (m.boostPointsForThisModel||0), 0);
        await this._accumulateDailyRewardPoints(rewardPointsThisRun);

        const persisted = await new Promise(res => chrome.storage.local.get([this._dailyRunningRewardKey, this._dailyRunningRewardDayKey, this._dailyStatsKey, this._lastSuccessfulKey], r => res(r)));
        let running = Number.isFinite(persisted?.[this._dailyRunningRewardKey]) ? persisted[this._dailyRunningRewardKey] : 0;
        const runningDay = persisted?.[this._dailyRunningRewardDayKey] || null;
        const lastDaily = persisted?.[this._lastSuccessfulKey] || null;
        const lastDailyPoints = Number.isFinite(lastDaily?.rewardPointsTotal) ? lastDaily.rewardPointsTotal : 0;
        const currentPeriod = await this.getCurrentPeriodKey();

        if (!running || runningDay !== currentPeriod) {
          this.log('Periodic summary: running counter missing or mismatched; computing fallback via getDailySummary');
          try {
            const computed = await this.getDailySummary({ persist: false });
            if (computed && Number.isFinite(computed.rewardPointsTotal)) {
              running = computed.rewardPointsTotal;
              try { chrome.storage.local.set({ [this._dailyRunningRewardKey]: running, [this._dailyRunningRewardDayKey]: currentPeriod }, () => { this.log('Periodic summary: persisted computed running counter', { running, period: currentPeriod }); }); } catch (err) { this.warn('Periodic summary: failed to persist computed running counter', err); }
            } else this.warn('Periodic summary: computed fallback missing rewardPointsTotal; leaving persisted running as-is', { running, runningDay });
          } catch (err) { this.warn('Periodic summary: fallback computation failed', err); }
        }

        let rewardsToday = running - lastDailyPoints; if (rewardsToday < 0) rewardsToday = running;
        const fromTs = new Date(this.previousValues.timestamp).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), toTs = new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });
        const headerLines = [
  📊 Récap (${fromTs} → ${toTs}),
  '',
  Points de téléchargement sur la période : ${totalEquivalent},
  '',
  'Mises à jour de modèles :',
  ''
];const maxModelsInMessage = 200;
        const list = modelsActivity.slice(0, maxModelsInMessage);
        const modelLines=[]; let anyLargeDelta=false;
        list.forEach((m,i) => {
          const downloadsDelta = m.downloadsDeltaEquivalent || 0, total = m.currentDownloadsTotal || 0, interval = m.rewardInterval || this.getRewardInterval(total), nextThreshold = this.nextRewardDownloads(total), remaining = Math.max(0, nextThreshold - total), ptsEarned = m.rewardPointsForThisModel || 0;
           let line = ${i+1}. <b>${escapeHtml(m.name)}</b> : +${downloadsDelta} (total ${total});
          // 👉 Ajout minimal : détails réels
          const dl = m.currentDownloadsRaw || 0;
          const pr = m.currentPrints || 0;
          const dld = m.downloadsDeltaRaw || 0;
          const prd = m.printsDelta || 0;
           line +=  — Téléch. : ${dl} (${dld >= 0 ? '+' : ''}${dld}), Impr. : ${pr} (${prd >= 0 ? '+' : ''}${prd});
 if (ptsEarned>0) line +=   🎉 +${ptsEarned} pts;
 if ((m.boostPointsForThisModel||0) > 0) line +=   ⚡ +${m.boostPointsForThisModel} pts (boosts);
 line +=   — reste ${remaining} pour 🎁 (palier ${interval});
          if (Math.abs(downloadsDelta) > this._suspiciousDeltaLimit) { line += \n⚠️ The number of downloads during this period is very high. This could be because your model is very popular (good job!). Or it could be an error. You may want to shorten the refresh interval.; anyLargeDelta=true; }
          if ((m.boostsDelta || 0) > 0) {
            line += 
⚡ Boosts : +${m.boostsDelta};
          }

          modelLines.push(line);
        });
        const spacedModels = modelLines.join('\n\n');
		// Count models within 2 downloads (downloads + 2×prints) of next reward across all models on the page
		let closeToGiftCount = 0;
		const allModels = Object.values(currentValues?.models || {});
		for (const cm of allModels) {
		  const downloads = Number(cm.downloads || 0);
		  const prints = Number(cm.prints || 0);
		  const total = this.calculateDownloadsEquivalent(downloads, prints); // downloads + 2*prints
		  const next = this.nextRewardDownloads(total);
		  const remaining = Math.max(0, next - total);
		  if (remaining <= 2) closeToGiftCount++;
		}
		 const footerLines = [
   '',
   🎁 Points (période) : ${rewardPointsThisRun} pts,
   🎁 Points (aujourd’hui) : ${rewardsToday} pts,
   🎯 Modèles proches du prochain palier (≤2) : ${closeToGiftCount}
 ];

        const message = headerLines.join('\n') + '\n' + spacedModels + '\n' + footerLines.join('\n');
        this.log('Aggregated summary message length:', message.length);
        const sent = await this.sendTelegramMessage(message); if (sent) anyNotification = true;
      } else {
        // per-model logic already executed inside loop
      }

      const prevString = JSON.stringify(this.previousValues || {}), currString = JSON.stringify(currentValues || {});
      if (prevString !== currString) { this.previousValues = currentValues; await this.savePreviousValues(currentValues); } else this.log('No changes detected, skipping savePreviousValues to reduce storage writes.');
      if (!anyNotification && !useSummaryMode) { const heartbeatMsg = 'Aucune nouvelle impression ni téléchargement.'; this.log(heartbeatMsg); await this.sendTelegramMessage(heartbeatMsg); }
    } catch (err) { this.error('Error during check:', err); }
    finally { this.isChecking = false; }
  }

  // accumulate running points with lock and retries
  async _accumulateDailyRewardPoints(pointsToAdd, attempt = 1) {
    if (!Number.isFinite(pointsToAdd) || pointsToAdd <= 0) return;
    const MAX_ATTEMPTS = 3, BASE_DELAY_MS = 300, MAX_BACKOFF_MS = 3000, lockTimeoutMs = 1500;
    while (attempt <= MAX_ATTEMPTS) {
      const lockAcquired = await this.acquireDailyLock(lockTimeoutMs);
      if (!lockAcquired) {
        if (attempt >= MAX_ATTEMPTS) { this.warn(_accumulateDailyRewardPoints: lock not acquired after ${MAX_ATTEMPTS} attempts; skipping this accumulation.); return; }
        const backoff = Math.min(MAX_BACKOFF_MS, BASE_DELAY_MS * Math.pow(2, attempt-1));
        const jitter = Math.floor(Math.random() * Math.min(500, Math.floor(backoff/2)));
        const delay = backoff + jitter; this.log(_accumulateDailyRewardPoints: lock not acquired (attempt ${attempt}). Waiting ${delay}ms then retrying.); await new Promise(r=>setTimeout(r, delay)); attempt++; continue;
      }

      try {
        const periodKey = await this.getCurrentPeriodKey();
        const local = await new Promise(res => chrome.storage.local.get([this._dailyRunningRewardKey, this._dailyRunningRewardDayKey], r => res(r)));
        let running = (local && local[this._dailyRunningRewardKey]) ? local[this._dailyRunningRewardKey] : 0;
        const runningDay = (local && local[this._dailyRunningRewardDayKey]) ? local[this._dailyRunningRewardDayKey] : null;
        this.log('_accumulateDailyRewardPoints read', { running, runningDay, periodKey, pointsToAdd, attempt });

        if (runningDay && runningDay !== periodKey) {
          const runningDayTs = new Date(runningDay).getTime(), periodKeyTs = new Date(periodKey).getTime();
          if (Number.isFinite(runningDayTs) && Number.isFinite(periodKeyTs)) {
            if (runningDayTs > periodKeyTs) { this.log('_accumulateDailyRewardPoints: stored runningDay is in the future; resetting running to 0 and continuing', { runningDay, periodKey }); running = 0; }
            else { this.warn('_accumulateDailyRewardPoints: stored runningDay older than current period; aborting to avoid joining wrong window', { runningDay, periodKey }); return; }
          } else { this.log('_accumulateDailyRewardPoints: could not parse runningDay/periodKey; resetting running to 0 and continuing', { runningDay, periodKey }); running = 0; }
        }
        if (!runningDay) { this.log('_accumulateDailyRewardPoints resetting running counter for new period', { oldDay: runningDay, newPeriod: periodKey }); running = 0; }
        running += pointsToAdd;
        await new Promise(resolve => {
          chrome.storage.local.set({ [this._dailyRunningRewardKey]: running, [this._dailyRunningRewardDayKey]: periodKey }, (err) => {
            if (chrome.runtime.lastError || err) this.warn('Storage set failed (quota or other error):', chrome.runtime.lastError || err);
            else this.log(_accumulateDailyRewardPoints: added ${pointsToAdd}, running=${running}, period=${periodKey});
            resolve();
          });
        });
        return;
      } finally { await this.releaseDailyLock(); }
    }
  }

  // previousValues persistence
  async loadPreviousValues(){ return new Promise(resolve => chrome.storage.local.get(['previousValues'], result => { if (result?.previousValues) { this.log('Previous values loaded:', result.previousValues); this.previousValues = result.previousValues; } resolve(); })); }
  async savePreviousValues(values){ return new Promise(resolve => chrome.storage.local.set({ previousValues: values }, () => { this.log('Values saved to storage'); resolve(); })); }

  // lifecycle
  async start() {
    this.log('Starting monitor...');
    if (this.checkInterval) { this.log('Monitor already running, skipping duplicate start.'); return; }
    chrome.storage.sync.get(['telegramToken','chatId','refreshInterval','dailyReport','dailyNotificationTime','notifySummaryMode'], async (config) => {
      if (!config || !config.telegramToken || !config.chatId) { this.error('Missing Telegram configuration'); return; }
      this.telegramToken = config.telegramToken; this.chatId = config.chatId; this.notifySummaryMode = !!config.notifySummaryMode;
      const refreshInterval = config.refreshInterval || 900000;
      this.log(Configured refresh interval: ${refreshInterval}ms); this.log(Notify summary mode: ${this.notifySummaryMode});
      let intervalToUse = refreshInterval; const ONE_HOUR = 60*60*1000; const COMPENSATION_MS = 60*1000;
      if (refreshInterval > ONE_HOUR) { intervalToUse = Math.max(0, refreshInterval - COMPENSATION_MS); this.log(Interval adjusted for overhead: using ${intervalToUse}ms instead of configured ${refreshInterval}ms); }
      else this.log(Interval not adjusted (configured <= 1 hour): using ${intervalToUse}ms);
      await autoScrollToFullBottom();
      await this.loadPreviousValues();
      await this.checkAndNotify();
      if (this.checkInterval) { clearInterval(this.checkInterval); this.checkInterval = null; }
      const STORAGE_KEY = 'monitorNextScheduledTime';
      let nextScheduled = Number(sessionStorage.getItem(STORAGE_KEY));

      if (!nextScheduled) {
        nextScheduled = Date.now() + intervalToUse;
        this.log('Initializing schedule. First run at:', new Date(nextScheduled).toLocaleString());
        sessionStorage.setItem(STORAGE_KEY, nextScheduled);
      }

      const scheduleNext = () => {
        const now = Date.now();

        if (now > nextScheduled) {
          this.warn(Missed scheduled time by ${Math.round((now - nextScheduled)/1000)}s. Running now.);
          while (nextScheduled < now) {
            nextScheduled += intervalToUse;
          }
          sessionStorage.setItem(STORAGE_KEY, nextScheduled);
        }

        const delay = Math.max(0, nextScheduled - now);
        this.log(Next check scheduled for ${new Date(nextScheduled).toLocaleString()} (in ${Math.round(delay/1000)}s));

        this.checkInterval = setTimeout(async () => {
          try {
            this.log('Scrolling before refresh...');
            await autoScrollToFullBottom();
            this.log('Refreshing page...');
          } catch (err) {
            this.error('Error during pre-refresh tasks:', err);
          }

          const newNextScheduled = nextScheduled + intervalToUse;
          sessionStorage.setItem(STORAGE_KEY, newNextScheduled);

          try { scheduleNext(); } catch (e) { this.error('Failed to schedule next run:', e); }
          try { window.location.reload(); } catch (e) { this.error('Reload failed:', e); }
        }, delay);
      };

      scheduleNext();
      if (config.dailyReport !== 'no') this.scheduleDailyNotification();
	  this.scheduleInterimNotifications();
      this.log(Monitor started, refresh every ${intervalToUse/60000} minutes (configured ${refreshInterval/60000} minutes));
    });
  }

  stop() {
    if (this.checkInterval) { clearInterval(this.checkInterval); this.checkInterval = null; }
    if (this._dailyTimerId) { clearTimeout(this._dailyTimerId); this._dailyTimerId = null; }
    this.isChecking = false;
    this.log('Monitor stopped');
  }

  async restart() {
    this.log('Restarting monitor on request...');
    this.stop();
    await autoScrollToFullBottom();
    await this.checkAndNotify();
    this.start();
  }

  // interim summary (manual request)
  async handleInterimSummaryRequest() {
    this.log('Interim summary requested');
    const currentValues = this.getCurrentValues();
    if (!currentValues) { this.error('Interim summary aborted: could not extract current values'); throw new Error('No current values'); }
    const baseline = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null)));
    if (!baseline) { this.error('Interim summary aborted: no baseline dailyStats found'); throw new Error('No baseline dailyStats found'); }

    const previousDay = baseline;
    const modelChanges = {};
    for (const [id, current] of Object.entries(currentValues.models)) {
      let previous = previousDay?.models?.[id] || null;
      if (!previous && current.permalink) previous = Object.values(previousDay.models || {}).find(m => m && m.permalink === current.permalink) || null;
      if (!previous && current.name) previous = Object.values(previousDay.models || {}).find(m => m?.name?.trim().toLowerCase() === current.name.trim().toLowerCase()) || null;
      if (!previous) { this.log('New model found (interim):', current.name); continue; }
      const downloadsGained = Math.max(0, (Number(current.downloads)||0) - (Number(previous.downloads)||0));
      const printsGained = Math.max(0, (Number(current.prints)||0) - (Number(previous.prints)||0));
      const boostsGained = Math.max(0, (Number(current.boosts)||0) - (Number(previous.boosts)||0));
      if (downloadsGained > 0 || printsGained > 0 || boostsGained > 0)
        modelChanges[id] = {
          id, name: current.name,
          downloadsGained, printsGained, boostsGained,
          previousDownloads: previous.downloads || 0, previousPrints: previous.prints || 0,
          currentDownloads: current.downloads || 0, currentPrints: current.prints || 0,
          imageUrl: current.imageUrl || ''
        };
    }

    const dailyDownloads = Object.values(modelChanges).reduce((s,m)=>s+m.downloadsGained,0);
    const dailyPrints = Object.values(modelChanges).reduce((s,m)=>s+m.printsGained,0);
    const top5Downloads = Object.values(modelChanges).filter(m=>m.downloadsGained>0).sort((a,b)=>b.downloadsGained-a.downloadsGained).slice(0,5);
    const top5Prints = Object.values(modelChanges).filter(m=>m.printsGained>0).sort((a,b)=>b.printsGained-a.printsGained).slice(0,5);

    let rewardsEarned = [], rewardPointsTotal = 0;
    for (const m of Object.values(modelChanges)) {
      const prevTotal = this.calculateDownloadsEquivalent(m.previousDownloads, m.previousPrints);
      const currTotal = this.calculateDownloadsEquivalent(m.currentDownloads, m.currentPrints);
      let cursor = prevTotal; const thresholdsHit=[]; const maxThresholdsPerModel=50; let count=0;
      while (cursor < currTotal && count < maxThresholdsPerModel) {
        const interval = this.getRewardInterval(cursor), mod = cursor % interval;
        const nextThreshold = (cursor===0 || mod===0) ? cursor+interval : cursor+(interval-mod);
        if (nextThreshold <= currTotal) { const pts = this.getRewardPointsForDownloads(nextThreshold)*1.25; thresholdsHit.push({ threshold: nextThreshold, points: pts }); rewardPointsTotal += pts; cursor = nextThreshold; count++; } else break;
      }
      if (thresholdsHit.length) rewardsEarned.push({ id:m.id, name:m.name, thresholds:thresholdsHit.map(t=>t.threshold), rewardPointsTotalForModel:thresholdsHit.reduce((s,t)=>s+t.points,0) });
    }

     const totalEquivalent = dailyDownloads + (dailyPrints * 2);
    const boostPointsVal = await this._getBoostPointsValue();
    const totalBoostsGained = Object.values(modelChanges).reduce((s,m)=>s + (m.boostsGained||0), 0);
    const boostPointsTotal = totalBoostsGained * boostPointsVal;
    rewardPointsTotal += boostPointsTotal;
    const topDownloadsList = top5Downloads.length ? top5Downloads.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.downloadsGained}).join('\n') : 'No new downloads so far';
    const topPrintsList = top5Prints.length ? top5Prints.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.printsGained}).join('\n') : 'No new prints so far';
    const fromTs = new Date(previousDay.timestamp).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), toTs = new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });
 const message = 
🔔 Récap intermédiaire (${fromTs} → ${toTs})

Points de téléchargement : ${totalEquivalent}
⚡ Boosts gagnés : +${totalBoostsGained} → +${boostPointsTotal} pts

🏆 Top téléchargements :
${topDownloadsList}

🖨️ Top impressions :
${topPrintsList}

🎁 Points gagnés jusque-là :
${(rewardPointsTotal > 0)
  ? ${rewardsEarned.length ? rewardsEarned.map(r => ${r.name} : +${r.rewardPointsTotalForModel} pts (seuils : ${r.thresholds.join(', ')})).join('\n')+'\n' : ''}Total : ${rewardPointsTotal} pts
  : 'Aucun point pour l’instant'}
.trim();
    this.log('Interim message:', message);
    const sent = await this.sendTelegramMessage(message);
    if (!sent) { this.error('Interim summary: failed to send via Telegram'); throw new Error('Telegram send failed'); }
    this.log('Interim summary: sent successfully');
    return true;
  }
}

// Startup
this.log = console.log.bind(console);
this.warn = console.warn.bind(console);
this.error = console.error.bind(console);

console.log('Initializing monitor...');
const monitor = new ValueMonitor();
monitor.start();

// Listen for popup messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'INTERIM_SUMMARY_REQUEST') {
    monitor.handleInterimSummaryRequest().then(()=>sendResponse({ok:true})).catch(err=>{ console.error('interim summary error', err); sendResponse({ok:false, error: err?.message}); });
    return true;
  }
  if (msg?.type === 'REFRESH_INTERVAL_UPDATED') {
    monitor.restart().then(()=>sendResponse({ok:true})).catch(err=>{ console.error('restart error', err); sendResponse({ok:false, error: err?.message}); });
    return true;
  }
  if (msg?.type === 'CONFIG_SAVED') {
    chrome.storage.sync.get(['notifySummaryMode'], cfg => { monitor.notifySummaryMode = !!(cfg?.notifySummaryMode); monitor.log('CONFIG_SAVED received. notifySummaryMode =', monitor.notifySummaryMode); monitor.restart().then(()=>sendResponse({ok:true})).catch(err=>sendResponse({ok:false, error: err?.message})); });
    return true;
  }
    if (msg?.type === 'DUMP_MODELS') {
    monitor.sendModelsSnapshot()
      .then(()=>sendResponse({ok:true}))
      .catch(err => { console.error('dump models error', err); sendResponse({ok:false, error: err?.message}); });
    return true;
  }

});


toujours une erreur de catch ligne 913
ChatGPT a dit :

Réflexion durant 32s
Bien vu — l’erreur vient d’un accolade manquante qui fait que le else { … } est rattaché au mauvais if.
Dans ta boucle, après le bloc if (hasActivity2) { … }, il faut fermer aussi le if (!this.notifySummaryMode) { … } avant d’ouvrir le else { … }.
Sinon, le parseur « perd le fil » et crashe plus loin… d’où le Unexpected token 'catch' en ligne 913.

Patch minimal (diff)
Cherche ce passage (vers la fin du gros for (...) { ... } dans checkAndNotify()):

  anyNotification = true;
} else {
  if (boostOnly) {
    const lines = [];
    …
Remplace-le par (=> on ajoute une accolade } avant le else):

  anyNotification = true;
}
else {
  if (boostOnly) {
    const lines = [];
    …
Version complète du bloc concerné (contexte)
if (!this.notifySummaryMode) {
  if (boostOnly) {
    const lines = [];
    const boostPts = Math.max(0, boostsDelta) * (await this._getBoostPointsValue());
    lines.push(`⚡ Boost sur : ${current.name}`, '', `⚡ Boosts : +${boostsDelta} → +${boostPts} pts`);
    const message = lines.join('\n');
    this.log('MESSAGE-BRANCH', { iteration: ITERATION, name: current.name, branch: 'boost-only', downloadsDeltaEquivalent, boostsDelta, rewardsFound: modelSummary.rewards.length });
    this.log(`Sending boost-only message for ${current.name}`);
    const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
    if (sent) {
      const boostPts = (await this._getBoostPointsValue()) * Math.max(0, boostsDelta);
      if (boostPts > 0) await this._accumulateDailyRewardPoints(boostPts);
    }
    anyNotification = true;
    continue;
  }

  const hasActivity2 = (downloadsDeltaRaw !== 0) || (printsDelta !== 0) || (modelSummary.rewards.length > 0) || (boostsDelta > 0);
  if (hasActivity2) {
    // … (ton bloc "milestone" corrigé)
    anyNotification = true;
  }
}
else {  // <= cette accolade en plus avant le else résout l’erreur
  if (boostOnly) {
    const lines = [];
    const boostPts = Math.max(0, boostsDelta) * (await this._getBoostPointsValue());
    lines.push(`⚡ Boost sur : ${current.name}`, '', `⚡ Boosts : +${boostsDelta} → +${boostPts} pts`);
    const message = lines.join('\n');
    this.log('MESSAGE-BRANCH', { iteration: ITERATION, name: current.name, branch: 'boost-only', downloadsDeltaEquivalent, boostsDelta, rewardsFound: modelSummary.rewards.length });
    this.log(`Sending boost-only message for ${current.name}`);
    const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
    if (sent) {
      const boostPts = (await this._getBoostPointsValue()) * Math.max(0, boostsDelta);
      if (boostPts > 0) await this._accumulateDailyRewardPoints(boostPts);
    }
    anyNotification = true;
    continue;
  }

  const hasActivity3 = (downloadsDeltaRaw !== 0) || (printsDelta !== 0) || (modelSummary.rewards.length > 0) || (boostsDelta > 0);
  if (hasActivity3) {
    modelsActivity.push({
      id,
      name: current.name,
      downloadsDeltaEquivalent,
      currentDownloadsTotal,
      rewardPointsForThisModel: modelSummary.rewards.reduce((s,r)=>s+r.points,0),
      boostsDelta,
      boostPointsForThisModel: Math.max(0, boostsDelta) * (await this._getBoostPointsValue()),
      currentDownloadsRaw,
      currentPrints,
      downloadsDeltaRaw,
      printsDelta
    });
  }
}
Après ce fix, ton else { … } est bien celui de if (!this.notifySummaryMode) { … }, et le parsing redevient OK — l’erreur catch disparaît.

Vous avez dit :
autre chose et la c'est un peu plu sioux


il faudrait en faisant le moins de modifs possibles


que tout ce qu'on fait soit fait deux fois

une fois pour le site europeen et une fois pour le site chinois

en gros on ferme les onglets

on opuvre europeen on fait le scroll on fait tout ce qu'on fait ensuite on ferme onglet on ouvre site chinois on refait la meme chose


et bien sur dans la notif il me faut un indicateur dans le texte pour dire d'ou ca vient et surtout il faut que chacun ait ses variables de reward/comptes etcccccccccc daily et j'en passe
ChatGPT a dit :

Réflexion durant 38s
ok, on garde ça ultra-minimal et propre :

Ce qu’on ajoute
Badge + clés séparées par site (EU / CN)

Messages tagués [EU] / [CN] automatiquement (ntfy et Telegram).

Comptes/journaliers séparés (toutes les clés chrome.storage.* sont préfixées par le site).

Aller-retour automatique EU ↔ CN dans le même onglet (pas besoin d’ouvrir/fermer des onglets, on navigue — effet identique).

1) Config (2 URL)
Dans chrome.storage.sync, on lira :

euSiteUrl (p.ex. https://makerworld.com/...)

cnSiteUrl (p.ex. https://makerworld.cn/...)

multiSiteMode = true (pour activer l’alternance)

Si non renseigné, on reste en mono-site (comportement actuel).

2) Helpers à coller juste après la ligne const escapeHtml = …
(rien d’autre à toucher ailleurs pour le badge)

// --- Multi-site helpers (ajout minimal) ---
function getSiteConfigFromUrl(href, euUrl, cnUrl) {
  const H = (u) => {
    try { return new URL(u).hostname; } catch { return ''; }
  };
  const host = H(href);
  const euHost = H(euUrl);
  const cnHost = H(cnUrl);

  if (euHost && host.endsWith(euHost)) return { id: 'EU', badge: '[EU]', prefix: 'EU:' };
  if (cnHost && host.endsWith(cnHost)) return { id: 'CN', badge: '[CN]', prefix: 'CN:' };

  // fallback simple: .cn => CN, sinon EU
  if (host.endsWith('.cn')) return { id: 'CN', badge: '[CN]', prefix: 'CN:' };
  return { id: 'EU', badge: '[EU]', prefix: 'EU:' };
}
3) Constructor : clés préfixées par site
Dans le constructeur de ValueMonitor, remplace le bloc d’inits des clés par ceci (seule vraie modif du ctor) :

constructor() {
  // config/state
  this.telegramToken = '';
  this.chatId = '';
  this.previousValues = null;
  this.checkInterval = null;
  this._dailyTimerId = null;
  this.isChecking = false;

  // --- DÉTECTE SITE + PRÉFIXE DE CLÉS ---
  // on lit la conf pour connaître les 2 URL (si posées)
  // (pas bloquant : on met un fallback immédiat au besoin)
  this._siteId = 'EU';
  this._siteBadge = '[EU]';
  this._keyPrefix = 'EU:';

  try {
    // lecture sync "synchrone" via callback un poil plus tard (mais on set déjà un premier guess)
    chrome.storage.sync.get(['euSiteUrl','cnSiteUrl'], (cfg) => {
      const euUrl = cfg?.euSiteUrl || '';
      const cnUrl = cfg?.cnSiteUrl || '';
      const info = getSiteConfigFromUrl(window.location.href, euUrl, cnUrl);
      this._siteId = info.id;
      this._siteBadge = info.badge;
      this._keyPrefix = info.prefix;

      // réinitialise les noms de clés après découverte (si ctor déjà passé)
      this._dailyLockKey            = this._keyPrefix + 'dailyLock';
      this._dailyStatsKey           = this._keyPrefix + 'dailyStats';
      this._lastSuccessfulKey       = this._keyPrefix + 'lastSuccessfulDailyReport';
      this._dailyRunningRewardKey   = this._keyPrefix + 'dailyRunningRewardPoints';
      this._dailyRunningRewardDayKey= this._keyPrefix + 'dailyRunningRewardDay';
    });
  } catch { /* fallback déjà posé */ }

  // identity/keys/timeouts (utilisent le préfixe, mis à jour ci-dessus quand la conf arrive)
  this._instanceId = Math.random().toString(36).slice(2);
  this._dailyLockKey             = this._keyPrefix + 'dailyLock';
  this._dailyStatsKey            = this._keyPrefix + 'dailyStats';
  this._lastSuccessfulKey        = this._keyPrefix + 'lastSuccessfulDailyReport';
  this._dailyRunningRewardKey    = this._keyPrefix + 'dailyRunningRewardPoints';
  this._dailyRunningRewardDayKey = this._keyPrefix + 'dailyRunningRewardDay';

  this._dailyLockTimeoutMs = 2 * 60 * 1000;
  this._dailyMaxPreSendRetries = 5;
  this._dailyPreSendBaseBackoffMs = 300;
  this._dailyScheduleJitterMs = 30 * 1000;
  this._defaultFallbackHours = 48;
  this.notifySummaryMode = false;
  this._telegramMaxMessageChars = 4000;
  this._suspiciousDeltaLimit = 200;
  this._interimTimers = [];
  this._interimSlots = ['07:00','12:00','16:00','22:00'];
  this._interimJitterMs = 15_000;
  this._interimClaimKey = this._keyPrefix + 'lastInterimSentKey'; // <- aussi préfixé !
  this._boostPointsDefault = 15;
}
Remarque : on a juste préfixé toutes les clés (dailyStats, dailyLock, etc.). Ça isole totalement EU/CN.

4) Préfixe des notifications (1 ligne dans chaque sender)
Dans sendTelegramMessage et sendTelegramMessageWithPhoto, on préfixe le contenu + on tag le Title pour ntfy.

a) Dans sendTelegramMessage(message, …)
Ajoute au début de la fonction (juste après la ligne try { const cfg = await new Promise(... qui lit ntfy) :

// Décore le message avec le badge du site
message = `${this._siteBadge} ${message || ''}`;
Et dans l’appel ntfy (déjà présent) change le Title:

return await __sendNtfyWithCfg(cfg, {
  title: `${this._siteBadge} MakerWorld`,
  text: message, imageUrl:'', clickUrl:'', tags:'makerworld,update', priority:3
});
b) Dans sendTelegramMessageWithPhoto(message, photoUrl)
Même principe, au tout début :

message = `${this._siteBadge} ${message || ''}`;
Et pour ntfy :

return await __sendNtfyWithCfg(cfg, {
  title: `${this._siteBadge} MakerWorld`,
  text: message, imageUrl:(photoUrl||''), clickUrl:'', tags:'makerworld,model,update', priority:4
});
Résultat : toutes les notifs (EU/CN) sont marquées [EU] ou [CN] sans toucher à chaque endroit où on compose du texte.

5) Alternance EU ↔ CN (navigation au lieu d’ouvrir/fermer)
Dans start(), on a déjà un scheduler. On change un seul endroit : le rechargement.
Repère ce bout dans scheduleNext() :

try { scheduleNext(); } catch (e) { this.error('Failed to schedule next run:', e); }
try { window.location.reload(); } catch (e) { this.error('Reload failed:', e); }
Remplace par :

try { scheduleNext(); } catch (e) { this.error('Failed to schedule next run:', e); }

try {
  chrome.storage.sync.get(['multiSiteMode','euSiteUrl','cnSiteUrl'], (cfg) => {
    const multi = !!cfg?.multiSiteMode;
    const euUrl = cfg?.euSiteUrl || '';
    const cnUrl = cfg?.cnSiteUrl || '';

    if (!multi || !euUrl || !cnUrl) {
      // mono-site: comportement actuel
      try { window.location.reload(); } catch (e) { this.error('Reload failed:', e); }
      return;
    }

    // On regarde où on est et on switch
    const here = window.location.href;
    const info = getSiteConfigFromUrl(here, euUrl, cnUrl);
    const nextUrl = (info.id === 'EU') ? cnUrl : euUrl;

    this.log(`Multi-site: switch ${info.id} → ${info.id === 'EU' ? 'CN' : 'EU'}: ${nextUrl}`);
    window.location.href = nextUrl;
  });
} catch (e) {
  this.error('Navigation switch failed, fallback reload:', e);
  try { window.location.reload(); } catch (e2) { this.error('Reload failed:', e2); }
}
Ça donne exactement le cycle voulu :
EU → run → (à l’échéance) bascule sur CN → run → (à l’échéance) rebascule sur EU, etc.
Pas d’onglets multiples, pas de droits tabs nécessaires.

6) (Optionnel) Tags ntfy par site
Si tu veux aussi taguer les notifs ntfy côté Tags :
change tags:'makerworld,update' en tags:\makerworld,update,${this._siteId.toLowerCase()}` ettags:'makerworld,model,update'entags:`makerworld,model,update,${this._siteId.toLowerCase()}``

Résultat
Aucune logique métier du calcul changée.

Variables/journaliers : totalement indépendants EU/CN (préfixe des clés).

Notifs : auto-tag [EU]/[CN] partout (Telegram & ntfy).

Séquence : EU puis CN, puis EU…, sans code lourd ni background.

Si tu veux, je peux te coller ces bouts directement dans ton fichier si tu me confirmes les 2 URLs exactes (euSiteUrl, cnSiteUrl).

Vous avez dit :
NON alors on va tout changer  dans le popup on définit l'url on va rajouter une deuxieme URL China URL

pour la première on va garder les memes variables comme ca on perd pas l'encours

pour la deuxième on va créer ce qu'il faut prefixer

ChatGPT a dit :

Réflexion durant 34s
Parfait — on ajoute dans le popup deux champs d’URL (Europe + Chine) et un préfixe pour que le contenu script puisse isoler ses clés de stockage côté Chine (sans toucher aux clés “historiques” côté Europe).

Voici les modifs minimales.

popup.html (ajouts)
Insère ce bloc juste avant le <hr> qui précède la section “Refresh interval / Daily report” (dans ton fichier actuel, c’est après la section ntfy) 
popup

:

  <div class="config-section">
    <h3>Sites</h3>

    <label for="site-url">URL MakerWorld (Europe) :</label>
    <input type="url" id="site-url" placeholder="https://makerworld.com/..." />

    <label for="china-url">URL MakerWorld (Chine) :</label>
    <input type="url" id="china-url" placeholder="https://makerworld.com.cn/..." />

    <label for="china-prefix">Préfixe des clés (Chine) :</label>
    <input type="text" id="china-prefix" placeholder="cn_" value="cn_" />
    <div class="small-note">
      Les variables côté Europe gardent les mêmes noms. Côté Chine, elles seront
      lues/écrites avec ce préfixe (ex. <code>cn_dailyStats</code>) pour éviter tout mélange.
    </div>
  </div>

  <hr>
(Le reste du HTML reste inchangé.)

popup.js (chargement + sauvegarde)
Déclare les nouveaux éléments DOM au début, avec les autres const (après les lignes qui récupèrent les inputs existants) 
popup

:

  const siteUrlInput = document.getElementById('site-url');
  const chinaUrlInput = document.getElementById('china-url');
  const chinaPrefixInput = document.getElementById('china-prefix');
Ajoute les nouvelles clés dans le chrome.storage.sync.get(...) et renseigne les valeurs par défaut lors du chargement:

  chrome.storage.sync.get([
    'telegramToken','chatId','refreshInterval',
    'dailyReport','dailyNotificationTime','notifySummaryMode',
    // ntfy
    'useNtfy','ntfyUrl','ntfyAuth','ntfyTags','ntfyPriority',
    // sites
    'siteUrl','chinaUrl','chinaPrefix'
  ], function (config) {
    // ... (le code existant)

    // sites
    siteUrlInput.value = config.siteUrl || '';
    chinaUrlInput.value = config.chinaUrl || '';
    chinaPrefixInput.value = (config.chinaPrefix || 'cn_');
  });
Dans l’objet cfg sauvegardé par le bouton Save, ajoute les trois nouvelles propriétés:

    const cfg = {
      telegramToken: telegramTokenInput.value.trim(),
      chatId: chatIdInput.value.trim(),
      refreshInterval: refreshMs,
      dailyReport: dailyReportSelect.value,
      dailyNotificationTime: normalizeTimeTo24h(notificationTimeInput.value),
      notifySummaryMode: !!notifySummaryCheckbox.checked,
      // ntfy
      useNtfy: !!useNtfyCheckbox.checked,
      ntfyUrl: ntfyUrlInput.value.trim(),
      ntfyAuth: ntfyAuthInput.value.trim(),
      ntfyTags: ntfyTagsInput.value.trim(),
      ntfyPriority: Math.min(5, Math.max(1, parseInt(ntfyPriorityInput.value || '3', 10))),
      // sites
      siteUrl: siteUrlInput.value.trim(),
      chinaUrl: chinaUrlInput.value.trim(),
      chinaPrefix: chinaPrefixInput.value.trim() || 'cn_'
    };
(Le reste du JS reste inchangé.)

Ce que ça permet dès maintenant
Tu peux configurer dans le popup :

URL Europe (ex: https://makerworld.com/...)

URL Chine (ex: https://makerworld.com.cn/...)

Préfixe Chine (par défaut cn_)

Côté contenu script, tu pourras lire ces clés (siteUrl, chinaUrl, chinaPrefix) et:

ouvrir/traiter séquentiellement Europe puis Chine,

et, pour le site chinois, utiliser des clés de stockage préfixées :
cn_previousValues, cn_dailyStats, cn_dailyRunningRewardPoints, etc.,
afin de garder l’historique Europe intact.

Dans les notifs, tu pourras ajouter un tag/texte ([EU] / [CN]) selon l’URL courante — il suffira de tester si l’onglet courant correspond à chinaUrl et d’injecter le label voulu.

Si tu veux, je te fais tout de suite le petit adaptateur côté content-script pour:

choisir l’URL cible,

fermer l’onglet courant,

ouvrir Europe → run → fermer → ouvrir Chine → run,

et mapper automatiquement toutes les clés locales avec le chinaPrefix.


Sources
Vous avez dit :
du coup maintenant dans content on fait quoi
ChatGPT a dit :

Réflexion durant 20s
Top ! On garde ton content script quasi identique et on ajoute juste de quoi :

détecter si on est sur le site EU ou CN,

préfixer toutes les clés de stockage côté CN pour séparer les compteurs,

taguer les notifs avec [EU] / [CN].

Voici le patch minimal à appliquer.

1) Déterminer le contexte (EU/CN) et préparer le préfixe
👉 Ajoute ce bloc tout en haut (avant la déclaration de const ITERATION = ... ou juste après, mais avant d’instancier ValueMonitor):

// ==== Contexte multi-sites (EU / CN) ====
let __MW_CFG__ = {};
function loadSync(keys) {
  return new Promise(res => chrome.storage.sync.get(keys, v => res(v || {})));
}

function computeSiteContext(cfg) {
  const href = location.href;
  const isCN = !!(cfg.chinaUrl && href.startsWith(cfg.chinaUrl));
  const prefix = isCN ? (cfg.chinaPrefix || 'cn_') : ''; // vide pour EU
  const label  = isCN ? '[CN]' : '[EU]';
  return { isCN, prefix, label };
}
2) Clé helper pour préfixer toutes les clés locales
👉 Ajoute ce helper (tu peux le mettre juste après le bloc précédent) :

// Retourne "prefix + name" côté CN, sinon "name" côté EU
function K(name) {
  const p = __MW_CFG__._ctx?.prefix || '';
  return p ? (p + name) : name;
}
3) Appliquer le préfixe aux clés de stockage dans ValueMonitor
Dans le constructor() de ValueMonitor, remplace les clés “nues” par leurs versions via K() :

this._dailyLockKey              = K('dailyLock');
this._dailyStatsKey             = K('dailyStats');
this._lastSuccessfulKey         = K('lastSuccessfulDailyReport');
this._dailyRunningRewardKey     = K('dailyRunningRewardPoints');
this._dailyRunningRewardDayKey  = K('dailyRunningRewardDay');
this._interimClaimKey           = K('lastInterimSentKey');
Plus bas, dans loadPreviousValues() et savePreviousValues(values) :

async loadPreviousValues(){
  const key = K('previousValues');
  return new Promise(resolve => chrome.storage.local.get([key], result => {
    if (result && result[key]) { this.log('Previous values loaded:', result[key]); this.previousValues = result[key]; }
    resolve();
  }));
}

async savePreviousValues(values){
  const key = K('previousValues');
  return new Promise(resolve => chrome.storage.local.set({ [key]: values }, () => {
    this.log('Values saved to storage'); resolve();
  }));
}
Et dans la planification (clé de session pour la prochaine exécution), change la constante :

const STORAGE_KEY = K('monitorNextScheduledTime');
⚠️ Tous les autres accès à ces clés restent inchangés, car on a centralisé la logique via K().

4) Taguer les notifications [EU]/[CN]
Telegram (texte) : préfixe le message si pas déjà présent.

Dans sendTelegramMessage(message, ...), au début de la fonction, ajoute :

const label = (__MW_CFG__._ctx?.label || '[EU]');
if (message && !String(message).startsWith(label)) {
  message = `${label} ${message}`;
}
Telegram + photo : pareil dans sendTelegramMessageWithPhoto(message, ...) :

const label = (__MW_CFG__._ctx?.label || '[EU]');
if (message && !String(message).startsWith(label)) {
  message = `${label} ${message}`;
}
ntfy : on garde ton override ; ajoute le label dans title si absent.
Dans __sendNtfyWithCfg(...), juste avant l’envoi :

const label = (__MW_CFG__._ctx?.label || '[EU]');
if (title && !String(title).startsWith(label)) title = `${label} ${title}`;
if (!title) title = label; // au pire, montre la source
(Place ces deux lignes après la construction de baseHeaders et avant le fetch.)

5) Initialisation : charger les URLs et démarrer le monitor
En bas, là où tu as :

console.log('Initializing monitor...');
const monitor = new ValueMonitor();
monitor.start();
Remplace par :

console.log('Initializing monitor...');

(async () => {
  // 1) Charge la config
  const cfg = await loadSync(['siteUrl','chinaUrl','chinaPrefix']);
  __MW_CFG__ = cfg;
  __MW_CFG__._ctx = computeSiteContext(cfg);

  // 2) Log utile
  console.log('[MakerStats] Site context:', __MW_CFG__._ctx);

  // 3) Démarre le monitor
  const monitor = new ValueMonitor();
  monitor.start();

  // 4) Expose (facultatif)
  window.__MakerStatsMonitor__ = monitor;
})();
6) (Optionnel) Ajuster quelques autres clés
Si tu utilises ailleurs directement les noms bruts ci-dessous, pense à les passer par K() aussi :

this._dailyLockKey, this._dailyStatsKey, this._lastSuccessfulKey,
this._dailyRunningRewardKey, this._dailyRunningRewardDayKey,
this._interimClaimKey, previousValues, monitorNextScheduledTime.

Dans ton code posté, on a couvert leurs usages principaux.

Ce que ça change concrètement
Même code sur les deux domaines.

Sur EU : pas de préfixe → les clés/compteurs restent identiques (tu ne perds rien).

Sur CN : toutes les clés en local/storage deviennent cn_* (ou le préfixe choisi), donc compteurs et daily séparés.

Chaque notif est préfixée [EU] ou [CN].

Et pour “faire EU puis CN automatiquement” ?
C’est mieux de le faire dans le service worker (background) ou le popup (ouvrir onglet EU → laisser le content faire sa passe → fermer → ouvrir CN → idem).
Le content script ne peut pas fermer/ouvrir des onglets tout seul proprement.
Si tu veux, je te donne un mini background avec un bouton “Run both sites” dans le popup qui :

lit siteUrl / chinaUrl,

ouvre EU → attend ~N sec → ferme,

ouvre CN → attend ~N sec → ferme.

Dis-moi et je te colle le code prêt à coller.

Vous avez dit :
const STORAGE_KEY = K('monitorNextScheduledTime');


je suis pas d'accord pour ca

car là en fait nous ce qu'on veut c'est un seul schedule qui fait les deux a la suite
ChatGPT a dit :

Réflexion durant 22s
Parfait — on garde donc un seul schedule global qui enchaîne EU puis CN.
👉 Du coup, dans le content, on fait 2 ajustements ultra-simples :

Le STORAGE_KEY reste global (sans préfixe)

On ne schedule que depuis le site EU (le site CN ne doit jamais (re)programmer la prochaine exécution)

Tout le reste (clés de stats, daily, etc.) reste préfixé côté CN via K(...) comme on l’a fait.

1) STORAGE_KEY global
Dans ton content, remplace la ligne que j’avais proposée par :

// STORAGE_KEY global partagé pour l'orchestration EU -> CN
const STORAGE_KEY = 'monitorNextScheduledTime';
(pas de K(...) ici, tu as raison)

2) Ne programmer le “next run” que depuis EU
Dans start() (là où on fait le scheduleNext()), entoure la partie planification par un garde-fou pour EU uniquement :

// ...
await this.checkAndNotify();

// ⛔️ IMPORTANT : on ne schedule que depuis EU
if (!__MW_CFG__._ctx?.isCN) {
  if (this.checkInterval) { clearInterval(this.checkInterval); this.checkInterval = null; }

  const STORAGE_KEY = 'monitorNextScheduledTime'; // global
  let nextScheduled = Number(sessionStorage.getItem(STORAGE_KEY));
  if (!nextScheduled) {
    nextScheduled = Date.now() + intervalToUse;
    this.log('Initializing schedule. First run at:', new Date(nextScheduled).toLocaleString());
    sessionStorage.setItem(STORAGE_KEY, nextScheduled);
  }

  const scheduleNext = () => {
    const now = Date.now();
    if (now > nextScheduled) {
      this.warn(`Missed scheduled time by ${Math.round((now - nextScheduled)/1000)}s. Running now.`);
      while (nextScheduled < now) nextScheduled += intervalToUse;
      sessionStorage.setItem(STORAGE_KEY, nextScheduled);
    }

    const delay = Math.max(0, nextScheduled - now);
    this.log(`Next check scheduled for ${new Date(nextScheduled).toLocaleString()} (in ${Math.round(delay/1000)}s)`);

    this.checkInterval = setTimeout(async () => {
      try {
        this.log('Scrolling before refresh...');
        await autoScrollToFullBottom();
        this.log('Refreshing page...');
      } catch (err) {
        this.error('Error during pre-refresh tasks:', err);
      }

      const newNextScheduled = nextScheduled + intervalToUse;
      sessionStorage.setItem(STORAGE_KEY, newNextScheduled);

      try { scheduleNext(); } catch (e) { this.error('Failed to schedule next run:', e); }
      try { window.location.reload(); } catch (e) { this.error('Reload failed:', e); }
    }, delay);
  };

  scheduleNext();
} else {
  // CN : pas de planification. On exécute juste checkAndNotify() puis on laisse l’onglet se fermer
  this.log('CN context detected — skipping local scheduling (global run orchestrated).');
}
// ...
Résultat : un seul timer (posé quand on est sur EU), et aucune reprogrammation depuis CN.

3) Orchestration EU → CN (à faire côté background/popup)
Le content ne peut pas ouvrir/fermer les onglets.

Le popup stocke déjà siteUrl (EU) et chinaUrl (CN).

Il faut un petit service worker (background) qui, à chaque échéance, ouvre EU, le laisse travailler (scroll + checkAndNotify), ferme l’onglet, puis ouvre CN, le laisse travailler, et referme.

Si tu veux, je te file le service_worker.js prêt à l’emploi (avec chrome.alarms) qui :

lit siteUrl / chinaUrl,

à chaque alarme : ouvre EU → attend N sec → ferme → ouvre CN → attend N sec → ferme,

s’appuie sur notre STORAGE_KEY global uniquement pour l’heure de la prochaine alarme.

Tu me dis et je te pose le fichier complet (très court) + les 2 lignes à ajouter dans ton manifest.json.

Vous avez dit :
ben oui je veux que ce soit bien géré justement
ChatGPT a dit :

Réflexion durant 53s
Top — on passe à un seul schedule global qui enchaîne EU ➜ CN, proprement, sans dupliquer la logique dans le content.

Voici exactement quoi faire (code prêt à coller) :

1) manifest.json
Ajoute/MAJ ces champs :

{
  "manifest_version": 3,
  "name": "MakerStats",
  "version": "1.0.0",
  "permissions": ["alarms", "tabs", "storage"],
  "background": { "service_worker": "service_worker.js" },
  "host_permissions": [
    "*://*/", 
    "https://*/*",
    "http://*/*"
  ]
}
Tu peux restreindre host_permissions si tu veux (ex: aux 2 domaines exacts EU & CN).

2) service_worker.js (nouveau)
Ce worker :

crée/maintient une alarme à partir de refreshInterval (popup),

à chaque déclenchement : ouvre EU, attend la fin du run (message CONTENT_DONE), ferme l’onglet, ouvre CN, attend, ferme,

fallback avec timeouts si jamais le content ne répond pas.

// service_worker.js

const ORCH = {
  ALARM: 'mw-orchestrator',
  DWELL_MS: 25_000,      // temps max par site (fallback)
  AWAIT_MS: 60_000,      // timeout d'attente de "CONTENT_DONE"
};

async function getCfg(keys) {
  return await new Promise(res => chrome.storage.sync.get(keys, r => res(r || {})));
}

async function setLocal(o) {
  return await new Promise(res => chrome.storage.local.set(o, () => res()));
}

async function getLocal(keys) {
  return await new Promise(res => chrome.storage.local.get(keys, r => res(r || {})));
}

async function createOrUpdateAlarm() {
  const cfg = await getCfg(['refreshInterval']);
  const every = Math.max(60_000, Number(cfg.refreshInterval || 900_000)); // >= 1 min
  // supprime l’ancienne puis recrée pour être sûr
  await chrome.alarms.clear(ORCH.ALARM);
  chrome.alarms.create(ORCH.ALARM, { periodInMinutes: every / 60000 });
  // Flag orchestration ON (lu par le content pour ne pas auto-scheduler)
  await setLocal({ mw_orchestrated_mode: true });
  console.log('[MW] alarm set every', every, 'ms');
}

chrome.runtime.onInstalled.addListener(createOrUpdateAlarm);
chrome.runtime.onStartup.addListener(createOrUpdateAlarm);

// Quand le popup change refreshInterval / URLs => on reschedule
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.refreshInterval || changes.siteUrl || changes.chinaUrl)) {
    createOrUpdateAlarm().catch(console.error);
  }
});

// Ouvre une URL et attend le message CONTENT_DONE (ou timeout)
async function openAndAwait(url, regionLabel) {
  console.log('[MW] Opening', regionLabel, '=>', url);
  const runId = Date.now() + ':' + regionLabel;
  await setLocal({ mw_current_run: runId });

  const tab = await chrome.tabs.create({ url, active: false });

  // garde-fou: si le content ne répond pas, on ferme quand même
  const hardClose = setTimeout(async () => {
    try { await chrome.tabs.remove(tab.id); } catch {}
  }, ORCH.DWELL_MS);

  const done = await new Promise(resolve => {
    let timeout = setTimeout(() => resolve(false), ORCH.AWAIT_MS);
    const listener = (msg, sender, sendResponse) => {
      if (msg && msg.type === 'CONTENT_DONE' && msg.region === regionLabel && msg.runId === runId) {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(listener);
        resolve(true);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
  });

  clearTimeout(hardClose);
  try { await chrome.tabs.remove(tab.id); } catch {}

  console.log(`[MW] ${regionLabel} finished:`, done ? 'ok' : 'timeout');
  return done;
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ORCH.ALARM) return;

  try {
    const { siteUrl, chinaUrl } = await getCfg(['siteUrl', 'chinaUrl']);
    const euUrl = siteUrl || '';
    const cnUrl = chinaUrl || '';

    if (!euUrl) { console.warn('[MW] Missing siteUrl (EU). Skip run.'); return; }
    if (!cnUrl) { console.warn('[MW] Missing chinaUrl (CN). Will run EU only.'); }

    // 1) EU
    await openAndAwait(euUrl, 'EU');

    // 2) CN (si dispo)
    if (cnUrl) await openAndAwait(cnUrl, 'CN');
  } catch (e) {
    console.error('[MW] orchestrator error', e);
  }
});
Rien à toucher dans le content pour ouvrir/fermer des tabs : c’est le worker qui s’en charge.

3) popup.js (petit ajout)
Quand tu sauvegardes (Save), après le chrome.storage.sync.set(...), force un reschedule :

chrome.runtime.sendMessage({ type: 'MW_RESCHEDULE' });
Et dans service_worker.js, capte-le (ajoute ceci) :

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'MW_RESCHEDULE') {
    createOrUpdateAlarm().then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }
});
(Si tu utilises déjà storage.onChanged, cette étape est optionnelle, mais ça donne un feedback immédiat.)

4) content.js (2 micro-modifs)
(a) Détecter EU vs CN
Ajoute un helper simple, en haut :

function detectRegion() {
  const h = location.hostname.toLowerCase();
  // adapte aux deux domaines réels
  if (h.includes('.cn') || h.includes('china')) return 'CN';
  return 'EU';
}
(b) Mode orchestration : ne pas auto-scheduler + envoyer “DONE”
Dans start() juste après await this.checkAndNotify();, remplace le bloc de planification par ce garde-fou :

// --- orchestration mode: content ne planifie pas, il exécute puis signale DONE ---
const { mw_orchestrated_mode, mw_current_run } = await new Promise(res =>
  chrome.storage.local.get(['mw_orchestrated_mode', 'mw_current_run'], r => res(r || {}))
);

if (mw_orchestrated_mode) {
  const region = detectRegion(); // 'EU' ou 'CN'
  try {
    chrome.runtime.sendMessage({ type: 'CONTENT_DONE', region, runId: mw_current_run || null });
  } catch {}
  this.log(`[MW] Orchestrated run: ${region} done — no local schedule.`);
  return; // FIN: pas de reload/schedule côté content
}

// --- sinon (mode legacy non orchestré), on garde ton scheduling existant ---
/* ton code scheduleNext() actuel ici, inchangé */
Résultat :

Quand l’orchestrateur est actif, le content n’utilise plus STORAGE_KEY, ne planifie plus et signale simplement la fin.

En mode “legacy” (si jamais tu coupes l’orchestrateur), ton content continue de s’auto-planifier comme avant (si tu le souhaites).

5) Notifs : tagger la source (EU/CN) et séparer les compteurs
Tu as déjà préfixé les clés de stockage pour CN via K(prefix, key) plus tôt. Continue sur cette logique (CN → mwCN_*, EU → mw_*).

Dans les messages, ajoute un préfixe [EU] / [CN]. Exemple, dans sendTelegramMessage(...) ou au moment de composer message :

const region = detectRegion();
const tag = region === 'CN' ? '[CN] ' : '[EU] ';
const message = tag + tonMessageExistant;
Tu peux le faire proprement en centralisant dans un petit wrapper :

formatWithRegion(text) {
  const region = detectRegion();
  const tag = region === 'CN' ? '[CN] ' : '[EU] ';
  return tag + text;
}
et remplacer les this.sendTelegramMessage(message) par
this.sendTelegramMessage(this.formatWithRegion(message)), idem pour sendTelegramMessageWithPhoto.

Ce que ça donne
Un seul minuteur (chrome.alarms) → EU → CN en série.

Content exécute la collecte/notifs une fois puis signale “CONTENT_DONE”, sans poser de timer local.

Background ferme EU et lance CN, ferme CN, fin du run.

Les daily/running rewards restent séparés via tes préfixes CN/EU (inchangé).

Chaque notif indique l’origine [EU] / [CN].

Si tu veux, je peux te donner un patch exact pour content.js en pointant l’endroit où insérer le bloc orchestration selon ton fichier actuel (dis-moi la ligne autour de start() où tu fais le schedule).

Vous avez dit :
un truc me chiffone si on utilise l'orchestrateur 

il faut que celui-ci gère le daily , l'interim et le check interval


et faut que content ne fasse plus rien de tout ça
ChatGPT a dit :

Réflexion durant 21s
Top, on aligne tout sur l’orchestrateur. Voici exactement quoi faire pour que le service worker pilote 100% (check périodique, “interim”, et “daily”), et que content.js n’ait plus aucun scheduling — il exécute juste des tâches quand on lui demande.

Plan clair
service_worker.js = orchestrateur unique

Gère 3 alarmes :

mw-check (toutes les X min = refreshInterval)

mw-interim (créneaux fixes 07:00/12:00/16:00/22:00, ou ceux que tu veux)

mw-daily (à l’heure dailyNotificationTime)

Pour chaque alarme, il ouvre EU → attend la fin → ouvre CN → attend la fin → ferme l’onglet (séquentiel).

Il envoie une commande au content dans l’onglet : RUN_TASK avec { task: 'CHECK' | 'INTERIM' | 'DAILY', runId, region }.

Il attend CONTENT_DONE correspondant, puis passe au suivant.

Il pose mw_orchestrated_mode = true en local pour que content n’auto-schedule rien.

content.js = exécuteur

Supprime/ignore tout ce qui planifiait : setTimeout, setInterval, chrome.alarms, “daily”, “interim”, “auto reload”, etc.

Au chargement, il ne lance rien (pas de scheduleDailyNotification(), pas de scheduleInterimNotifications(), pas de boucle de reload).

Il écoute chrome.runtime.onMessage :

RUN_TASK ⇒ détecte la région (EU/CN), fixe le prefix (vide pour EU, cn_ pour CN — tu l’as déjà), puis exécute pile la fonction demandée :

CHECK → autoScrollToFullBottom() puis checkAndNotify()

INTERIM → handleInterimSummaryRequest()

DAILY → getDailySummary() puis envoi du message récap 24h (tu l’as déjà dans scheduleDailyNotification; on factorise l’assemblage du message dans une petite méthode sendDailyReportFromSummary(summary)).

Quand c’est fini : chrome.runtime.sendMessage({ type: 'CONTENT_DONE', task, region, runId }).

Stockage séparé EU / CN

Tu l’avais bien amorcé : computeSiteContext() + K(name) pour préfixer :

EU ⇒ prefix '' (variables historiques inchangées)

CN ⇒ prefix 'cn_' (isole les compteurs, dailyStats, runningReward, etc.)

Dans la notif, ajoute le label [EU] / [CN] au début des messages (tu le fais déjà via label), comme “📊 [CN] Récap 24h (..)” / “⚡ [EU] Boost sur : …”.

Patches minimaux
A. service_worker.js
Ajoute un vrai scheduler 3 alarmes + orchestration séquentielle :

// service_worker.js

const ORCH = {
  ALARM_CHECK:  'mw-check',
  ALARM_DAILY:  'mw-daily',
  ALARM_INTERIM:'mw-interim',
  DWELL_MS: 25_000,   // garde-fou par site
  AWAIT_MS: 90_000,   // timeout attente CONTENT_DONE
};

async function getCfg(keys){ return await new Promise(res => chrome.storage.sync.get(keys, r => res(r||{}))); }
async function setLocal(o){ return await new Promise(res => chrome.storage.local.set(o, () => res())); }

async function openAndRun(url, regionLabel, task) {
  const runId = `${Date.now()}:${regionLabel}:${task}`;
  await setLocal({ mw_orchestrated_mode: true, mw_current_run: runId });

  const tab = await chrome.tabs.create({ url, active: false });

  // garde-fou fermeture forcée
  const hardClose = setTimeout(async () => { try { await chrome.tabs.remove(tab.id); } catch {} }, ORCH.DWELL_MS);

  // dès que le content est prêt, on lui envoie la tâche
  chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
    if (tabId === tab.id && info.status === 'complete') {
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.tabs.sendMessage(tab.id, { type: 'RUN_TASK', task, region: regionLabel, runId });
    }
  });

  const done = await new Promise(resolve => {
    const t = setTimeout(() => resolve(false), ORCH.AWAIT_MS);
    function onMsg(msg) {
      if (msg && msg.type === 'CONTENT_DONE' &&
          msg.runId === runId && msg.region === regionLabel && msg.task === task) {
        clearTimeout(t);
        chrome.runtime.onMessage.removeListener(onMsg);
        resolve(true);
      }
    }
    chrome.runtime.onMessage.addListener(onMsg);
  });

  clearTimeout(hardClose);
  try { await chrome.tabs.remove(tab.id); } catch {}

  console.log(`[MW][${regionLabel}] ${task} finished:`, done ? 'ok' : 'timeout');
  return done;
}

async function runBothSites(task) {
  const { siteUrl, chinaUrl } = await getCfg(['siteUrl','chinaUrl']);
  const euUrl = siteUrl || '';
  const cnUrl = chinaUrl || '';

  if (!euUrl && !cnUrl) { console.warn('[MW] No URLs configured'); return; }
  if (euUrl) await openAndRun(euUrl, 'EU', task);
  if (cnUrl) await openAndRun(cnUrl, 'CN', task);
}

// ====== Alarms set/update ======
async function scheduleAll() {
  const cfg = await getCfg(['refreshInterval','dailyNotificationTime']);
  const everyMs = Math.max(60_000, Number(cfg.refreshInterval || 900_000));

  // CHECK (périodique)
  await chrome.alarms.clear(ORCH.ALARM_CHECK);
  chrome.alarms.create(ORCH.ALARM_CHECK, { periodInMinutes: everyMs / 60000 });

  // DAILY
  const daily = (cfg.dailyNotificationTime || '23:30').split(':').map(Number);
  const whenDaily = new Date(); whenDaily.setMinutes(daily[1]||0, 0, 0); whenDaily.setHours(daily[0]||23);
  if (whenDaily <= new Date()) whenDaily.setDate(whenDaily.getDate()+1);
  await chrome.alarms.clear(ORCH.ALARM_DAILY);
  chrome.alarms.create(ORCH.ALARM_DAILY, { when: whenDaily.getTime(), periodInMinutes: 24*60 });

  // INTERIM (4 créneaux fixes)
  await chrome.alarms.clear(ORCH.ALARM_INTERIM);
  // On crée 4 alarmes “one-shot” reconduites à chaque tick (simple) :
  const slots = ['07:00','12:00','16:00','22:00'];
  for (const slot of slots) {
    const [h,m] = slot.split(':').map(Number);
    const d = new Date(); d.setHours(h||0, m||0, 0, 0);
    if (d <= new Date()) d.setDate(d.getDate()+1);
    chrome.alarms.create(`${ORCH.ALARM_INTERIM}:${slot}`, { when: d.getTime() });
  }

  await setLocal({ mw_orchestrated_mode: true });
  console.log('[MW] Orchestrator alarms scheduled.');
}

chrome.runtime.onInstalled.addListener(scheduleAll);
chrome.runtime.onStartup.addListener(scheduleAll);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.refreshInterval || changes.dailyNotificationTime || changes.siteUrl || changes.chinaUrl)) {
    scheduleAll().catch(console.error);
  }
});

// ====== Alarm handler ======
chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    if (alarm.name === ORCH.ALARM_CHECK) {
      await runBothSites('CHECK');
      return;
    }
    if (alarm.name === ORCH.ALARM_DAILY) {
      await runBothSites('DAILY');
      return;
    }
    if (alarm.name.startsWith(ORCH.ALARM_INTERIM+':')) {
      const slot = alarm.name.split(':')[1]; // “07:00” etc.
      await runBothSites('INTERIM');
      // replanifier ce slot pour demain
      const [h,m] = slot.split(':').map(Number);
      const d = new Date(); d.setDate(d.getDate()+1); d.setHours(h||0, m||0, 0, 0);
      chrome.alarms.create(`${ORCH.ALARM_INTERIM}:${slot}`, { when: d.getTime() });
      return;
    }
  } catch (e) {
    console.error('[MW] alarm run error', e);
  }
});

// Permettre le “Reschedule” depuis le popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'MW_RESCHEDULE') {
    scheduleAll().then(() => sendResponse({ ok: true }))
                 .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});
NB : On garde un seul onglet à la fois, EU puis CN, par tâche. Le worker envoie RUN_TASK après onUpdated complete.

B. content.js
Au tout début, fixe le contexte et coupe tout scheduling automatique :

// au load (tu l’as déjà en grande partie)
let __MW_CFG__ = {};
function computeSiteContext(cfg) { /* ...comme tu l’as... */ }
function K(name) { /* ...prefix EU/CN... */ }

(async () => {
  __MW_CFG__ = await new Promise(res => chrome.storage.sync.get(null, r => {
    const cfg = r || {};
    cfg._ctx = computeSiteContext(cfg);
    res(cfg);
  }));
})();
Supprime/neutralise dans start() :

les appels à scheduleDailyNotification()

scheduleInterimNotifications()

le mécanisme de reload (la boucle qui faisait window.location.reload()).

la logique “heartbeat” quand pas de notif à envoyer, tu peux la garder (elle part vers ntfy/tg), mais ne programme plus de prochaine exécution côté content.

Ajoute le dispatcher RUN_TASK :

// content.js — à la fin
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'RUN_TASK') return;

  const { task, region, runId } = msg;

  (async () => {
    try {
      // IMPORTANT: re-compute site context (EU/CN) & set label/prefix
      const cfg = await new Promise(res => chrome.storage.sync.get(null, r => res(r||{})));
      cfg._ctx = computeSiteContext(cfg);

      // Tagger tous les messages sortants
      const tag = cfg._ctx?.label || (region ? `[${region}]` : '');
      const decorate = (s) => `${tag} ${s}`;

      if (typeof this.sendTelegramMessage === 'function') {
        const origSend = this.sendTelegramMessage.bind(this);
        this.sendTelegramMessage = (m, ...rest) => origSend(decorate(m), ...rest);
      }
      if (typeof this.sendTelegramMessageWithPhoto === 'function') {
        const origSendP = this.sendTelegramMessageWithPhoto.bind(this);
        this.sendTelegramMessageWithPhoto = (m, photo, ...rest) => origSendP(decorate(m), photo, ...rest);
      }

      // Exécuter la tâche demandée
      if (task === 'CHECK') {
        await autoScrollToFullBottom();
        await this.checkAndNotify();
      } else if (task === 'INTERIM') {
        await autoScrollToFullBottom();
        await this.handleInterimSummaryRequest();
      } else if (task === 'DAILY') {
        const summary = await this.getDailySummary({ persist: true });
        if (summary) {
          // réutilise ton gabarit existant “daily”
          const message =
            `📊 ${tag} Récap 24h (${summary.from} → ${summary.to})\n\n` +
            `Points de téléchargement : ${summary.dailyDownloads + (summary.dailyPrints * 2)}\n` +
            `⚡ Boosts gagnés : +${summary.totalBoostsGained||0} → +${summary.boostPointsTotal||0} pts\n\n` +
            `🏆 Top téléchargements :\n${summary.top5Downloads.length ? summary.top5Downloads.map((m,i)=>`${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.downloadsGained}`).join('\n') : 'Aucun'}\n\n` +
            `🖨️ Top impressions :\n${summary.top5Prints.length ? summary.top5Prints.map((m,i)=>`${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.printsGained}`).join('\n') : 'Aucune'}\n\n` +
            `🎁 Points (24h) : ${summary.rewardPointsTotal}`;
          await this.sendTelegramMessage(message);
        }
      }

      chrome.runtime.sendMessage({ type: 'CONTENT_DONE', task, region, runId });
      sendResponse && sendResponse({ ok: true });
    } catch (e) {
      console.error('[MW][content] task error', task, e);
      chrome.runtime.sendMessage({ type: 'CONTENT_DONE', task, region, runId, ok:false, error:String(e) });
      sendResponse && sendResponse({ ok: false, error: String(e) });
    }
  })();

  return true; // async
});
Ça suffit pour que le content ne fasse plus rien tout seul et réponde uniquement aux ordres de l’orchestrateur.

Détails utiles
Variables séparées : grâce à K('dailyStats'), K('dailyRunningRewardPoints'), etc., CN écrira cn_dailyStats etc. Aucun mélange EU ↔ CN.

Label notif : on préfixe toutes les notifs avec [EU] ou [CN] (déjà dans ton code via label; j’ai ajouté un wrapper decorate pour être sûr).

Popup : rien de spécial à changer, sauf un bouton “Reschedule” qui envoie { type: 'MW_RESCHEDULE' } (tu l’as déjà) pour recalculer les alarmes quand tu modifies URLs/horaires/intervalle.

Si tu veux, je peux t’envoyer un diff ultra-court pile sur tes fichiers actuels (les parties à enlever dans start() + le bloc RUN_TASK + le nouveau service_worker.js).

Vous avez dit :
tu peux jsute m'aider a nettoyer start()
ChatGPT a dit :
yes — on allège start() pour qu’il n’exécute qu’un run unique (scroll → load prev → check) et ne planifie plus rien. Voilà un remplaçant drop-in, plus deux petits helpers pour s’assurer qu’aucun ancien timer ne traîne.

// ✅ À mettre dans content.js

// (optionnel) coupe tous les timers hérités si jamais appelés avant
_cleanupLegacyTimers() {
  try {
    if (this.checkInterval) { clearInterval(this.checkInterval); this.checkInterval = null; }
    if (this._dailyTimerId) { clearTimeout(this._dailyTimerId); this._dailyTimerId = null; }
  } catch (_) {}
  // on ne conserve plus rien en sessionStorage/monitorNextScheduledTime
  try { sessionStorage.removeItem('monitorNextScheduledTime'); } catch (_) {}
}

// (optionnel) stop "dur" si jamais appelé ailleurs
stop() {
  this._cleanupLegacyTimers();
  this.isChecking = false;
  this.log('Monitor stopped (orchestrator mode).');
}

// 🚀 NOUVELLE VERSION MINIMALE
async start() {
  this.log('Starting (executor mode) …');

  // on s’assure qu’aucun scheduling hérité ne tourne
  this._cleanupLegacyTimers();

  // IMPORTANT : le content ne décide plus de planifier quoi que ce soit.
  // Il exécute juste une passe (utile si la page a été ouverte manuellement).

  try {
    await autoScrollToFullBottom();
  } catch (e) {
    this.warn('autoScrollToFullBottom failed (non fatal):', e);
  }

  try {
    await this.loadPreviousValues();
  } catch (e) {
    this.warn('loadPreviousValues failed (non fatal):', e);
  }

  try {
    await this.checkAndNotify();  // une seule passe
  } catch (e) {
    this.error('checkAndNotify error:', e);
  }

  // ❌ PAS de scheduleDailyNotification()
  // ❌ PAS de scheduleInterimNotifications()
  // ❌ PAS de boucle de reload / setTimeout / setInterval
  // ❌ PAS d’utilisation de STORAGE_KEY/monitorNextScheduledTime ici

  this.log('Executor pass complete (no scheduling from content).');
}

// (facultatif) restart = juste relancer une passe unique
async restart() {
  this.log('Restart (executor mode) …');
  this.stop();
  try { await autoScrollToFullBottom(); } catch(_) {}
  try { await this.checkAndNotify(); } catch(_) {}
  this.log('Restart done.');
}
Ce que ça enlève (à supprimer de l’ancienne start()):
l’initialisation/usage de STORAGE_KEY = 'monitorNextScheduledTime' et tout le bloc qui calculait nextScheduled, scheduleNext(), setTimeout(...), window.location.reload().

les appels à this.scheduleDailyNotification() et this.scheduleInterimNotifications().

toute création d’interval/timeout pour relancer automatiquement.

Avec ça :

content.js n’a plus aucun scheduling.

Le service worker (orchestrateur) ouvre la page et envoie RUN_TASK; start() peut rester (exécutera juste une passe si l’utilisateur ouvre la page manuellement), mais c’est le handler RUN_TASK qui drive les vraies exécutions.

Vous avez dit :
async start() {
    this.log('Starting monitor...');
    if (this.checkInterval) { this.log('Monitor already running, skipping duplicate start.'); return; }
    chrome.storage.sync.get(['telegramToken','chatId','refreshInterval','dailyReport','dailyNotificationTime','notifySummaryMode'], async (config) => {
      if (!config || !config.telegramToken || !config.chatId) { this.error('Missing Telegram configuration'); return; }
      this.telegramToken = config.telegramToken; this.chatId = config.chatId; this.notifySummaryMode = !!config.notifySummaryMode;
      const refreshInterval = config.refreshInterval || 900000;
      this.log(Configured refresh interval: ${refreshInterval}ms); this.log(Notify summary mode: ${this.notifySummaryMode});
      let intervalToUse = refreshInterval; const ONE_HOUR = 60*60*1000; const COMPENSATION_MS = 60*1000;
      if (refreshInterval > ONE_HOUR) { intervalToUse = Math.max(0, refreshInterval - COMPENSATION_MS); this.log(Interval adjusted for overhead: using ${intervalToUse}ms instead of configured ${refreshInterval}ms); }
      else this.log(Interval not adjusted (configured <= 1 hour): using ${intervalToUse}ms);
      await autoScrollToFullBottom();
      await this.loadPreviousValues();
      await this.checkAndNotify();
      const { mw_orchestrated_mode, mw_current_run } = await new Promise(res =>
  chrome.storage.local.get(['mw_orchestrated_mode', 'mw_current_run'], r => res(r || {}))
);

if (mw_orchestrated_mode) {
  const region = detectRegion(); // 'EU' ou 'CN'
  try {
    chrome.runtime.sendMessage({ type: 'CONTENT_DONE', region, runId: mw_current_run || null });
  } catch {}
  this.log([MW] Orchestrated run: ${region} done — no local schedule.);
  return; // FIN: pas de reload/schedule côté content
}

      if (config.dailyReport !== 'no') this.scheduleDailyNotification();
	  this.scheduleInterimNotifications();
      this.log(Monitor started, refresh every ${intervalToUse/60000} minutes (configured ${refreshInterval/60000} minutes));
    });
  }


ca devient quoi ?
ChatGPT a dit :

Réflexion durant 13s
voilà une version clean de start() pour le mode orchestrateur :

une seule passe (scroll → load prev → check)

pas de schedule / pas d’interval / pas de daily / pas d’interim côté content

si mw_orchestrated_mode est vrai, on notifie le SW puis on sort

Je te mets aussi 2 mini helpers utiles (_cleanupLegacyTimers et detectRegion) si tu ne les as pas déjà.

// Helpers (à poser dans la classe si pas déjà présents)
_cleanupLegacyTimers() {
  try {
    if (this.checkInterval) { clearInterval(this.checkInterval); this.checkInterval = null; }
    if (this._dailyTimerId) { clearTimeout(this._dailyTimerId); this._dailyTimerId = null; }
  } catch (_) {}
  try { sessionStorage.removeItem('monitorNextScheduledTime'); } catch (_) {}
}

function detectRegion() {
  const href = (location && location.href || '').toLowerCase();
  // adapte si tu as un domaine précis pour CN
  return (/\.cn\b|china|\/cn\//.test(href)) ? 'CN' : 'EU';
}
// ✅ Nouvelle start() "exécuteur" (aucun scheduling depuis content)
async start() {
  this.log('Starting (executor mode)…');

  // coupe tout héritage d’anciens timers
  this._cleanupLegacyTimers();

  // charge config minimale (juste pour token/chat + mode résumé)
  const cfg = await new Promise(res =>
    chrome.storage.sync.get(
      ['telegramToken','chatId','notifySummaryMode'],
      r => res(r || {})
    )
  );

  if (!cfg || !cfg.telegramToken || !cfg.chatId) {
    this.error('Missing Telegram configuration');
    return;
  }

  this.telegramToken = cfg.telegramToken;
  this.chatId = cfg.chatId;
  this.notifySummaryMode = !!cfg.notifySummaryMode;

  // exécute UNE passe
  try { await autoScrollToFullBottom(); } catch (e) { this.warn('autoScrollToFullBottom failed:', e); }
  try { await this.loadPreviousValues(); } catch (e) { this.warn('loadPreviousValues failed:', e); }
  try { await this.checkAndNotify(); } catch (e) { this.error('checkAndNotify error:', e); }

  // si orchestré, on signale la fin au service worker puis on sort
  const { mw_orchestrated_mode, mw_current_run } = await new Promise(res =>
    chrome.storage.local.get(['mw_orchestrated_mode','mw_current_run'], r => res(r || {}))
  );

  if (mw_orchestrated_mode) {
    const region = detectRegion(); // 'EU' / 'CN'
    try {
      chrome.runtime.sendMessage({ type: 'CONTENT_DONE', region, runId: mw_current_run || null });
    } catch (_) {}
    this.log(`[MW] Orchestrated run done — region=${region}.`);
    return;
  }

  // ⚠️ Rien d’autre côté content : pas de planning local.
  this.log('Executor pass complete (no local scheduling).');
}
Points clés :

on a viré tout ce qui touchait à refreshInterval, scheduleDailyNotification(), scheduleInterimNotifications(), timers, reload, etc.

le service_worker reste seul maître du tempo (daily / interim / check interval), en ouvrant l’onglet EU puis CN, et en attendant le CONTENT_DONE à chaque fois.

Vous avez dit :
 stop() {
    if (this.checkInterval) { clearInterval(this.checkInterval); this.checkInterval = null; }
    if (this._dailyTimerId) { clearTimeout(this._dailyTimerId); this._dailyTimerId = null; }
    this.isChecking = false;
    this.log('Monitor stopped');
  }

  async restart() {
    this.log('Restarting monitor on request...');
    this.stop();
    await autoScrollToFullBottom();
    await this.checkAndNotify();
    this.start();
  }

stop et restart ?
ChatGPT a dit :

Réflexion durant 14s
voici des versions simplifiées (mode orchestrateur) :

stop() {
  this.log('Stopping (executor mode)…');
  // nettoie tout timer/héritage
  try {
    if (this.checkInterval) { clearInterval(this.checkInterval); this.checkInterval = null; }
    if (this._dailyTimerId) { clearTimeout(this._dailyTimerId); this._dailyTimerId = null; }
    sessionStorage.removeItem('monitorNextScheduledTime');
  } catch (_) {}
  this.isChecking = false;
  this.log('Monitor stopped');
}

async restart() {
  this.log('Restart requested (executor mode)…');
  this.stop();          // on s’assure qu’aucun timer ne traîne
  await this.start();   // une seule passe: scroll → load prev → check → CONTENT_DONE
}
stop() ne laisse aucun timer local (puisque le SW orchestre tout).

restart() fait juste un stop() puis relance une passe via start() (pas de planning côté content).

Vous avez dit :
autre question j'ai des actions manuelles possibles depuis le popup

elles sont gérées ?
ChatGPT a dit :
Oui — on peut garder toutes tes actions manuelles du popup et les faire passer par l’orchestrateur (service worker). L’idée :

Le popup n’exécute rien lui-même ; il envoie un message au service worker.

Le service worker décide quoi faire (ouvrir EU/CN séquentiellement, pousser une commande au content script, etc.).

Le content reste “exécuteur” (scroll → parse → notifs → renvoie CONTENT_DONE), et ne planifie plus rien.

Voici les ajouts minimum pour que tes boutons du popup marchent en mode orchestré.

1) popup.js – envoyer les commandes
Ajoute des handlers qui envoient une action claire au service worker. Exemples (garde tes querySelector selon ton HTML) :

// Util: envoi simple au SW
function sendToSW(action, payload = {}) {
  chrome.runtime.sendMessage({ from: 'popup', action, payload });
}

// Bouton "Run maintenant (EU+CN)"
document.getElementById('btnRunNowBoth')?.addEventListener('click', () => {
  sendToSW('ORCH_RUN_NOW_BOTH');
});

// Bouton "Run EU"
document.getElementById('btnRunNowEU')?.addEventListener('click', () => {
  sendToSW('ORCH_RUN_NOW_REGION', { region: 'EU' });
});

// Bouton "Run CN"
document.getElementById('btnRunNowCN')?.addEventListener('click', () => {
  sendToSW('ORCH_RUN_NOW_REGION', { region: 'CN' });
});

// Bouton "Récap intermédiaire maintenant" (EU+CN)
document.getElementById('btnInterimNow')?.addEventListener('click', () => {
  sendToSW('ORCH_INTERIM_NOW_BOTH');
});

// Bouton "Dump modèles" (EU+CN)
document.getElementById('btnDumpModels')?.addEventListener('click', () => {
  sendToSW('ORCH_DUMP_MODELS_BOTH');
});

// Bouton "Restart executors dans les onglets actifs"
// (utile si on veut recharger le content sans relancer toute l’orchestration)
document.getElementById('btnRestartExecutors')?.addEventListener('click', () => {
  sendToSW('ORCH_RESTART_EXECUTORS');
});
Tu peux ajouter/mapper autant de boutons que tu veux de la même façon.

2) service_worker.js – orchestrer ou relayer
Ajoute des listeners pour ces actions. Le SW sait :

quelles URL EU/CN ouvrir (depuis chrome.storage.sync.get(['europeUrl','chinaUrl', ...])),

comment lancer la séquence EU→CN,

comment relayer une commande “interim” ou “dump” vers le content du bon onglet.

// Util: ouvre un onglet à une URL et attend que le content signale la fin
async function runRegionOnce({ url, region, runId, mode = 'check' }) {
  // on marque qu’on est en mode orchestré pour ce run
  await chrome.storage.local.set({
    mw_orchestrated_mode: true,
    mw_current_run: runId,
    mw_orchestrated_mode_kind: mode, // 'check' | 'interim' | 'dump'
    mw_region_hint: region          // 'EU' | 'CN' (visible côté content via detectRegion())
  });

  const tab = await chrome.tabs.create({ url, active: true });
  const tabId = tab.id;

  // Pour "interim" et "dump", on n’a pas besoin de recharger la page—
  // on envoie l’ordre après l’injection du content (petit délai safe).
  if (mode === 'interim' || mode === 'dump') {
    await new Promise(r => setTimeout(r, 1500));
    const msgType = mode === 'interim' ? 'INTERIM_SUMMARY_REQUEST' : 'DUMP_MODELS';
    try { await chrome.tabs.sendMessage(tabId, { type: msgType }); } catch {}
  }

  // Attendre l’ACK de fin (CONTENT_DONE) du content
  const done = await new Promise(resolve => {
    const timeout = setTimeout(() => resolve(false), 120000); // 2 min safety
    const listener = (msg, sender) => {
      if (msg?.type === 'CONTENT_DONE' && msg?.runId === runId && msg?.region === region) {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(listener);
        resolve(true);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
  });

  // fermer l’onglet (succès ou pas, on avance)
  try { chrome.tabs.remove(tabId); } catch {}

  return done;
}

// Relais "soft" vers l’onglet EU/CN déjà ouvert
async function sendToActiveContent(region, payload) {
  const { europeUrl, chinaUrl } = await chrome.storage.sync.get(['europeUrl', 'chinaUrl']);
  const url = region === 'CN' ? chinaUrl : europeUrl;
  const tabs = await chrome.tabs.query({ url: url ? url.split('?')[0] + '*' : undefined });
  if (tabs && tabs.length) {
    try { await chrome.tabs.sendMessage(tabs[0].id, payload); return true; } catch {}
  }
  return false;
}

// Handler des actions provenant du popup
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg?.from !== 'popup') return;

  const { europeUrl, chinaUrl } = await chrome.storage.sync.get(['europeUrl', 'chinaUrl']);
  const runId = `run_${Date.now()}`;

  switch (msg.action) {
    case 'ORCH_RUN_NOW_BOTH': {
      if (!europeUrl || !chinaUrl) break;
      await runRegionOnce({ url: europeUrl, region: 'EU', runId, mode: 'check' });
      await runRegionOnce({ url: chinaUrl, region: 'CN', runId, mode: 'check' });
      break;
    }

    case 'ORCH_RUN_NOW_REGION': {
      const region = msg.payload?.region === 'CN' ? 'CN' : 'EU';
      const url = region === 'CN' ? chinaUrl : europeUrl;
      if (!url) break;
      await runRegionOnce({ url, region, runId, mode: 'check' });
      break;
    }

    case 'ORCH_INTERIM_NOW_BOTH': {
      if (!europeUrl || !chinaUrl) break;
      await runRegionOnce({ url: europeUrl, region: 'EU', runId, mode: 'interim' });
      await runRegionOnce({ url: chinaUrl, region: 'CN', runId, mode: 'interim' });
      break;
    }

    case 'ORCH_DUMP_MODELS_BOTH': {
      if (!europeUrl || !chinaUrl) break;
      await runRegionOnce({ url: europeUrl, region: 'EU', runId, mode: 'dump' });
      await runRegionOnce({ url: chinaUrl, region: 'CN', runId, mode: 'dump' });
      break;
    }

    case 'ORCH_RESTART_EXECUTORS': {
      // Essaie d’envoyer REFRESH_INTERVAL_UPDATED (ou autre) aux onglets ouverts
      await sendToActiveContent('EU', { type: 'REFRESH_INTERVAL_UPDATED' });
      await sendToActiveContent('CN', { type: 'REFRESH_INTERVAL_UPDATED' });
      break;
    }
  }

  sendResponse?.({ ok: true });
});
Remarque : le SW pose mw_orchestrated_mode, mw_orchestrated_mode_kind, mw_region_hint en local. Ton content.start() lit ces flags et n’installe plus de cron local. Il fait juste sa passe unique puis renvoie CONTENT_DONE.

3) content.js – on garde tes handlers manuels
Tu as déjà :

INTERIM_SUMMARY_REQUEST → handleInterimSummaryRequest()

DUMP_MODELS → sendModelsSnapshot()

REFRESH_INTERVAL_UPDATED / CONFIG_SAVED → restart()

On ne change rien là, si ce n’est que start() ne planifie plus (ce que tu as déjà nettoyé) et qu’il renvoie bien le CONTENT_DONE au SW quand mw_orchestrated_mode est vrai.

4) Variables et notifs par région
Tu l’as déjà fait côté content via detectRegion() + préfixes (EU:/CN:) dans les messages, et clés de stockage préfixées si besoin (points, daily, interim).
L’orchestrateur passe aussi mw_region_hint au cas où le DOM ne permet pas de détecter clairement.

En résumé
Oui, tes actions du popup sont gérées : elles deviennent des ordres au service worker.

Le service worker orchestre EU→CN (ou région isolée), déclenche les runs uniques, et ferme les onglets.

Le content exécute (scroll→parse→notifs), puis notifie fin de run au SW.

Les notifs portent EU: / CN: et les compteurs/journaliers sont séparés.

Si tu veux, je peux adapter ces snippets à tes IDs réels de boutons du popup et au nom exact des champs europeUrl / chinaUrl présents dans ton popup.html.

Vous avez dit :
ben fait moi un bouton qui lance la séquence

un bouton qui lance la sequence interim

ChatGPT a dit :

Réflexion durant 5s
ok, voici le strict minimum pour 2 boutons dans le popup :

“Lancer séquence (EU → CN)”

“Lancer récap intermédiaire (EU → CN)”

Ils enverront des ordres à ton service worker (actions ORCH_RUN_NOW_BOTH et ORCH_INTERIM_NOW_BOTH que tu as déjà/vas ajouter côté SW).

popup.html – ajoute les boutons
<!-- … ton HTML existant … -->

<hr>
<section>
  <h3>Orchestration</h3>
  <div style="display:flex; gap:.5rem; flex-wrap:wrap">
    <button id="btnRunNowBoth" class="btn btn-primary">Lancer séquence (EU → CN)</button>
    <button id="btnInterimNowBoth" class="btn">Récap intermédiaire (EU → CN)</button>
  </div>
  <small id="orchStatus" style="display:block; margin-top:.5rem; opacity:.8"></small>
</section>

<!-- … fin -->
popup.js – branche les clics
// Util: envoi au Service Worker
function sendToSW(action, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ from: 'popup', action, payload }, (resp) => {
      resolve(resp || { ok: false });
    });
  });
}

// Util: petit helper d’état UI
function setBusy(busy) {
  const runBtn = document.getElementById('btnRunNowBoth');
  const interimBtn = document.getElementById('btnInterimNowBoth');
  const status = document.getElementById('orchStatus');
  [runBtn, interimBtn].forEach(b => b && (b.disabled = !!busy));
  if (status) status.textContent = busy ? 'Exécution en cours…' : '';
}

// Vérif rapide: URLs présentes ?
async function ensureUrlsConfigured() {
  const { europeUrl, chinaUrl } = await chrome.storage.sync.get(['europeUrl', 'chinaUrl']);
  if (!europeUrl || !chinaUrl) {
    alert("Merci de configurer les deux URLs (EU et CN) avant de lancer la séquence.");
    return null;
  }
  return { europeUrl, chinaUrl };
}

// Bouton: Lancer séquence EU → CN
document.getElementById('btnRunNowBoth')?.addEventListener('click', async () => {
  if (!await ensureUrlsConfigured()) return;
  try {
    setBusy(true);
    const res = await sendToSW('ORCH_RUN_NOW_BOTH');
    const status = document.getElementById('orchStatus');
    if (status) status.textContent = res?.ok ? 'Séquence EU → CN lancée.' : 'Échec du lancement.';
  } finally {
    setBusy(false);
  }
});

// Bouton: Récap intermédiaire EU → CN
document.getElementById('btnInterimNowBoth')?.addEventListener('click', async () => {
  if (!await ensureUrlsConfigured()) return;
  try {
    setBusy(true);
    const res = await sendToSW('ORCH_INTERIM_NOW_BOTH');
    const status = document.getElementById('orchStatus');
    if (status) status.textContent = res?.ok ? 'Récap intermédiaire lancé.' : 'Échec du lancement.';
  } finally {
    setBusy(false);
  }
});
service_worker.js – (rappel rapide)
Assure-toi d’avoir les handlers suivants (noms identiques à ceux envoyés par le popup) :

// … dans chrome.runtime.onMessage.addListener …
case 'ORCH_RUN_NOW_BOTH':
  // runRegionOnce({ url: europeUrl, region: 'EU', runId, mode: 'check' });
  // runRegionOnce({ url: chinaUrl, region: 'CN', runId, mode: 'check' });
  break;

case 'ORCH_INTERIM_NOW_BOTH':
  // runRegionOnce({ url: europeUrl, region: 'EU', runId, mode: 'interim' });
  // runRegionOnce({ url: chinaUrl, region: 'CN', runId, mode: 'interim' });
  break;
C’est tout.
Les boutons déclenchent l’orchestrateur (EU puis CN), et le content fera son run unique puis renverra CONTENT_DONE.

Vous avez dit :
// service_worker.js

const ORCH = {
  ALARM_CHECK:  'mw-check',
  ALARM_DAILY:  'mw-daily',
  ALARM_INTERIM:'mw-interim',
  DWELL_MS: 25_000,   // garde-fou par site
  AWAIT_MS: 90_000,   // timeout attente CONTENT_DONE
};

async function getCfg(keys){ return await new Promise(res => chrome.storage.sync.get(keys, r => res(r||{}))); }
async function setLocal(o){ return await new Promise(res => chrome.storage.local.set(o, () => res())); }

async function openAndRun(url, regionLabel, task) {
  const runId = ${Date.now()}:${regionLabel}:${task};
  await setLocal({ mw_orchestrated_mode: true, mw_current_run: runId });

  const tab = await chrome.tabs.create({ url, active: false });

  // garde-fou fermeture forcée
  const hardClose = setTimeout(async () => { try { await chrome.tabs.remove(tab.id); } catch {} }, ORCH.DWELL_MS);

  // dès que le content est prêt, on lui envoie la tâche
  chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
    if (tabId === tab.id && info.status === 'complete') {
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.tabs.sendMessage(tab.id, { type: 'RUN_TASK', task, region: regionLabel, runId });
    }
  });

  const done = await new Promise(resolve => {
    const t = setTimeout(() => resolve(false), ORCH.AWAIT_MS);
    function onMsg(msg) {
      if (msg && msg.type === 'CONTENT_DONE' &&
          msg.runId === runId && msg.region === regionLabel && msg.task === task) {
        clearTimeout(t);
        chrome.runtime.onMessage.removeListener(onMsg);
        resolve(true);
      }
    }
    chrome.runtime.onMessage.addListener(onMsg);
  });

  clearTimeout(hardClose);
  try { await chrome.tabs.remove(tab.id); } catch {}

  console.log([MW][${regionLabel}] ${task} finished:, done ? 'ok' : 'timeout');
  return done;
}

async function runBothSites(task) {
  const { siteUrl, chinaUrl } = await getCfg(['siteUrl','chinaUrl']);
  const euUrl = siteUrl || '';
  const cnUrl = chinaUrl || '';

  if (!euUrl && !cnUrl) { console.warn('[MW] No URLs configured'); return; }
  if (euUrl) await openAndRun(euUrl, 'EU', task);
  if (cnUrl) await openAndRun(cnUrl, 'CN', task);
}

// ====== Alarms set/update ======
async function scheduleAll() {
  const cfg = await getCfg(['refreshInterval','dailyNotificationTime']);
  const everyMs = Math.max(60_000, Number(cfg.refreshInterval || 900_000));

  // CHECK (périodique)
  await chrome.alarms.clear(ORCH.ALARM_CHECK);
  chrome.alarms.create(ORCH.ALARM_CHECK, { periodInMinutes: everyMs / 60000 });

  // DAILY
  const daily = (cfg.dailyNotificationTime || '23:30').split(':').map(Number);
  const whenDaily = new Date(); whenDaily.setMinutes(daily[1]||0, 0, 0); whenDaily.setHours(daily[0]||23);
  if (whenDaily <= new Date()) whenDaily.setDate(whenDaily.getDate()+1);
  await chrome.alarms.clear(ORCH.ALARM_DAILY);
  chrome.alarms.create(ORCH.ALARM_DAILY, { when: whenDaily.getTime(), periodInMinutes: 24*60 });

  // INTERIM (4 créneaux fixes)
  await chrome.alarms.clear(ORCH.ALARM_INTERIM);
  // On crée 4 alarmes “one-shot” reconduites à chaque tick (simple) :
  const slots = ['07:00','12:00','16:00','22:00'];
  for (const slot of slots) {
    const [h,m] = slot.split(':').map(Number);
    const d = new Date(); d.setHours(h||0, m||0, 0, 0);
    if (d <= new Date()) d.setDate(d.getDate()+1);
    chrome.alarms.create(${ORCH.ALARM_INTERIM}:${slot}, { when: d.getTime() });
  }

  await setLocal({ mw_orchestrated_mode: true });
  console.log('[MW] Orchestrator alarms scheduled.');
}

chrome.runtime.onInstalled.addListener(scheduleAll);
chrome.runtime.onStartup.addListener(scheduleAll);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.refreshInterval || changes.dailyNotificationTime || changes.siteUrl || changes.chinaUrl)) {
    scheduleAll().catch(console.error);
  }
});

// ====== Alarm handler ======
chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    if (alarm.name === ORCH.ALARM_CHECK) {
      await runBothSites('CHECK');
      return;
    }
    if (alarm.name === ORCH.ALARM_DAILY) {
      await runBothSites('DAILY');
      return;
    }
    if (alarm.name.startsWith(ORCH.ALARM_INTERIM+':')) {
      const slot = alarm.name.split(':')[1]; // “07:00” etc.
      await runBothSites('INTERIM');
      // replanifier ce slot pour demain
      const [h,m] = slot.split(':').map(Number);
      const d = new Date(); d.setDate(d.getDate()+1); d.setHours(h||0, m||0, 0, 0);
      chrome.alarms.create(${ORCH.ALARM_INTERIM}:${slot}, { when: d.getTime() });
      return;
    }
  } catch (e) {
    console.error('[MW] alarm run error', e);
  }
});

// Permettre le “Reschedule” depuis le popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'MW_RESCHEDULE') {
    scheduleAll().then(() => sendResponse({ ok: true }))
                 .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});
ChatGPT a dit :

Réflexion durant 19s
top : l’orchestrateur est quasi bon. Il te manque juste 3–4 micro-trucs pour que ça tourne nickel avec le content “piloté”.

1) ⚠️ Bug bloquant : CONTENT_DONE sans task
Ton SW attend msg.task === task pour valider, mais dans content.js tu envoies CONTENT_DONE sans le champ task. Résultat : timeout systématique.

Patch content.js (dans start() sous mode orchestré)
Remplace l’envoi par ceci (et ajoute un petit listener pour RUN_TASK) :

// en haut du fichier (scope global du content)
let MW_CURRENT_TASK = null; // 'CHECK' | 'DAILY' | 'INTERIM'
let MW_CURRENT_REGION = null;

// recoit l'ordre du SW
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'RUN_TASK') {
    MW_CURRENT_TASK = msg.task || 'CHECK';
    MW_CURRENT_REGION = msg.region || 'EU';
    // déclenche l’exécution à la volée
    (async () => {
      try {
        await autoScrollToFullBottom();
        if (MW_CURRENT_TASK === 'INTERIM') {
          await monitor.handleInterimSummaryRequest();
        } else {
          // CHECK ou DAILY font la même vérif, DAILY enverra le récap 24h via getDailySummary()
          await monitor.checkAndNotify();
          if (MW_CURRENT_TASK === 'DAILY') {
            // Forcer le daily (si tu veux un envoi précis “daily”) :
            await monitor.scheduleDailyNotification?.(); // facultatif selon ta logique
          }
        }
      } finally {
        try {
          chrome.runtime.sendMessage({
            type: 'CONTENT_DONE',
            runId: msg.runId || null,
            region: MW_CURRENT_REGION,
            task: MW_CURRENT_TASK,           // <<<<<< INDISPENSABLE
          });
        } catch {}
      }
    })();

    sendResponse({ ok: true });
    return true;
  }
});
Et dans ton start(), garde juste le check orchestré (tu l’as déjà) mais envoie aussi task si tu fais un run auto (au cas où tu déclenches sans RUN_TASK) :

// ... après check & notify, SI orchestré
if (mw_orchestrated_mode) {
  const region = detectRegion(); // 'EU' | 'CN'
  const task = MW_CURRENT_TASK || 'CHECK';
  try {
    chrome.runtime.sendMessage({ type: 'CONTENT_DONE', region, runId: mw_current_run || null, task });
  } catch {}
  this.log(`[MW] Orchestrated run: ${region}/${task} done — no local schedule.`);
  return;
}
NB : en mode orchestré, content ne crée plus d’alarmes (tu as déjà retiré ça, parfait).

2) SW : ajouter les actions “manuelles” depuis le popup
Tu avais demandé 2 boutons (run + interim). Ton SW doit les gérer :

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'MW_RESCHEDULE') {
    scheduleAll().then(() => sendResponse({ ok: true }))
                 .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  // Bouton: lancer séquence EU→CN maintenant
  if (msg.action === 'ORCH_RUN_NOW_BOTH') {
    runBothSites('CHECK').then(() => sendResponse({ ok: true }))
                         .catch(e => sendResponse({ ok:false, error: String(e) }));
    return true;
  }

  // Bouton: lancer récap intermédiaire EU→CN
  if (msg.action === 'ORCH_INTERIM_NOW_BOTH') {
    runBothSites('INTERIM').then(() => sendResponse({ ok: true }))
                           .catch(e => sendResponse({ ok:false, error: String(e) }));
    return true;
  }
});
3) SW : fiabiliser l’envoi de RUN_TASK (race condition possible)
Il peut arriver que l’onglet finisse le chargement avant que ton listener tabs.onUpdated soit accroché. Ajoute une tentative “optimiste” de sendMessage avec retry bref :

async function trySendRunTask(tabId, payload, tries = 5, gap = 500) {
  for (let i = 0; i < tries; i++) {
    try {
      await chrome.tabs.sendMessage(tabId, payload);
      return true;
    } catch (e) {
      await new Promise(r => setTimeout(r, gap));
    }
  }
  return false;
}

async function openAndRun(url, regionLabel, task) {
  const runId = `${Date.now()}:${regionLabel}:${task}`;
  await setLocal({ mw_orchestrated_mode: true, mw_current_run: runId });

  const tab = await chrome.tabs.create({ url, active: false });

  const hardClose = setTimeout(async () => { try { await chrome.tabs.remove(tab.id); } catch {} }, ORCH.DWELL_MS);

  // 1) Essai immédiat + retries courts (si le content est déjà injecté)
  await trySendRunTask(tab.id, { type: 'RUN_TASK', task, region: regionLabel, runId });

  // 2) Et on garde le fallback “onUpdated” si la page charge lentement
  chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
    if (tabId === tab.id && info.status === 'complete') {
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.tabs.sendMessage(tab.id, { type: 'RUN_TASK', task, region: regionLabel, runId }).catch(()=>{});
    }
  });

  // attente CONTENT_DONE (inchangé)
  const done = await new Promise(resolve => {
    const t = setTimeout(() => resolve(false), ORCH.AWAIT_MS);
    function onMsg(msg) {
      if (msg && msg.type === 'CONTENT_DONE' &&
          msg.runId === runId && msg.region === regionLabel && msg.task === task) {
        clearTimeout(t);
        chrome.runtime.onMessage.removeListener(onMsg);
        resolve(true);
      }
    }
    chrome.runtime.onMessage.addListener(onMsg);
  });

  clearTimeout(hardClose);
  try { await chrome.tabs.remove(tab.id); } catch {}

  console.log(`[MW][${regionLabel}] ${task} finished:`, done ? 'ok' : 'timeout');
  return done;
}
4) SW : nettoyage des alarmes “INTERIM” existantes avant replanification
Tu crées mw-interim:07:00, :12:00, etc… Si tu rappelles scheduleAll, les anciennes restent. Ajoute un clear ciblé :

async function clearInterimAlarms() {
  const all = await chrome.alarms.getAll();
  const olds = all.filter(a => a.name.startsWith(ORCH.ALARM_INTERIM + ':'));
  await Promise.all(olds.map(a => chrome.alarms.clear(a.name)));
}

async function scheduleAll() {
  const cfg = await getCfg(['refreshInterval','dailyNotificationTime']);
  const everyMs = Math.max(60_000, Number(cfg.refreshInterval || 900_000));

  await chrome.alarms.clear(ORCH.ALARM_CHECK);
  chrome.alarms.create(ORCH.ALARM_CHECK, { periodInMinutes: everyMs / 60000 });

  // DAILY
  const daily = (cfg.dailyNotificationTime || '23:30').split(':').map(Number);
  const whenDaily = new Date();
  whenDaily.setMinutes(daily[1]||0, 0, 0);
  whenDaily.setHours(daily[0]||23);
  if (whenDaily <= new Date()) whenDaily.setDate(whenDaily.getDate()+1);
  await chrome.alarms.clear(ORCH.ALARM_DAILY);
  chrome.alarms.create(ORCH.ALARM_DAILY, { when: whenDaily.getTime(), periodInMinutes: 24*60 });

  // INTERIM
  await clearInterimAlarms();
  const slots = ['07:00','12:00','16:00','22:00'];
  for (const slot of slots) {
    const [h,m] = slot.split(':').map(Number);
    const d = new Date(); d.setHours(h||0, m||0, 0, 0);
    if (d <= new Date()) d.setDate(d.getDate()+1);
    chrome.alarms.create(`${ORCH.ALARM_INTERIM}:${slot}`, { when: d.getTime() });
  }

  await setLocal({ mw_orchestrated_mode: true });
  console.log('[MW] Orchestrator alarms scheduled.');
}
5) (optionnel) DWELL/await
DWELL_MS: 25s peut être court selon la taille de page + scroll + fetch image Telegram. Si tu vois des timeouts, monte DWELL_MS (p.ex. 45–60s) et/ou AWAIT_MS (120–150s).

6) Clés de config
Tu utilises siteUrl et chinaUrl dans le SW (parfait). Assure-toi que le popup enregistre bien ces clés (pas europeUrl).

Avec ces petits patches :

un seul schedule (via SW) pilote EU puis CN pour chaque tick,

le content n’orchestre plus rien (il exécute et répond),

les boutons du popup déclenchent les runs manuels,

plus de timeout caché (grâce au task renvoyé et au retry sendMessage).

Vous avez dit :
oula tu me donnes ptrop de tru c la


d'abord qu'est ce qui va pas avec le content

const ITERATION = 'Iteration 20.4.1';
console.log(Initializing monitor — ${ITERATION});
// en haut du fichier (scope global du content)
let MW_CURRENT_TASK = null; // 'CHECK' | 'DAILY' | 'INTERIM'
let MW_CURRENT_REGION = null;
let __MW_CFG__ = {};
function loadSync(keys) {
  return new Promise(res => chrome.storage.sync.get(keys, v => res(v || {})));
}

function computeSiteContext(cfg) {
  const href = location.href;
  const isCN = !!(cfg.chinaUrl && href.startsWith(cfg.chinaUrl));
  const prefix = isCN ? (cfg.chinaPrefix || 'cn_') : ''; // vide pour EU
  const label  = isCN ? '[CN]' : '[EU]';
  return { isCN, prefix, label };
}

_cleanupLegacyTimers() {
  try {
    if (this.checkInterval) { clearInterval(this.checkInterval); this.checkInterval = null; }
    if (this._dailyTimerId) { clearTimeout(this._dailyTimerId); this._dailyTimerId = null; }
  } catch (_) {}
  try { sessionStorage.removeItem('monitorNextScheduledTime'); } catch (_) {}
}

function detectRegion() {
  const href = (location && location.href || '').toLowerCase();
  // adapte si tu as un domaine précis pour CN
  return (/\.cn\b|china|\/cn\//.test(href)) ? 'CN' : 'EU';
}

function K(name) {
  const p = __MW_CFG__._ctx?.prefix || '';
  return p ? (p + name) : name;
}
(async () => {
  __MW_CFG__ = await new Promise(res => chrome.storage.sync.get(null, r => {
    const cfg = r || {};
    cfg._ctx = computeSiteContext(cfg);
    res(cfg);
  }));
})();

const escapeHtml = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
// === ntfy (override minimal; no flow change) ===
// Reads chrome.storage.sync keys set by your popup (if any):
//   useNtfy (bool, optional), ntfyUrl (string), ntfyAuth (string, optional),
//   ntfyTags (string, optional), ntfyPriority (1..5, optional)
async function __sendNtfyWithCfg(cfg, { title, text, imageUrl, clickUrl, tags, priority }) {
  // 💓 1) Ignorer le heartbeat
  if (text && (text.includes('No new prints or downloads found.') || text.includes('Aucune nouvelle impression ni téléchargement.'))) {
    console.debug('[MakerStats] ntfy: heartbeat suppressed');
    return true;
  }
    // Convertit un message HTML "léger" (Telegram) en Markdown (ntfy)
  const htmlToMd = (s="") =>
    String(s)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<b>/gi, '**').replace(/<\/b>/gi, '**')
      .replace(/<strong>/gi, '**').replace(/<\/strong>/gi, '**')
      .replace(/<i>/gi, '*').replace(/<\/i>/gi, '*')
      .replace(/<em>/gi, '*').replace(/<\/em>/gi, '*')
      // retire toute autre balise HTML résiduelle
      .replace(/<\/?[^>]+>/g, '');

  // 💬 2) URL du serveur ntfy
  const url = (cfg && cfg.ntfyUrl) ? String(cfg.ntfyUrl).trim() : "";
  if (!url) {
    console.error("[MakerStats] ntfy: ntfyUrl missing");
    return false;
  }

  // 🧹 3) Nettoyage minimal (évite erreurs Chrome sur headers non ASCII)
  const asciiOnly = (s) => (s || "").replace(/[^\x00-\x7F]/g, "");
  const asciiOrEmpty = (s) => asciiOnly(String(s || "")).trim();

  // 🔢 4) Détermination de la priorité
  const prio = (cfg && Number.isFinite(cfg.ntfyPriority))
    ? cfg.ntfyPriority
    : (Number.isFinite(priority) ? priority : 3);

  // 🧩 5) Headers de base (ASCII only)
  const baseHeaders = {
    "Priority": String(prio),
  };
  if (cfg && cfg.ntfyAuth) baseHeaders["Authorization"] = asciiOrEmpty(cfg.ntfyAuth);
  if (cfg && cfg.ntfyTags) baseHeaders["Tags"] = asciiOrEmpty(cfg.ntfyTags);
  if (clickUrl) baseHeaders["Click"] = asciiOrEmpty(clickUrl);
  if (title) baseHeaders["Title"] = asciiOrEmpty(title);
  baseHeaders["Markdown"] = "yes";

  try {
    // === 🖼️ CAS IMAGE (prévisualisable) ===
    if (imageUrl) {
      const headers = {
        ...baseHeaders,
        "Content-Type": "text/plain",
        "Attach": asciiOrEmpty(encodeURI(imageUrl)), // ntfy va télécharger et afficher la preview
      };

      const res = await fetch(url, {
        method: "POST",
        headers,
        body:  htmlToMd(text || ""), // le message peut contenir accents/émojis
      });

      if (!res.ok) {
        const t = await res.text().catch(() => res.statusText);
        console.error("[MakerStats] ntfy POST (Attach) HTTP", res.status, t);
        return false;
      }

      console.debug("[MakerStats] ntfy POST (Attach) OK — image preview enabled");
      return true;
    }

    // === ✉️ CAS TEXTE SEUL ===
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...baseHeaders,
        "Content-Type": "text/plain"
      },
      body: htmlToMd(text || ""),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => res.statusText);
      console.error("[MakerStats] ntfy POST (text) HTTP", res.status, t);
      return false;
    }

    console.debug("[MakerStats] ntfy POST (text) OK");
    return true;

  } catch (e) {
    console.error("[MakerStats] ntfy send error:", e);
    return false;
  }
}




const autoScrollToFullBottom = ({ step = 600, delay = 250, settle = 800 } = {}) => new Promise(resolve => {
  let timer;
  const scrollAndCheck = () => {
    window.scrollBy(0, step);
    const currentHeight = document.body.scrollHeight;
    const atBottom = (window.innerHeight + window.scrollY) >= (currentHeight - 2);
    if (atBottom) {
      clearInterval(timer);
      setTimeout(() => {
        if (document.body.scrollHeight > currentHeight) timer = setInterval(scrollAndCheck, delay);
        else resolve();
      }, settle);
    }
  };
  timer = setInterval(scrollAndCheck, delay);
});

class ValueMonitor {
  constructor() {
    // config/state
    this.telegramToken = '';
    this.chatId = '';
    this.previousValues = null;
    this.checkInterval = null;
    this._dailyTimerId = null;
    this.isChecking = false;
    // identity/keys/timeouts
    this._instanceId = Math.random().toString(36).slice(2);
    this._dailyLockKey              = K('dailyLock');
this._dailyStatsKey             = K('dailyStats');
this._lastSuccessfulKey         = K('lastSuccessfulDailyReport');
this._dailyRunningRewardKey     = K('dailyRunningRewardPoints');
this._dailyRunningRewardDayKey  = K('dailyRunningRewardDay');
this._interimClaimKey           = K('lastInterimSentKey');
    this._dailyLockTimeoutMs = 2 * 60 * 1000;
    this._dailyMaxPreSendRetries = 5;
    this._dailyPreSendBaseBackoffMs = 300;
    this._dailyScheduleJitterMs = 30 * 1000;
    this._defaultFallbackHours = 48;
    this.notifySummaryMode = false;
    this._telegramMaxMessageChars = 4000;
    this._suspiciousDeltaLimit = 200;
	this._interimTimers = [];
	this._interimSlots = ['07:00','12:00','16:00','22:00']; // créneaux fixes
	this._interimJitterMs = 15_000; // ±15s pour désynchroniser
	this._boostPointsDefault = 15;
  }

  // logging shorthands (preserve outputs)
  log(...a){ console.log(...a); }
  warn(...a){ console.warn(...a); }
  error(...a){ console.error(...a); }
	 // --- ENVOI SNAPSHOT DE TOUS LES MODÈLES ---
  _nextOccurrenceFor(timeStr) {
  const [h, m] = String(timeStr).split(':').map(Number);
  const now = new Date();
  const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h||0, m||0, 0, 0);
  if (dt <= now) dt.setDate(dt.getDate() + 1);
  return dt;
}
  async _getBoostPointsValue() {
    try {
      const cfg = await new Promise(res => chrome.storage.sync.get(['boostPointsValue'], r => res(r||{})));
      const v = Number(cfg?.boostPointsValue);
      return Number.isFinite(v) && v >= 0 ? v : this._boostPointsDefault;
    } catch { return this._boostPointsDefault; }
  }


_clearInterimTimers() {
  for (const t of this._interimTimers) clearTimeout(t);
  this._interimTimers = [];
}

// retournne une clé unique pour le créneau du jour (ex: "2025-10-14T09:00")
_makeInterimSlotKey(dateObj, timeStr) {
  const pad = n => String(n).padStart(2,'0');
  return ${dateObj.getFullYear()}-${pad(dateObj.getMonth()+1)}-${pad(dateObj.getDate())}T${timeStr};
}

// planifie un seul créneau (avec jitter & auto-reschedule)
_scheduleOneInterim(timeStr) {
  const target = this._nextOccurrenceFor(timeStr);
  const baseDelay = Math.max(0, target - Date.now());
  const jitter = Math.floor((Math.random() * 2 - 1) * this._interimJitterMs); // [-jitter;+jitter]
  const delay = Math.max(0, baseDelay + jitter);

  this.log(Interim "${timeStr}" prévu à ${new Date(Date.now()+delay).toLocaleString()} (base=${baseDelay}ms, jitter=${jitter}ms));

  const timerId = setTimeout(async () => {
    try {
      // anti-doublon inter-onglets : on "claim" la fenêtre de tir
      const slotKey = this._makeInterimSlotKey(new Date(), timeStr); // date du jour courant
      const store = await new Promise(res => chrome.storage.local.get([this._interimClaimKey], v => res(v||{})));
      const lastKey = store?.[this._interimClaimKey];

      if (lastKey === slotKey) {
        this.log(Interim ${timeStr}: déjà envoyé pour ce créneau (${slotKey}), on skip.);
      } else {
        // petit "claim" optimiste (meilleur-effort)
        await new Promise(r => chrome.storage.local.set({ [this._interimClaimKey]: slotKey }, () => r()));
        this.log(Interim ${timeStr}: envoi… (slot=${slotKey}));
        try {
          await this.handleInterimSummaryRequest();
        } catch (e) {
          this.warn(Interim ${timeStr}: échec d'envoi, e);
          // en cas d'échec on ne "déclaim" pas — ce n’est pas critique pour de la notif
        }
      }
    } catch (e) {
      this.error(Interim ${timeStr}: erreur inattendue, e);
    } finally {
      // replanifie ce créneau pour le lendemain
      this._scheduleOneInterim(timeStr);
    }
  }, delay);

  this._interimTimers.push(timerId);
}

// planifie les 4 interims du jour
scheduleInterimNotifications() {
  this._clearInterimTimers();
  const slots = Array.isArray(this._interimSlots) && this._interimSlots.length
    ? this._interimSlots
    : ['09:00','12:00','16:00','22:00'];

  for (const s of slots) this._scheduleOneInterim(s);
  this.log(Interim scheduling actif pour: ${slots.join(', ')});
}
  async sendModelsSnapshot() {
    const current = this.getCurrentValues();
    if (!current || !current.models || !Object.keys(current.models).length) {
      await this.sendTelegramMessage("No models found on the page.");
      return true;
    }

    // Tri par “popularité” (downloads + 2x prints) décroissant
    const models = Object.values(current.models)
      .map(m => ({
        ...m,
        totalEq: this.calculateDownloadsEquivalent(m.downloads, m.prints)
      }))
      .sort((a,b) => b.totalEq - a.totalEq);

    // En-tête
    const header = 📸 Models snapshot (${models.length} items)\nSorted by downloads + 2×prints\n;
    await this.sendTelegramMessage(header);

    // Envoi 1 message par modèle (avec image si dispo)
    for (const m of models) {
      const captionLines = [
        📦 ${m.name},
        ⬇️ Downloads: ${m.downloads},
        🖨️ Prints: ${m.prints},
        ⚡ Boosts: ${m.boosts},
        Σ Downloads eq: ${m.totalEq},
      ];
      if (m.permalink) captionLines.push(🔗 ${m.permalink});
      const caption = captionLines.join('\n');

      if (m.imageUrl) {
        await this.sendTelegramMessageWithPhoto(caption, m.imageUrl);
      } else {
        await this.sendTelegramMessage(caption);
      }

      // petit spacing pour éviter rate limit Telegram/ntfy
      await new Promise(r => setTimeout(r, 250));
    }

    return true;
  }
  // period key uses user's dailyNotificationTime or 12:00 default
  async getCurrentPeriodKey() {
    const cfg = await new Promise(res => chrome.storage.sync.get(['dailyNotificationTime'], r =>
      res(r && r.dailyNotificationTime ? r.dailyNotificationTime : '12:00')));
    const [hourStr, minuteStr] = String(cfg).split(':');
    const hour = Number.isFinite(Number(hourStr)) ? Number(hourStr) : 12;
    const minute = Number.isFinite(Number(minuteStr)) ? Number(minuteStr) : 0;
    const now = new Date();
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    if (candidate > now) candidate.setDate(candidate.getDate() - 1);
    const pad = n => String(n).padStart(2,'0');
    const offset = -candidate.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const offsetHours = pad(Math.floor(Math.abs(offset)/60));
    const offsetMins = pad(Math.abs(offset)%60);
    return ${candidate.getFullYear()}-${pad(candidate.getMonth()+1)}-${pad(candidate.getDate())}T${pad(candidate.getHours())}:${pad(candidate.getMinutes())}:00${sign}${offsetHours}:${offsetMins};
  }

  // split large telegram messages into parts keeping paragraphs
  _splitMessageIntoParts(message='', maxLen=this._telegramMaxMessageChars) {
    if (!message) return [];
    if (message.length <= maxLen) return [message];
    const parts=[]; const paragraphs = message.split('\n\n'); let current='';
    for (const p of paragraphs) {
      const chunk = (current ? '\n\n' : '') + p;
      if ((current + chunk).length > maxLen) {
        if (current) { parts.push(current); current = p; if (current.length > maxLen) { let s=0; while (s < current.length){ parts.push(current.slice(s, s+maxLen)); s+=maxLen;} current=''; } }
        else { let s=0; while (s < p.length){ parts.push(p.slice(s, s+maxLen)); s+=maxLen; } current=''; }
      } else current += chunk;
    }
    if (current) parts.push(current);
    return parts;
  }

  // Telegram send helpers with one retry
  async sendTelegramMessage(message, attempt=1) {
	    // --- ntfy override minimal ---
    try {
      const cfg = await new Promise(res =>
        chrome.storage.sync.get(['useNtfy','ntfyUrl','ntfyAuth','ntfyTags','ntfyPriority'], v => res(v||{}))
      );
      const enabled = (cfg.useNtfy === undefined ? !!cfg.ntfyUrl : !!cfg.useNtfy);
      if (enabled && cfg.ntfyUrl) {
        return await __sendNtfyWithCfg(cfg, { title:'MakerWorld', text: message, imageUrl:'', clickUrl:'', tags:'makerworld,update', priority:3 });
      }
    } catch(e) { /* fallback to Telegram */ }
    if (!this.telegramToken || !this.chatId) { this.error('Missing Token or Chat ID'); return false; }
    const parts = this._splitMessageIntoParts(message, this._telegramMaxMessageChars);
    for (const part of parts) {
      const payload = { chat_id: this.chatId, text: part, parse_mode: 'HTML' };
      this.log('→ Telegram payload (part):', { len: part.length });
      try {
        const res = await fetch(https://api.telegram.org/bot${this.telegramToken}/sendMessage, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        const body = await res.json();
        if (!res.ok) {
          this.error('← Telegram API error:', body);
          if (attempt < 2) { this.log('Retrying Telegram send...'); await new Promise(r=>setTimeout(r,1000)); return this.sendTelegramMessage(message, attempt+1); }
          return false;
        }
        this.log('← Telegram API ok:', body);
      } catch (err) {
        this.error('Error sending message:', err);
        if (attempt < 2) { this.log('Retrying Telegram send...'); await new Promise(r=>setTimeout(r,1000)); return this.sendTelegramMessage(message, attempt+1); }
        return false;
      }
      await new Promise(r=>setTimeout(r,200));
    }
    return true;
  }

  async sendTelegramMessageWithPhoto(message, photoUrl) {
	// --- ntfy override minimal ---
    try {
      const cfg = await new Promise(res =>
        chrome.storage.sync.get(['useNtfy','ntfyUrl','ntfyAuth','ntfyTags','ntfyPriority'], v => res(v||{}))
      );
      const enabled = (cfg.useNtfy === undefined ? !!cfg.ntfyUrl : !!cfg.useNtfy);
      if (enabled && cfg.ntfyUrl) {
        return await __sendNtfyWithCfg(cfg, { title:'MakerWorld', text: message, imageUrl:(photoUrl||''), clickUrl:'', tags:'makerworld,model,update', priority:4 });
      }
    } catch(e) { /* fallback to Telegram */ }
    if (!this.telegramToken || !this.chatId || !photoUrl) { this.log('Falling back to text message (missing token/chat/photo).'); return this.sendTelegramMessage(message); }
    try {
      this.log('Attempting to send photo:', { photoUrl, chatId: this.chatId });
      const imgRes = await fetch(photoUrl);
      if (!imgRes.ok) throw new Error(Image download failed: ${imgRes.status});
      const blob = await imgRes.blob();
      const form = new FormData(); form.append('chat_id', this.chatId); form.append('caption', message); form.append('photo', blob, 'model_image.jpg');
      const res = await fetch(https://api.telegram.org/bot${this.telegramToken}/sendPhoto, { method:'POST', body: form });
      const result = await res.json();
      this.log('Telegram response:', result);
      if (!res.ok) throw new Error(Telegram Error: ${res.status});
      return true;
    } catch (err) {
      this.error('Error sending photo:', err);
      return this.sendTelegramMessage(message);
    }
  }

  // scraping/parsing
  parseNumber(text){ if (!text) return 0; text = String(text).trim().toLowerCase(); if (text.includes('k')){ const base = parseFloat(text.replace('k','')); if (Number.isFinite(base)) return Math.round(base*1000); } const n = parseInt(text.replace(/[^\d]/g,''),10); return Number.isFinite(n)? n:0; }

  getCurrentValues() {
    try {
      const currentValues = { models: {}, points: 0, timestamp: Date.now() };
      try {
        const pointsContainer = document.querySelector('.mw-css-1541sxf');
        this.log('Found points container:', !!pointsContainer);
        if (pointsContainer) {
          const pts = pointsContainer.textContent.trim().match(/[\d,]+(\.\d+)?/);
          if (pts && pts[0]) { currentValues.points = parseFloat(pts[0].replace(/,/g,'')); this.log('Points found:', currentValues.points); }
        }
      } catch (e){ this.error('Error extracting points:', e); }
      const downloadElements = document.querySelectorAll('[data-trackid]');
      downloadElements.forEach(element => {
        const modelId = element.getAttribute('data-trackid');
        const modelTitle = element.querySelector('h3.translated-text');
        const name = modelTitle?.textContent.trim() || 'Model';
        const imageUrl = element.querySelector('img')?.getAttribute('src') || '';
        let permalink = null;
        const anchor = element.querySelector('a[href*="/models/"], a[href*="/model/"], a[href*="/models/"]');
        if (anchor?.href) permalink = anchor.href;
        const allMetrics = element.querySelectorAll('.mw-css-xlgty3 span');
        if (allMetrics.length >= 3) {
          const lastThree = Array.from(allMetrics).slice(-3);
          const boosts = this.parseNumber(lastThree[0]?.textContent || '0');
          const downloads = this.parseNumber(lastThree[1]?.textContent || '0');
          const prints = this.parseNumber(lastThree[2]?.textContent || '0');
          currentValues.models[modelId] = { id: modelId, permalink, name, boosts, downloads, prints, imageUrl };
          this.log(Model "${name}":, { id: modelId, boosts, downloads, prints, permalink });
        } else this.log(Not enough metrics for ${name} (found ${allMetrics.length}));
      });
      return currentValues;
    } catch (err) { this.error('Error extracting values:', err); return null; }
  }

  // reward math
  getRewardInterval(totalDownloads){ if (totalDownloads <= 50) return 10; if (totalDownloads <= 500) return 25; if (totalDownloads <= 1000) return 50; return 100; }
  nextRewardDownloads(totalDownloads){ const interval = this.getRewardInterval(totalDownloads); const mod = totalDownloads % interval; return (totalDownloads === 0 || mod === 0) ? totalDownloads + interval : totalDownloads + (interval - mod); }
  getRewardPointsForDownloads(thresholdDownloads){ if (thresholdDownloads <= 50) return 15+3; if (thresholdDownloads <= 500) return 12+3; if (thresholdDownloads <= 1000) return 20+5; return 30+8; }
  calculateDownloadsEquivalent(downloads, prints){ return Number(downloads||0) + (Number(prints||0) * 2); }

  // storage lock helpers
  async acquireDailyLock(timeoutMs = this._dailyLockTimeoutMs) {
    const now = Date.now();
    return new Promise(resolve => chrome.storage.local.get([this._dailyLockKey], res => {
      const lock = res?.[this._dailyLockKey] || null;
      if (!lock || (now - lock.ts) > timeoutMs) {
        if (lock && (now - lock.ts) > timeoutMs) {
          chrome.storage.local.remove([this._dailyLockKey], () => {
            const newLock = { ts: now, owner: this._instanceId };
            chrome.storage.local.set({ [this._dailyLockKey]: newLock }, () => {
              chrome.storage.local.get([this._dailyLockKey], r2 => {
                const confirmed = r2?.[this._dailyLockKey]?.owner === this._instanceId;
                this.log('acquireDailyLock (force unlock) result', { confirmed, owner: r2?.[this._dailyLockKey]?.owner, instance: this._instanceId });
                resolve(confirmed);
              });
            });
          });
        } else {
          const newLock = { ts: now, owner: this._instanceId };
          chrome.storage.local.set({ [this._dailyLockKey]: newLock }, () => {
            chrome.storage.local.get([this._dailyLockKey], r2 => {
              const confirmed = r2?.[this._dailyLockKey]?.owner === this._instanceId;
              this.log('acquireDailyLock result', { confirmed, owner: r2?.[this._dailyLockKey]?.owner, instance: this._instanceId });
              resolve(confirmed);
            });
          });
        }
      } else { this.log('acquireDailyLock failed, existing lock', lock); resolve(false); }
    }));
  }

  async releaseDailyLock() {
    return new Promise(resolve => chrome.storage.local.get([this._dailyLockKey], res => {
      const lock = res?.[this._dailyLockKey] || null;
      if (lock && lock.owner === this._instanceId) {
        chrome.storage.local.remove([this._dailyLockKey], () => { this.log('releaseDailyLock: released by', this._instanceId); resolve(true); });
      } else resolve(false);
    }));
  }

  // pre-send check to avoid duplicate daily sends
  async preSendCheckAndMaybeWait(startTime) {
    for (let attempt = 0; attempt < this._dailyMaxPreSendRetries; attempt++) {
      const latest = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null)));
      if (latest && latest.timestamp >= startTime) { this.log('preSendCheck: found newer dailyStats, aborting send', { latestTs: new Date(latest.timestamp).toISOString(), startTime: new Date(startTime).toISOString() }); return false; }
      const backoff = this._dailyPreSendBaseBackoffMs + Math.floor(Math.random()*700);
      await new Promise(r => setTimeout(r, backoff));
    }
    return true;
  }

  // robust daily summary computation and storage
  async getDailySummary({ persist = true } = {}) {
    const currentValues = this.getCurrentValues();
    if (!currentValues) { this.error('Unable to get current values'); return null; }
    this.log('getDailySummary START — now:', new Date().toISOString());
    this.log('getDailySummary: currentValues.models count =', Object.keys(currentValues.models || {}).length, 'timestamp=', new Date(currentValues.timestamp).toISOString());

    const [previousDayRaw, maxStaleMs] = await Promise.all([
      new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null))),
      new Promise(res => chrome.storage.sync.get(['dailyFallbackMaxAgeMs'], cfg => {
        const cfgVal = cfg?.dailyFallbackMaxAgeMs; res(Number.isFinite(cfgVal) ? cfgVal : (this._defaultFallbackHours*60*60*1000));
      }))
    ]);

    let raw = previousDayRaw;
    if (!raw) {
      for (let i=0;i<3 && !raw;i++){ this.log('getDailySummary: dailyStats missing — retrying read (attempt)', i+1); await new Promise(r=>setTimeout(r,1000)); raw = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r2 => res(r2?.[this._dailyStatsKey] || null))); }
    }
    if (raw) this.log('getDailySummary: read dailyStats from storage:', { ts: new Date(raw.timestamp).toISOString(), ageMs: Date.now()-raw.timestamp, modelsCount: Object.keys(raw.models || {}).length, points: raw.points, owner: raw.owner || null, periodKey: raw.periodKey || null });
    else this.log('getDailySummary: no dailyStats found in storage after retries.');

    const ONE_DAY_MS = 24*60*60*1000;
    let previousDay = null;
    if (raw) {
      const ageMs = Date.now() - raw.timestamp;
      if (ageMs <= ONE_DAY_MS) previousDay = raw, this.log('getDailySummary: using fresh snapshot', new Date(raw.timestamp).toISOString());
      else if (ageMs <= maxStaleMs) previousDay = raw, this.warn('getDailySummary: using STALE snapshot as fallback', new Date(raw.timestamp).toISOString(), ageMs=${ageMs});
      else this.log('getDailySummary: snapshot too old, treating as missing', new Date(raw.timestamp).toISOString(), ageMs=${ageMs});
    }

    if (!previousDay) {
      this.log('getDailySummary: No previous day data available or snapshot unusable. Writing current snapshot and returning empty summary.');
      const periodKey = await this.getCurrentPeriodKey();
      if (persist) {
        chrome.storage.local.set({ [this._dailyStatsKey]: { models: currentValues.models, points: currentValues.points, timestamp: Date.now(), owner: this._instanceId, periodKey } }, () => {
          this.log('getDailySummary: stored dailyStats ts=', new Date().toISOString(), 'modelsCount=', Object.keys(currentValues.models || {}).length, 'owner=', this._instanceId, 'periodKey=', periodKey);
        });
        chrome.storage.local.set({ [this._dailyRunningRewardKey]: 0, [this._dailyRunningRewardDayKey]: periodKey, [this._lastSuccessfulKey]: { state:'SENT', owner:this._instanceId, sentAt:Date.now(), periodKey, snapshot:{ models: currentValues.models, points: currentValues.points, timestamp: Date.now() }, rewardPointsTotal:0 } });
      }
      return { dailyDownloads:0, dailyPrints:0, points: currentValues.points, pointsGained:0, top5Downloads:[], top5Prints:[], rewardsEarned:[], rewardPointsTotal:0, from:new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), to:new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) };
    }

    // compare
    const modelChanges = {};
    this.log('getDailySummary: comparing models; previousDay.models count', Object.keys(previousDay.models || {}).length);
    for (const [id, current] of Object.entries(currentValues.models)) {
      let previous = previousDay?.models?.[id] || null;
      if (!previous && current.permalink) previous = Object.values(previousDay.models || {}).find(m => m?.permalink === current.permalink) || null;
      if (!previous && current.name) { const norm = current.name.trim().toLowerCase(); previous = Object.values(previousDay.models || {}).find(m => m?.name?.trim().toLowerCase() === norm) || null; if (previous) this.log('getDailySummary: matched previous by name', { id, name: current.name }); }
      if (!previous) { this.log('New model found:', current.name, 'id=', id, 'permalink=', current.permalink); continue; }

      const prevDownloads = Number(previous.downloads || 0), prevPrints = Number(previous.prints || 0), prevBoosts = Number(previous.boosts || 0);
	  const currDownloads = Number(current.downloads || 0), currPrints = Number(current.prints || 0), currBoosts = Number(current.boosts || 0);
      let downloadsGained = currDownloads - prevDownloads, printsGained = currPrints - prevPrints, boostsGained = currBoosts - prevBoosts;
      if (downloadsGained <= 0 && printsGained <= 0 && boostsGained <= 0) continue;
      if (downloadsGained > this._suspiciousDeltaLimit || printsGained > this._suspiciousDeltaLimit) { this.warn('Suspiciously large delta detected, skipping reward calculation for', { id, name: current.name, downloadsGained, printsGained, prevTs: previous.timestamp || null }); continue; }

      modelChanges[id] = { id, name: current.name, downloadsGained, printsGained, boostsGained, previousDownloads: prevDownloads, previousPrints: prevPrints, currentDownloads: currDownloads, currentPrints: currPrints, permalink: current.permalink || previous?.permalink || null };
    }

    const dailyDownloads = Object.values(modelChanges).reduce((s,m)=>s+m.downloadsGained,0);
    const dailyPrints = Object.values(modelChanges).reduce((s,m)=>s+m.printsGained,0);
    const top5Downloads = Object.values(modelChanges).filter(m=>m.downloadsGained>0).sort((a,b)=>b.downloadsGained-a.downloadsGained).slice(0,5);
    const top5Prints = Object.values(modelChanges).filter(m=>m.printsGained>0).sort((a,b)=>b.printsGained-a.printsGained).slice(0,5);

    // compute rewards
    const rewardsEarned = []; let rewardPointsTotal = 0;
    for (const m of Object.values(modelChanges)) {
      const prevDownloadsTotal = this.calculateDownloadsEquivalent(m.previousDownloads, m.previousPrints);
      const currDownloadsTotal = this.calculateDownloadsEquivalent(m.currentDownloads, m.currentPrints);
      let cursor = prevDownloadsTotal; const thresholdsHit = []; const maxThresholdsPerModel = 200; let thresholdsCount = 0;
      while (cursor < currDownloadsTotal && thresholdsCount < maxThresholdsPerModel) {
        const interval = this.getRewardInterval(cursor);
        const mod = cursor % interval;
        const nextThreshold = (cursor === 0 || mod === 0) ? cursor + interval : cursor + (interval - mod);
        if (nextThreshold <= currDownloadsTotal) {
          const rewardPoints = this.getRewardPointsForDownloads(nextThreshold)*1.25;
          thresholdsHit.push({ threshold: nextThreshold, rewardPoints });
          rewardPointsTotal += rewardPoints;
          cursor = nextThreshold; thresholdsCount++;
        } else break;
      }
      if (thresholdsHit.length) rewardsEarned.push({ id:m.id, name:m.name, thresholds:thresholdsHit.map(t=>t.threshold), rewardPointsTotalForModel:thresholdsHit.reduce((s,t)=>s+t.rewardPoints,0) });
    }

    const periodKey = await this.getCurrentPeriodKey();
    if (persist) {
      chrome.storage.local.set({ [this._dailyStatsKey]: { models: currentValues.models, points: currentValues.points, timestamp: Date.now(), owner: this._instanceId, periodKey } }, () => {
        this.log('getDailySummary: updated dailyStats ts=', new Date().toISOString(), 'modelsCount=', Object.keys(currentValues.models || {}).length, 'owner=', this._instanceId, 'periodKey', periodKey);
      });
      chrome.storage.local.set({ [this._dailyRunningRewardKey]: 0, [this._dailyRunningRewardDayKey]: periodKey, [this._lastSuccessfulKey]: { state:'SENT', owner:this._instanceId, sentAt:Date.now(), periodKey, snapshot:{ models: currentValues.models, points: currentValues.points, timestamp: Date.now() }, rewardPointsTotal:0 } });
    }
	    // points de boosts (agrégés)
    const boostPointsVal = await this._getBoostPointsValue();
    const totalBoostsGained = Object.values(modelChanges).reduce((s,m)=>s + (m.boostsGained||0), 0);
    const boostPointsTotal = totalBoostsGained * boostPointsVal;
    rewardPointsTotal += boostPointsTotal;

    return { dailyDownloads, dailyPrints, points: currentValues.points, pointsGained: currentValues.points - previousDay.points, top5Downloads, top5Prints, rewardsEarned, rewardPointsTotal,totalBoostsGained, boostPointsTotal, boostPointsVal, from: new Date(previousDay.timestamp).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), to: new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) };
  }

  // schedule daily report with locking/claiming
  scheduleDailyNotification() {
    if (this._dailyTimerId) { clearTimeout(this._dailyTimerId); this._dailyTimerId = null; }
    chrome.storage.sync.get(['dailyReport','dailyNotificationTime'], (config) => {
      const dailyReport = config.dailyReport || 'yes';
      if (dailyReport === 'no') { this.log('Daily report disabled'); return; }
      const dailyTime = config.dailyNotificationTime || '23:30';
      const [hour, minute] = dailyTime.split(':').map(Number);
      const now = new Date(); const nextNotification = new Date(); nextNotification.setHours(hour, minute, 0, 0); if (nextNotification <= now) nextNotification.setDate(nextNotification.getDate()+1);
      const jitter = Math.floor((Math.random()*2 -1) * this._dailyScheduleJitterMs);
      const delay = Math.max(0, nextNotification - now + jitter);
      this.log(Daily report scheduled for: ${new Date(Date.now()+delay)}. Delay: ${delay}ms; jitterMs=${jitter});
      this._dailyTimerId = setTimeout(async () => {
        const startTime = Date.now(); this.log(scheduleDailyNotification: firing attempt at ${new Date().toISOString()});
        const claimantKey = this._lastSuccessfulKey; let clearPending=false, wrotePending=false, periodKey=null;
        const gotLock = await this.acquireDailyLock();
        if (!gotLock) { this.log('scheduleDailyNotification: could not acquire lock, another instance likely running. Aborting this attempt.'); this.scheduleDailyNotification(); return; }
        try {
          const latestAfterLock = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null)));
          if (latestAfterLock && latestAfterLock.timestamp >= startTime) { this.log('scheduleDailyNotification: dailyStats updated by another instance after lock; aborting this send.'); return; }
          const nowMs = Date.now(); periodKey = await this.getCurrentPeriodKey();
          const claimResult = await new Promise(res => {
            chrome.storage.local.get([claimantKey], r => {
              const existing = r?.[claimantKey] || null;
              if (existing && existing.state === 'SENT' && existing.periodKey === periodKey) { res({ ok:false, reason:'already-sent', existing }); return; }
              const PENDING_STALE_MS = 5 * 60 * 1000;
              if (existing && existing.state === 'PENDING' && (nowMs - (existing.claimAt || 0)) < PENDING_STALE_MS && existing.periodKey === periodKey) { res({ ok:false, reason:'pending-claim', existing }); return; }
              const claim = { state:'PENDING', owner:this._instanceId, claimAt: nowMs, periodKey };
              chrome.storage.local.set({ [claimantKey]: claim }, () => { chrome.storage.local.get([claimantKey], v => { const confirmed = v?.[claimantKey]?.owner === this._instanceId && v[claimantKey].state === 'PENDING' && v[claimantKey].periodKey === periodKey; res({ ok:confirmed, claim }); }); });
            });
          });
          if (!claimResult.ok) { this.log('scheduleDailyNotification: aborting send due to claim failure', claimResult.reason, claimResult.existing); return; }
          wrotePending = true;
          const okToSend = await this.preSendCheckAndMaybeWait(startTime);
          if (!okToSend) { this.log('scheduleDailyNotification: preSendCheck indicates newer snapshot; aborting this send.'); clearPending = true; return; }
          this.log(Sending daily report: ${new Date()});
          const summary = await this.getDailySummary();
          if (summary) {
            let rewardsSection = 'No rewards earned in the prior 24 hours';
            if (summary.rewardsEarned?.length) rewardsSection = summary.rewardsEarned.map(r => ${r.name}: +${r.rewardPointsTotalForModel} points (thresholds: ${r.thresholds.join(', ')})).join('\n');
            const totalEquivalent = summary.dailyDownloads + (summary.dailyPrints * 2);
            const topDownloadsList = summary.top5Downloads.length ? summary.top5Downloads.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.downloadsGained}).join('\n') : 'No new downloads today';
            const topPrintsList = summary.top5Prints.length ? summary.top5Prints.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.printsGained}).join('\n') : 'No new prints today';
 const message = 
📊 Récap 24h (${summary.from} → ${summary.to})

Points de téléchargement : ${totalEquivalent}
⚡ Boosts gagnés : +${summary.totalBoostsGained||0} → +${summary.boostPointsTotal||0} pts

🏆 Top téléchargements :
${topDownloadsList}

🖨️ Top impressions :
${topPrintsList}

🎁 Points gagnés (24h) :
${summary.rewardsEarned?.length
  ? summary.rewardsEarned.map(r => ${r.name} : +${r.rewardPointsTotalForModel} pts (seuils : ${r.thresholds.join(', ')})).join('\n')
  : 'Aucun palier atteint'}

Total points (24h) : ${summary.rewardPointsTotal}
.trim();
            const sent = await this.sendTelegramMessage(message);
            if (sent) {
              const sentAt = Date.now();
              const runningRewardPoints = await new Promise(res => chrome.storage.local.get([this._dailyRunningRewardKey], r => res(r?.[this._dailyRunningRewardKey] || 0)));
              const finalRecord = { state:'SENT', owner:this._instanceId, sentAt, periodKey, snapshot:{ models: summary.top5Downloads.concat(summary.top5Prints).reduce((acc,m)=>{acc[m.id]=m;return acc;},{}), points: summary.points, timestamp: Date.now() }, rewardPointsTotal: runningRewardPoints };
              await new Promise(resolve => chrome.storage.local.set({ [this._lastSuccessfulKey]: finalRecord }, () => { this.log('scheduleDailyNotification: wrote lastSuccessfulDailyReport SENT by', this._instanceId, 'sentAt=', new Date(sentAt).toISOString(), 'periodKey=', periodKey); resolve(); }));
              try { chrome.storage.local.set({ [this._dailyRunningRewardKey]:0, [this._dailyRunningRewardDayKey]: periodKey }, () => { this.log('scheduleDailyNotification: reset running reward counter for period', { periodKey }); }); } catch (err) { this.error('Error resetting running reward counter for period', err); }
            } else clearPending = true;
          } else clearPending = true;
        } finally {
          try {
            if (clearPending && claimantKey) {
              chrome.storage.local.get([claimantKey], r => {
                const existing = r?.[claimantKey] || null;
                if (existing && existing.state === 'PENDING' && existing.owner === this._instanceId) chrome.storage.local.remove([claimantKey], () => { this.log('scheduleDailyNotification: cleared PENDING claim during cleanup'); });
                else this.log('scheduleDailyNotification: skip clearing PENDING (not owner or not pending)', { existing });
              });
            }
          } finally {
            await this.releaseDailyLock();
            this.scheduleDailyNotification();
          }
        }
      }, delay);
    });
  }

  // main periodic check (per-model messages or summary)
  async checkAndNotify() {
    if (this.isChecking) { this.log('Check already in progress, skipping...'); return; }
    this.log(checkAndNotify start — ${ITERATION}); this.isChecking = true;
    try {
      this.log('Starting change check...');
      let anyNotification = false;
      const currentValues = this.getCurrentValues();
      if (!currentValues) { this.log('No current values found'); await this.savePreviousValues({}); return; }
      if (!this.previousValues) await this.loadPreviousValues();
      if (!this.previousValues) { this.log('First run or no previous values, saving initial values'); this.previousValues = currentValues; await this.savePreviousValues(currentValues); return; }
      if (this.previousValues && !this.previousValues.models) { this.previousValues.models = {}; await this.savePreviousValues(this.previousValues); }
      if (currentValues.points > (this.previousValues.points || 0)) this.log('Global account points increased, ignoring for per-model-only Telegram notifications.');

      const modelsActivity = []; let modelUpdateCount = 0;
      for (const [id, current] of Object.entries(currentValues.models)) {
        const previous = this.previousValues.models[id];
        if (!previous) continue;
        const previousDownloadsRaw = Number(previous.downloads) || 0, previousPrints = Number(previous.prints) || 0, previousBoosts = Number(previous.boosts) || 0;
        const previousDownloadsTotal = this.calculateDownloadsEquivalent(previousDownloadsRaw, previousPrints);
        const currentDownloadsRaw = Number(current.downloads) || 0, currentPrints = Number(current.prints) || 0, currentBoosts = Number(current.boosts) || 0;
        const currentDownloadsTotal = this.calculateDownloadsEquivalent(currentDownloadsRaw, currentPrints);
        const downloadsDeltaRaw = currentDownloadsRaw - previousDownloadsRaw, printsDelta = currentPrints - previousPrints, boostsDelta = currentBoosts - previousBoosts;
        const downloadsDeltaEquivalent = downloadsDeltaRaw + (printsDelta * 2);
        const hasActivity = (downloadsDeltaRaw !== 0) || (printsDelta !== 0) || (boostsDelta > 0);
        if (hasActivity) modelUpdateCount++;
        const modelSummary = { id, name: current.name, imageUrl: current.imageUrl, downloadsDeltaRaw, printsDelta, boostsDelta, previousDownloadsTotal, currentDownloadsTotal, downloadsDeltaEquivalent, rewards: [] };

        if (currentDownloadsTotal > previousDownloadsTotal) {
          let cursor = previousDownloadsTotal, maxRewardsToReport = 50, rewardsFound = 0;
          while (cursor < currentDownloadsTotal && rewardsFound < maxRewardsToReport) {
            const interval = this.getRewardInterval(cursor), mod = cursor % interval;
            const nextThreshold = (cursor === 0 || mod === 0) ? cursor + interval : cursor + (interval - mod);
            this.log(REWARD-LOOP ${current.name} cursor=${cursor} interval=${interval} nextThreshold=${nextThreshold} currDownloads=${currentDownloadsTotal});
            if (nextThreshold <= currentDownloadsTotal) { const rewardPoints = this.getRewardPointsForDownloads(nextThreshold)*1.25; modelSummary.rewards.push({ thresholdDownloads: nextThreshold, points: rewardPoints }); cursor = nextThreshold; rewardsFound++; } else break;
          }
          if (rewardsFound >= maxRewardsToReport) this.log(Many rewards earned for ${current.name}. Listed first ${maxRewardsToReport} in summary.);
        }

        const boostOnly = (boostsDelta > 0) && (downloadsDeltaRaw === 0 && printsDelta === 0 && modelSummary.rewards.length === 0);
        if (!this.notifySummaryMode) {
          if (boostOnly) {
            const lines = [];
            const boostPts = Math.max(0, boostsDelta) * (await this._getBoostPointsValue());
lines.push(⚡ Boost sur : ${current.name}, '', ⚡ Boosts : +${boostsDelta} → +${boostPts} pts);
            const message = lines.join('\n');
            this.log('MESSAGE-BRANCH', { iteration: ITERATION, name: current.name, branch: 'boost-only', downloadsDeltaEquivalent, boostsDelta, rewardsFound: modelSummary.rewards.length });
            this.log(Sending boost-only message for ${current.name});
            const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
 if (sent) {
   const boostPts = (await this._getBoostPointsValue()) * Math.max(0, boostsDelta);
   if (boostPts > 0) await this._accumulateDailyRewardPoints(boostPts);
 }
            anyNotification = true; continue;
          }

          const hasActivity2 = (downloadsDeltaRaw !== 0) || (printsDelta !== 0) || (modelSummary.rewards.length > 0) || (boostsDelta > 0);
          if (hasActivity2) {
  this.log('MESSAGE-BRANCH', {
    iteration: ITERATION,
    name: current.name,
    branch: 'milestone',
    downloadsDeltaEquivalent,
    boostsDelta,
    rewardsFound: modelSummary.rewards.length
  });

  const lines = [];
  const equivalentTotal = currentDownloadsTotal;

  // En-tête + deltas bruts
  lines.push(📦 Mise à jour : ${current.name}, '');
  lines.push(${downloadsDeltaEquivalent > 0 ? '+' : ''}${downloadsDeltaEquivalent} points de téléchargement (total ${equivalentTotal}), '');
  lines.push(⬇️ Téléchargements : ${currentDownloadsRaw} (${downloadsDeltaRaw > 0 ? '+' : ''}${downloadsDeltaRaw}));
  lines.push(🖨️ Impressions : ${currentPrints} (${printsDelta > 0 ? '+' : ''}${printsDelta}));

  // Paliers atteints (seulement si présents)
  if (modelSummary.rewards.length > 0) {
    modelSummary.rewards.forEach(r =>
      lines.push(🎁 Palier atteint ! +${r.points} pts à ${r.thresholdDownloads})
    );
    lines.push('');
  }

  // Toujours afficher prochain palier / intervalle
  const nextThresholdAfterCurrent = this.nextRewardDownloads(equivalentTotal);
  const downloadsUntilNext = Math.max(0, nextThresholdAfterCurrent - equivalentTotal);
  lines.push(🎯 Prochain palier : encore ${downloadsUntilNext} (objectif ${nextThresholdAfterCurrent}), '');
  lines.push(🔁 Intervalle : tous les ${this.getRewardInterval(equivalentTotal)});

  // Boosts (si présents)
  if (boostsDelta > 0) {
    const boostPts = Math.max(0, boostsDelta) * (await this._getBoostPointsValue());
    lines.push('', ⚡ Boosts : +${boostsDelta} → +${boostPts} pts);
  }

  // Avertissement si deltas suspects
  let warning = '';
  if (Math.abs(downloadsDeltaRaw) > this._suspiciousDeltaLimit || Math.abs(printsDelta) > this._suspiciousDeltaLimit) {
    warning = "\n\n⚠️ Volume très élevé sur la période. C’est peut-être un pic de popularité (bravo !) ou un artefact. Tu peux réduire l’intervalle de rafraîchissement si besoin.";
  }

  const message = lines.join('\n') + warning;

  this.log(Sending milestone message for ${current.name});
  const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);

  if (sent) {
    const pts = modelSummary.rewards.reduce((s, r) => s + r.points, 0);
    const boostPts = (await this._getBoostPointsValue()) * Math.max(0, boostsDelta);
    const totalPts = pts + boostPts;
    if (totalPts > 0) await this._accumulateDailyRewardPoints(totalPts);
  }

  anyNotification = true;
} 
		}else {
		  if (boostOnly) {
            const lines = [];
			const boostPts = Math.max(0, boostsDelta) * (await this._getBoostPointsValue());
 lines.push(⚡ Boost sur : ${current.name}, '', ⚡ Boosts : +${boostsDelta} → +${boostPts} pts);
            const message = lines.join('\n');
            this.log('MESSAGE-BRANCH', { iteration: ITERATION, name: current.name, branch: 'boost-only', downloadsDeltaEquivalent, boostsDelta, rewardsFound: modelSummary.rewards.length });
            this.log(Sending boost-only message for ${current.name});
            const sent = await this.sendTelegramMessageWithPhoto(message, modelSummary.imageUrl);
 if (sent) {
   const boostPts = (await this._getBoostPointsValue()) * Math.max(0, boostsDelta);
   if (boostPts > 0) await this._accumulateDailyRewardPoints(boostPts);
 }
            anyNotification = true; continue;
          }
          const hasActivity3 = (downloadsDeltaRaw !== 0) || (printsDelta !== 0) || (modelSummary.rewards.length > 0) || (boostsDelta > 0);
          if (hasActivity3) modelsActivity.push({
            id,
            name: current.name,
            downloadsDeltaEquivalent,
            currentDownloadsTotal,
            rewardPointsForThisModel: modelSummary.rewards.reduce((s,r)=>s+r.points,0),
            boostsDelta,
			boostPointsForThisModel: Math.max(0, boostsDelta) * (await this._getBoostPointsValue()),
            // 👉 Ajout minimal pour le rendu
            currentDownloadsRaw,
            currentPrints,
            downloadsDeltaRaw,
            printsDelta
          });
        }
      }

      // dynamic summary mode switch
      let forceSummaryMode = false;
      const SUMMARY_MODE_THRESHOLD = 15;
      if (!this.notifySummaryMode && modelUpdateCount >= SUMMARY_MODE_THRESHOLD) { forceSummaryMode = true; this.log(Switching to summary mode for this check due to ${modelUpdateCount} updates.); }
      const useSummaryMode = this.notifySummaryMode || forceSummaryMode;

      if (useSummaryMode) {
        if (forceSummaryMode) await this.sendTelegramMessage("Beaucoup d’activité : passage en mode récap pour éviter les limites Telegram.");
        if (modelsActivity.length === 0) {
          await this.sendTelegramMessage("No new prints or downloads found."); anyNotification = true;
          const prevString = JSON.stringify(this.previousValues||{}), currString = JSON.stringify(currentValues||{});
          if (prevString !== currString) { this.previousValues = currentValues; await this.savePreviousValues(currentValues); }
          this.isChecking = false; return;
        }

        const totalEquivalent = modelsActivity.reduce((s,m)=>s + (m.downloadsDeltaEquivalent||0),0);
        const rewardPointsThisRun = modelsActivity.reduce((s,m)=>s + (m.rewardPointsForThisModel||0) + (m.boostPointsForThisModel||0), 0);
        await this._accumulateDailyRewardPoints(rewardPointsThisRun);

        const persisted = await new Promise(res => chrome.storage.local.get([this._dailyRunningRewardKey, this._dailyRunningRewardDayKey, this._dailyStatsKey, this._lastSuccessfulKey], r => res(r)));
        let running = Number.isFinite(persisted?.[this._dailyRunningRewardKey]) ? persisted[this._dailyRunningRewardKey] : 0;
        const runningDay = persisted?.[this._dailyRunningRewardDayKey] || null;
        const lastDaily = persisted?.[this._lastSuccessfulKey] || null;
        const lastDailyPoints = Number.isFinite(lastDaily?.rewardPointsTotal) ? lastDaily.rewardPointsTotal : 0;
        const currentPeriod = await this.getCurrentPeriodKey();

        if (!running || runningDay !== currentPeriod) {
          this.log('Periodic summary: running counter missing or mismatched; computing fallback via getDailySummary');
          try {
            const computed = await this.getDailySummary({ persist: false });
            if (computed && Number.isFinite(computed.rewardPointsTotal)) {
              running = computed.rewardPointsTotal;
              try { chrome.storage.local.set({ [this._dailyRunningRewardKey]: running, [this._dailyRunningRewardDayKey]: currentPeriod }, () => { this.log('Periodic summary: persisted computed running counter', { running, period: currentPeriod }); }); } catch (err) { this.warn('Periodic summary: failed to persist computed running counter', err); }
            } else this.warn('Periodic summary: computed fallback missing rewardPointsTotal; leaving persisted running as-is', { running, runningDay });
          } catch (err) { this.warn('Periodic summary: fallback computation failed', err); }
        }

        let rewardsToday = running - lastDailyPoints; if (rewardsToday < 0) rewardsToday = running;
        const fromTs = new Date(this.previousValues.timestamp).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), toTs = new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });
        const headerLines = [
  📊 Récap (${fromTs} → ${toTs}),
  '',
  Points de téléchargement sur la période : ${totalEquivalent},
  '',
  'Mises à jour de modèles :',
  ''
];const maxModelsInMessage = 200;
        const list = modelsActivity.slice(0, maxModelsInMessage);
        const modelLines=[]; let anyLargeDelta=false;
        list.forEach((m,i) => {
          const downloadsDelta = m.downloadsDeltaEquivalent || 0, total = m.currentDownloadsTotal || 0, interval = m.rewardInterval || this.getRewardInterval(total), nextThreshold = this.nextRewardDownloads(total), remaining = Math.max(0, nextThreshold - total), ptsEarned = m.rewardPointsForThisModel || 0;
           let line = ${i+1}. <b>${escapeHtml(m.name)}</b> : +${downloadsDelta} (total ${total});
          // 👉 Ajout minimal : détails réels
          const dl = m.currentDownloadsRaw || 0;
          const pr = m.currentPrints || 0;
          const dld = m.downloadsDeltaRaw || 0;
          const prd = m.printsDelta || 0;
           line +=  — Téléch. : ${dl} (${dld >= 0 ? '+' : ''}${dld}), Impr. : ${pr} (${prd >= 0 ? '+' : ''}${prd});
 if (ptsEarned>0) line +=   🎉 +${ptsEarned} pts;
 if ((m.boostPointsForThisModel||0) > 0) line +=   ⚡ +${m.boostPointsForThisModel} pts (boosts);
 line +=   — reste ${remaining} pour 🎁 (palier ${interval});
          if (Math.abs(downloadsDelta) > this._suspiciousDeltaLimit) { line += \n⚠️ The number of downloads during this period is very high. This could be because your model is very popular (good job!). Or it could be an error. You may want to shorten the refresh interval.; anyLargeDelta=true; }
          if ((m.boostsDelta || 0) > 0) {
            line += 
⚡ Boosts : +${m.boostsDelta};
          }

          modelLines.push(line);
        });
        const spacedModels = modelLines.join('\n\n');
		// Count models within 2 downloads (downloads + 2×prints) of next reward across all models on the page
		let closeToGiftCount = 0;
		const allModels = Object.values(currentValues?.models || {});
		for (const cm of allModels) {
		  const downloads = Number(cm.downloads || 0);
		  const prints = Number(cm.prints || 0);
		  const total = this.calculateDownloadsEquivalent(downloads, prints); // downloads + 2*prints
		  const next = this.nextRewardDownloads(total);
		  const remaining = Math.max(0, next - total);
		  if (remaining <= 2) closeToGiftCount++;
		}
		 const footerLines = [
   '',
   🎁 Points (période) : ${rewardPointsThisRun} pts,
   🎁 Points (aujourd’hui) : ${rewardsToday} pts,
   🎯 Modèles proches du prochain palier (≤2) : ${closeToGiftCount}
 ];

        const message = headerLines.join('\n') + '\n' + spacedModels + '\n' + footerLines.join('\n');
        this.log('Aggregated summary message length:', message.length);
        const sent = await this.sendTelegramMessage(message); if (sent) anyNotification = true;
      } else {
        // per-model logic already executed inside loop
      }

      const prevString = JSON.stringify(this.previousValues || {}), currString = JSON.stringify(currentValues || {});
      if (prevString !== currString) { this.previousValues = currentValues; await this.savePreviousValues(currentValues); } else this.log('No changes detected, skipping savePreviousValues to reduce storage writes.');
      if (!anyNotification && !useSummaryMode) { const heartbeatMsg = 'Aucune nouvelle impression ni téléchargement.'; this.log(heartbeatMsg); await this.sendTelegramMessage(heartbeatMsg); }
    } catch (err) { this.error('Error during check:', err); }
    finally { this.isChecking = false; }
  }

  // accumulate running points with lock and retries
  async _accumulateDailyRewardPoints(pointsToAdd, attempt = 1) {
    if (!Number.isFinite(pointsToAdd) || pointsToAdd <= 0) return;
    const MAX_ATTEMPTS = 3, BASE_DELAY_MS = 300, MAX_BACKOFF_MS = 3000, lockTimeoutMs = 1500;
    while (attempt <= MAX_ATTEMPTS) {
      const lockAcquired = await this.acquireDailyLock(lockTimeoutMs);
      if (!lockAcquired) {
        if (attempt >= MAX_ATTEMPTS) { this.warn(_accumulateDailyRewardPoints: lock not acquired after ${MAX_ATTEMPTS} attempts; skipping this accumulation.); return; }
        const backoff = Math.min(MAX_BACKOFF_MS, BASE_DELAY_MS * Math.pow(2, attempt-1));
        const jitter = Math.floor(Math.random() * Math.min(500, Math.floor(backoff/2)));
        const delay = backoff + jitter; this.log(_accumulateDailyRewardPoints: lock not acquired (attempt ${attempt}). Waiting ${delay}ms then retrying.); await new Promise(r=>setTimeout(r, delay)); attempt++; continue;
      }

      try {
        const periodKey = await this.getCurrentPeriodKey();
        const local = await new Promise(res => chrome.storage.local.get([this._dailyRunningRewardKey, this._dailyRunningRewardDayKey], r => res(r)));
        let running = (local && local[this._dailyRunningRewardKey]) ? local[this._dailyRunningRewardKey] : 0;
        const runningDay = (local && local[this._dailyRunningRewardDayKey]) ? local[this._dailyRunningRewardDayKey] : null;
        this.log('_accumulateDailyRewardPoints read', { running, runningDay, periodKey, pointsToAdd, attempt });

        if (runningDay && runningDay !== periodKey) {
          const runningDayTs = new Date(runningDay).getTime(), periodKeyTs = new Date(periodKey).getTime();
          if (Number.isFinite(runningDayTs) && Number.isFinite(periodKeyTs)) {
            if (runningDayTs > periodKeyTs) { this.log('_accumulateDailyRewardPoints: stored runningDay is in the future; resetting running to 0 and continuing', { runningDay, periodKey }); running = 0; }
            else { this.warn('_accumulateDailyRewardPoints: stored runningDay older than current period; aborting to avoid joining wrong window', { runningDay, periodKey }); return; }
          } else { this.log('_accumulateDailyRewardPoints: could not parse runningDay/periodKey; resetting running to 0 and continuing', { runningDay, periodKey }); running = 0; }
        }
        if (!runningDay) { this.log('_accumulateDailyRewardPoints resetting running counter for new period', { oldDay: runningDay, newPeriod: periodKey }); running = 0; }
        running += pointsToAdd;
        await new Promise(resolve => {
          chrome.storage.local.set({ [this._dailyRunningRewardKey]: running, [this._dailyRunningRewardDayKey]: periodKey }, (err) => {
            if (chrome.runtime.lastError || err) this.warn('Storage set failed (quota or other error):', chrome.runtime.lastError || err);
            else this.log(_accumulateDailyRewardPoints: added ${pointsToAdd}, running=${running}, period=${periodKey});
            resolve();
          });
        });
        return;
      } finally { await this.releaseDailyLock(); }
    }
  }

  async loadPreviousValues(){
  const key = K('previousValues');
  return new Promise(resolve => chrome.storage.local.get([key], result => {
    if (result && result[key]) { this.log('Previous values loaded:', result[key]); this.previousValues = result[key]; }
    resolve();
  }));
}

async savePreviousValues(values){
  const key = K('previousValues');
  return new Promise(resolve => chrome.storage.local.set({ [key]: values }, () => {
    this.log('Values saved to storage'); resolve();
  }));
}

  // lifecycle
  async start() {
  this.log('Starting (executor mode)…');

  // coupe tout héritage d’anciens timers
  this._cleanupLegacyTimers();

  // charge config minimale (juste pour token/chat + mode résumé)
  const cfg = await new Promise(res =>
    chrome.storage.sync.get(
      ['telegramToken','chatId','notifySummaryMode'],
      r => res(r || {})
    )
  );

  if (!cfg || !cfg.telegramToken || !cfg.chatId) {
    this.error('Missing Telegram configuration');
    return;
  }

  this.telegramToken = cfg.telegramToken;
  this.chatId = cfg.chatId;
  this.notifySummaryMode = !!cfg.notifySummaryMode;

  // exécute UNE passe
  try { await autoScrollToFullBottom(); } catch (e) { this.warn('autoScrollToFullBottom failed:', e); }
  try { await this.loadPreviousValues(); } catch (e) { this.warn('loadPreviousValues failed:', e); }
  try { await this.checkAndNotify(); } catch (e) { this.error('checkAndNotify error:', e); }

  // si orchestré, on signale la fin au service worker puis on sort
  const { mw_orchestrated_mode, mw_current_run } = await new Promise(res =>
    chrome.storage.local.get(['mw_orchestrated_mode','mw_current_run'], r => res(r || {}))
  );

  if (mw_orchestrated_mode) {
    const region = detectRegion(); // 'EU' / 'CN'
    try {
      chrome.runtime.sendMessage({ type: 'CONTENT_DONE', region, runId: mw_current_run || null });
    } catch (_) {}
    this.log([MW] Orchestrated run done — region=${region}.);
    return;
  }

  // ⚠️ Rien d’autre côté content : pas de planning local.
  this.log('Executor pass complete (no local scheduling).');
}

stop() {
  this.log('Stopping (executor mode)…');
  // nettoie tout timer/héritage
  try {
    if (this.checkInterval) { clearInterval(this.checkInterval); this.checkInterval = null; }
    if (this._dailyTimerId) { clearTimeout(this._dailyTimerId); this._dailyTimerId = null; }
    sessionStorage.removeItem('monitorNextScheduledTime');
  } catch (_) {}
  this.isChecking = false;
  this.log('Monitor stopped');
}

async restart() {
  this.log('Restart requested (executor mode)…');
  this.stop();          // on s’assure qu’aucun timer ne traîne
  await this.start();   // une seule passe: scroll → load prev → check → CONTENT_DONE
}

  // interim summary (manual request)
  async handleInterimSummaryRequest() {
    this.log('Interim summary requested');
    const currentValues = this.getCurrentValues();
    if (!currentValues) { this.error('Interim summary aborted: could not extract current values'); throw new Error('No current values'); }
    const baseline = await new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null)));
    if (!baseline) { this.error('Interim summary aborted: no baseline dailyStats found'); throw new Error('No baseline dailyStats found'); }

    const previousDay = baseline;
    const modelChanges = {};
    for (const [id, current] of Object.entries(currentValues.models)) {
      let previous = previousDay?.models?.[id] || null;
      if (!previous && current.permalink) previous = Object.values(previousDay.models || {}).find(m => m && m.permalink === current.permalink) || null;
      if (!previous && current.name) previous = Object.values(previousDay.models || {}).find(m => m?.name?.trim().toLowerCase() === current.name.trim().toLowerCase()) || null;
      if (!previous) { this.log('New model found (interim):', current.name); continue; }
      const downloadsGained = Math.max(0, (Number(current.downloads)||0) - (Number(previous.downloads)||0));
      const printsGained = Math.max(0, (Number(current.prints)||0) - (Number(previous.prints)||0));
      const boostsGained = Math.max(0, (Number(current.boosts)||0) - (Number(previous.boosts)||0));
      if (downloadsGained > 0 || printsGained > 0 || boostsGained > 0)
        modelChanges[id] = {
          id, name: current.name,
          downloadsGained, printsGained, boostsGained,
          previousDownloads: previous.downloads || 0, previousPrints: previous.prints || 0,
          currentDownloads: current.downloads || 0, currentPrints: current.prints || 0,
          imageUrl: current.imageUrl || ''
        };
    }

    const dailyDownloads = Object.values(modelChanges).reduce((s,m)=>s+m.downloadsGained,0);
    const dailyPrints = Object.values(modelChanges).reduce((s,m)=>s+m.printsGained,0);
    const top5Downloads = Object.values(modelChanges).filter(m=>m.downloadsGained>0).sort((a,b)=>b.downloadsGained-a.downloadsGained).slice(0,5);
    const top5Prints = Object.values(modelChanges).filter(m=>m.printsGained>0).sort((a,b)=>b.printsGained-a.printsGained).slice(0,5);

    let rewardsEarned = [], rewardPointsTotal = 0;
    for (const m of Object.values(modelChanges)) {
      const prevTotal = this.calculateDownloadsEquivalent(m.previousDownloads, m.previousPrints);
      const currTotal = this.calculateDownloadsEquivalent(m.currentDownloads, m.currentPrints);
      let cursor = prevTotal; const thresholdsHit=[]; const maxThresholdsPerModel=50; let count=0;
      while (cursor < currTotal && count < maxThresholdsPerModel) {
        const interval = this.getRewardInterval(cursor), mod = cursor % interval;
        const nextThreshold = (cursor===0 || mod===0) ? cursor+interval : cursor+(interval-mod);
        if (nextThreshold <= currTotal) { const pts = this.getRewardPointsForDownloads(nextThreshold)*1.25; thresholdsHit.push({ threshold: nextThreshold, points: pts }); rewardPointsTotal += pts; cursor = nextThreshold; count++; } else break;
      }
      if (thresholdsHit.length) rewardsEarned.push({ id:m.id, name:m.name, thresholds:thresholdsHit.map(t=>t.threshold), rewardPointsTotalForModel:thresholdsHit.reduce((s,t)=>s+t.points,0) });
    }

     const totalEquivalent = dailyDownloads + (dailyPrints * 2);
    const boostPointsVal = await this._getBoostPointsValue();
    const totalBoostsGained = Object.values(modelChanges).reduce((s,m)=>s + (m.boostsGained||0), 0);
    const boostPointsTotal = totalBoostsGained * boostPointsVal;
    rewardPointsTotal += boostPointsTotal;
    const topDownloadsList = top5Downloads.length ? top5Downloads.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.downloadsGained}).join('\n') : 'No new downloads so far';
    const topPrintsList = top5Prints.length ? top5Prints.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.printsGained}).join('\n') : 'No new prints so far';
    const fromTs = new Date(previousDay.timestamp).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }), toTs = new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });
 const message = 
🔔 Récap intermédiaire (${fromTs} → ${toTs})

Points de téléchargement : ${totalEquivalent}
⚡ Boosts gagnés : +${totalBoostsGained} → +${boostPointsTotal} pts

🏆 Top téléchargements :
${topDownloadsList}

🖨️ Top impressions :
${topPrintsList}

🎁 Points gagnés jusque-là :
${(rewardPointsTotal > 0)
  ? ${rewardsEarned.length ? rewardsEarned.map(r => ${r.name} : +${r.rewardPointsTotalForModel} pts (seuils : ${r.thresholds.join(', ')})).join('\n')+'\n' : ''}Total : ${rewardPointsTotal} pts
  : 'Aucun point pour l’instant'}
.trim();
    this.log('Interim message:', message);
    const sent = await this.sendTelegramMessage(message);
    if (!sent) { this.error('Interim summary: failed to send via Telegram'); throw new Error('Telegram send failed'); }
    this.log('Interim summary: sent successfully');
    return true;
  }
}

// Startup
this.log = console.log.bind(console);
this.warn = console.warn.bind(console);
this.error = console.error.bind(console);

console.log('Initializing monitor...');
const monitor = new ValueMonitor();
monitor.start();

// content.js — à la fin
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'RUN_TASK') return;

  const { task, region, runId } = msg;

  (async () => {
    try {
      // IMPORTANT: re-compute site context (EU/CN) & set label/prefix
      const cfg = await new Promise(res => chrome.storage.sync.get(null, r => res(r||{})));
      cfg._ctx = computeSiteContext(cfg);

      // Tagger tous les messages sortants
      const tag = cfg._ctx?.label || (region ? [${region}] : '');
      const decorate = (s) => ${tag} ${s};

      if (typeof this.sendTelegramMessage === 'function') {
        const origSend = this.sendTelegramMessage.bind(this);
        this.sendTelegramMessage = (m, ...rest) => origSend(decorate(m), ...rest);
      }
      if (typeof this.sendTelegramMessageWithPhoto === 'function') {
        const origSendP = this.sendTelegramMessageWithPhoto.bind(this);
        this.sendTelegramMessageWithPhoto = (m, photo, ...rest) => origSendP(decorate(m), photo, ...rest);
      }

      // Exécuter la tâche demandée
      if (task === 'CHECK') {
        await autoScrollToFullBottom();
        await this.checkAndNotify();
      } else if (task === 'INTERIM') {
        await autoScrollToFullBottom();
        await this.handleInterimSummaryRequest();
      } else if (task === 'DAILY') {
        const summary = await this.getDailySummary({ persist: true });
        if (summary) {
          // réutilise ton gabarit existant “daily”
          const message =
            📊 ${tag} Récap 24h (${summary.from} → ${summary.to})\n\n +
            Points de téléchargement : ${summary.dailyDownloads + (summary.dailyPrints * 2)}\n +
            ⚡ Boosts gagnés : +${summary.totalBoostsGained||0} → +${summary.boostPointsTotal||0} pts\n\n +
            🏆 Top téléchargements :\n${summary.top5Downloads.length ? summary.top5Downloads.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.downloadsGained}).join('\n') : 'Aucun'}\n\n +
            🖨️ Top impressions :\n${summary.top5Prints.length ? summary.top5Prints.map((m,i)=>${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.printsGained}).join('\n') : 'Aucune'}\n\n +
            🎁 Points (24h) : ${summary.rewardPointsTotal};
          await this.sendTelegramMessage(message);
        }
      }

      chrome.runtime.sendMessage({ type: 'CONTENT_DONE', task, region, runId });
      sendResponse && sendResponse({ ok: true });
    } catch (e) {
      console.error('[MW][content] task error', task, e);
      chrome.runtime.sendMessage({ type: 'CONTENT_DONE', task, region, runId, ok:false, error:String(e) });
      sendResponse && sendResponse({ ok: false, error: String(e) });
    }
  })();

  return true; // async
});
ChatGPT a dit :

Réflexion durant 41s
yes — il y a 4 soucis concrets dans ton content.js actuel. Voilà le pourquoi + les patchs minimaux.

1) GROS bug de syntaxe : _cleanupLegacyTimers() hors classe
Tu as écrit une “méthode” toute seule au niveau global :

_cleanupLegacyTimers() {
  ...
}
Hors classe/fonction, c’est invalide en JS ⇒ parse error.
✅ Fix minimal : fais-en une méthode de la classe ou une fonction globale.

Option A (dans la classe)
Ajoute-la dans class ValueMonitor { ... } puis appelle-la avec this._cleanupLegacyTimers() :

class ValueMonitor {
  constructor(){ ... }

  _cleanupLegacyTimers() {
    try {
      if (this.checkInterval) { clearInterval(this.checkInterval); this.checkInterval = null; }
      if (this._dailyTimerId) { clearTimeout(this._dailyTimerId); this._dailyTimerId = null; }
    } catch (_) {}
    try { sessionStorage.removeItem('monitorNextScheduledTime'); } catch (_) {}
  }
}
2) Mauvais this dans le listener de messages
Dans le listener chrome.runtime.onMessage.addListener(...) tu utilises this.sendTelegramMessage(...) etc.
Dans ce scope, this ≠ ton instance — c’est le window. Résultat : undefined is not a function.

✅ Fix : utilise l’instance monitor (ou restaure/override proprement sur monitor).

Exemple minimal dans le listener (voir aussi #4 pour le décorateur EU/CN) :

// à la fin de content.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'RUN_TASK') return;

  const { task, region, runId } = msg;

  (async () => {
    try {
      // …
      if (task === 'CHECK') {
        await autoScrollToFullBottom();
        await monitor.checkAndNotify();        // <<< monitor, pas this
      } else if (task === 'INTERIM') {
        await autoScrollToFullBottom();
        await monitor.handleInterimSummaryRequest();
      } else if (task === 'DAILY') {
        const summary = await monitor.getDailySummary({ persist: true });
        if (summary) {
          // compose msg …
          await monitor.sendTelegramMessage(message);
        }
      }

      chrome.runtime.sendMessage({ type: 'CONTENT_DONE', task, region, runId });
      sendResponse && sendResponse({ ok: true });
    } catch (e) {
      console.error('[MW][content] task error', task, e);
      chrome.runtime.sendMessage({ type: 'CONTENT_DONE', task, region, runId, ok:false, error:String(e) });
      sendResponse && sendResponse({ ok: false, error: String(e) });
    }
  })();

  return true;
});
3) CONTENT_DONE sans task dans start()
Dans start(), si mw_orchestrated_mode est vrai, tu envoies :

chrome.runtime.sendMessage({ type: 'CONTENT_DONE', region, runId: mw_current_run || null });
Le SW attend aussi task pour matcher la promesse => timeout possible.

✅ Fix minimal :

const { mw_orchestrated_mode, mw_current_run } = await new Promise(res =>
  chrome.storage.local.get(['mw_orchestrated_mode','mw_current_run'], r => res(r || {}))
);

if (mw_orchestrated_mode) {
  const region = detectRegion();
  const task = MW_CURRENT_TASK || 'CHECK';   // <= récupère la tâche courante
  try {
    chrome.runtime.sendMessage({ type: 'CONTENT_DONE', region, runId: mw_current_run || null, task });
  } catch (_) {}
  this.log(`[MW] Orchestrated run done — region=${region}, task=${task}.`);
  return;
}
Et dans le listener RUN_TASK, pense à définir :

MW_CURRENT_TASK   = task || 'CHECK';
MW_CURRENT_REGION = region || detectRegion();
4) EU/CN prefix/label au bon endroit (et temporaire)
Tu veux tagger les messages ([EU] / [CN]). Tu as commencé à override this.sendTelegramMessage mais (a) ce n’est pas la bonne instance (voir #2), (b) il faut restaurer l’original après la tâche pour éviter de doubler les tags aux runs suivants.

✅ Pattern simple dans le listener, autour de l’exécution de la tâche :

const cfg = await new Promise(res => chrome.storage.sync.get(null, r => res(r||{})));
cfg._ctx = computeSiteContext(cfg);
const tag = cfg._ctx?.label || (region ? `[${region}]` : '');

// sauvegarde
const origSend  = monitor.sendTelegramMessage.bind(monitor);
const origSendP = monitor.sendTelegramMessageWithPhoto.bind(monitor);

// décorateurs
monitor.sendTelegramMessage = (m, ...rest) => origSend(`${tag} ${m}`, ...rest);
monitor.sendTelegramMessageWithPhoto = (m, photo, ...rest) => origSendP(`${tag} ${m}`, photo, ...rest);

try {
  // … exécuter la tâche …
} finally {
  // restauration impérative
  monitor.sendTelegramMessage = origSend;
  monitor.sendTelegramMessageWithPhoto = origSendP;
}
5) Préfixes de stockage (K(...)) dépendants de la config async
K(name) lit __MW_CFG__._ctx?.prefix, mais __MW_CFG__ est rempli via une IIFE async après la définition de la classe et avant l’instanciation… pas garanti. Si l’instance ValueMonitor est créée avant que __MW_CFG__ soit prêt, tu vas stocker sans préfixe (donc mélange EU/CN).

✅ Fix minimal : bootstrap asynchrone — charge la config, calcule le contexte, puis crée l’instance.

// supprime ces 2 lignes (ou déplace-les)
// const monitor = new ValueMonitor();
// monitor.start();

(async function bootstrap() {
  const all = await new Promise(res => chrome.storage.sync.get(null, r => res(r || {})));
  all._ctx = computeSiteContext(all);
  __MW_CFG__ = all;

  window.monitor = new ValueMonitor();   // rendre dispo global si besoin
  await monitor.start();
})();
Ainsi, quand le constructeur fait :

this._dailyLockKey  = K('dailyLock');
// ...
K() a déjà le bon prefix (ex. cn_) pour isoler les clés.

TL;DR des changements à faire
Déplace _cleanupLegacyTimers() dans la classe (ou transforme-la en function cleanupLegacyTimers() et appelle-la sans this).

Remplace tous les this.sendTelegramMessage... du listener par monitor.sendTelegramMessage... et pense à restaurer les overrides.

Inclue task dans le CONTENT_DONE envoyé depuis start() en mode orchestré.

Bootstrap asynchrone : charge la config → calcule le contexte → crée monitor → monitor.start() (pour que K() ait le bon préfixe EU/CN).

Fais ces 4 patchs et ton content sera propre, pilotable par l’orchestrateur, avec tags EU/CN et stockages séparés.

Vous avez dit :
voila l'orchestrateur il faut q'uil gère les clics sur els deux boutons qu'on a rajouté
ChatGPT a dit :

Réflexion durant 17s
parfait — côté orchestrateur (service_worker.js) il suffit d’écouter les 2 messages envoyés par tes boutons du popup et d’appeler runBothSites() avec la bonne tâche.

Voici le patch minimal à ajouter (ou compléter) dans service_worker.js :

// --- à la fin de service_worker.js (ou près des autres listeners) ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // (déjà présent) replanifier les alarmes
  if (msg && msg.type === 'MW_RESCHEDULE') {
    scheduleAll().then(() => sendResponse({ ok: true }))
                 .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  // ▶️ Bouton "Lancer la séquence" (CHECK sur EU puis CN)
  if (msg && msg.type === 'MW_RUN_SEQUENCE') {
    runBothSites('CHECK')
      .then(ok => sendResponse({ ok }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }

  // ⏱️ Bouton "Récap intermédiaire" (INTERIM sur EU puis CN)
  if (msg && msg.type === 'MW_RUN_INTERIM') {
    runBothSites('INTERIM')
      .then(ok => sendResponse({ ok }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }

  // (optionnel) si tu ajoutes un bouton "Daily now"
  if (msg && msg.type === 'MW_RUN_DAILY') {
    runBothSites('DAILY')
      .then(ok => sendResponse({ ok }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }
});
Rappel popup (pour être sûr)
Tes deux boutons doivent juste envoyer ces messages :

// popup.js
document.getElementById('btnRunSequence').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'MW_RUN_SEQUENCE' }, resp => {
    console.log('RUN_SEQUENCE resp:', resp);
  });
});

document.getElementById('btnRunInterim').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'MW_RUN_INTERIM' }, resp => {
    console.log('RUN_INTERIM resp:', resp);
  });
});

// (optionnel)
document.getElementById('btnRunDailyNow')?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'MW_RUN_DAILY' }, resp => {
    console.log('RUN_DAILY resp:', resp);
  });
});
Avec ça :

Un clic sur “Lancer la séquence” ⇒ runBothSites('CHECK') : ouvre EU, exécute, ferme, puis CN, exécute, ferme.

Un clic sur “Récap intermédiaire” ⇒ runBothSites('INTERIM') de la même manière.

L’orchestrateur conserve DWELL_MS et AWAIT_MS et reçoit le CONTENT_DONE {task, region, runId} envoyé par content.js.

Vous avez dit :
le clic sur le bouton save nef ait rien
ChatGPT a dit :

Réflexion durant 52s
OK, j’ai repéré 2 trucs qui peuvent expliquer “le clic sur Save ne fait rien” :

Ton handler “Save” est attaché uniquement dans DOMContentLoaded. Si, pour une raison X, l’évènement est déjà passé quand ton script s’exécute (ça arrive parfois selon l’ordre d’injection), rien ne s’attache → le clic ne fait rien.

(Indépendant du “Save”, mais ça cassera tes nouveaux boutons) : ensureUrlsConfigured() lit europeUrl alors que tu sauvegardes siteUrl. Du coup les boutons d’orchestration alertent “merci de configurer…” même si c’est rempli.

Voici les patchs minimaux.

1) Rendre l’attachement des handlers robuste (Save & co)
Remplace le tout début de popup.js par une init “idempotente” qui s’exécute immédiatement si le DOM est déjà prêt :

(function initPopup() {
  function init() {
    const telegramTokenInput = document.getElementById('telegram-token');
    const chatIdInput = document.getElementById('chat-id');
    const refreshIntervalSelect = document.getElementById('refresh-interval');
    const dailyReportSelect = document.getElementById('daily-report');
    const notificationTimeInput = document.getElementById('notification-time');
    const saveButton = document.getElementById('save-button');
    const interimButton = document.getElementById('interim-button');
    const statusDiv = document.getElementById('status');
    const notifySummaryCheckbox = document.getElementById('notify-summary-mode');

    // ntfy fields
    const useNtfyCheckbox = document.getElementById('use-ntfy');
    const ntfyBlock = document.getElementById('ntfy-block');
    const ntfyUrlInput = document.getElementById('ntfy-url');
    const ntfyAuthInput = document.getElementById('ntfy-auth');
    const ntfyTagsInput = document.getElementById('ntfy-tags');
    const ntfyPriorityInput = document.getElementById('ntfy-priority');
    const siteUrlInput = document.getElementById('site-url');
    const chinaUrlInput = document.getElementById('china-url');
    const chinaPrefixInput = document.getElementById('china-prefix');

    function toggleNtfyBlock() {
      ntfyBlock.style.display = useNtfyCheckbox.checked ? 'block' : 'none';
    }
    function normalizeTimeTo24h(input) {
      if (!input) return "23:30";
      input = String(input).trim();
      const m24 = /^(\d{1,2}):(\d{2})$/.exec(input);
      if (m24) {
        let h = parseInt(m24[1], 10), min = parseInt(m24[2], 10);
        h = Math.max(0, Math.min(23, h)); min = Math.max(0, Math.min(59, min));
        return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
      }
      const m12 = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/.exec(input);
      if (m12) {
        let h = parseInt(m12[1], 10), min = parseInt(m12[2], 10);
        const mer = m12[3].toUpperCase(); if (mer === 'AM') { if (h === 12) h = 0; } else { if (h !== 12) h += 12; }
        return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
      }
      return "23:30";
    }
    function showStatus(message, isError = false) {
      statusDiv.textContent = message;
      statusDiv.style.color = isError ? 'red' : '#666';
      setTimeout(() => { statusDiv.textContent = ''; }, 3000);
    }

    // LOAD
    chrome.storage.sync.get([
      'telegramToken','chatId','refreshInterval',
      'dailyReport','dailyNotificationTime','notifySummaryMode',
      'useNtfy','ntfyUrl','ntfyAuth','ntfyTags','ntfyPriority',
      'siteUrl','chinaUrl','chinaPrefix'
    ], function (config) {
      telegramTokenInput.value = config.telegramToken || '';
      chatIdInput.value = config.chatId || '';
      refreshIntervalSelect.value = (config.refreshInterval ? Math.max(1, Math.round(config.refreshInterval/60000)) : 15);
      dailyReportSelect.value = config.dailyReport || 'yes';
      notificationTimeInput.value = normalizeTimeTo24h(config.dailyNotificationTime || '23:30');
      notifySummaryCheckbox.checked = !!config.notifySummaryMode;
      useNtfyCheckbox.checked = !!config.useNtfy;
      ntfyUrlInput.value = config.ntfyUrl || '';
      ntfyAuthInput.value = config.ntfyAuth || '';
      ntfyTagsInput.value = config.ntfyTags || '';
      ntfyPriorityInput.value = config.ntfyPriority || 3;
      siteUrlInput.value = config.siteUrl || '';
      chinaUrlInput.value = config.chinaUrl || '';
      chinaPrefixInput.value = (config.chinaPrefix || 'cn_');
      toggleNtfyBlock();
    });

    useNtfyCheckbox.addEventListener('change', toggleNtfyBlock);

    // DUMP (inchangé)
    document.getElementById('dump-models')?.addEventListener('click', function () {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (!tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, { type: 'DUMP_MODELS' }, () => {});
      });
    });

    // SAVE
    saveButton.addEventListener('click', function () {
      const refreshMins = Math.max(1, parseInt(refreshIntervalSelect.value || '15', 10));
      const refreshMs = refreshMins * 60 * 1000;

      const cfg = {
        telegramToken: telegramTokenInput.value.trim(),
        chatId: chatIdInput.value.trim(),
        refreshInterval: refreshMs,
        dailyReport: dailyReportSelect.value,
        dailyNotificationTime: normalizeTimeTo24h(notificationTimeInput.value),
        notifySummaryMode: !!notifySummaryCheckbox.checked,
        useNtfy: !!useNtfyCheckbox.checked,
        ntfyUrl: ntfyUrlInput.value.trim(),
        ntfyAuth: ntfyAuthInput.value.trim(),
        ntfyTags: ntfyTagsInput.value.trim(),
        ntfyPriority: Math.min(5, Math.max(1, parseInt(ntfyPriorityInput.value || '3', 10))),
        siteUrl: siteUrlInput.value.trim(),
        chinaUrl: chinaUrlInput.value.trim(),
        chinaPrefix: chinaPrefixInput.value.trim() || 'cn_'
      };

      chrome.storage.sync.set(cfg, function () {
        if (chrome.runtime.lastError) {
          console.error('Error saving:', chrome.runtime.lastError);
          showStatus('Error saving configuration', true);
          return;
        }
        showStatus('Configuration saved!');
        // notifier le content actif (si l’onglet courant est sur MW)
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'REFRESH_INTERVAL_UPDATED' }, () => {});
            chrome.tabs.sendMessage(tabs[0].id, { type: 'CONFIG_SAVED' }, () => {});
          }
        });
        // re-planifier côté orchestrateur
        chrome.runtime.sendMessage({ type: 'MW_RESCHEDULE' });
      });
    });

    // INTERIM direct (si on clique dans le popup sur l’onglet courant)
    if (interimButton) {
      interimButton.addEventListener('click', function () {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          if (!tabs[0]) { showStatus('No active tab', true); return; }
          chrome.tabs.sendMessage(tabs[0].id, { type: 'INTERIM_SUMMARY_REQUEST' }, function (response) {
            if (chrome.runtime.lastError || !response || !response.ok) {
              console.error('Interim summary error', chrome.runtime.lastError || response);
              showStatus('Failed to send interim summary', true);
            } else {
              showStatus('Interim summary sent!');
            }
          });
        });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init(); // DOM déjà prêt → on attache maintenant
  }
})();
2) Corriger les clés lues par l’orchestration (EU/CN)
Plus bas dans le même fichier, corrige ensureUrlsConfigured() pour utiliser les bonnes clés :

async function ensureUrlsConfigured() {
  const { siteUrl, chinaUrl } = await chrome.storage.sync.get(['siteUrl', 'chinaUrl']);
  if (!siteUrl && !chinaUrl) {
    alert("Merci de configurer au moins une URL (EU ou CN) avant de lancer la séquence.");
    return null;
  }
  return { siteUrl, chinaUrl };
}
Et les boutons envoient bien au SW (ton service_worker écoute déjà ORCH_RUN_NOW_BOTH / ORCH_INTERIM_NOW_BOTH si tu as intégré mon handler précédent). Si tu veux rester sur les noms que tu as déjà utilisés, garde :

document.getElementById('btnRunNowBoth')?.addEventListener('click', async () => {
  const ok = await ensureUrlsConfigured(); if (!ok) return;
  try {
    setBusy(true);
    const res = await sendToSW('ORCH_RUN_NOW_BOTH');
    const status = document.getElementById('orchStatus');
    if (status) status.textContent = res?.ok ? 'Séquence EU → CN lancée.' : 'Échec du lancement.';
  } finally { setBusy(false); }
});

document.getElementById('btnInterimNowBoth')?.addEventListener('click', async () => {
  const ok = await ensureUrlsConfigured(); if (!ok) return;
  try {
    setBusy(true);
    const res = await sendToSW('ORCH_INTERIM_NOW_BOTH');
    const status = document.getElementById('orchStatus');
    if (status) status.textContent = res?.ok ? 'Récap intermédiaire lancé.' : 'Échec du lancement.';
  } finally { setBusy(false); }
});
Avec ces deux corrections :

le handler du bouton Save est garanti d’être attaché (même si DOMContentLoaded est déjà passé) ;

les boutons EU→CN ne râleront plus sur des clés d’URL inexistantes.

Vous avez dit :
le save marche mais les boutons de run ne font rien peut etre que ca marche masi que c'est dans le content que ca bloque mais il se passe rien j'ai pas de message derreur ni rien en console
ChatGPT a dit :
Yep — tes boutons “Run” ne déclenchent rien car ton service_worker n’écoute pas encore leurs messages.
Dans ton SW tu n’as qu’un handler pour MW_RESCHEDULE. Du coup, quand le popup envoie ORCH_RUN_NOW_BOTH / ORCH_INTERIM_NOW_BOTH, personne ne répond → silence radio.

Voici les patchs ultra-minimaux pour que ça marche tout de suite.

1) service_worker.js — ajouter les handlers « run now »
Ajoute ce bloc (ou complète ton onMessage existant) :

// ---- Lancements manuels depuis le popup ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'ORCH_RUN_NOW_BOTH') {
    runBothSites('CHECK')
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }

  if (msg.type === 'ORCH_INTERIM_NOW_BOTH') {
    runBothSites('INTERIM')
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }

  if (msg.type === 'ORCH_DAILY_NOW_BOTH') {
    runBothSites('DAILY')
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }

  if (msg.type === 'MW_RESCHEDULE') {
    scheduleAll()
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }
});
2) popup.js — s’assurer qu’on envoie bien au SW
Ajoute un petit helper si tu ne l’as pas déjà :

async function sendToSW(type, payload = {}) {
  return await new Promise(resolve =>
    chrome.runtime.sendMessage({ type, ...payload }, resolve)
  );
}
Et pour les deux boutons (ids à adapter à ton HTML exact) :

document.getElementById('btnRunNowBoth')?.addEventListener('click', async () => {
  const { siteUrl, chinaUrl } = await chrome.storage.sync.get(['siteUrl','chinaUrl']);
  if (!siteUrl && !chinaUrl) { alert("Configure au moins une URL (EU ou CN)."); return; }

  const res = await sendToSW('ORCH_RUN_NOW_BOTH');
  console.log('ORCH_RUN_NOW_BOTH =>', res);
});

document.getElementById('btnInterimNowBoth')?.addEventListener('click', async () => {
  const { siteUrl, chinaUrl } = await chrome.storage.sync.get(['siteUrl','chinaUrl']);
  if (!siteUrl && !chinaUrl) { alert("Configure au moins une URL (EU ou CN)."); return; }

  const res = await sendToSW('ORCH_INTERIM_NOW_BOTH');
  console.log('ORCH_INTERIM_NOW_BOTH =>', res);
});
3) (déjà OK mais à vérifier) content.js
Tu as déjà le listener :

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'RUN_TASK') return;
  // ...
});
et ton SW appelle bien chrome.tabs.sendMessage(tab.id, { type: 'RUN_TASK', task, region, runId }); quand l’onglet est complete. Nickel.

Après ces ajouts :

le popup envoie ORCH_* → le service_worker lance EU puis CN → il ouvre l’onglet, envoie RUN_TASK au content,

le content fait le job, répond CONTENT_DONE, le SW ferme l’onglet, passe au suivant.

Si malgré tout tu ne vois rien : vérifie dans chrome://extensions (mode dev) l’onglet “Service Worker” de ton extension pour voir les logs console.log du SW pendant tes clics.

Vous avez dit :
(function initPopup() {
  function init() {
    const telegramTokenInput = document.getElementById('telegram-token');
    const chatIdInput = document.getElementById('chat-id');
    const refreshIntervalSelect = document.getElementById('refresh-interval');
    const dailyReportSelect = document.getElementById('daily-report');
    const notificationTimeInput = document.getElementById('notification-time');
    const saveButton = document.getElementById('save-button');
    const interimButton = document.getElementById('interim-button');
    const statusDiv = document.getElementById('status');
    const notifySummaryCheckbox = document.getElementById('notify-summary-mode');

    // ntfy fields
    const useNtfyCheckbox = document.getElementById('use-ntfy');
    const ntfyBlock = document.getElementById('ntfy-block');
    const ntfyUrlInput = document.getElementById('ntfy-url');
    const ntfyAuthInput = document.getElementById('ntfy-auth');
    const ntfyTagsInput = document.getElementById('ntfy-tags');
    const ntfyPriorityInput = document.getElementById('ntfy-priority');
    const siteUrlInput = document.getElementById('site-url');
    const chinaUrlInput = document.getElementById('china-url');
    const chinaPrefixInput = document.getElementById('china-prefix');

    function toggleNtfyBlock() {
      ntfyBlock.style.display = useNtfyCheckbox.checked ? 'block' : 'none';
    }
    function normalizeTimeTo24h(input) {
      if (!input) return "23:30";
      input = String(input).trim();
      const m24 = /^(\d{1,2}):(\d{2})$/.exec(input);
      if (m24) {
        let h = parseInt(m24[1], 10), min = parseInt(m24[2], 10);
        h = Math.max(0, Math.min(23, h)); min = Math.max(0, Math.min(59, min));
        return ${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')};
      }
      const m12 = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/.exec(input);
      if (m12) {
        let h = parseInt(m12[1], 10), min = parseInt(m12[2], 10);
        const mer = m12[3].toUpperCase(); if (mer === 'AM') { if (h === 12) h = 0; } else { if (h !== 12) h += 12; }
        return ${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')};
      }
      return "23:30";
    }
    function showStatus(message, isError = false) {
      statusDiv.textContent = message;
      statusDiv.style.color = isError ? 'red' : '#666';
      setTimeout(() => { statusDiv.textContent = ''; }, 3000);
    }

    // LOAD
    chrome.storage.sync.get([
      'telegramToken','chatId','refreshInterval',
      'dailyReport','dailyNotificationTime','notifySummaryMode',
      'useNtfy','ntfyUrl','ntfyAuth','ntfyTags','ntfyPriority',
      'siteUrl','chinaUrl','chinaPrefix'
    ], function (config) {
      telegramTokenInput.value = config.telegramToken || '';
      chatIdInput.value = config.chatId || '';
      refreshIntervalSelect.value = (config.refreshInterval ? Math.max(1, Math.round(config.refreshInterval/60000)) : 15);
      dailyReportSelect.value = config.dailyReport || 'yes';
      notificationTimeInput.value = normalizeTimeTo24h(config.dailyNotificationTime || '23:30');
      notifySummaryCheckbox.checked = !!config.notifySummaryMode;
      useNtfyCheckbox.checked = !!config.useNtfy;
      ntfyUrlInput.value = config.ntfyUrl || '';
      ntfyAuthInput.value = config.ntfyAuth || '';
      ntfyTagsInput.value = config.ntfyTags || '';
      ntfyPriorityInput.value = config.ntfyPriority || 3;
      siteUrlInput.value = config.siteUrl || '';
      chinaUrlInput.value = config.chinaUrl || '';
      chinaPrefixInput.value = (config.chinaPrefix || 'cn_');
      toggleNtfyBlock();
    });

    useNtfyCheckbox.addEventListener('change', toggleNtfyBlock);

    // DUMP (inchangé)
    document.getElementById('dump-models')?.addEventListener('click', function () {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (!tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, { type: 'DUMP_MODELS' }, () => {});
      });
    });

    // SAVE
    saveButton.addEventListener('click', function () {
      const refreshMins = Math.max(1, parseInt(refreshIntervalSelect.value || '15', 10));
      const refreshMs = refreshMins * 60 * 1000;

      const cfg = {
        telegramToken: telegramTokenInput.value.trim(),
        chatId: chatIdInput.value.trim(),
        refreshInterval: refreshMs,
        dailyReport: dailyReportSelect.value,
        dailyNotificationTime: normalizeTimeTo24h(notificationTimeInput.value),
        notifySummaryMode: !!notifySummaryCheckbox.checked,
        useNtfy: !!useNtfyCheckbox.checked,
        ntfyUrl: ntfyUrlInput.value.trim(),
        ntfyAuth: ntfyAuthInput.value.trim(),
        ntfyTags: ntfyTagsInput.value.trim(),
        ntfyPriority: Math.min(5, Math.max(1, parseInt(ntfyPriorityInput.value || '3', 10))),
        siteUrl: siteUrlInput.value.trim(),
        chinaUrl: chinaUrlInput.value.trim(),
        chinaPrefix: chinaPrefixInput.value.trim() || 'cn_'
      };

      chrome.storage.sync.set(cfg, function () {
        if (chrome.runtime.lastError) {
          console.error('Error saving:', chrome.runtime.lastError);
          showStatus('Error saving configuration', true);
          return;
        }
        showStatus('Configuration saved!');
        // notifier le content actif (si l’onglet courant est sur MW)
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'REFRESH_INTERVAL_UPDATED' }, () => {});
            chrome.tabs.sendMessage(tabs[0].id, { type: 'CONFIG_SAVED' }, () => {});
          }
        });
        // re-planifier côté orchestrateur
        chrome.runtime.sendMessage({ type: 'MW_RESCHEDULE' });
      });
    });

    // INTERIM direct (si on clique dans le popup sur l’onglet courant)
    if (interimButton) {
      interimButton.addEventListener('click', function () {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          if (!tabs[0]) { showStatus('No active tab', true); return; }
          chrome.tabs.sendMessage(tabs[0].id, { type: 'INTERIM_SUMMARY_REQUEST' }, function (response) {
            if (chrome.runtime.lastError || !response || !response.ok) {
              console.error('Interim summary error', chrome.runtime.lastError || response);
              showStatus('Failed to send interim summary', true);
            } else {
              showStatus('Interim summary sent!');
            }
          });
        });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init(); // DOM déjà prêt → on attache maintenant
  }
})();

function sendToSW(action, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ from: 'popup', action, payload }, (resp) => {
      resolve(resp || { ok: false });
    });
  });
}

// Util: petit helper d’état UI
function setBusy(busy) {
  const runBtn = document.getElementById('btnRunNowBoth');
  const interimBtn = document.getElementById('btnInterimNowBoth');
  const status = document.getElementById('orchStatus');
  [runBtn, interimBtn].forEach(b => b && (b.disabled = !!busy));
  if (status) status.textContent = busy ? 'Exécution en cours…' : '';
}

// Vérif rapide: URLs présentes ?
async function ensureUrlsConfigured() {
  const { siteUrl, chinaUrl } = await chrome.storage.sync.get(['siteUrl', 'chinaUrl']);
  if (!siteUrl && !chinaUrl) {
    alert("Merci de configurer au moins une URL (EU ou CN) avant de lancer la séquence.");
    return null;
  }
  return { siteUrl, chinaUrl };
}

// Bouton: Lancer séquence EU → CN
document.getElementById('btnRunNowBoth')?.addEventListener('click', async () => {
  if (!await ensureUrlsConfigured()) return;
  try {
    setBusy(true);
    const res = await sendToSW('ORCH_RUN_NOW_BOTH');
    const status = document.getElementById('orchStatus');
    if (status) status.textContent = res?.ok ? 'Séquence EU → CN lancée.' : 'Échec du lancement.';
  } finally {
    setBusy(false);
  }
});

// Bouton: Récap intermédiaire EU → CN
document.getElementById('btnInterimNowBoth')?.addEventListener('click', async () => {
  if (!await ensureUrlsConfigured()) return;
  try {
    setBusy(true);
    const res = await sendToSW('ORCH_INTERIM_NOW_BOTH');
    const status = document.getElementById('orchStatus');
    if (status) status.textContent = res?.ok ? 'Récap intermédiaire lancé.' : 'Échec du lancement.';
  } finally {
    setBusy(false);
  }
});
ChatGPT a dit :

Réflexion durant 22s
Yep, j’ai trouvé la cause : ton popup envoie { action: … } alors que le service_worker écoute msg.type. Du coup, tes clics partent… mais le SW ne les voit jamais.

Voici les patchs MINIMAUX pour que ça parte et s’exécute EU → CN.

1) popup.js — envoyer type (au lieu de action)
Remplace ta fonction sendToSW par :

function sendToSW(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, (resp) => {
      resolve(resp || { ok: false });
    });
  });
}
Et laisse tes appels tels que :

await sendToSW('ORCH_RUN_NOW_BOTH');
await sendToSW('ORCH_INTERIM_NOW_BOTH');
2) service_worker.js — s’assurer qu’on écoute ces messages
Ajoute/complète le listener (si tu n’as que MW_RESCHEDULE pour l’instant) :

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'ORCH_RUN_NOW_BOTH') {
    runBothSites('CHECK')
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }

  if (msg.type === 'ORCH_INTERIM_NOW_BOTH') {
    runBothSites('INTERIM')
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }

  if (msg.type === 'ORCH_DAILY_NOW_BOTH') {
    runBothSites('DAILY')
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }

  if (msg.type === 'MW_RESCHEDULE') {
    scheduleAll()
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }
});
3) Vérifie les IDs dans le HTML
Tes handlers ciblent btnRunNowBoth et btnInterimNowBoth. Si ces boutons n’existent pas dans popup.html, aucun listener n’est attaché (tu utilises ?.). Assure-toi d’avoir quelque chose comme :

<button id="btnRunNowBoth">Lancer séquence EU → CN</button>
<button id="btnInterimNowBoth">Récap intermédiaire EU → CN</button>
<div id="orchStatus" style="font-size:12px;color:#666;margin-top:6px;"></div>
4) (au cas où) S’assurer que le content est injecté
Le SW ouvre un onglet puis fait chrome.tabs.sendMessage(tab.id, { type:'RUN_TASK', … }).
Ça nécessite que content.js soit injecté sur les deux sites. Vérifie manifest.json :

soit content_scripts.matches couvre les deux URLs (EU + CN),

soit <all_urls> (si tu préfères simple).

Sans ça, le message part mais personne ne lira dans la page.

Avec ces 4 points, tes boutons du popup déclenchent bien l’orchestrateur, qui ouvre EU puis CN, envoie RUN_TASK, le content exécute et renvoie CONTENT_DONE, et le SW ferme l’onglet avant de passer au suivant.

Vous avez dit :
toujours rien

ChatGPT a dit :

Réflexion durant 32s
Yes — the run buttons don’t trigger because the popup sends {action: …} while your service worker listens for {type: …}. So the SW never matches the message. Fix is tiny: send type instead of action, and (nice to have) surface lastError.

Patch (popup.js)
Replace your sendToSW helper with this:

function sendToSW(action, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: action, from: 'popup', ...payload }, (resp) => {
      if (chrome.runtime.lastError) {
        console.error('[POPUP] SW message error:', chrome.runtime.lastError);
        resolve({ ok: false, error: String(chrome.runtime.lastError.message || chrome.runtime.lastError) });
        return;
      }
      resolve(resp || { ok: false });
    });
  });
}
You don’t need to change your button code; these will now send type: 'ORCH_RUN_NOW_BOTH' and type: 'ORCH_INTERIM_NOW_BOTH', which your service_worker.js already handles.

Optional (but helps debugging)
Add a quick log in the SW to see incoming messages:

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[SW] onMessage', msg); // keep this while testing
  …
});
Quick checklist
Manifest has "permissions": ["alarms","tabs","storage","scripting"] and your content_scripts.matches include both EU & CN URLs.

Use the background console (chrome://extensions → your extension → “Service Worker” inspect) to see the logs: you should now see [SW] onMessage { type: 'ORCH_RUN_NOW_BOTH', … } followed by the EU→CN runs.

Vous avez dit :
ben j'ai toujours rien et j'ai meme pas de log sur le onMessage
ChatGPT a dit :

Réflexion durant 52s
OK, j’ai trouvé le vrai blocage : ton content script n’est injecté automatiquement que sur https://makerworld.com/* (cf. manifest). Quand l’orchestrateur ouvre l’URL EU/CN définie dans le popup (qui peut être un autre domaine ou un sous-domaine CN), il n’y a pas de content script → le RUN_TASK part dans le vide → aucun log côté content → boutons “Run” semblent ne rien faire.

Ce qu’on corrige (minimal & ciblé)
manifest.json
Ajoute la permission scripting.

Rends content.js inject-able partout par le SW via chrome.scripting.executeScript (web_accessible_resources).

Tu peux garder la règle content_scripts existante pour makerworld.com (injection auto), mais on injectera en plus “à la demande” pour EU/CN.

{
  "manifest_version": 3,
  "name": "MakerStats Notifier",
  "version": "1.1.0",
  "description": "Sends notifications about prints, downloads, and points earned on MakerWorld (Telegram or ntfy).",
  "permissions": ["alarms", "tabs", "storage", "scripting"],
  "background": { "service_worker": "service_worker.js" },
  "host_permissions": ["*://*/*", "https://*/*", "http://*/*"],
  "content_scripts": [
    {
      "matches": ["https://makerworld.com/*"],
      "js": ["content.js"],
      "run_at": "document_end"
    }
  ],
  "web_accessible_resources": [{
    "resources": ["content.js"],
    "matches": ["<all_urls>"]
  }],
  "action": { "default_popup": "popup.html", "default_icon": "icon.png" },
  "icons": { "48": "icon.png", "128": "icon.png" }
}

manifest


service_worker.js → injection “à la demande” + envoi de la tâche
Dans openAndRun, après onUpdated→status==='complete', injecte content.js puis envoie RUN_TASK. (En MV3, il faut scripting et web_accessible_resources ci-dessus.)

chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
  if (tabId === tab.id && info.status === 'complete') {
    chrome.tabs.onUpdated.removeListener(listener);
    // 1) injecte le content script si non présent
    chrome.scripting.executeScript(
      { target: { tabId: tab.id }, files: ['content.js'] },
      () => {
        // 2) envoie la tâche une fois injecté
        chrome.tabs.sendMessage(tab.id, { type: 'RUN_TASK', task, region: regionLabel, runId }, () => {
          if (chrome.runtime.lastError) {
            console.warn('[MW] send RUN_TASK error:', chrome.runtime.lastError.message);
          }
        });
      }
    );
  }
});
Assure-toi que ton SW a bien les handlers pour les boutons du popup (ils y sont déjà dans ta version “scheduleAll/runBothSites”) :

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'ORCH_RUN_NOW_BOTH') {
    runBothSites('CHECK').then(ok => sendResponse({ ok })).catch(e => sendResponse({ ok:false, error:String(e) }));
    return true;
  }
  if (msg?.type === 'ORCH_INTERIM_NOW_BOTH') {
    runBothSites('INTERIM').then(ok => sendResponse({ ok })).catch(e => sendResponse({ ok:false, error:String(e) }));
    return true;
  }
  if (msg?.type === 'MW_RESCHEDULE') {
    scheduleAll().then(()=>sendResponse({ok:true})).catch(e=>sendResponse({ok:false, error:String(e)}));
    return true;
  }
});

service_worker


popup.js → assure que l’envoi vers le SW est correct
Tu as plusieurs variantes dans le fichier. Garde cette version (simple & valide) :

function sendToSW(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, (resp) => {
      if (chrome.runtime.lastError) {
        console.error('[POPUP] SW message error:', chrome.runtime.lastError);
        resolve({ ok: false, error: String(chrome.runtime.lastError.message || chrome.runtime.lastError) });
        return;
      }
      resolve(resp || { ok: false });
    });
  });
}
Les boutons sont OK, ils envoient bien :

document.getElementById('btnRunNowBoth')?.addEventListener('click', async () => {
  if (!await ensureUrlsConfigured()) return;
  setBusy(true);
  const res = await sendToSW('ORCH_RUN_NOW_BOTH');
  document.getElementById('orchStatus').textContent = res?.ok ? 'Séquence EU → CN lancée.' : 'Échec du lancement.';
  setBusy(false);
});
document.getElementById('btnInterimNowBoth')?.addEventListener('click', async () => {
  if (!await ensureUrlsConfigured()) return;
  setBusy(true);
  const res = await sendToSW('ORCH_INTERIM_NOW_BOTH');
  document.getElementById('orchStatus').textContent = res?.ok ? 'Récap intermédiaire lancé.' : 'Échec du lancement.';
  setBusy(false);
});

popup


content.js → côté exécution
Ton listener RUN_TASK est en place et tagge bien les messages (EU/CN) puis appelle check/interim/daily, et renvoie CONTENT_DONE avec task. Nickel. Juste une micro-garantie : on pose la tâche globale pour que le CONTENT_DONE porte le bon nom (tu as déjà MW_CURRENT_TASK dans ton code → garde la ligne ci-dessous au tout début du handler).

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'RUN_TASK') return;
  const { task, region, runId } = msg;
  MW_CURRENT_TASK = task;  // <— pour le CONTENT_DONE
  // ...
});

content


Pourquoi ça va débloquer tes boutons
Avant : le SW ouvrait l’onglet EU/CN et envoyait RUN_TASK, mais aucun content script n’était chargé sur ce domaine → rien ne se passait.

Après : le SW injecte content.js à la volée sur l’onglet ouvert, puis envoie RUN_TASK. Le content exécute, notifie, renvoie CONTENT_DONE, le SW ferme l’onglet et passe au suivant.

Si après ces modifs tu ne vois toujours pas de logs, ouvre chrome://extensions → “Service worker” (Inspect) de l’extension pour voir les logs console.log du SW.


Sources
Vous avez dit :
je peux en console declecnher un alarm ORCH.ALARm_CHECK ?
ChatGPT a dit :

Réflexion durant 28s
Oui, mais pas depuis la console de la page web. Les alarmes Chrome ne sont accessibles que depuis le Service Worker (background) ou depuis un contexte extension (popup, content-script). Voici 3 façons rapides :

1) Depuis la console du Service Worker
Ouvre chrome://extensions → “Mode développeur” → “Inspecter la vue” du service worker.

Puis tape, par exemple, pour lancer immédiatement le check :

chrome.alarms.create('mw-check', { when: Date.now() + 200 }); // déclenche dans ~200ms
// ou avec un petit délai:
chrome.alarms.create('mw-check', { delayInMinutes: 0.01 });
Tu peux aussi bypasser l’alarm et appeler directement ta logique :

await runBothSites('CHECK');      // check périodique
await runBothSites('INTERIM');    // récap intermédiaire
await runBothSites('DAILY');      // daily
2) Depuis le popup (console du popup)
Inspecte le popup, puis en console :

chrome.runtime.sendMessage({ type: 'ORCH_RUN_NOW_BOTH' });      // lance CHECK EU→CN
chrome.runtime.sendMessage({ type: 'ORCH_INTERIM_NOW_BOTH' });  // lance INTERIM EU→CN
3) Depuis un content-script (console en “isolated world”)
Dans DevTools, choisis le contexte “Content script” de l’extension (menu déroulant en haut de la console), puis :

chrome.runtime.sendMessage({ type: 'ORCH_RUN_NOW_BOTH' });
Note : la constante est ORCH.ALARM_CHECK (majuscules correctes). Si tu veux vraiment l’utiliser telle quelle, fais-le dans la console du Service Worker où ORCH est défini. Sinon, utilise simplement le nom d’alarme littéral 'mw-check' comme ci-dessus.

Vous avez dit :
await runBothSites('CHECK');  
service_worker.js:47 [MW][EU] CHECK finished: ok
service_worker.js:1 Uncaught (in promise) Error: Could not establish connection. Receiving end does not exist.
ChatGPT a dit :
Yes—you hit two separate issues:

the SW throws “Could not establish connection…” when it tries to sendMessage to a tab that doesn’t have your content script (CN URL not matched, or just not ready yet);

in content.js your RUN_TASK handler uses this instead of the monitor instance, so even when the message arrives nothing runs.

Here’s the minimal set of fixes.

1) service_worker.js — don’t let sendMessage reject, and (optionally) inject
Wrap the sendMessage call and (optionally) force-inject the content script so it’s definitely there:

// inside openAndRun(...), in the onUpdated listener:
chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
  if (tabId === tab.id && info.status === 'complete') {
    chrome.tabs.onUpdated.removeListener(listener);

    // Optional but robust: ensure content.js is injected
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
      .catch(() => {/* ignore if already injected */})
      .finally(() => {
        // IMPORTANT: give a callback so the promise doesn't reject unhandled
        chrome.tabs.sendMessage(tab.id, { type: 'RUN_TASK', task, region: regionLabel, runId }, (resp) => {
          const err = chrome.runtime.lastError;
          if (err) {
            console.warn('[MW] sendMessage failed:', err.message);
          } else {
            console.log('[MW] RUN_TASK dispatched to content:', task, regionLabel, resp);
          }
        });
      });
  }
});
Also make sure the SW actually handles the two popup buttons (if not already):

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === 'ORCH_RUN_NOW_BOTH') {
    runBothSites('CHECK').then(()=>sendResponse({ok:true})).catch(e=>sendResponse({ok:false,error:String(e)}));
    return true;
  }
  if (msg.type === 'ORCH_INTERIM_NOW_BOTH') {
    runBothSites('INTERIM').then(()=>sendResponse({ok:true})).catch(e=>sendResponse({ok:false,error:String(e)}));
    return true;
  }
  if (msg.type === 'MW_RESCHEDULE') {
    scheduleAll().then(()=>sendResponse({ok:true})).catch(e=>sendResponse({ok:false,error:String(e)}));
    return true;
  }
});
2) manifest.json — make sure content.js runs on both sites (or allow injection)
Either add both domains to content_scripts.matches:

"content_scripts": [{
  "matches": [
    "https://www.makerworld.com/*",
    "https://makerworld.com/*",
    "https://www.makerworld.cn/*",
    "https://makerworld.cn/*"
  ],
  "js": ["content.js"],
  "run_at": "document_idle"
}],
"host_permissions": [
  "https://makerworld.com/*",
  "https://makerworld.cn/*"
]
—or keep your current static match and rely on the executeScript shown above (but you still need host_permissions for those URLs).

3) content.js — use the monitor instance (not this) in RUN_TASK
Right now the handler does things like this.sendTelegramMessage… which refers to window, not your class. Patch it to use the monitor object you instantiate:

// At the bottom of content.js

const monitor = new ValueMonitor();
monitor.start();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'RUN_TASK') return;

  const { task, region, runId } = msg;

  (async () => {
    try {
      // recompute ctx & decorate messages
      const cfg = await new Promise(res => chrome.storage.sync.get(null, r => res(r || {})));
      cfg._ctx = computeSiteContext(cfg);
      const tag = cfg._ctx?.label || (region ? `[${region}]` : '');
      const decorate = (s) => `${tag} ${s}`;

      // patch senders on the INSTANCE:
      if (typeof monitor.sendTelegramMessage === 'function') {
        const orig = monitor.sendTelegramMessage.bind(monitor);
        monitor.sendTelegramMessage = (m, ...rest) => orig(decorate(m), ...rest);
      }
      if (typeof monitor.sendTelegramMessageWithPhoto === 'function') {
        const origP = monitor.sendTelegramMessageWithPhoto.bind(monitor);
        monitor.sendTelegramMessageWithPhoto = (m, photo, ...rest) => origP(decorate(m), photo, ...rest);
      }

      // run the task on the INSTANCE:
      if (task === 'CHECK') {
        await autoScrollToFullBottom();
        await monitor.checkAndNotify();
      } else if (task === 'INTERIM') {
        await autoScrollToFullBottom();
        await monitor.handleInterimSummaryRequest();
      } else if (task === 'DAILY') {
        const summary = await monitor.getDailySummary({ persist: true });
        if (summary) {
          const message =
            `📊 ${tag} Récap 24h (${summary.from} → ${summary.to})\n\n` +
            `Points de téléchargement : ${summary.dailyDownloads + (summary.dailyPrints * 2)}\n` +
            `⚡ Boosts gagnés : +${summary.totalBoostsGained||0} → +${summary.boostPointsTotal||0} pts\n\n` +
            `🏆 Top téléchargements :\n${summary.top5Downloads.length ? summary.top5Downloads.map((m,i)=>`${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.downloadsGained}`).join('\n') : 'Aucun'}\n\n` +
            `🖨️ Top impressions :\n${summary.top5Prints.length ? summary.top5Prints.map((m,i)=>`${i+1}. <b>${escapeHtml(m.name)}</b>: +${m.printsGained}`).join('\n') : 'Aucune'}\n\n` +
            `🎁 Points (24h) : ${summary.rewardPointsTotal}`;
          await monitor.sendTelegramMessage(message);
        }
      }

      chrome.runtime.sendMessage({ type: 'CONTENT_DONE', task, region, runId });
      sendResponse && sendResponse({ ok: true });
    } catch (e) {
      console.error('[MW][content] task error', task, e);
      chrome.runtime.sendMessage({ type: 'CONTENT_DONE', task, region, runId, ok:false, error:String(e) });
      sendResponse && sendResponse({ ok: false, error: String(e) });
    }
  })();

  return true; // keep port open for async sendResponse
});
4) Popup → SW wiring (your buttons)
Your popup code is fine if the SW listener above is present. You can also sanity-check from the popup console:

chrome.runtime.sendMessage({ type: 'ORCH_RUN_NOW_BOTH' }, console.log);
chrome.runtime.sendMessage({ type: 'ORCH_INTERIM_NOW_BOTH' }, console.log);
After these patches:

The CN site will either have the content script (via matches) or be injected on the fly;

The SW won’t throw unhandled promise rejections when the content isn’t there yet;

The RUN_TASK code will actually use the monitor instance;

Your two buttons will trigger the orchestrated runs.

Vous avez dit :
tu peux me le faire en francais
ChatGPT a dit :
Oui bien sûr 😊

Voici une explication complète en français + les correctifs à appliquer, étape par étape.

🧩 Le problème réel
Le message d’erreur :

Error: Could not establish connection. Receiving end does not exist.

signifie que ton service_worker essaie d’envoyer un message (RUN_TASK) à un onglet…
👉 mais aucun content script (content.js) n’est injecté sur cette page.
Résultat : il n’y a « personne pour recevoir », et Chrome rejette la promesse.

Cela arrive typiquement quand :

Le site chinois (ou européen) n’est pas couvert par les matches du manifest.json,

ou que content.js n’est pas encore injecté au moment du sendMessage.

✅ Ce qu’on fait
On corrige trois points :

Injection automatique ou forcée du content script avant chaque envoi.

Sécurisation de l’appel chrome.tabs.sendMessage pour éviter les erreurs silencieuses.

Correction dans le content.js : utiliser l’instance monitor (pas this), car le handler n’est pas dans la classe.

⚙️ 1. Dans service_worker.js
Repère la fonction openAndRun()
→ dans le bloc où tu écoutes chrome.tabs.onUpdated.addListener(...),
remplace cette partie :

chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
  if (tabId === tab.id && info.status === 'complete') {
    chrome.tabs.onUpdated.removeListener(listener);
    chrome.tabs.sendMessage(tab.id, { type: 'RUN_TASK', task, region: regionLabel, runId });
  }
});

chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
  if (tabId === tab.id && info.status === 'complete') {
    chrome.tabs.onUpdated.removeListener(listener);

    // 1️⃣ Injecte content.js si pas encore présent
    chrome.scripting.executeScript(
      { target: { tabId: tab.id }, files: ['content.js'] }
    ).catch(() => {
      // on ignore si déjà injecté
    }).finally(() => {
      // 2️⃣ Envoie le message RUN_TASK, sans planter si la connexion échoue
      chrome.tabs.sendMessage(tab.id, { type: 'RUN_TASK', task, region: regionLabel, runId }, (resp) => {
        if (chrome.runtime.lastError) {
          console.warn('[MW] Erreur d’envoi RUN_TASK :', chrome.runtime.lastError.message);
        } else {
          console.log(`[MW][${regionLabel}] RUN_TASK (${task}) envoyé au content`, resp);
        }
      });
    });
  }
});

  const done = await new Promise(resolve => {
    const t = setTimeout(() => resolve(false), ORCH.AWAIT_MS);
    function onMsg(msg) {
      if (msg && msg.type === 'CONTENT_DONE' &&
          msg.runId === runId && msg.region === regionLabel && msg.task === task) {
        clearTimeout(t);
        chrome.runtime.onMessage.removeListener(onMsg);
        resolve(true);
      }
    }
    chrome.runtime.onMessage.addListener(onMsg);
  });

  clearTimeout(hardClose);
  try { await chrome.tabs.remove(tab.id); } catch {}

  console.log(`[MW][${regionLabel}] ${task} finished:`, done ? 'ok' : 'timeout');
  return done;
}

async function runBothSites(task) {
  const { siteUrl, chinaUrl } = await getCfg(['siteUrl','chinaUrl']);
  const euUrl = siteUrl || '';
  const cnUrl = chinaUrl || '';

  if (!euUrl && !cnUrl) { console.warn('[MW] No URLs configured'); return; }
  if (euUrl) await openAndRun(euUrl, 'EU', task);
  if (cnUrl) await openAndRun(cnUrl, 'CN', task);
}

// ====== Alarms set/update ======
async function scheduleAll() {
  const cfg = await getCfg(['refreshInterval','dailyNotificationTime']);
  const everyMs = Math.max(60_000, Number(cfg.refreshInterval || 900_000));

  // CHECK (périodique)
  await chrome.alarms.clear(ORCH.ALARM_CHECK);
  chrome.alarms.create(ORCH.ALARM_CHECK, { periodInMinutes: everyMs / 60000 });

  // DAILY
  const daily = (cfg.dailyNotificationTime || '23:30').split(':').map(Number);
  const whenDaily = new Date(); whenDaily.setMinutes(daily[1]||0, 0, 0); whenDaily.setHours(daily[0]||23);
  if (whenDaily <= new Date()) whenDaily.setDate(whenDaily.getDate()+1);
  await chrome.alarms.clear(ORCH.ALARM_DAILY);
  chrome.alarms.create(ORCH.ALARM_DAILY, { when: whenDaily.getTime(), periodInMinutes: 24*60 });

  // INTERIM (4 créneaux fixes)
  await chrome.alarms.clear(ORCH.ALARM_INTERIM);
  // On crée 4 alarmes “one-shot” reconduites à chaque tick (simple) :
  const slots = ['07:00','12:00','16:00','22:00'];
  for (const slot of slots) {
    const [h,m] = slot.split(':').map(Number);
    const d = new Date(); d.setHours(h||0, m||0, 0, 0);
    if (d <= new Date()) d.setDate(d.getDate()+1);
    chrome.alarms.create(`${ORCH.ALARM_INTERIM}:${slot}`, { when: d.getTime() });
  }

  await setLocal({ mw_orchestrated_mode: true });
  console.log('[MW] Orchestrator alarms scheduled.');
}

chrome.runtime.onInstalled.addListener(scheduleAll);
chrome.runtime.onStartup.addListener(scheduleAll);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.refreshInterval || changes.dailyNotificationTime || changes.siteUrl || changes.chinaUrl)) {
    scheduleAll().catch(console.error);
  }
});

// ====== Alarm handler ======
chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    if (alarm.name === ORCH.ALARM_CHECK) {
      await runBothSites('CHECK');
      return;
    }
    if (alarm.name === ORCH.ALARM_DAILY) {
      await runBothSites('DAILY');
      return;
    }
    if (alarm.name.startsWith(ORCH.ALARM_INTERIM+':')) {
      const slot = alarm.name.split(':')[1]; // “07:00” etc.
      await runBothSites('INTERIM');
      // replanifier ce slot pour demain
      const [h,m] = slot.split(':').map(Number);
      const d = new Date(); d.setDate(d.getDate()+1); d.setHours(h||0, m||0, 0, 0);
      chrome.alarms.create(`${ORCH.ALARM_INTERIM}:${slot}`, { when: d.getTime() });
      return;
    }
  } catch (e) {
    console.error('[MW] alarm run error', e);
  }
});

// Permettre le “Reschedule” depuis le popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	 console.log('[SW] onMessage', msg); // keep this while testing
  if (msg && msg.type === 'MW_RESCHEDULE') {
    scheduleAll().then(() => sendResponse({ ok: true }))
                 .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // (déjà présent) replanifier les alarmes
  if (msg && msg.type === 'MW_RESCHEDULE') {
    scheduleAll().then(() => sendResponse({ ok: true }))
                 .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  // ▶️ Bouton "Lancer la séquence" (CHECK sur EU puis CN)
  if (msg && msg.type === 'ORCH_RUN_NOW_BOTH') {
    runBothSites('CHECK')
      .then(ok => sendResponse({ ok }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }

  // ⏱️ Bouton "Récap intermédiaire" (INTERIM sur EU puis CN)
  if (msg && msg.type === 'ORCH_INTERIM_NOW_BOTH') {
    runBothSites('INTERIM')
      .then(ok => sendResponse({ ok }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }

  // (optionnel) si tu ajoutes un bouton "Daily now"
  if (msg && msg.type === 'ORCH_DAILY_NOW_BOTH') {
    runBothSites('DAILY')
      .then(ok => sendResponse({ ok }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }
});
