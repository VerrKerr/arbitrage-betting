const SCAN_MESSAGE = "ARB_SCAN_VISIBLE_TEXT";
const ODDS_MIN = 1.01;
const ODDS_MAX = 100;
const MAX_COMBINATIONS_TO_CHECK = 250000;
const MAX_ARBITRAGE_RESULTS = 50;
const MARKET_DISPLAY_ORDER = ["1x2"];
const ALLOWED_MARKET_DEFINITIONS = [
  {
    key: "1x2",
    title: "1x2 Odds",
    validSearchModes: [3],
    patterns: [
      /\b1\s*x\s*2\b/i,
      /\b3[-\s]?way\b/i,
      /\bfull\s*time\s*result\b/i,
      /\bmatch\s*result\b/i,
      /\bregular\s*time\s*result\b/i
    ]
  }
];
const RESTRICTED_MARKET_PATTERNS = [
  /\banytime\s+goal\s*scorer\b/i,
  /\banytime\s+goalscorer\b/i,
  /\bgoal\s*scorer\b/i,
  /\bgoalscorer\b/i,
  /\bhalf[-\s]?time\s*\/\s*full[-\s]?time\b/i,
  /\bhalf\s*time\s+full\s*time\b/i,
  /\bht\s*\/\s*ft\b/i,
  /\bhalf[-\s]?time\b/i,
  /\b1st\s*half\b/i,
  /\bfirst\s*half\b/i,
  /\bcorrect\s*score\b/i,
  /\b1st\s*half\s*correct\s*score\b/i,
  /\bfirst\s*half\s*correct\s*score\b/i,
  /\b1\s*x\s*2\s*(and|&|\+)\s*both\s*teams\s*to\s*score\b/i,
  /\b1\s*x\s*2\s*(and|&|\+)\s*btts\b/i,
  /\bboth\s*teams\s*to\s*score\b/i,
  /\bbtts\b/i,
  /\basian\s*handicap\b/i,
  /\basian\s*total\b/i,
  /\b1\s*x\s*2\s*\(?\s*1\s*up\s*\)?/i,
  /\b1\s*x\s*2\s*\(?\s*2\s*up\s*\)?/i,
  /\bdouble\s*chance\b/i,
  /\bdraw\s*no\s*bet\b/i,
  /\bdnb\b/i,
  /\b1x\b/i,
  /\bx2\b/i,
  /(^|\s)12(\s|$)/,
  /\bmatch\s*winner\b/i,
  /\bgame\s*winner\b/i,
  /\bmoney\s*line\b/i,
  /\bmoneyline\b/i,
  /\bover\s*\/\s*under\b/i,
  /\bover\s+under\b/i,
  /\btotals\b/i,
  /\btotal\s*(goals|points|runs|rounds|games|sets|maps)?\b/i,
  /\bhandicap\b/i,
  /\bspread\b/i,
  /\bplayer\b/i,
  /\bprops?\b/i,
  /\bshots?\b/i,
  /\bassists?\b/i,
  /\brebounds?\b/i,
  /\bcards?\b/i,
  /\bcorners?\b/i
];

const state = {
  mode: 3,
  detectedOdds: [],
  detectedGroups: [],
  scannedTabs: [],
  scanScope: "none",
  selectedOdds: [],
  arbitrageCandidates: []
};

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  bindEvents();
  renderAll();
});

function bindElements() {
  elements.scanButton = document.getElementById("scanButton");
  elements.scanTabsButton = document.getElementById("scanTabsButton");
  elements.calculateButton = document.getElementById("calculateButton");
  elements.findArbsButton = document.getElementById("findArbsButton");
  elements.resetButton = document.getElementById("resetButton");
  elements.mode2Button = document.getElementById("mode2Button");
  elements.mode3Button = document.getElementById("mode3Button");
  elements.scanStatus = document.getElementById("scanStatus");
  elements.detectedCount = document.getElementById("detectedCount");
  elements.sourceCount = document.getElementById("sourceCount");
  elements.selectionCount = document.getElementById("selectionCount");
  elements.detectedOdds = document.getElementById("detectedOdds");
  elements.selectedOdds = document.getElementById("selectedOdds");
  elements.totalAmount = document.getElementById("totalAmount");
  elements.errorMessage = document.getElementById("errorMessage");
  elements.results = document.getElementById("results");
}

function bindEvents() {
  elements.scanButton.addEventListener("click", scanCurrentTab);
  elements.scanTabsButton.addEventListener("click", scanOpenTabs);
  elements.calculateButton.addEventListener("click", calculate);
  elements.findArbsButton.addEventListener("click", findArbitrageCandidates);
  elements.resetButton.addEventListener("click", reset);
  elements.mode2Button.addEventListener("click", () => setMode(2));
  elements.mode3Button.addEventListener("click", () => setMode(3));
}

async function scanCurrentTab() {
  clearError();
  clearResults();
  setScanStatus("Scanning current tab...");
  setBusy(true);

  try {
    const tab = await getActiveTab();

    if (!tab || !tab.id) {
      throw new Error("No active tab found.");
    }

    if (!isHttpUrl(tab.url || "")) {
      throw new Error("Only http and https tabs can be scanned.");
    }

    await scanTabs([tab], "current");
  } catch (error) {
    setScanStatus("Scan failed.");
    showError(error.message || "Unable to scan this tab.");
  } finally {
    setBusy(false);
  }
}

async function scanOpenTabs() {
  clearError();
  clearResults();
  setScanStatus("Scanning open tabs in this window...");
  setBusy(true);

  try {
    const tabs = await getOpenHttpTabs();

    if (tabs.length === 0) {
      throw new Error("No open http or https tabs were found in this window.");
    }

    await scanTabs(tabs, "tabs");
  } catch (error) {
    setScanStatus("Scan failed.");
    showError(error.message || "Unable to scan open tabs.");
  } finally {
    setBusy(false);
  }
}

async function scanTabs(tabs, scope) {
  const scanResults = await Promise.all(tabs.map((tab, index) => scanOneTab(tab, index)));
  const successfulResults = scanResults.filter((result) => result.ok);
  const failedCount = scanResults.length - successfulResults.length;

  state.scannedTabs = successfulResults.map((result) => result.source);
  state.scanScope = scope;
  state.detectedGroups = mergeSourceGroups(successfulResults);
  state.detectedOdds = state.detectedGroups.flatMap((group) => group.odds);
  state.arbitrageCandidates = [];
  state.selectedOdds = state.selectedOdds.filter((selected) =>
    state.detectedOdds.some((odds) => odds.id === selected.id)
  );

  if (state.detectedOdds.length === 0) {
    const failureText = failedCount > 0 ? ` ${failedCount} tab(s) could not be scanned.` : "";
    setScanStatus(`No allowed decimal odds were detected.${failureText}`);
  } else {
    const groupText = state.detectedGroups.length === 1 ? "betting type" : "betting types";
    const sourceCount = getDistinctSourceCount(state.scannedTabs);
    const sourceText = sourceCount === 1 ? "source site" : "source sites";
    const failureText = failedCount > 0 ? ` ${failedCount} tab(s) could not be scanned.` : "";
    setScanStatus(`Detected ${state.detectedOdds.length} selections across ${state.detectedGroups.length} ${groupText} from ${sourceCount} ${sourceText} in ${state.scannedTabs.length} tab(s).${failureText}`);
  }

  renderAll();
}

async function scanOneTab(tab, index) {
  try {
    const response = await requestVisibleText(tab);

    if (!response || !response.ok) {
      throw new Error("The page did not return visible text.");
    }

    const url = response.url || tab.url || "";
    const source = createSourceFromTab(tab, url, index);
    const groups = addSourceToGroups(extractGroupedDecimalOdds(response.text || ""), source);

    return {
      ok: true,
      source,
      groups
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Unable to scan tab.",
      tab
    };
  }
}

async function requestVisibleText(tab) {
  try {
    const response = await sendMessageToTab(tab.id, { type: SCAN_MESSAGE });

    if (response && response.ok) {
      return response;
    }
  } catch (_initialError) {
    // Fall through and inject the content script below.
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"]
  });

  return sendMessageToTab(tab.id, { type: SCAN_MESSAGE });
}

function getActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(tabs[0]);
    });
  });
}

function getOpenHttpTabs() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(tabs.filter((tab) => isHttpUrl(tab.url || "")));
    });
  });
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(response);
    });
  });
}

function createSourceFromTab(tab, url, index) {
  const host = getHost(url);
  const name = getSourceName(host, tab.title || "");

  return {
    id: String(tab.id || index),
    order: index,
    name,
    shortName: getCompactSourceName(host, name),
    host,
    title: tab.title || host || `Tab ${index + 1}`,
    url
  };
}

function addSourceToGroups(groups, source) {
  return groups.map((group) => ({
    ...group,
    source,
    odds: group.odds.map((odds, oddsIndex) => ({
      ...odds,
      id: `${source.id}-${odds.id}`,
      outcomeRole: getOutcomeRole(group.key, odds, oddsIndex),
      sourceId: source.id,
      sourceOrder: source.order,
      sourceName: source.name,
      sourceShortName: source.shortName,
      sourceHost: source.host,
      sourceTitle: source.title,
      sourceUrl: source.url
    }))
  }));
}

function mergeSourceGroups(scanResults) {
  const merged = new Map();

  scanResults.forEach((result) => {
    result.groups.forEach((group) => {
      if (!merged.has(group.key)) {
        merged.set(group.key, {
          key: group.key,
          title: group.title,
          validSearchModes: group.validSearchModes,
          firstSeen: merged.size,
          odds: []
        });
      }

      merged.get(group.key).odds.push(...group.odds);
    });
  });

  return Array.from(merged.values())
    .map((group) => ({
      ...group,
      odds: group.odds.sort((a, b) => a.sourceOrder - b.sourceOrder || a.firstSeen - b.firstSeen)
    }))
    .filter((group) => group.odds.length > 0)
    .sort(sortMarketGroups)
    .map(({ firstSeen: _firstSeen, ...group }) => group);
}

function isHttpUrl(url) {
  return /^https?:\/\//i.test(url);
}

function getHost(url) {
  try {
    return new URL(url).hostname;
  } catch (_error) {
    return "";
  }
}

function getSourceName(host, title) {
  if (host) {
    return host.replace(/^www\./i, "");
  }

  return title || "Unknown source";
}

function getCompactSourceName(host, fallbackName) {
  const source = (host || fallbackName || "source").replace(/^www\./i, "");
  const parts = source.split(".").filter(Boolean);

  if (parts.length >= 2) {
    const publicSuffixes = new Set(["com", "co", "net", "org", "io", "app", "uk", "au", "sg", "us", "ca"]);
    const meaningfulParts = parts.filter((part) => !publicSuffixes.has(part.toLowerCase()));

    if (meaningfulParts.length > 0) {
      return truncateSourceLabel(meaningfulParts[meaningfulParts.length - 1]);
    }
  }

  return truncateSourceLabel(source);
}

function truncateSourceLabel(label) {
  return label.length > 14 ? `${label.slice(0, 12)}...` : label;
}

function getSourceKey(odds) {
  return odds.sourceHost || odds.sourceName || odds.sourceId || "current";
}

function getDistinctSourceCount(sources) {
  return new Set(sources.map((source) => source.host || source.name || source.id)).size;
}

function getOutcomeRole(marketKey, odds, oddsIndex) {
  const normalizedLabel = normalizeOutcomeKey(odds.outcomeLabel || "");

  if (marketKey === "1x2" || marketKey === "1x2-1up") {
    if (normalizedLabel === "draw") {
      return "draw";
    }

    return ["home", "draw", "away"][oddsIndex % 3];
  }

  if (marketKey === "draw-no-bet") {
    return ["home", "away"][oddsIndex % 2];
  }

  if (marketKey === "double-chance") {
    return ["home-draw", "home-away", "draw-away"][oddsIndex % 3];
  }

  return odds.outcomeKey || normalizedLabel || `outcome-${oddsIndex + 1}`;
}

function getOutcomeComboKey(odds) {
  return odds.outcomeRole || odds.outcomeKey;
}

function extractDecimalOdds(text) {
  return extractGroupedDecimalOdds(text).flatMap((group) => group.odds);
}

function extractGroupedDecimalOdds(text) {
  const groups = new Map();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let currentMarket = null;
  let currentMarketOddsCount = 0;
  let pendingLabels = [];
  let occurrenceIndex = 0;
  let suppressAllowedHeadingLinesRemaining = 0;
  let suppressedContentLinesRemaining = 0;

  lines.forEach((line) => {
    const marketState = detectMarketState(line);

    if (marketState.type === "restricted") {
      currentMarket = null;
      currentMarketOddsCount = 0;
      pendingLabels = [];
      suppressAllowedHeadingLinesRemaining = marketState.category === "half-time" ? 4 : 0;
      suppressedContentLinesRemaining = 0;
      return;
    }

    if (suppressedContentLinesRemaining > 0 && marketState.type !== "allowed") {
      suppressedContentLinesRemaining -= 1;
      currentMarket = null;
      currentMarketOddsCount = 0;
      pendingLabels = [];
      return;
    }

    if (marketState.type !== "allowed" && suppressAllowedHeadingLinesRemaining > 0) {
      suppressAllowedHeadingLinesRemaining -= 1;
    }

    if (marketState.type === "allowed") {
      if (suppressAllowedHeadingLinesRemaining > 0 && isGenericAllowedHeading(line)) {
        currentMarket = null;
        currentMarketOddsCount = 0;
        pendingLabels = [];
        suppressAllowedHeadingLinesRemaining = 0;
        suppressedContentLinesRemaining = getSuppressedContentLineCount(marketState.market.key);
        return;
      }

      suppressAllowedHeadingLinesRemaining = 0;
      suppressedContentLinesRemaining = 0;
      currentMarket = marketState.market;
      currentMarketOddsCount = 0;
      pendingLabels = [];
    }

    const odds = extractOddsFromText(line, pendingLabels, occurrenceIndex);
    occurrenceIndex += odds.length;

    if (!currentMarket) {
      return;
    }

    if (odds.length === 0 && marketState.type !== "allowed" && isPotentialOutcomeLabel(line)) {
      pendingLabels.push(line);
      pendingLabels = pendingLabels.slice(-6);
      return;
    }

    const remainingOdds = getMaxOddsForMarket(currentMarket.key) - currentMarketOddsCount;

    if (remainingOdds <= 0) {
      currentMarket = null;
      currentMarketOddsCount = 0;
      pendingLabels = [];
      return;
    }

    const oddsToAdd = odds.slice(0, remainingOdds);

    oddsToAdd.forEach((item) => {
      addOddsToGroup(groups, currentMarket, item);
    });

    currentMarketOddsCount += oddsToAdd.length;

    if (currentMarketOddsCount >= getMaxOddsForMarket(currentMarket.key)) {
      currentMarket = null;
      currentMarketOddsCount = 0;
      pendingLabels = [];
    }
  });

  return Array.from(groups.values())
    .map((group) => ({
      key: group.key,
      title: group.title,
      validSearchModes: group.validSearchModes,
      firstSeen: group.firstSeen,
      odds: Array.from(group.odds.values()).sort((a, b) => a.firstSeen - b.firstSeen)
    }))
    .filter((group) => group.odds.length > 0)
    .sort(sortMarketGroups)
    .map(({ firstSeen: _firstSeen, ...group }) => group);
}

function sortMarketGroups(a, b) {
  return getMarketDisplayIndex(a.key) - getMarketDisplayIndex(b.key) || a.firstSeen - b.firstSeen;
}

function getMarketDisplayIndex(key) {
  const index = MARKET_DISPLAY_ORDER.indexOf(key);

  return index >= 0 ? index : MARKET_DISPLAY_ORDER.length;
}

function detectMarketState(line) {
  const cleaned = line.replace(/\s+/g, " ").trim();

  if (!cleaned || cleaned.length > 120) {
    return { type: "none" };
  }

  const restrictedCategory = getRestrictedMarketCategory(cleaned);

  if (restrictedCategory) {
    return { type: "restricted", category: restrictedCategory };
  }

  const definition = ALLOWED_MARKET_DEFINITIONS.find((market) =>
    market.patterns.some((pattern) => pattern.test(cleaned))
  );

  if (!definition) {
    return { type: "none" };
  }

  return {
    type: "allowed",
    market: {
      key: definition.key,
      title: definition.title,
      validSearchModes: definition.validSearchModes
    }
  };
}

function getRestrictedMarketCategory(cleaned) {
  if (isHalfTimeMarketLine(cleaned)) {
    return isHalfTimeOneXTwoContext(cleaned) ? "half-time" : "restricted";
  }

  return RESTRICTED_MARKET_PATTERNS.some((pattern) => pattern.test(cleaned)) ? "restricted" : "";
}

function isHalfTimeMarketLine(cleaned) {
  return (
    /\bhalf[-\s]?time\b/i.test(cleaned) ||
    /\b1st\s*half\b/i.test(cleaned) ||
    /\bfirst\s*half\b/i.test(cleaned) ||
    /\bht\s*\/\s*ft\b/i.test(cleaned)
  );
}

function isHalfTimeOneXTwoContext(cleaned) {
  const normalized = cleaned.replace(/\s+/g, " ").trim();

  return (
    /^(?:\d+\s*\|\s*)?(?:half[-\s]?time|1st\s*half|first\s*half)$/i.test(normalized) ||
    /\b(?:half[-\s]?time|1st\s*half|first\s*half)\s+1\s*x\s*2\b/i.test(normalized) ||
    /\b1\s*x\s*2\s+(?:half[-\s]?time|1st\s*half|first\s*half)\b/i.test(normalized)
  );
}

function isGenericAllowedHeading(line) {
  const cleaned = line.replace(/\s+/g, " ").trim();

  return /^(1\s*x\s*2(\s*\(?\s*1\s*up\s*\)?)?|double\s*chance|draw\s*no\s*bet|dnb)$/i.test(cleaned);
}

function getSuppressedContentLineCount(marketKey) {
  return getMaxOddsForMarket(marketKey) * 2;
}

function getMaxOddsForMarket(marketKey) {
  return marketKey === "1x2" ? 3 : Number.POSITIVE_INFINITY;
}

function extractOddsFromText(text, pendingLabels = [], occurrenceIndexStart = 0) {
  const matches = [];
  const oddsRegex = /(^|[^\d.])(\d{1,3}\.\d{2})(?![\d.])/g;
  let match;
  let previousEnd = 0;

  while ((match = oddsRegex.exec(text)) !== null) {
    const oddsText = match[2];
    const index = match.index + match[1].length;
    const endIndex = index + oddsText.length;
    const value = Number(oddsText);

    if (!Number.isFinite(value) || value < ODDS_MIN || value > ODDS_MAX) {
      previousEnd = endIndex;
      continue;
    }

    if (isLikelyNonOdds(text, index, oddsText.length)) {
      previousEnd = endIndex;
      continue;
    }

    const inlineLabel = cleanOutcomeLabel(text.slice(previousEnd, index));
    const queuedLabel = inlineLabel ? "" : cleanOutcomeLabel(pendingLabels.shift() || "");
    const outcomeLabel = inlineLabel || queuedLabel || `Outcome ${occurrenceIndexStart + matches.length + 1}`;
    const outcomeInitials = initialsForOutcome(outcomeLabel);
    const key = value.toFixed(2);

    matches.push({
      value,
      label: key,
      count: 1,
      outcomeLabel,
      outcomeInitials,
      outcomeKey: normalizeOutcomeKey(outcomeLabel),
      firstSeen: occurrenceIndexStart + matches.length
    });

    previousEnd = endIndex;
  }

  return matches;
}

function cleanOutcomeLabel(rawLabel) {
  let label = rawLabel
    .replace(/\s+/g, " ")
    .replace(/[|•]/g, " ")
    .trim();

  const cleaners = [
    /\b1\s*x\s*2\s*\(?\s*1\s*up\s*\)?/ig,
    /\b1\s*x\s*2\b/ig,
    /\bfull\s*time\s*result\b/ig,
    /\bmatch\s*result\b/ig,
    /\bregular\s*time\s*result\b/ig,
    /\bdouble\s*chance\b/ig,
    /\bdraw\s*no\s*bet\b/ig,
    /\bdnb\b/ig,
    /\bodds?\b/ig
  ];

  cleaners.forEach((pattern) => {
    label = label.replace(pattern, " ");
  });

  label = label
    .replace(/\b(Home|Away)\s*[:.-]\s*/ig, "")
    .replace(/^[\s:;,./\\\-+]+|[\s:;,./\\\-+]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return label.length > 60 ? "" : label;
}

function isPotentialOutcomeLabel(line) {
  const label = cleanOutcomeLabel(line);

  if (!label || label.length < 2 || label.length > 60) {
    return false;
  }

  if (/\d{1,3}\.\d{2}/.test(label)) {
    return false;
  }

  return !/^(show more|show less|suspended|closed|live|cash out|locked|bet builder)$/i.test(label);
}

function initialsForOutcome(label) {
  const tokens = label
    .replace(/[+/]/g, " or ")
    .replace(/&/g, " and ")
    .match(/[A-Za-z0-9]+/g);

  if (!tokens || tokens.length === 0) {
    return "?";
  }

  return tokens
    .map((token) => {
      const lower = token.toLowerCase();

      if (lower === "or") {
        return "o";
      }

      if (lower === "and") {
        return "a";
      }

      return token.charAt(0).toUpperCase();
    })
    .join("");
}

function normalizeOutcomeKey(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function formatOddsSelection(odds, includeSource = false) {
  const selection = `${odds.outcomeInitials || "?"} : ${odds.label}`;

  if (!includeSource || !odds.sourceName) {
    return selection;
  }

  return `${selection} @ ${odds.sourceShortName || odds.sourceName}`;
}

function formatOutcomeName(item, fallbackIndex) {
  if (!item) {
    return String(fallbackIndex + 1);
  }

  return item.outcomeInitials || item.outcomeLabel || String(fallbackIndex + 1);
}

function addOddsToGroup(groups, market, odds) {
  const groupKey = market.key;

  if (!groups.has(groupKey)) {
    groups.set(groupKey, {
      key: groupKey,
      title: market.title,
      validSearchModes: market.validSearchModes,
      firstSeen: groups.size,
      odds: new Map()
    });
  }

  const group = groups.get(groupKey);
  const key = `${odds.outcomeKey}-${odds.value.toFixed(2)}`;
  const existing = group.odds.get(key);

  if (existing) {
    existing.count += odds.count;
    return;
  }

  group.odds.set(key, {
    id: `${groupKey}-${odds.firstSeen}`,
    value: odds.value,
    label: odds.label,
    count: odds.count,
    outcomeLabel: odds.outcomeLabel,
    outcomeInitials: odds.outcomeInitials,
    outcomeKey: odds.outcomeKey,
    firstSeen: odds.firstSeen,
    marketKey: groupKey,
    marketTitle: market.title,
    validSearchModes: market.validSearchModes
  });
}

function isLikelyNonOdds(text, startIndex, length) {
  const before = text.slice(Math.max(0, startIndex - 24), startIndex).toLowerCase();
  const after = text.slice(startIndex + length, startIndex + length + 24).toLowerCase();
  const immediateBefore = text.slice(Math.max(0, startIndex - 2), startIndex);
  const immediateAfter = text.slice(startIndex + length, startIndex + length + 2);
  const blockedBeforeLabels = /\b(balance|wallet|deposit|withdraw|cashier|bonus|currency|available|account|profit|loss|payout|usd|eur|gbp|cad|aud|sgd|btc|eth|usdt|ltc|doge|xrp)\b[\s:=-]*$/i;
  const blockedAfterLabels = /^[\s:=-]*\b(usd|eur|gbp|cad|aud|sgd|btc|eth|usdt|ltc|doge|xrp)\b/i;

  if (/[$€£¥₿]/.test(immediateBefore) || /[$€£¥₿%]/.test(immediateAfter)) {
    return true;
  }

  return blockedBeforeLabels.test(before) || blockedAfterLabels.test(after);
}

function setMode(nextMode) {
  state.mode = nextMode;

  if (state.selectedOdds.length > state.mode) {
    state.selectedOdds = state.selectedOdds.slice(0, state.mode);
  }

  state.arbitrageCandidates = [];
  clearError();
  clearResults();
  renderAll();
}

function toggleOddsSelection(oddsId) {
  clearError();
  clearResults();

  const existingIndex = state.selectedOdds.findIndex((selected) => selected.id === oddsId);

  if (existingIndex >= 0) {
    state.selectedOdds.splice(existingIndex, 1);
    renderAll();
    return;
  }

  if (state.selectedOdds.length >= state.mode) {
    showError(`Only ${state.mode} odds can be selected in ${state.mode}-way mode.`);
    return;
  }

  const detected = state.detectedOdds.find((odds) => odds.id === oddsId);

  if (!detected) {
    showError("That detected odd is no longer available.");
    return;
  }

  state.selectedOdds.push({
    id: detected.id,
    valueText: detected.label,
    outcomeLabel: detected.outcomeLabel || "",
    outcomeInitials: detected.outcomeInitials || "",
    outcomeKey: detected.outcomeKey || "",
    sourceName: detected.sourceName || "",
    sourceShortName: detected.sourceShortName || "",
    sourceId: detected.sourceId || "",
    marketTitle: detected.marketTitle || ""
  });

  renderAll();
}

function updateSelectedOdds(index, valueText) {
  clearError();
  clearResults();

  if (!state.selectedOdds[index]) {
    return;
  }

  state.selectedOdds[index].valueText = valueText;
}

function removeSelectedOdds(index) {
  clearError();
  clearResults();
  state.selectedOdds.splice(index, 1);
  renderAll();
}

function calculate() {
  clearError();
  clearResults();

  const totalAmount = Number(elements.totalAmount.value);
  const odds = state.selectedOdds.map((selected) => Number(selected.valueText));

  if (state.selectedOdds.length !== state.mode) {
    showError(`Select exactly ${state.mode} odds before calculating.`);
    return;
  }

  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    showError("Enter a total amount greater than 0.");
    return;
  }

  const invalidIndex = odds.findIndex((value) => !Number.isFinite(value) || value <= 1);

  if (invalidIndex >= 0) {
    showError(`Outcome ${invalidIndex + 1} needs decimal odds greater than 1.00.`);
    return;
  }

  renderResults(computeArbitrage(odds, totalAmount), state.selectedOdds);
}

function findArbitrageCandidates() {
  clearError();
  clearResults();

  const totalAmount = Number(elements.totalAmount.value);

  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    showError("Enter a total amount greater than 0 before searching combinations.");
    return;
  }

  if (state.detectedOdds.length < state.mode) {
    showError("Scan the page first, then choose 2-way or 3-way mode.");
    return;
  }

  const searchGroups = state.detectedGroups
    .map((group) => ({
      ...group,
      searchOdds: expandOddsForSearch(group.odds)
    }))
    .filter((group) =>
      Array.isArray(group.validSearchModes) &&
      group.validSearchModes.includes(state.mode) &&
      group.searchOdds.length >= state.mode
    );
  const combinationsToCheck = searchGroups.reduce(
    (sum, group) => sum + countCombinations(group.searchOdds.length, state.mode),
    0
  );

  if (combinationsToCheck === 0) {
    showError(`No allowed betting type is compatible with ${state.mode}-way search.`);
    return;
  }

  if (combinationsToCheck > MAX_COMBINATIONS_TO_CHECK) {
    showError(`Too many combinations (${combinationsToCheck.toLocaleString()}) to check safely. Scan a narrower market page.`);
    return;
  }

  const candidates = [];
  let combinationsChecked = 0;
  let eligibleCombinations = 0;

  searchGroups.forEach((group) => {
    forEachCombination(group.searchOdds, state.mode, (combo) => {
      combinationsChecked += 1;

      const outcomeKeys = new Set(combo.map(getOutcomeComboKey));

      if (outcomeKeys.size !== state.mode) {
        return;
      }

      const sourceKeys = new Set(combo.map(getSourceKey));

      if (state.scanScope === "tabs" && sourceKeys.size < 2) {
        return;
      }

      eligibleCombinations += 1;

      const oddsValues = combo.map((odds) => odds.value);
      const arbSum = calculateArbSum(oddsValues);

      if (arbSum >= 1) {
        return;
      }

      const calculation = computeArbitrage(oddsValues, totalAmount);

      candidates.push({
        groupKey: group.key,
        groupTitle: group.title,
        sourceCount: sourceKeys.size,
        odds: combo,
        calculation
      });
    });
  });

  candidates.sort((a, b) =>
    b.calculation.roi - a.calculation.roi ||
    a.calculation.totalImplied - b.calculation.totalImplied
  );

  state.arbitrageCandidates = candidates;
  renderArbitrageSearchResults(candidates, combinationsChecked, eligibleCombinations);
}

function calculateArbSum(odds) {
  return odds.reduce((sum, value) => sum + (1 / value), 0);
}

function computeArbitrage(odds, totalAmount) {
  const implied = odds.map((value) => 1 / value);
  const totalImplied = implied.reduce((sum, value) => sum + value, 0);
  const arbitrage = totalImplied < 1;
  const rawAmounts = implied.map((value) => totalAmount * (value / totalImplied));
  const displayedAmounts = allocateRoundedAmounts(rawAmounts, totalAmount);
  const returns = displayedAmounts.map((amount, index) => amount * odds[index]);
  const guaranteedReturn = Math.min(...returns);
  const roi = ((guaranteedReturn - totalAmount) / totalAmount) * 100;

  return {
    odds,
    implied,
    totalImplied,
    arbitrage,
    displayedAmounts,
    returns,
    guaranteedReturn,
    roi
  };
}

function expandOddsForSearch(oddsList) {
  return oddsList.map((odds) => ({
    ...odds,
    searchId: odds.id
  }));
}

function countCombinations(itemCount, chooseCount) {
  if (chooseCount > itemCount) {
    return 0;
  }

  if (chooseCount === 2) {
    return (itemCount * (itemCount - 1)) / 2;
  }

  if (chooseCount === 3) {
    return (itemCount * (itemCount - 1) * (itemCount - 2)) / 6;
  }

  return 0;
}

function forEachCombination(items, chooseCount, callback) {
  if (chooseCount === 2) {
    for (let first = 0; first < items.length - 1; first += 1) {
      for (let second = first + 1; second < items.length; second += 1) {
        callback([items[first], items[second]]);
      }
    }

    return;
  }

  if (chooseCount === 3) {
    for (let first = 0; first < items.length - 2; first += 1) {
      for (let second = first + 1; second < items.length - 1; second += 1) {
        for (let third = second + 1; third < items.length; third += 1) {
          callback([items[first], items[second], items[third]]);
        }
      }
    }
  }
}

function allocateRoundedAmounts(rawAmounts, totalAmount) {
  const totalCents = Math.round(totalAmount * 100);
  const cents = rawAmounts.map((amount) => Math.floor(amount * 100));
  let remainingCents = totalCents - cents.reduce((sum, value) => sum + value, 0);

  const order = rawAmounts
    .map((amount, index) => ({
      index,
      remainder: amount * 100 - Math.floor(amount * 100)
    }))
    .sort((a, b) => b.remainder - a.remainder);

  let cursor = 0;

  while (remainingCents > 0 && order.length > 0) {
    cents[order[cursor % order.length].index] += 1;
    remainingCents -= 1;
    cursor += 1;
  }

  return cents.map((value) => value / 100);
}

function renderAll() {
  renderMode();
  renderDetectedOdds();
  renderSelectedOdds();
}

function renderMode() {
  elements.mode2Button.classList.toggle("active", state.mode === 2);
  elements.mode3Button.classList.toggle("active", state.mode === 3);
  elements.selectionCount.textContent = `${state.selectedOdds.length} / ${state.mode}`;
}

function renderDetectedOdds() {
  elements.detectedCount.textContent = String(state.detectedOdds.length);
  const sourceCount = getDistinctSourceCount(state.scannedTabs);
  elements.sourceCount.textContent = `${sourceCount} ${sourceCount === 1 ? "source" : "sources"}`;
  elements.detectedOdds.replaceChildren();

  if (state.detectedOdds.length === 0) {
    elements.detectedOdds.className = "odds-grid empty-state";
    elements.detectedOdds.textContent = "Scan a page to detect 1x2 odds only.";
    return;
  }

  elements.detectedOdds.className = "detected-groups";

  state.detectedGroups.forEach((group) => {
    const section = document.createElement("section");
    section.className = "market-group";

    const header = document.createElement("div");
    header.className = "market-header";

    const title = document.createElement("h3");
    title.className = "market-title";
    title.textContent = group.title;

    const count = document.createElement("span");
    count.className = "market-count";
    count.textContent = `${group.odds.length} selections`;

    const grid = document.createElement("div");
    grid.className = "market-odds-grid";

    group.odds.forEach((odds) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "odds-chip";
      chip.classList.toggle("selected", state.selectedOdds.some((selected) => selected.id === odds.id));
      chip.dataset.oddsId = odds.id;
      chip.title = `${group.title}: ${odds.outcomeLabel} ${odds.label}${odds.sourceName ? ` @ ${odds.sourceName}` : ""}`;
      chip.addEventListener("click", () => toggleOddsSelection(odds.id));

      const benefactor = document.createElement("span");
      benefactor.className = "odds-benefactor";
      benefactor.textContent = odds.outcomeInitials || "?";

      const value = document.createElement("span");
      value.className = "odds-value";
      value.textContent = `: ${odds.label}`;

      const seenCount = document.createElement("span");
      seenCount.className = "odds-count";
      seenCount.textContent = odds.sourceShortName || odds.sourceName || (odds.count > 1 ? `${odds.count} seen` : "seen");
      seenCount.title = odds.sourceName || "";

      const selection = document.createElement("span");
      selection.className = "odds-selection";
      selection.append(benefactor, value);

      chip.append(selection, seenCount);
      grid.append(chip);
    });

    header.append(title, count);
    section.append(header, grid);
    elements.detectedOdds.append(section);
  });
}

function renderSelectedOdds() {
  elements.selectionCount.textContent = `${state.selectedOdds.length} / ${state.mode}`;
  elements.selectedOdds.replaceChildren();

  for (let index = 0; index < state.mode; index += 1) {
    const selected = state.selectedOdds[index];

    if (!selected) {
      const empty = document.createElement("div");
      empty.className = "selected-row empty";
      empty.textContent = `Outcome ${index + 1}: select an odd`;
      elements.selectedOdds.append(empty);
      continue;
    }

    const row = document.createElement("div");
    row.className = "selected-row";

    const label = document.createElement("label");
    label.className = "selected-label";
    label.htmlFor = `selected-odds-${index}`;
    label.textContent = selected.outcomeInitials || `Outcome ${index + 1}`;
    label.title = [selected.outcomeLabel || `Outcome ${index + 1}`, selected.sourceName].filter(Boolean).join(" @ ");

    const input = document.createElement("input");
    input.id = `selected-odds-${index}`;
    input.className = "number-input";
    input.type = "number";
    input.min = "1.01";
    input.max = "100";
    input.step = "0.01";
    input.inputMode = "decimal";
    input.value = selected.valueText;
    input.addEventListener("input", (event) => updateSelectedOdds(index, event.target.value));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-button";
    remove.title = `Remove outcome ${index + 1}`;
    remove.textContent = "x";
    remove.addEventListener("click", () => removeSelectedOdds(index));

    row.append(label, input, remove);
    elements.selectedOdds.append(row);
  }
}

function renderResults(result, outcomeItems = []) {
  const {
    odds,
    implied,
    totalImplied,
    arbitrage,
    displayedAmounts,
    returns,
    guaranteedReturn,
    roi
  } = result;

  elements.results.classList.remove("hidden");
  elements.results.replaceChildren();

  const banner = document.createElement("div");
  banner.className = `result-banner ${arbitrage ? "yes" : "no"}`;
  banner.innerHTML = `<span>Arbitrage</span><strong>${arbitrage ? "YES" : "NO"}</strong>`;
  elements.results.append(banner);

  const metrics = document.createElement("div");
  metrics.className = "result-grid";
  metrics.append(
    createMetric("Total implied", `${formatPercent(totalImplied)} (${totalImplied.toFixed(4)})`),
    createMetric("Guaranteed gross", formatMoney(guaranteedReturn)),
    createMetric("ROI", `${roi.toFixed(2)}%`),
    createMetric(
      "Selected odds",
      odds.map((value, index) => {
        const item = outcomeItems[index];
        return item ? `${formatOutcomeName(item, index)}:${value.toFixed(2)}` : value.toFixed(2);
      }).join(" / ")
    )
  );
  elements.results.append(metrics);

  const table = document.createElement("table");
  table.className = "result-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Outcome</th>
        <th>Odds</th>
        <th>Implied</th>
        <th>Amount</th>
        <th>Gross return</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");

  odds.forEach((value, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${formatOutcomeName(outcomeItems[index], index)}</td>
      <td>${value.toFixed(2)}</td>
      <td>${formatPercent(implied[index])}</td>
      <td>${formatMoney(displayedAmounts[index])}</td>
      <td>${formatMoney(returns[index])}</td>
    `;
    tbody.append(row);
  });

  elements.results.append(table);

  if (!arbitrage) {
    const warning = document.createElement("div");
    warning.className = "warning-box";
    warning.textContent = "Warning: no arbitrage exists with these odds. The calculated split may lock in a loss.";
    elements.results.append(warning);
  } else if (roi <= 0) {
    const warning = document.createElement("div");
    warning.className = "warning-box";
    warning.textContent = "Theoretical arbitrage exists, but rounded amounts remove the visible profit at this amount size.";
    elements.results.append(warning);
  }
}

function renderArbitrageSearchResults(candidates, combinationsChecked, eligibleCombinations) {
  const displayedCandidates = candidates.slice(0, MAX_ARBITRAGE_RESULTS);
  const bestCandidate = candidates[0];

  elements.results.classList.remove("hidden");
  elements.results.replaceChildren();

  const banner = document.createElement("div");
  banner.className = `result-banner ${candidates.length > 0 ? "yes" : "no"}`;

  const bannerLabel = document.createElement("span");
  bannerLabel.textContent = `${state.mode}-way arbitrage candidates`;

  const bannerValue = document.createElement("strong");
  bannerValue.textContent = String(candidates.length);

  banner.append(bannerLabel, bannerValue);
  elements.results.append(banner);

  const metrics = document.createElement("div");
  metrics.className = "result-grid";
  metrics.append(
    createMetric("Checked", combinationsChecked.toLocaleString()),
    createMetric("Eligible", eligibleCombinations.toLocaleString()),
    createMetric("Displayed", `${displayedCandidates.length} / ${candidates.length}`),
    createMetric("Best ROI", bestCandidate ? `${bestCandidate.calculation.roi.toFixed(2)}%` : "None")
  );
  elements.results.append(metrics);

  if (candidates.length === 0) {
    const empty = document.createElement("div");
    empty.className = "warning-box";
    empty.textContent = `No ${state.mode}-way combinations with arb_sum below 1 were found after the allowed-market, outcome, and source-site checks.`;
    elements.results.append(empty);
    return;
  }

  const warning = document.createElement("div");
  warning.className = "warning-box";
  warning.textContent = "These are math-only candidates where arb_sum is below 1. ROI uses rounded displayed amounts, so tiny totals can remove visible profit. Verify every candidate is from the exact same event, exact same market, and all required outcomes before using the amount split.";
  elements.results.append(warning);

  const list = document.createElement("div");
  list.className = "candidate-list";

  displayedCandidates.forEach((candidate, index) => {
    const card = document.createElement("article");
    card.className = "candidate-card";

    const header = document.createElement("div");
    header.className = "candidate-header";

    const title = document.createElement("h3");
    title.className = "candidate-title";
    title.textContent = `#${index + 1} ${candidate.groupTitle}`;

    const useButton = document.createElement("button");
    useButton.type = "button";
    useButton.className = "small-button";
    useButton.textContent = "Use";
    useButton.addEventListener("click", () => loadCandidate(index));

    header.append(title, useButton);

    const summary = document.createElement("div");
    summary.className = "candidate-summary";
    summary.append(
      createCandidateField("Selections", candidate.odds.map((odds) => formatOddsSelection(odds, true)).join(" / ")),
      createCandidateField("Implied", `${formatPercent(candidate.calculation.totalImplied)} (${candidate.calculation.totalImplied.toFixed(4)})`),
      createCandidateField("ROI", `${candidate.calculation.roi.toFixed(2)}%`),
      createCandidateField("Guaranteed gross", formatMoney(candidate.calculation.guaranteedReturn)),
      createCandidateField("Amount split", candidate.calculation.displayedAmounts.map((amount) => formatMoney(amount)).join(" / ")),
      createCandidateField("Gross returns", candidate.calculation.returns.map((grossReturn) => formatMoney(grossReturn)).join(" / "))
    );

    card.append(header, summary);
    list.append(card);
  });

  if (candidates.length > displayedCandidates.length) {
    const limitNote = document.createElement("div");
    limitNote.className = "warning-box";
    limitNote.textContent = `Showing the top ${MAX_ARBITRAGE_RESULTS} candidates by rounded ROI. Narrow the page or market if you need fewer candidates to review.`;
    list.append(limitNote);
  }

  elements.results.append(list);
}

function createCandidateField(label, value) {
  const field = document.createElement("div");
  field.className = "candidate-field";

  const labelNode = document.createElement("span");
  labelNode.className = "candidate-label";
  labelNode.textContent = label;

  const valueNode = document.createElement("span");
  valueNode.className = "candidate-value";
  valueNode.textContent = value;

  field.append(labelNode, valueNode);
  return field;
}

function loadCandidate(index) {
  const candidate = state.arbitrageCandidates[index];

  if (!candidate) {
    showError("That arbitrage candidate is no longer available.");
    return;
  }

  const totalAmount = Number(elements.totalAmount.value);

  state.selectedOdds = candidate.odds.map((odds, oddsIndex) => ({
    id: `candidate-${index}-${oddsIndex}-${odds.searchId || odds.id}`,
    valueText: odds.label,
    outcomeLabel: odds.outcomeLabel || "",
    outcomeInitials: odds.outcomeInitials || "",
    outcomeKey: odds.outcomeKey || "",
    sourceName: odds.sourceName || "",
    sourceShortName: odds.sourceShortName || "",
    sourceId: odds.sourceId || "",
    marketTitle: candidate.groupTitle
  }));

  clearError();
  renderAll();

  if (Number.isFinite(totalAmount) && totalAmount > 0) {
    renderResults(computeArbitrage(candidate.odds.map((odds) => odds.value), totalAmount), candidate.odds);
  }
}

function createMetric(label, value) {
  const metric = document.createElement("div");
  metric.className = "metric";

  const labelNode = document.createElement("span");
  labelNode.className = "metric-label";
  labelNode.textContent = label;

  const valueNode = document.createElement("span");
  valueNode.className = "metric-value";
  valueNode.textContent = value;

  metric.append(labelNode, valueNode);
  return metric;
}

function reset() {
  state.mode = 3;
  state.detectedOdds = [];
  state.detectedGroups = [];
  state.scannedTabs = [];
  state.scanScope = "none";
  state.selectedOdds = [];
  state.arbitrageCandidates = [];
  elements.totalAmount.value = "";
  setScanStatus("No scan yet.");
  clearError();
  clearResults();
  renderAll();
}

function setBusy(isBusy) {
  elements.scanButton.disabled = isBusy;
  elements.scanTabsButton.disabled = isBusy;
  elements.calculateButton.disabled = isBusy;
  elements.findArbsButton.disabled = isBusy;
}

function setScanStatus(message) {
  elements.scanStatus.textContent = message;
}

function showError(message) {
  elements.errorMessage.textContent = message;
}

function clearError() {
  elements.errorMessage.textContent = "";
}

function clearResults() {
  elements.results.classList.add("hidden");
  elements.results.replaceChildren();
}

function formatMoney(value) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatPercent(value) {
  return `${(value * 100).toFixed(2)}%`;
}
