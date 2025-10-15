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