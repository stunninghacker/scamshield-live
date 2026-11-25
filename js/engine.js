// =====================================================================
// ScamShield rule engine (JavaScript port of the Dart engine)
// ---------------------------------------------------------------------
// How it works, in simple words:
//   1. Ten "detectors" look for scam patterns in the message using
//      regular expressions (regex). Each detector returns the exact
//      position (start, end) of every pattern it finds, so the page can
//      highlight it.
//   2. Each pattern type (signal) has a weight. We add up the weights.
//   3. The total score (0-100) decides the verdict:
//        below 30  -> SAFE
//        below 60  -> SUSPICIOUS
//        60 or more -> DANGEROUS
//
// No AI, no internet. The same message always gives the same answer.
// Ported line-by-line from reference/scamshield-dart/ (constants.dart,
// signals.dart, scam_engine.dart).
//
// Note on regex flags: Dart and JavaScript regexes follow the same
// rules, so the patterns are copied as they are. We do NOT add the
// "u" (unicode) flag: "₹" works fine without it, and "u" would make
// "." count an emoji as 1 character instead of 2, which would change
// results compared with the Dart app.
// =====================================================================

// ---------------------------------------------------------------------
// 1. WEIGHTS AND THRESHOLDS (from constants.dart)
// ---------------------------------------------------------------------

export const WEIGHTS = {
  // A link gets a base score, plus extra points for each risky feature.
  linkBase: 20, // any URL
  linkShortener: 15, // bit.ly, tinyurl ...
  linkHttp: 10, // plain http:// (no padlock)
  linkIpHost: 20, // http://192.168.1.10/...
  linkLookalike: 25, // bank name inside a fake domain
  linkCap: 60, // all links together can add at most 60

  SECRET_REQUEST: 60, // asks for OTP / PIN / password      (critical)
  PAYMENT_PULL: 60, // asks you to pay or send money      (critical)
  REMOTE_ACCESS: 60, // AnyDesk / screen share             (critical)
  DIGITAL_ARREST: 60, // fake police / CBI threat           (critical)
  URGENCY_THREAT: 40, // "blocked", "within 24 hours"       (technique)
  REWARD_LURE: 40, // prize, lottery, cashback           (technique)
  JOB_LURE: 40, // easy-money job / task              (technique)
  IMPERSONATION: 20, // bank / govt / courier name         (supporting)
  CALLBACK: 15, // "call this number"                 (supporting)
};

export const THRESHOLDS = {
  suspicious: 30, // score >= 30 means SUSPICIOUS
  dangerous: 60, // score >= 60 means DANGEROUS
};

// Link shortener websites (they hide where a link really goes).
const SHORTENER_HOSTS = [
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd',
  'buff.ly', 'cutt.ly', 'rb.gy', 'rebrand.ly', 'shorturl.at', 'tiny.cc',
];

// Cheap domain endings that real Indian banks don't use.
const SUSPICIOUS_TLDS = [
  'xyz', 'top', 'click', 'buzz', 'work', 'support', 'verify',
  'online', 'link', 'info', 'tk', 'ml', 'ga', 'cf',
];

// Brand words scammers put inside fake website names.
const BRAND_KEYWORDS = [
  'sbi', 'hdfc', 'icici', 'axis', 'kotak', 'pnb', 'bob', 'canara',
  'unionbank', 'yesbank', 'paytm', 'phonepe', 'upi', 'rbi',
  'incometax', 'kyc', 'kbc',
];

// The REAL websites of these brands (not fake even though they
// contain a brand word).
const TRUSTED_HOSTS = [
  'sbi.co.in', 'onlinesbi.com', 'hdfcbank.com', 'icicibank.com',
  'axisbank.com', 'kotak.com', 'pnb.co.in', 'bankofbaroda.in',
  'canarabank.com', 'unionbankofindia.co.in', 'yesbank.in',
  'rbi.org.in', 'incometax.gov.in', 'paytm.com', 'phonepe.com',
];

// ---------------------------------------------------------------------
// 2. SMALL HELPERS
// ---------------------------------------------------------------------

// Find EVERY match of a regex in the text.
// We build a fresh "global" copy of the regex each time, because a
// global regex remembers its last position (lastIndex) and that can
// cause hard-to-find bugs if we reuse it.
function findAll(regex, text) {
  let flags = regex.flags;
  if (!flags.includes('g')) {
    flags = flags + 'g';
  }
  const freshRegex = new RegExp(regex.source, flags);
  const results = [];
  for (const m of text.matchAll(freshRegex)) {
    results.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
    });
  }
  return results;
}

// true if the regex matches anywhere in the text.
function hasMatch(regex, text) {
  const freshRegex = new RegExp(regex.source, regex.flags.replace('g', ''));
  return freshRegex.test(text);
}

// Keep a number between a minimum and a maximum.
function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

// Build one signal object. matchedText is always the exact slice of
// the ORIGINAL text, so highlights line up perfectly.
function makeSignal(id, label, weight, source, start, end, detail) {
  return {
    id: id,
    label: label,
    weight: weight,
    matchedText: source.substring(start, end),
    start: start,
    end: end,
    detail: detail || '',
  };
}

// Replace the given ranges with spaces. The string keeps the SAME
// length, so every position (offset) still points to the same place in
// the original message. Used to hide URLs from other detectors.
function maskRanges(text, ranges) {
  const chars = text.split('');
  for (const r of ranges) {
    for (let i = r.start; i < r.end && i < chars.length; i++) {
      chars[i] = ' ';
    }
  }
  return chars.join('');
}

// Text with all URLs blanked out (same length).
function withoutUrls(text) {
  return maskRanges(text, findAll(URL_RE, text));
}

// Remove exact duplicates (same id, start and end), then sort by start.
function dedupe(list) {
  const seen = new Set();
  const unique = [];
  for (const s of list) {
    const key = s.start + ':' + s.end + ':' + s.id;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(s);
    }
  }
  unique.sort((a, b) => a.start - b.start);
  return unique;
}

// ---------------------------------------------------------------------
// 3. LINK_RISK — risky URLs
// ---------------------------------------------------------------------

// Matches http://..., https://... and www.... up to the next space.
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/i;

// Remove punctuation stuck to the end of a URL ("...com/x." -> "...com/x").
function trimUrl(raw) {
  let s = raw;
  while (s.length > 0 && '.,;:!?)]}'.includes(s[s.length - 1])) {
    s = s.substring(0, s.length - 1);
  }
  return s;
}

// "https://www.sbi-verify.xyz:8080/kyc?x=1" -> "sbi-verify.xyz"
function hostOf(url) {
  let u = url.toLowerCase();
  u = u.replace(/^https?:\/\//, '');
  u = u.replace(/^www\./, '');
  const slash = u.indexOf('/');
  if (slash !== -1) u = u.substring(0, slash);
  const q = u.indexOf('?');
  if (q !== -1) u = u.substring(0, q);
  const at = u.indexOf('@'); // user@host -> keep the host part
  if (at !== -1) u = u.substring(at + 1);
  const colon = u.indexOf(':'); // host:port -> host
  if (colon !== -1) u = u.substring(0, colon);
  return u;
}

// "sbi-verify.xyz" -> "xyz"
function tldOf(host) {
  const parts = host.split('.');
  return parts.length === 0 ? '' : parts[parts.length - 1];
}

function isTrustedHost(host) {
  for (const t of TRUSTED_HOSTS) {
    // exact match, or a sub-domain like www.onlinesbi.com
    if (host === t || host.endsWith('.' + t)) return true;
  }
  return false;
}

function isShortener(host) {
  for (const s of SHORTENER_HOSTS) {
    if (host === s || host.endsWith('.' + s)) return true;
  }
  return false;
}

function isIpHost(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^\[[0-9a-f:]+\]$/.test(host);
}

// A brand name inside a website that is NOT the brand's real website.
function isLookalike(host) {
  if (isTrustedHost(host)) return false;
  const h = host.toLowerCase();
  let hasBrand = false;
  for (const b of BRAND_KEYWORDS) {
    if (h.includes(b)) hasBrand = true;
  }
  if (!hasBrand) return false;
  // The Dart engine lists extra checks here (shady ending, hyphen,
  // unusual ending) but every path returns true: a brand word in an
  // untrusted website is always enough to warn.
  if (SUSPICIOUS_TLDS.includes(tldOf(h))) return true;
  return true;
}

export function detectLinks(text) {
  const out = [];
  for (const m of findAll(URL_RE, text)) {
    const trimmed = trimUrl(m.text);
    const trimDelta = m.text.length - trimmed.length;
    const start = m.start;
    const end = m.end - trimDelta;
    if (trimmed.length < 5) continue;

    const lower = trimmed.toLowerCase();
    const host = hostOf(trimmed);
    let weight = WEIGHTS.linkBase;
    const reasons = ['url'];

    if (lower.startsWith('http://')) {
      weight += WEIGHTS.linkHttp;
      reasons.push('no-https');
    }
    if (isShortener(host)) {
      weight += WEIGHTS.linkShortener;
      reasons.push('shortener:' + host);
    }
    if (isIpHost(host)) {
      weight += WEIGHTS.linkIpHost;
      reasons.push('ip-host');
    }
    if (isLookalike(host)) {
      weight += WEIGHTS.linkLookalike;
      reasons.push('lookalike:' + host);
    }

    out.push(makeSignal('LINK_RISK', 'Suspicious link', weight, text, start, end,
      reasons.join(', ')));
  }
  return out;
}

// ---------------------------------------------------------------------
// 4. ADVICE GUARDS — "never share your OTP" is advice, not a request
// ---------------------------------------------------------------------

// Negation words that appear BEFORE the keyword in the same sentence.
const ADVISORY_NEG_RE = new RegExp(
  "\\b(never|don't|do not|does not|will never|won't|would never|beware|" +
  'not\\s+share|if\\s+(?:someone|anyone|somebody|anybody)\\s+asks?|' +
  'is\\s+(?:likely|probably)\\s+a\\s+scam|would\\s+be\\s+a\\s+scam)\\b',
  'i');

// Advice that comes AFTER the keyword: "Your OTP is 7890, do not share it".
const ADVISORY_NEG_AFTER_RE = new RegExp(
  "\\b(?:do\\s+not|don't|never|not\\s+supposed\\s+to|should\\s+not|shouldn't)" +
  '\\s+(?:share|enter|reveal|give|tell|send|type|disclose)',
  'i');

// Sentence breaks.
const SENTENCE_BREAK_RE = /[.!?\n]/;

// Looks at up to 48 characters BEFORE position `at`, inside the same
// sentence. true = that sentence is warning AGAINST the action.
function isAdvisoryBefore(scan, at) {
  const winStart = clamp(at - 48, 0, scan.length);
  const pieces = scan.substring(winStart, at).split(SENTENCE_BREAK_RE);
  const clause = pieces[pieces.length - 1];
  return hasMatch(ADVISORY_NEG_RE, clause.toLowerCase());
}

// Looks at up to 72 characters AFTER position `at`, same sentence.
function isAdvisoryAfter(scan, at) {
  const winEnd = clamp(at + 72, at, scan.length);
  const clause = scan.substring(at, winEnd).split(SENTENCE_BREAK_RE)[0];
  return hasMatch(ADVISORY_NEG_AFTER_RE, clause);
}

// ---------------------------------------------------------------------
// 5. SECRET_REQUEST — asks for OTP / PIN / CVV / password
// ---------------------------------------------------------------------

const PASSWORD_RE = /\bpassword\b/i;

// "Your password has been changed successfully" is a notification.
const NOTIFY_RE = /(?:has\s+been|was|were|is)\s+(?:changed|updated|modified|reset|replaced)\b|successfully/i;

function isChangeNotification(scan, from) {
  const winEnd = clamp(from + 56, from, scan.length);
  const clause = scan.substring(from, winEnd).split(SENTENCE_BREAK_RE)[0];
  return hasMatch(NOTIFY_RE, clause);
}

const SECRET_RES = [
  /\botp\b/i,
  /\bupi\s*pin\b/i,
  /\batm\s*pin\b/i,
  /\bcvv\b/i,
  PASSWORD_RE,
  /\bpin\s*number\b/i,
  /\bcard\s*(number|details|no\.?)\b/i,
  /share\s+(the\s+|your\s+|this\s+)?(otp|code|pin|cvv|password)/i,
  /enter\s+(your\s+)?(otp|pin|cvv|password|card)/i,
  /send\s+(me\s+|us\s+)?(your\s+)?(otp|pin|cvv|password)/i,
  /\bcredentials?\b/i,
  /\bbank\s+details\b/i,
  /\b(?:verification|login|whatsapp|2fa|auth(?:entication)?|security)\s+code\b/i,
];

// "do not share" / "never enter" ...
const NEGATED_SHARE_RE = new RegExp(
  "(?:do\\s+not|don't|never|should\\s+not|shouldn't|not\\s+supposed\\s+to)\\s+" +
  '(?:share|enter|reveal|give|tell|send|type|disclose)',
  'i');
const POSITIVE_ASK_RE = /\b(share|enter|send|provide|reply\s+with|type\s+in|give|submit)\b/i;

// The WHOLE message is safety advice: it has "do not share" and, once
// we remove that phrase, no other "share/enter/send..." verb is left.
function isPureAdvisory(scan) {
  if (!hasMatch(NEGATED_SHARE_RE, scan)) return false;
  const globalNeg = new RegExp(NEGATED_SHARE_RE.source, 'gi');
  const stripped = scan.replace(globalNeg, ' ');
  return !hasMatch(POSITIVE_ASK_RE, stripped);
}

export function detectSecretRequest(text) {
  const out = [];
  const scan = withoutUrls(text);
  if (isPureAdvisory(scan)) return out;
  for (const re of SECRET_RES) {
    for (const m of findAll(re, scan)) {
      if (isAdvisoryBefore(scan, m.start)) continue;
      if (isAdvisoryAfter(scan, m.end)) continue;
      if (re === PASSWORD_RE && isChangeNotification(scan, m.end)) continue;
      out.push(makeSignal('SECRET_REQUEST', 'Asks for secret code',
        WEIGHTS.SECRET_REQUEST, text, m.start, m.end, 'secret:' + m.text));
    }
  }
  return dedupe(out);
}

// ---------------------------------------------------------------------
// 6. URGENCY_THREAT — panic words
// ---------------------------------------------------------------------

const URGENCY_RES = [
  /account\s+(will\s+be\s+|is\s+|has\s+been\s+|was\s+)?(blocked|suspended|frozen|closed|compromised|deactivated|locked|disabled|deleted|flagged|at\s+risk|under\s+review)/i,
  /\bkyc\b.{0,20}(expired|expiring|suspended|blocked)/i,
  /within\s+\d+\s*(hours?|minutes?|days?)/i,
  /\bimmediately\b/i,
  /\blast\s+warning\b/i,
  /\bfinal\s+notice\b/i,
  /\blegal\s+action\b/i,
  /\burgent\b/i,
  /verify\s+(immediately|now)/i,
  /\bsuspended\b/i,
  /\bblocked\b/i,
  /\b(?:unauthorized|unauthorised)\s+(?:login|logins|transaction|transactions|activity|access|attempt)/i,
  /\bsuspicious\s+(?:login|logins|activity|transaction|transactions|access)/i,
  /\b(?:login|logged)\s+from\s+(?:another|a\s+different)\s+(?:city|device|location|country)/i,
  /\bcompromised\b/i,
  /\bdeactivated\b/i,
  /\bcloned\b/i,
  /\bunder\s+investigation\b/i,
  /\bbalance\s+is\s+low\b/i,
];

export function detectUrgency(text) {
  const out = [];
  const scan = withoutUrls(text);
  for (const re of URGENCY_RES) {
    for (const m of findAll(re, scan)) {
      out.push(makeSignal('URGENCY_THREAT', 'Urgency / threat',
        WEIGHTS.URGENCY_THREAT, text, m.start, m.end, 'urgency:' + m.text));
    }
  }
  return dedupe(out);
}

// ---------------------------------------------------------------------
// 7. REWARD_LURE — prize / lottery / cashback / refund bait
// ---------------------------------------------------------------------

// UPI handle like "winner-claim@okhdfcbank" (also used by PAYMENT_PULL).
const UPI_RE = /[A-Za-z0-9._-]{2,}@(okhdfcbank|ybl|paytm|okicici|okaxis|oksbi|upi|ibl)/i;

const REWARD_RES = [
  /you\s+(have\s+)?won\b/i,
  /\blottery\b/i,
  /\blucky\s+winner\b/i,
  /\bcashback\b/i,
  /\brefund\s+(pending|approved|initiated|processing|ready|on\s+hold|is\s+ready|has\s+been\s+approved)\b/i,
  /\b(?:claim|receive|get|unlock|view|check|pending)\s+(?:your\s+)?(?:\w+\s+)?refund\b/i,
  /claim\s+(your\s+)?(prize|reward|cashback)/i,
  /\bto\s+claim\b/i,
  /\bget\s+(?:a\s+)?(?:reward|bonus|gift|cashback)\b/i,
  /\b(?:get|earn)\s+(?:rs\.?|₹)\s*\d[\d,]*\s+back\b/i,
  /\bearn\s+(?:rs\.?|₹)\s*\d[\d,]*/i,
  /\bprize\b/i,
  /\bkbc\b/i,
  /\bwinner\b/i,
  /congratulations/i,
  /guaranteed\s+(?:[^\s]+\s+){0,3}?(?:profits?|returns?)\b/i,
  /\b(?:double|triple)\s+your\s+(?:money|investment|amount)/i,
  /\b\d+(?:\.\d+)?x\s+(?:profits?|returns?|gains?)\b/i,
  /\b(?:profits?|returns?)\s+in\s+\d+\s*(?:hours?|days?|weeks?|months?)/i,
  /\bearn\s+\d+(?:\.\d+)?\s?%/i,
  /\bearn\s+(?:daily|weekly|monthly|hourly|profits?|returns?|money)\b/i,
  /\b(?:daily|weekly|monthly)\s+returns?\b/i,
  /\bhigh\s+returns?\b/i,
  /\brisk[-\s]free\s+(?:profits?|returns?)\b/i,
  /\bdoubled\b/i,
];

export function detectReward(text) {
  const out = [];
  // Ignore words inside URLs and UPI handles.
  const hidden = findAll(URL_RE, text).concat(findAll(UPI_RE, text));
  const scan = maskRanges(text, hidden);
  for (const re of REWARD_RES) {
    for (const m of findAll(re, scan)) {
      if (isAdvisoryBefore(scan, m.start)) continue;
      out.push(makeSignal('REWARD_LURE', 'Prize / refund lure',
        WEIGHTS.REWARD_LURE, text, m.start, m.end, 'reward:' + m.text));
    }
  }
  return dedupe(out);
}

// ---------------------------------------------------------------------
// 8. PAYMENT_PULL — asks you to pay / send / invest money
// ---------------------------------------------------------------------

const PAYMENT_RES = [
  /pay\s*(?:₹|rs\.?\s*\d[\d,]*)/i,
  /send\s+(?:₹|rs\.?\s*)?\d[\d,]*/i,
  /scan\s+(this\s+)?(qr|code)/i,
  /send\s+money\s+to/i,
  /processing\s*fee/i,
  /pay\s+(a\s+|the\s+)?(fee|amount|now)/i,
  /\bpay\s+(?:[a-z][a-z-]*[\s,]+|rs\.?\s*[\d,.]+[\s,]+|₹\s*[\d,.]+[\s,]+|\d[\d,.]*[\s,]+){0,4}(?:fine|penalty|bail|charge|fee|tax|amount|deposit|dues|bill|postage|rent|premium)\b/i,
  /\b(?:put|deposit)\s+(?:rs\.?|₹)\s*\d[\d,]*/i,
  /\bneeds?\s+(?:a\s+small\s+)?(?:payment|deposit|advance|fee|charge)s?\b/i,
  /\bpay\b.{0,25}\bto\s+(?:start|register|join|begin|release|unlock|clear|remove|verify|receive|keep|secure|withdraw|activate|complete|earn)\b/i,
  /\bvia\s+upi\b/i,
  /\btransfer\s+(?:rs\.?|₹)\s*\d[\d,]*/i,
  /\binvest(?:ment)?\b/i,
  /\brequire[sd]?\s+(?:an?\s+|immediate\s+)?(?:payment|deposit|fee|charge)s?\b/i,
  /\bpay\b.{0,20}\bto\s+be\s+(?:removed|cleared|released|deleted|lifted|unblocked)\b/i,
];

// "UPI ... pay / send / id" — an instruction about UPI.
const UPI_ACTION_RE = /\bupi\b.{0,20}(pay|send|id)/i;
// Words that mean it's just a bank STATUS message ("UPI payment successful").
const UPI_STATUS_RE = /\b(?:successful|success|completed|debited|credited|received|initiated|transaction\s+(?:id|no|number))\b/i;
// Action verbs that prove it's a demand.
const UPI_ASK_RE = /\b(share|enter|send|pay|scan|click|verify|confirm|reply|type|provide|give|upload|whatsapp|telegram)\b/i;

export function detectPaymentPull(text) {
  const out = [];

  // (a) Any UPI handle like name@ybl.
  for (const m of findAll(UPI_RE, text)) {
    if (isAdvisoryBefore(text, m.start)) continue;
    out.push(makeSignal('PAYMENT_PULL', 'Asks for payment (UPI)',
      WEIGHTS.PAYMENT_PULL, text, m.start, m.end, 'upi:' + m.text));
  }

  // (b) Payment phrases ("pay Rs.499", "processing fee", "scan this QR").
  const scan = withoutUrls(text);
  for (const re of PAYMENT_RES) {
    for (const m of findAll(re, scan)) {
      if (isAdvisoryBefore(scan, m.start)) continue;
      out.push(makeSignal('PAYMENT_PULL', 'Asks for payment',
        WEIGHTS.PAYMENT_PULL, text, m.start, m.end, 'payment:' + m.text));
    }
  }

  // (c) "UPI ... pay/send/id", unless it's only a status message.
  for (const m of findAll(UPI_ACTION_RE, scan)) {
    if (isAdvisoryBefore(scan, m.start)) continue;
    const after = scan.substring(m.start, clamp(m.end + 30, 0, scan.length));
    const windowText = scan.substring(
      clamp(m.start - 48, 0, scan.length), clamp(m.end + 30, 0, scan.length));
    const asks = hasMatch(UPI_ASK_RE, windowText);
    if (!asks && hasMatch(UPI_STATUS_RE, after)) continue;
    out.push(makeSignal('PAYMENT_PULL', 'Asks for payment (UPI)',
      WEIGHTS.PAYMENT_PULL, text, m.start, m.end, 'upi:' + m.text));
  }
  return dedupe(out);
}

// ---------------------------------------------------------------------
// 9. CALLBACK — a phone number plus "call" words
// ---------------------------------------------------------------------

const CALL_CUE_RE = /\bcall\b|contact|helpline|customer\s*care|toll[\s-]?free|call\s+now|reach\s+us/i;

// 1800 toll-free, landline (011-23456789), 5+5 mobile, 10-digit mobile.
const PHONE_RE = /(?:\+91[\s-]?)?(?:1800[\s-]?\d{3,4}[\s-]?\d{3,4}|0\d{2,3}[\s-]?\d{6,8}|\d{5}[\s-]?\d{5}|\d{10})/;

export function detectCallback(text) {
  if (!hasMatch(CALL_CUE_RE, text)) return [];
  const out = [];
  for (const m of findAll(PHONE_RE, text)) {
    out.push(makeSignal('CALLBACK', 'Callback number',
      WEIGHTS.CALLBACK, text, m.start, m.end, 'callback:' + m.text));
  }
  return dedupe(out);
}

// ---------------------------------------------------------------------
// 10. IMPERSONATION — bank / govt / courier name (only WITH other signals)
// ---------------------------------------------------------------------

const IMPERSONATION_RE = /\bsbi\b|\bhdfc\b|\bicici\b|\baxis\b|\bkotak\b|\bpnb\b|\brbi\b|income\s*tax|india\s*post|courier|delivery|\bdhl\b|\bfedex\b|\bekart\b|\bdelhivery\b|\bbluedart\b|customs|\bpolice\b|\bcbi\b|\bkbc\b/i;

// A genuine "SBI" alert alone must NOT be flagged, so this detector
// only runs when another detector already found something.
export function detectImpersonation(text, otherSignalsFound) {
  if (!otherSignalsFound) return [];
  const masked = withoutUrls(text);
  const out = [];
  for (const m of findAll(IMPERSONATION_RE, masked)) {
    out.push(makeSignal('IMPERSONATION', 'Impersonates bank / govt / courier',
      WEIGHTS.IMPERSONATION, text, m.start, m.end,
      'brand:' + text.substring(m.start, m.end)));
  }
  return dedupe(out);
}

// ---------------------------------------------------------------------
// 11. REMOTE_ACCESS — screen-share / remote-control apps
// ---------------------------------------------------------------------

const REMOTE_RES = [
  /\banydesk\b/i,
  /\bteamviewer\b/i,
  /\brustdesk\b/i,
  /\bquicksupport\b/i,
  /screen\s*shar(e|ing)/i,
  /share\s+(?:your\s+|the\s+)?(?:\w+\s+){0,2}screen/i,
  /remote\s*(?:access|control|support|desktop|session|viewing|view)/i,
  /share\s+(?:your\s+)?display/i,
  /(install|download).{0,20}\bapk\b|\bapk\b.{0,20}(install|download)/i,
];

export function detectRemoteAccess(text) {
  const out = [];
  const scan = withoutUrls(text);
  for (const re of REMOTE_RES) {
    for (const m of findAll(re, scan)) {
      if (isAdvisoryBefore(scan, m.start)) continue;
      out.push(makeSignal('REMOTE_ACCESS', 'Remote-access / screen-share trap',
        WEIGHTS.REMOTE_ACCESS, text, m.start, m.end,
        'remote:' + text.substring(m.start, m.end)));
    }
  }
  return dedupe(out);
}

// ---------------------------------------------------------------------
// 12. JOB_LURE — part-time / task / earn-per-day job fraud
// ---------------------------------------------------------------------

// Weak job words: only count if the message also talks about jobs.
const JOB_ROLE_RE = /\b(?:freelance|typing|tutoring|surveys?|blog\s+writing|resume\s+writing|product\s+testing|package\s+forwarding|content\s+moderation|social\s+media\s+(?:manager|marketing|tasks?))\b/i;

const JOB_CONTEXT_RE = /\bjobs?\b|\bworks?\b|\bearn|\btasks?\b|hiring|vacancy|vacancies|apply|part[\s-]?time|from\s+home|per\s+(?:day|task|hour|post|article)|commission|register|salary|recruit|\bpay\b|\bjoin\b/i;

const JOB_RES = [
  /part[\s-]?time/i,
  /\bearn\b.{0,20}(rs\.?|₹|per day|\/|daily)/i,
  /\btask(?:s)?\b.{0,25}(commission|reward|pay|bonus|earn|daily|earning)/i,
  /(commission|reward)\s+per\s+task/i,
  /\btelegram\b/i,
  /\bdata\s+entry\b/i,
  /\bwork\s+from\s+home\b/i,
  /\bregistration\s+(?:fee|charges?)\b/i,
  /\bpay\b.{0,25}\bto\s+(?:start|register|join|begin|earn)\b/i,
  JOB_ROLE_RE,
  // "job" as recruitment, but never "job card" (a government document).
  /\bjobs?\b(?!\s+card\b)/i,
];

export function detectJobLure(text) {
  const out = [];
  const hidden = findAll(URL_RE, text).concat(findAll(UPI_RE, text));
  const scan = maskRanges(text, hidden);
  for (const re of JOB_RES) {
    for (const m of findAll(re, scan)) {
      if (re === JOB_ROLE_RE && !hasMatch(JOB_CONTEXT_RE, scan)) continue;
      out.push(makeSignal('JOB_LURE', 'Fake job / task lure',
        WEIGHTS.JOB_LURE, text, m.start, m.end,
        'job:' + text.substring(m.start, m.end)));
    }
  }
  return dedupe(out);
}

// ---------------------------------------------------------------------
// 13. DIGITAL_ARREST — fake police / CBI / customs threat
// ---------------------------------------------------------------------

const ARREST_RES = [
  /digital\s+arrest/i,
  /video\s*call.{0,50}(police|cbi|officer|customs|court|verify)/i,
  /(police|cbi|customs|officer|court).{0,50}video\s*call/i,
  /money\s+laundering/i,
  /(parcel|package|courier).{0,50}(drug|narcotic)/i,
  /(drug|narcotic).{0,50}(parcel|package)/i,
  /\barrest\s+warrant\b/i,
  /\b(?:police|cbi|ed)\s+complaint\b/i,
  /\bunder\s+investigation\b/i,
  /\b(?:cbi|police|cyber\s*crime|ed)\s+(?:investigation|probe|case)\b/i,
  /\bcriminal\s+list\b/i,
  /\bwatch\s*list\b/i,
  /linked\s+to\s+(?:a\s+)?(?:crime|crimina|fraud|fraudulent|illegal)/i,
  /\b(?:face|facing)\s+(?:an\s+)?(?:arrest|charges|action)\b/i,
  /wanted\s+by\s+(?:the\s+)?(?:police|cbi)/i,
  /\bcustoms\s+seized\b|\bseized\s+(?:your\s+)?(?:parcel|package)\b/i,
  /(?:income\s+tax|gst|police|cbi)\s+notice/i,
  /\bcybercrime\b/i,
  /police\s+(?:have\s+|has\s+)?(?:issued|registered|filed|arrested)/i,
];

// "Aadhaar" is only a threat word when police / crime words are nearby.
const AADHAAR_RE = /\baadhaar\b/i;
const ARREST_CONTEXT_RE = /crime|crimina|fraud|arrest|police|cbi|investigat|warrant|notice|customs|court|laundering|watch\s*list|illegal|narcotic|offence|offense/i;

export function detectDigitalArrest(text) {
  const out = [];
  const scan = withoutUrls(text);
  const contextOk = hasMatch(ARREST_CONTEXT_RE, scan);
  const patterns = ARREST_RES.slice();
  if (contextOk) patterns.push(AADHAAR_RE);
  for (const re of patterns) {
    for (const m of findAll(re, scan)) {
      out.push(makeSignal('DIGITAL_ARREST', 'Digital-arrest style threat',
        WEIGHTS.DIGITAL_ARREST, text, m.start, m.end,
        'arrest:' + text.substring(m.start, m.end)));
    }
  }
  return dedupe(out);
}

// ---------------------------------------------------------------------
// 14. THE MAIN FUNCTION — analyze(text)
// ---------------------------------------------------------------------

export function analyze(rawText) {
  const text = String(rawText || '').trim();
  if (text.length === 0) {
    return { verdict: 'SAFE', score: 0, signals: [], breakdown: {}, text: text };
  }

  // Step 1: run every detector.
  const links = detectLinks(text);
  const secrets = detectSecretRequest(text);
  const urgency = detectUrgency(text);
  const reward = detectReward(text);
  const payment = detectPaymentPull(text);
  const callback = detectCallback(text);
  const remote = detectRemoteAccess(text);
  const job = detectJobLure(text);
  const arrest = detectDigitalArrest(text);

  const othersFound = links.length + secrets.length + urgency.length +
    reward.length + payment.length + callback.length + remote.length +
    job.length + arrest.length > 0;
  const impersonation = detectImpersonation(text, othersFound);

  // Step 2: links add up per URL, but never more than 60 in total.
  let linkScore = 0;
  for (const l of links) linkScore += l.weight;
  if (linkScore > WEIGHTS.linkCap) linkScore = WEIGHTS.linkCap;

  let score = linkScore;
  const breakdown = {};
  if (linkScore > 0) breakdown.LINK_RISK = linkScore;

  // Step 3: every other signal type counts ONCE, however many times it
  // appears (but each appearance is still highlighted).
  function add(id, hits) {
    if (hits.length > 0) {
      score += WEIGHTS[id];
      breakdown[id] = WEIGHTS[id];
    }
  }
  add('SECRET_REQUEST', secrets);
  add('URGENCY_THREAT', urgency);
  add('REWARD_LURE', reward);
  add('PAYMENT_PULL', payment);
  add('CALLBACK', callback);
  add('REMOTE_ACCESS', remote);
  add('JOB_LURE', job);
  add('DIGITAL_ARREST', arrest);
  add('IMPERSONATION', impersonation);

  // Step 4: keep the score between 0 and 100.
  score = clamp(score, 0, 100);

  const signals = [].concat(links, secrets, urgency, reward, payment,
    callback, remote, job, arrest, impersonation);
  signals.sort((a, b) => a.start - b.start);

  // Step 5: if we found ANY scam pattern, never call it SAFE.
  if (signals.length > 0 && score < THRESHOLDS.suspicious) {
    score = THRESHOLDS.suspicious;
  }

  // Step 6: the DEMAND GATE.
  // DANGEROUS only if the message DEMANDS something (secret, remote
  // access, money, or a police threat) OR mixes a threat with a link /
  // lure. Otherwise the most it can be is SUSPICIOUS (score 59).
  const ids = new Set(signals.map((s) => s.id));
  const demand = ids.has('SECRET_REQUEST') || ids.has('REMOTE_ACCESS') ||
    ids.has('DIGITAL_ARREST') || ids.has('PAYMENT_PULL');
  const threatWithVector = ids.has('URGENCY_THREAT') &&
    (ids.has('LINK_RISK') || ids.has('REWARD_LURE') || ids.has('JOB_LURE'));
  if (!demand && !threatWithVector && score >= THRESHOLDS.dangerous) {
    score = THRESHOLDS.dangerous - 1;
  }

  // Step 7: score -> verdict.
  let verdict = 'SAFE';
  if (score >= THRESHOLDS.dangerous) {
    verdict = 'DANGEROUS';
  } else if (score >= THRESHOLDS.suspicious) {
    verdict = 'SUSPICIOUS';
  }

  return { verdict: verdict, score: score, signals: signals, breakdown: breakdown, text: text };
}

// ---------------------------------------------------------------------
// 15. EXPLANATIONS (English + Hindi) for each signal
// ---------------------------------------------------------------------

export const SIGNAL_INFO = {
  SECRET_REQUEST: { short: 'Asks for OTP / PIN', en: 'Asks for OTP / PIN / password. No real bank ever asks.', hi: 'OTP/PIN kabhi share na karein.' },
  PAYMENT_PULL: { short: 'Asks for money', en: 'Asks you to pay or send money.', hi: 'Paise bhejne ko keh raha hai.' },
  REMOTE_ACCESS: { short: 'Remote access / screen share', en: 'Asks you to install AnyDesk / share screen.', hi: 'Screen share ya app install na karein.' },
  DIGITAL_ARREST: { short: 'Fake police threat', en: 'Fake police / CBI threat. Police never arrest on video call.', hi: 'Video call par koi arrest nahi hota.' },
  URGENCY_THREAT: { short: 'Urgency / panic', en: 'Creates panic: "blocked", "24 hours".', hi: 'Darr aur jaldi — scam ka sign.' },
  REWARD_LURE: { short: 'Prize / cashback bait', en: 'Prize, lottery or cashback bait.', hi: 'Free inaam ka laalach.' },
  JOB_LURE: { short: 'Easy-money job', en: 'Easy-money job or task offer.', hi: 'Aasaan kamai wali naukri — fraud.' },
  LINK_RISK: { short: 'Suspicious link', en: 'Risky or fake-looking link.', hi: 'Link par click na karein.' },
  IMPERSONATION: { short: 'Pretends to be bank / govt', en: 'Pretends to be a bank, govt or courier.', hi: 'Bank/sarkar ka naam leke dhokha.' },
  CALLBACK: { short: 'Call-this-number push', en: 'Pushes you to call a number.', hi: 'Diye gaye number par call na karein.' },
};

// ---------------------------------------------------------------------
// 16. DEMO SAMPLES (from demo_samples.dart — do not edit the text,
//     the scores are tuned to these exact words)
// ---------------------------------------------------------------------

export const DEMO_SAMPLES = [
  {
    title: 'Fake KYC + OTP',
    expected: 'DANGEROUS',
    text: 'Dear Customer, your SBI Account KYC is expired and will be ' +
      'BLOCKED within 24 hours. Verify immediately at ' +
      'http://sbi-verify.xyz/kyc-update and share your OTP and ATM PIN ' +
      'to avoid suspension. Call 1800123456 for help.',
  },
  {
    title: 'Lottery fee lure',
    expected: 'DANGEROUS',
    text: 'Congratulations! You won KBC lottery Rs.25,00,000! You are a ' +
      'lucky winner. Claim your prize now — pay Rs.499 processing fee to ' +
      'winner-claim@okhdfcbank to receive your refund. Visit ' +
      'http://bit.ly/kbc-win2024 Hurry, offer ends today!',
  },
  {
    title: 'Courier borderline',
    expected: 'SUSPICIOUS',
    text: 'Hi, your courier package is waiting. Update your delivery address ' +
      'at https://delivery-update.com/track?id=12345 or call 9876543210 ' +
      'to confirm delivery.',
  },
  {
    title: 'Genuine bank alert',
    expected: 'SAFE',
    text: 'Dear customer, Rs.12,450 credited to your SBI A/c XX1234 on ' +
      '20-Sep. Avl bal Rs.54,210. -SBI',
  },
];
