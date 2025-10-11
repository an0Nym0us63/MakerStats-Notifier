/* content.js — MakerStats Notifier (Telegram + ntfy)
 * Version: 21.0.2-ntfy
 * Philosophie: identique à l’original, mais avec ntfy en option.
 * - Reload de la page à intervalle régulier (window.location.reload()) : OUI
 * - Scroll, scrape, synthèse : idem original
 * - Notifications : Telegram inchangé ; si useNtfy + ntfyUrl -> envoi via ntfy
 *
 * chrome.storage.sync :
 *   telegramToken, chatId, refreshInterval(ms), dailyReport('yes'|'no'),
 *   notificationTime('HH:MM'), notifySummaryMode(boolean),
 *   useNtfy(boolean), ntfyUrl(string), ntfyAuth(string), ntfyTags(string), ntfyPriority(1..5)
 *
 * chrome.storage.local :
 *   makerstats_previous_values, makerstats_daily_stats, makerstats_running_reward_points
 */

const ITERATION = 'Iteration 21.0.2-ntfy';

class MakerStatsMonitor {
  constructor() {
    // === Config Telegram (original)
    this.telegramToken = '';
    this.chatId = '';
    this.notifySummaryMode = false;

    // === Config ntfy (ajout minimal)
    this.useNtfy = false;
    this.ntfyUrl = '';
    this.ntfyAuth = '';
    this.ntfyTags = '';
    this.ntfyPriority = 3;

    // Timers / storage keys
    this.checkInterval = null;
    this._defaultRefreshMs = 15 * 60 * 1000;
    this._dailyTimerId = null;
    this._dailyScheduleJitterMs = 15 * 60 * 1000;
    this._previousKey = 'makerstats_previous_values';
    this._dailyStatsKey = 'makerstats_daily_stats';
    this._dailyRunningRewardKey = 'makerstats_running_reward_points';

    // Bornes
    this._telegramMaxMessageChars = 3800;
    this._suspiciousDeltaLimit = 5000;

    // Instance id
    this._instanceId = Math.random().toString(36).slice(2, 9);
  }

  /* ----------------- utils ----------------- */
  log(...a){ try{ console.log('[MakerStats]', ...a); }catch{} }
  warn(...a){ try{ console.warn('[MakerStats]', ...a); }catch{} }
  error(...a){ try{ console.error('[MakerStats]', ...a); }catch{} }
  sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
  parseNumber(text){ const n = parseInt(String(text||'').replace(/[^\d]/g,''),10); return Number.isFinite(n)?n:0; }

  /* ----------------- scroll pour charger ----------------- */
  async autoScrollToBottom({ step=800, delay=350, settle=900 } = {}) {
    let last = 0;
    for (let i=0;i<120;i++){
      window.scrollBy(0, step);
      await this.sleep(delay);
      const h = document.body.scrollHeight;
      if (h === last){
        await this.sleep(settle);
        if (document.body.scrollHeight === h) break;
      }
      last = document.body.scrollHeight;
    }
    // Tenter de cliquer sur d’éventuels "Load more"
    const more = Array.from(document.querySelectorAll('button, a'))
      .filter(el => /load more|show more|plus|more/i.test(el.textContent||''));
    for (const el of more){ try{ el.click(); await this.sleep(1200); }catch{} }
  }

  /* ----------------- scraping ----------------- */
  getModelCards(){
    const anchors = document.querySelectorAll('a[href*="/model/"], a[href*="/models/"]');
    const cards = new Set();
    for (const a of anchors){
      let el = a;
      for (let i=0;i<5 && el && el!==document.body;i++){
        const cls = String(el.className||'');
        const looksLikeCard = /(card|list|grid|item|model)/i.test(cls);
        if (looksLikeCard && (el.querySelector('img') || el.querySelector('svg'))) { cards.add(el); break; }
        el = el.parentElement;
      }
    }
    return Array.from(cards);
  }

  extractNearestNumber(root, regex){
    const it = document.createNodeIterator(root, NodeFilter.SHOW_ELEMENT);
    let best=null, bestDepth=1e9, n;
    while((n = it.nextNode())){
      const t = (n.textContent||'').trim();
      if (regex.test(t)){
        const d = this.domDepth(n);
        if (d < bestDepth){ best = n; bestDepth = d; }
      }
    }
    if (!best) return null;
    const m = (best.textContent||'').match(/\d[\d,\.]*/);
    if (!m) return null;
    return this.parseNumber(m[0]);
  }

  domDepth(el){ let d=0, n=el; while(n && n!==document.body){ d++; n=n.parentElement; } return d; }

  guessFromText(text, rx){
    const t = String(text||'').toLowerCase().replace(/\s+/g,' ');
    const m = t.match(new RegExp(`(?:^|\\D)(\\d{1,7})(?=\\D*${rx.source})`,'i'));
    return m ? this.parseNumber(m[1]) : 0;
  }

  extractCardData(card){
    const link = card.querySelector('a[href*="/model"]') || card.querySelector('a[href*="/models"]') || card.querySelector('a[href]');
    const url = link ? new URL(link.href, location.href).href : null;

    let name = '';
    const titleEl = card.querySelector('h3,h4,h5,[class*="title"],[class*="name"]');
    if (titleEl) name = (titleEl.textContent||'').trim();

    let imageUrl = '';
    const imgEl = card.querySelector('img[src*="http"], img[data-src*="http"]');
    if (imgEl) imageUrl = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';

    const text = (card.textContent||'').toLowerCase().replace(/\s+/g,' ');
    const downloads = this.extractNearestNumber(card, /(download|dl)/i) ?? this.guessFromText(text, /download|dl/);
    const prints    = this.extractNearestNumber(card, /(print|printed)/i) ?? this.guessFromText(text, /print|printed/);
    const boosts    = this.extractNearestNumber(card, /(boost)/i) ?? this.guessFromText(text, /boost/);

    return { url, name, imageUrl, downloads: downloads||0, prints: prints||0, boosts: boosts||0 };
  }

  getPoints(){
    const root = document.querySelector('header, [class*="profile"], [class*="points"]') || document.body;
    const text = (root.textContent||'').replace(/\s+/g,' ');
    const m = text.match(/(\d[\d,\.]{2,})\s*(?:pts|points?)/i) || text.match(/points?:\s*(\d[\d,\.]*)/i);
    if (m) return parseFloat(m[1].replace(/,/g,''));
    return 0;
  }

  async collectCurrentValues(){
    await this.autoScrollToBottom();
    const cards = this.getModelCards();
    const models = {};
    for (const c of cards){
      const d = this.extractCardData(c);
      if (d.url) models[d.url] = d;
    }
    const points = this.getPoints();
    return { models, points, timestamp: Date.now() };
  }

  /* ----------------- storage ----------------- */
  loadPreviousValues(){
    return new Promise(res => {
      chrome.storage.local.get([this._previousKey], r => {
        res(r?.[this._previousKey] || { models:{}, points:0, timestamp:0 });
      });
    });
  }
  savePreviousValues(values){
    return new Promise(res => {
      chrome.storage.local.set({ [this._previousKey]: values }, () => res());
    });
  }

  /* ----------------- Telegram (original) ----------------- */
  _splitMessageIntoParts(message, maxLen){
    if (!message) return [''];
    if (message.length <= maxLen) return [message];
    const lines = message.split('\n');
    const parts = [];
    let buf = '';
    for (const line of lines){
      const candidate = buf + line + '\n';
      if (candidate.length > maxLen){ parts.push(buf); buf = ''; }
      buf += line + '\n';
    }
    if (buf) parts.push(buf);
    return parts;
  }

  async sendTelegramMessage(message, attempt=1){
    // Route vers ntfy si activé
    if (this.useNtfy && this.ntfyUrl){
      return await this.sendNtfyMessage({
        title: 'MakerWorld',
        text: message,
        clickUrl: '',
        imageUrl: '',
        tags: this.ntfyTags || 'info',
        priority: this.ntfyPriority || 3
      });
    }

    if (!this.telegramToken || !this.chatId){ this.error('Missing Token or Chat ID'); return false; }
    const parts = this._splitMessageIntoParts(message, this._telegramMaxMessageChars);
    for (const part of parts){
      const payload = { chat_id: this.chatId, text: part, parse_mode: 'HTML' };
      this.log('→ Telegram payload (part):', { len: part.length });
      try {
        const res = await fetch(`https://api.telegram.org/bot${this.telegramToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const body = await res.json().catch(()=>({}));
        if (!res.ok){
          this.error('← Telegram API error:', body);
          if (attempt < 2){
            this.log('Retrying Telegram send...');
            await this.sleep(1000);
            return this.sendTelegramMessage(message, attempt+1);
          }
          return false;
        }
        this.log('← Telegram OK');
      } catch (err){
        this.error('Telegram send error:', err);
        if (attempt < 2){
          await this.sleep(1000);
          return this.sendTelegramMessage(message, attempt+1);
        }
        return false;
      }
    }
    return true;
  }

  async sendTelegramMessageWithPhoto(message, photoUrl){
    // Route vers ntfy si activé (on met l’URL image dans le corps)
    if (this.useNtfy && this.ntfyUrl){
      return await this.sendNtfyMessage({
        title: 'MakerWorld',
        text: message,
        clickUrl: '',
        imageUrl: photoUrl || '',
        tags: (this.ntfyTags ? this.ntfyTags + ',model,update' : 'model,update'),
        priority: this.ntfyPriority || 4
      });
    }

    if (!this.telegramToken || !this.chatId || !photoUrl){
      this.warn('Missing token/chat/photo). Falling back to text message.');
      return this.sendTelegramMessage(message);
    }
    try {
      this.log('Attempting to send photo:', { photoUrl, chatId: this.chatId });
      const imgRes = await fetch(photoUrl);
      if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`);
      const blob = await imgRes.blob();
      const form = new FormData();
      form.append('chat_id', this.chatId);
      form.append('caption', message);
      form.append('photo', blob, 'model_image.jpg');
      const res = await fetch(`https://api.telegram.org/bot${this.telegramToken}/sendPhoto`, { method: 'POST', body: form });
      const result = await res.json().catch(()=>({}));
      this.log('Telegram response:', result);
      if (!res.ok) throw new Error(`Telegram Error: ${res.status}`);
      return true;
    } catch (err){
      this.error('Error sending photo:', err);
      return this.sendTelegramMessage(message);
    }
  }

  /* ----------------- ntfy (ajout) ----------------- */
  async sendNtfyMessage({ title, text, clickUrl, imageUrl, tags, priority }){
    if (!this.ntfyUrl){ this.error('NTFY URL missing'); return false; }
    const headers = { 'Content-Type': 'text/plain' };
    if (title) headers['Title'] = title;
    if (clickUrl) headers['Click'] = clickUrl;
    if (tags) headers['Tags'] = tags;
    if (priority) headers['Priority'] = String(priority);
    if (this.ntfyAuth) headers['Authorization'] = this.ntfyAuth;

    let body = text || '';
    if (imageUrl) body = (body ? (body + '\n') : '') + imageUrl;

    try{
      this.log('→ ntfy POST', { url: this.ntfyUrl, title, hasImage: !!imageUrl, tags, priority });
      const res = await fetch(this.ntfyUrl, { method: 'POST', headers, body });
      const t = await res.text().catch(()=> '');
      if (!res.ok){
        this.error('← ntfy HTTP', res.status, t);
        return false;
      }
      this.log('← ntfy OK', res.status);
      return true;
    } catch(e){
      this.error('ntfy error:', e);
      return false;
    }
  }

  /* ----------------- messages ----------------- */
  formatPerModelMessage(prev, curr, deltas){
    const lines = [];
    lines.push(`📦 <b>${curr.name || 'Untitled model'}</b>`);
    if (deltas.downloads !== 0) lines.push(`⬇️ Downloads: ${prev.downloads} → ${curr.downloads}  ( +${deltas.downloads} )`);
    if (deltas.prints !== 0)    lines.push(`🖨️ Prints:    ${prev.prints} → ${curr.prints}      ( +${deltas.prints} )`);
    if (deltas.boosts !== 0)    lines.push(`⚡ Boosts:     ${prev.boosts} → ${curr.boosts}      ( +${deltas.boosts} )`);
    lines.push(curr.url || '');
    return lines.join('\n');
  }

  summarizeChanges(changes){
    const lines = [];
    let totalDownloads = 0, totalPrints = 0, totalBoosts = 0;
    for (const ch of changes){
      totalDownloads += ch.deltas.downloads;
      totalPrints    += ch.deltas.prints;
      totalBoosts    += ch.deltas.boosts;
    }
    lines.push('🧾 <b>Summary</b>');
    lines.push(`⬇️ +${totalDownloads}  ·  🖨️ +${totalPrints}  ·  ⚡ +${totalBoosts}`);
    lines.push('');
    for (const ch of changes.slice(0, 30)){
      const name = ch.current.name || 'Untitled';
      const parts = [];
      if (ch.deltas.downloads) parts.push(`⬇️ +${ch.deltas.downloads}`);
      if (ch.deltas.prints)    parts.push(`🖨️ +${ch.deltas.prints}`);
      if (ch.deltas.boosts)    parts.push(`⚡ +${ch.deltas.boosts}`);
      lines.push(`• ${name} — ${parts.join('  ·  ')}`);
    }
    if (changes.length > 30) lines.push(`… and ${changes.length-30} more`);
    return lines.join('\n');
  }

  /* ----------------- daily ----------------- */
  async _accumulateDailyRewardPoints(points){
    const r = await new Promise(res => chrome.storage.local.get(
      [this._dailyRunningRewardKey],
      v => res(v?.[this._dailyRunningRewardKey] || { rewardPointsTotal: 0 })
    ));
    const total = (r.rewardPointsTotal || 0) + (points || 0);
    await new Promise(res => chrome.storage.local.set(
      { [this._dailyRunningRewardKey]: { rewardPointsTotal: total, timestamp: Date.now() } },
      () => res()
    ));
  }

  async getCurrentPeriodKey(){
    const hhmm = await new Promise(res => chrome.storage.sync.get(['notificationTime'], r => res(r?.notificationTime || '12:00')));
    const [hStr, mStr] = String(hhmm).split(':');
    const h = Number.isFinite(+hStr) ? +hStr : 12;
    const m = Number.isFinite(+mStr) ? +mStr : 0;
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
    return base.getTime();
  }

  async getDailySummary(currentValues){
    const [previousDayRaw, fallbackAgeMs] = await Promise.all([
      new Promise(res => chrome.storage.local.get([this._dailyStatsKey], r => res(r?.[this._dailyStatsKey] || null))),
      new Promise(res => chrome.storage.sync.get(['dailyFallbackMaxAgeMs'], cfg => {
        const v = cfg?.dailyFallbackMaxAgeMs; res(Number.isFinite(v) ? v : 24*60*60*1000);
      }))
    ]);

    let raw = previousDayRaw;
    if (!raw){
      const periodKey = await this.getCurrentPeriodKey();
      await new Promise(res => chrome.storage.local.set({ [this._dailyStatsKey]: { models: currentValues.models, points: currentValues.points, timestamp: Date.now(), owner: this._instanceId, periodKey } }, () => res()));
      await new Promise(res => chrome.storage.local.set({ [this._dailyRunningRewardKey]: { rewardPointsTotal: 0, timestamp: Date.now() } }, () => res()));
      return { dailyDownloads:0, dailyPrints:0, points: currentValues.points, previousValues: currentValues, periodKey };
    }

    const ageMs = Date.now() - (raw.timestamp || 0);
    if (ageMs > fallbackAgeMs){
      const periodKey = await this.getCurrentPeriodKey();
      await new Promise(res => chrome.storage.local.set({ [this._dailyStatsKey]: { models: currentValues.models, points: currentValues.points, timestamp: Date.now(), owner: this._instanceId, periodKey } }, () => res()));
      await new Promise(res => chrome.storage.local.set({ [this._dailyRunningRewardKey]: { rewardPointsTotal: 0, timestamp: Date.now() } }, () => res()));
      return { dailyDownloads:0, dailyPrints:0, points: currentValues.points, previousValues: currentValues, periodKey };
    }

    const modelChanges = {};
    let dailyDownloads = 0, dailyPrints = 0;
    for (const [url, curr] of Object.entries(currentValues.models)){
      const prev = raw.models[url];
      if (!prev) continue;
      const dDl = curr.downloads - prev.downloads;
      const dPr = curr.prints - prev.prints;
      if (dDl > 0) dailyDownloads += dDl;
      if (dPr > 0) dailyPrints += dPr;
      modelChanges[url] = { downloads: dDl, prints: dPr };
    }

    const periodKey = raw.periodKey || await this.getCurrentPeriodKey();
    return { dailyDownloads, dailyPrints, points: currentValues.points, previousValues: raw, periodKey };
  }

  async scheduleDailyNotification(){
    if (this._dailyTimerId){ clearTimeout(this._dailyTimerId); this._dailyTimerId = null; }
    chrome.storage.sync.get(['dailyReport','notificationTime'], (cfg) => {
      const dailyReport = cfg?.dailyReport || 'yes';
      if (dailyReport === 'no'){ this.log('Daily report disabled'); return; }
      const dailyTime = cfg?.notificationTime || '12:00';
      const [hour, minute] = dailyTime.split(':').map(Number);
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour||12, minute||0, 0, 0);
      if (next <= now) next.setDate(next.getDate()+1);
      const jitter = Math.floor((Math.random()*2 - 1) * this._dailyScheduleJitterMs);
      const delay = Math.max(0, next - now + jitter);
      this.log(`Daily report scheduled in ~${Math.round(delay/60000)} min`);

      this._dailyTimerId = setTimeout(async () => {
        try {
          const currentValues = await this.collectCurrentValues();
          const daily = await this.getDailySummary(currentValues);
          const text = [
            '📅 <b>Daily Summary</b>',
            `⬇️ ${daily.dailyDownloads}  ·  🖨️ ${daily.dailyPrints}`,
            `⭐ Points now: ${daily.points}`
          ].join('\n');

          await this.notifyMessage({
            title: 'MakerWorld · Daily',
            text,
            clickUrl: location.href,
            imageUrl: '',
            tags: 'summary,daily',
            priority: 3
          });

          // reset base snapshot
          await new Promise(res => chrome.storage.local.set({ [this._dailyStatsKey]: { models: currentValues.models, points: currentValues.points, timestamp: Date.now(), owner: this._instanceId, periodKey: daily.periodKey } }, () => res()));
          await new Promise(res => chrome.storage.local.set({ [this._dailyRunningRewardKey]: { rewardPointsTotal: 0, timestamp: Date.now() } }, () => res()));
        } catch (e){
          this.error('Daily summary error', e);
        } finally {
          this.scheduleDailyNotification();
        }
      }, delay);
    });
  }

  /* ----------------- notifications routeur ----------------- */
  async notifyMessage({ title, text, clickUrl, imageUrl, tags, priority=3 }){
    if (this.useNtfy && this.ntfyUrl){
      const mergedTags = [tags, this.ntfyTags].filter(Boolean).join(',').replace(/,+/g, ',');
      return this.sendNtfyMessage({ title, text, clickUrl, imageUrl, tags: mergedTags, priority: priority || this.ntfyPriority || 3 });
    }
    if (imageUrl) return this.sendTelegramMessageWithPhoto(text, imageUrl);
    return this.sendTelegramMessage(text);
  }

  /* ----------------- boucle principale ----------------- */
  async checkForUpdates(){
    this.log('Check for updates...');
    const current = await this.collectCurrentValues();
    const previous = await this.loadPreviousValues();

    const changes = [];
    for (const [url, curr] of Object.entries(current.models)){
      const prev = previous.models[url];
      if (!prev) continue;
      const d = {
        downloads: curr.downloads - prev.downloads,
        prints:    curr.prints    - prev.prints,
        boosts:    curr.boosts    - prev.boosts
      };
      if (d.downloads || d.prints || d.boosts){
        changes.push({ url, current: curr, previous: prev, deltas: d });
      }
    }

    const pointsDelta = (current.points || 0) - (previous.points || 0);
    if (pointsDelta > 0) await this._accumulateDailyRewardPoints(pointsDelta);

    let anyNotification = false;

    if (this.notifySummaryMode || changes.length > 15){
      const summaryText = this.summarizeChanges(changes);
      if (summaryText.trim()){
        await this.notifyMessage({
          title: 'MakerWorld · Summary',
          text: summaryText,
          clickUrl: location.href,
          imageUrl: '',
          tags: 'summary',
          priority: 3
        });
        anyNotification = true;
      }
    } else {
      for (const ch of changes){
        const msg = this.formatPerModelMessage(ch.previous, ch.current, ch.deltas);
        const img = ch.current.imageUrl || '';
        await this.notifyMessage({
          title: `MakerWorld · ${ch.current.name || ''}`,
          text: msg,
          clickUrl: ch.url,
          imageUrl: img,
          tags: 'model,update',
          priority: 4
        });
        anyNotification = true;
      }
    }

    if (!anyNotification){
      await this.notifyMessage({
        title: 'MakerWorld',
        text: 'No new prints or downloads found.',
        clickUrl: '',
        imageUrl: '',
        tags: 'heartbeat',
        priority: 1
      });
    }

    await this.savePreviousValues(current);
  }

  async restart(){
    if (this.checkInterval){ clearInterval(this.checkInterval); this.checkInterval = null; }
    await this.start();
  }

  /* ----------------- lifecycle ----------------- */
  async start(){
    this.log(`Initializing monitor — ${ITERATION}`);
    if (this.checkInterval){ this.log('Monitor already running, skipping duplicate start.'); return; }

    chrome.storage.sync.get([
      'telegramToken','chatId','refreshInterval',
      'dailyReport','notificationTime','notifySummaryMode',
      'useNtfy','ntfyUrl','ntfyAuth','ntfyTags','ntfyPriority'
    ], async (config) => {
      this.telegramToken = config?.telegramToken || '';
      this.chatId = config?.chatId || '';
      this.notifySummaryMode = !!config?.notifySummaryMode;

      this.useNtfy = !!config?.useNtfy;
      this.ntfyUrl = config?.ntfyUrl || '';
      this.ntfyAuth = config?.ntfyAuth || '';
      this.ntfyTags = config?.ntfyTags || '';
      this.ntfyPriority = Number.isFinite(config?.ntfyPriority) ? config.ntfyPriority : 3;

      const refreshMs = Number.isFinite(config?.refreshInterval) ? config.refreshInterval : this._defaultRefreshMs;
      this.log(`Configured refresh interval: ${refreshMs} ms`);
      this.log(`Notify summary mode: ${this.notifySummaryMode}`);
      this.log(`NTFY enabled=${this.useNtfy} url=${this.ntfyUrl ? 'yes':'no'}`);

      // IMPORTANT : comme l’original, le script peut démarrer sans Telegram
      // si ntfy est activé + configuré. Sinon on exige Telegram.
      if (!(this.useNtfy && this.ntfyUrl)){
        if (!this.telegramToken || !this.chatId){
          this.error('Missing Telegram configuration and ntfy not enabled; aborting start.');
          return;
        }
      }

      // 1) premier run (scrape & notif)
      await this.checkForUpdates().catch(e=>this.error('initial checkForUpdates error', e));

      // 2) boucle: RELOAD de la page à chaque intervalle (comportement original)
      if (this.checkInterval){ clearInterval(this.checkInterval); }
      this.checkInterval = setInterval(async () => {
        try {
          this.log('Refreshing page...');
          window.location.reload();
        } catch(e){
          this.error('reload error', e);
        }
      }, refreshMs);

      // 3) daily
      this.scheduleDailyNotification();
    });
  }

  /* ----------------- interactions popup ----------------- */
  async handleInterimSummaryRequest(){
    try {
      const current = await this.collectCurrentValues();
      const previous = await this.loadPreviousValues();

      const changes = [];
      for (const [url, curr] of Object.entries(current.models)){
        const prev = previous.models[url];
        if (!prev) continue;
        const d = {
          downloads: curr.downloads - prev.downloads,
          prints:    curr.prints    - prev.prints,
          boosts:    curr.boosts    - prev.boosts
        };
        if (d.downloads || d.prints || d.boosts){
          changes.push({ url, current: curr, previous: prev, deltas: d });
        }
      }

      const text = this.summarizeChanges(changes);
      await this.notifyMessage({
        title: 'MakerWorld · Interim',
        text,
        clickUrl: location.href,
        imageUrl: '',
        tags: 'summary,interim',
        priority: 3
      });

      return true;
    } catch (e){
      this.error('Interim summary error', e);
      return false;
    }
  }
}

/* ---------- boot ---------- */
const monitor = new MakerStatsMonitor();
monitor.start();

/* ---------- messages depuis popup ---------- */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg && msg.type === 'SEND_INTERIM_SUMMARY'){
      const ok = await monitor.handleInterimSummaryRequest();
      sendResponse({ ok });
      return;
    }
    if (msg && msg.type === 'REFRESH_INTERVAL_UPDATED'){
      await monitor.restart();
      sendResponse({ ok: true });
      return;
    }
    if (msg && msg.type === 'CONFIG_SAVED'){
      chrome.storage.sync.get(['notifySummaryMode'], cfg => {
        monitor.notifySummaryMode = !!cfg?.notifySummaryMode;
        sendResponse({ ok: true });
		setTimeout(() => window.location.reload(), 200);
      });
      return;
    }
  })();
  return true; // canal async
});
