// service_worker.js

const ORCH = {
  ALARM_CHECK:  'mw-check',
  ALARM_DAILY:  'mw-daily',
  ALARM_INTERIM:'mw-interim',
  DWELL_MS: 250_000,   // garde-fou par site
  AWAIT_MS: 300_000,   // timeout attente CONTENT_DONE
};
async function pingContent(tabId, maxTries = 12, delayMs = 250) {
  for (let i = 0; i < maxTries; i++) {
    try {
      const res = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: 'PING' }, (r) => resolve(r || null));
      });
      if (res && res.ok) return true;
    } catch (_) {}
    await new Promise(r => setTimeout(r, delayMs));
  }
  return false;
}
async function ensureContentReady(tabId) {
  // 1) ping: si déjà injecté, on est bon
  if (await pingContent(tabId)) return true;

  // 2) injecte content.js (MV3)
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
  } catch (e) {
    console.warn('[MW] inject content.js failed', e);
  }

  // 3) re-ping après injection
  return await pingContent(tabId);
}
async function getCfg(keys){ return await new Promise(res => chrome.storage.sync.get(keys, r => res(r||{}))); }
async function setLocal(o){ return await new Promise(res => chrome.storage.local.set(o, () => res())); }

async function openAndRun(url, regionLabel, task) {
  const runId = `${Date.now()}:${regionLabel}:${task}`;
  await setLocal({ mw_orchestrated_mode: true, mw_current_run: runId });

  const useTranslate = true; // ou lis un flag storage
  const effectiveUrl = (regionLabel === 'CN' && useTranslate)
    ? wrapWithTranslateGoog(url, 'zh-CN', 'fr')
    : url;

  // ⚠️ utiliser effectiveUrl (et pas url)
   const tab = await chrome.tabs.create({ url: url, active: true });
 try {
   const win = await chrome.windows.getCurrent();
   await chrome.windows.update(win.id, { focused: true });
 } catch (_) {}

  chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
    if (tabId === tab.id && info.status === 'complete') {
      chrome.tabs.onUpdated.removeListener(listener);
      (async () => {
        const ready = await ensureContentReady(tab.id);
        if (!ready) {
          console.warn(`[MW][${regionLabel}] Content non prêt → abort RUN_TASK`);
          return;
        }
        try {
          await new Promise((resolve) => {
            chrome.tabs.sendMessage(
              tab.id,
              { type: 'RUN_TASK', task, region: regionLabel, runId },
              () => resolve()
            );
          });
        } catch (e) {
          console.warn('[MW] send RUN_TASK error (ignored):', e);
        }
      })();
    }
  });

  const done = await new Promise((resolve) => {
    const t = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(onMsg); // ✅ nettoyer au timeout
      resolve(false);
    }, ORCH.AWAIT_MS);

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

  try { await chrome.tabs.remove(tab.id); } catch {}
  console.log(`[MW][${regionLabel}] ${task} finished:`, done ? 'ok' : 'timeout');
  return done;
}
function wrapWithTranslateGoog(url, sl='zh-CN', tl='fr') {
  const u = new URL(url);
  const host = `${u.hostname.replace(/\./g,'-')}-translate.goog`;
  const qs = u.search ? u.search + '&' : '?';
  return `https://${host}${u.pathname}${qs}_x_tr_sl=${sl}&_x_tr_tl=${tl}&_x_tr_hl=${tl}&_x_tr_pto=wapp`;
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[SW] onMessage', msg);

  if (msg?.type === 'MW_RESCHEDULE') {
    scheduleAll().then(() => sendResponse({ ok: true }))
                 .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }

  if (msg?.type === 'ORCH_RUN_NOW_BOTH') {
    runBothSites('CHECK')
      .then(ok => sendResponse({ ok }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (msg?.type === 'ORCH_INTERIM_NOW_BOTH') {
    runBothSites('INTERIM')
      .then(ok => sendResponse({ ok }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (msg?.type === 'ORCH_DAILY_NOW_BOTH') {
    runBothSites('DAILY')
      .then(ok => sendResponse({ ok }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});
