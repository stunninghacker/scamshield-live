// =====================================================================
// footprint.js — reads details that ANY website can see without asking.
// Used by the player card on the score page. Nothing here is saved or
// sent anywhere, except one city lookup (ipapi.co) whose answer is only
// shown on screen.
// =====================================================================

// Operating system / device, e.g. "Android 14 · Pixel 8 · Phone"
async function getDevice() {
  const uaData = navigator.userAgentData;
  if (uaData) {
    let platform = uaData.platform || 'Unknown';
    let extra = '';
    try {
      // Chrome can tell us the exact version and phone model.
      const details = await uaData.getHighEntropyValues(['platformVersion', 'model']);
      if (details.model) extra = details.model;
      if (details.platformVersion && platform === 'Android') {
        platform += ' ' + details.platformVersion.split('.')[0];
      }
    } catch (err) {
      // not available, that's fine
    }
    const kind = uaData.mobile ? 'Phone' : 'Computer';
    return [platform, extra, kind].filter(Boolean).join(' · ');
  }
  return parseOsFromUserAgent(navigator.userAgent);
}

// Fallback for Safari / Firefox: guess from the user-agent text.
function parseOsFromUserAgent(ua) {
  let match = ua.match(/Android\s([\d.]+)/);
  if (match) return 'Android ' + match[1] + ' · Phone';
  match = ua.match(/(iPhone|iPad).*?OS\s([\d_]+)/);
  if (match) return match[1] + ' · iOS ' + match[2].replace(/_/g, '.');
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11 · Computer';
  if (/Windows/.test(ua)) return 'Windows · Computer';
  match = ua.match(/Mac OS X ([\d_]+)/);
  if (match) return 'macOS ' + match[1].replace(/_/g, '.') + ' · Computer';
  if (/CrOS/.test(ua)) return 'ChromeOS · Computer';
  if (/Linux/.test(ua)) return 'Linux · Computer';
  return 'Unknown device';
}

// Browser name + main version, e.g. "Chrome 131"
function getBrowser() {
  const ua = navigator.userAgent;
  const checks = [
    ['Edge', /Edg\/(\d+)/],
    ['Opera', /OPR\/(\d+)/],
    ['Samsung Internet', /SamsungBrowser\/(\d+)/],
    ['Firefox', /Firefox\/(\d+)/],
    ['Chrome', /Chrome\/(\d+)/],
    ['Safari', /Version\/(\d+).*Safari/],
  ];
  for (const [name, re] of checks) {
    const m = ua.match(re);
    if (m) return name + ' ' + m[1];
  }
  return 'Unknown browser';
}

function getScreen() {
  const ratio = window.devicePixelRatio || 1;
  return screen.width + ' × ' + screen.height + ' px · pixel ratio ' + ratio;
}

function getTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown';
  } catch (err) {
    return 'Unknown';
  }
}

function getLocalTime() {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return time + ' · ' + getTimeZone();
}

// Battery: only Chrome/Android support this. iPhones don't, so we hide it.
async function getBattery() {
  if (typeof navigator.getBattery !== 'function') return null;
  try {
    const b = await navigator.getBattery();
    const pct = Math.round(b.level * 100) + '%';
    return pct + (b.charging ? ' · charging' : ' · not charging');
  } catch (err) {
    return null;
  }
}

// Approximate city from the IP address. One request, 3-second limit.
// The answer is shown on screen and then forgotten.
async function getCity() {
  const fallback = getTimeZone() + ' region';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
    if (!res.ok) return fallback;
    const data = await res.json();
    if (!data.city) return fallback;
    return [data.city, data.region, data.country_name].filter(Boolean).join(', ');
  } catch (err) {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

function getLanguage() {
  const langs = navigator.languages && navigator.languages.length
    ? navigator.languages.slice(0, 3).join(', ')
    : navigator.language;
  return langs || 'Unknown';
}

function getHardware() {
  const parts = [];
  if (navigator.hardwareConcurrency) parts.push(navigator.hardwareConcurrency + ' CPU cores');
  if (navigator.deviceMemory) parts.push('~' + navigator.deviceMemory + ' GB RAM');
  return parts.length ? parts.join(' · ') : 'Hidden by this browser';
}

// Collect everything. Returns a list of { icon, label, value }.
// Battery is left out on phones that don't share it (like iPhones).
export async function collectFootprint() {
  const [device, battery, city] = await Promise.all([getDevice(), getBattery(), getCity()]);
  const items = [
    { icon: 'smartphone', label: 'Device', value: device },
    { icon: 'globe', label: 'Browser', value: getBrowser() },
    { icon: 'map-pin', label: 'City (from your internet connection)', value: city },
    { icon: 'clock', label: 'Local time', value: getLocalTime() },
    { icon: 'monitor', label: 'Screen', value: getScreen() },
    { icon: 'battery-charging', label: 'Battery', value: battery },
    { icon: 'languages', label: 'Languages', value: getLanguage() },
    { icon: 'cpu', label: 'Processor and memory', value: getHardware() },
  ];
  return items.filter((item) => item.value);
}
