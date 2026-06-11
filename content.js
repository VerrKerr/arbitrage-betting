(() => {
  if (window.__stakeArbCalculatorLoaded) {
    return;
  }

  window.__stakeArbCalculatorLoaded = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "STAKE_ARB_SCAN_VISIBLE_TEXT") {
      return false;
    }

    const visibleText = document.body ? document.body.innerText || "" : "";

    sendResponse({
      ok: true,
      text: visibleText,
      url: window.location.href
    });

    return true;
  });
})();
