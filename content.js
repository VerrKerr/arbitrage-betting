(() => {
  if (window.__arbCalculatorLoaded) {
    return;
  }

  window.__arbCalculatorLoaded = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "ARB_SCAN_VISIBLE_TEXT") {
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
