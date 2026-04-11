/**
 * ApplyMate Background Service Worker
 * Handles badge updates and cross-tab messaging
 */

// Listen for form detection events from content script
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'FORM_DETECTED' && sender.tab) {
    // Show a green badge to indicate autofill is available
    chrome.action.setBadgeText({ text: '✓', tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981', tabId: sender.tab.id });
  }
});

// Clear badge when navigating away
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ text: '', tabId });
  }
});
