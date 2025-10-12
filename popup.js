document.addEventListener('DOMContentLoaded', function () {
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

  function toggleNtfyBlock() {
    ntfyBlock.style.display = useNtfyCheckbox.checked ? 'block' : 'none';
  }
  
  function normalizeTimeTo24h(input) {
  if (!input) return "23:30";
  input = String(input).trim();

  // Cas déjà 24h "HH:MM"
  const m24 = /^(\d{1,2}):(\d{2})$/.exec(input);
  if (m24) {
    let h = parseInt(m24[1], 10), min = parseInt(m24[2], 10);
    if (isNaN(h) || isNaN(min)) return "23:30";
    h = Math.max(0, Math.min(23, h));
    min = Math.max(0, Math.min(59, min));
    return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
  }

  // Cas AM/PM "HH:MM AM/PM"
  const m12 = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/.exec(input);
  if (m12) {
    let h = parseInt(m12[1], 10), min = parseInt(m12[2], 10);
    const mer = m12[3].toUpperCase();
    if (mer === 'AM') { if (h === 12) h = 0; }
    else { if (h !== 12) h += 12; }
    return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
  }

  return "23:30";
}

  function showStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.style.color = isError ? 'red' : '#666';
    setTimeout(() => { statusDiv.textContent = ''; }, 3000);
  }

  // Load settings
  chrome.storage.sync.get([
    'telegramToken','chatId','refreshInterval',
    'dailyReport','dailyNotificationTime','notifySummaryMode',
    // ntfy
    'useNtfy','ntfyUrl','ntfyAuth','ntfyTags','ntfyPriority'
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

    toggleNtfyBlock();
  });

  useNtfyCheckbox.addEventListener('change', toggleNtfyBlock);

  // Save settings
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
      // ntfy
      useNtfy: !!useNtfyCheckbox.checked,
      ntfyUrl: ntfyUrlInput.value.trim(),
      ntfyAuth: ntfyAuthInput.value.trim(),
      ntfyTags: ntfyTagsInput.value.trim(),
      ntfyPriority: Math.min(5, Math.max(1, parseInt(ntfyPriorityInput.value || '3', 10)))
    };

    chrome.storage.sync.set(cfg, function () {
      if (chrome.runtime.lastError) {
        console.error('Error saving:', chrome.runtime.lastError);
        showStatus('Error saving configuration', true);
        return;
      }
      showStatus('Configuration saved!');

      // notify content script to refresh timers/config
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'REFRESH_INTERVAL_UPDATED' }, () => {});
          chrome.tabs.sendMessage(tabs[0].id, { type: 'CONFIG_SAVED' }, () => {});
        }
      });
    });
  });

  // Interim summary now
  interimButton.addEventListener('click', function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0]) {
        showStatus('No active tab', true);
        return;
      }
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
});
