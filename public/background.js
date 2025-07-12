// QuickScribe Reader Mode Chrome Extension
// Background service worker

// Handle extension icon clicks
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // Check if we can inject scripts into this tab
    if (
      !tab.url ||
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://")
    ) {
      console.log("Cannot inject scripts into this tab type");
      return;
    }

    // Always inject scripts (activeTab-only model)
    try {
      // Inject CSS first
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["style.css"],
      });

      // Inject JavaScript files in correct order
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["purify.min.js", "readability.js", "content.js"],
      });

      // Send message to content script to activate reader mode
      setTimeout(async () => {
        try {
          const response = await chrome.tabs.sendMessage(tab.id, {
            action: "activateReader",
          });

          if (response && response.success) {
            console.log("Reader mode activated successfully");
          }
        } catch (retryError) {
          console.error(
            "Failed to activate reader mode after script injection:",
            retryError
          );
        }
      }, 100);
    } catch (injectionError) {
      console.error("Failed to inject content scripts:", injectionError);
    }
  } catch (error) {
    console.error("Error in extension activation:", error);
  }
});

// Handle installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("QuickScribe Reader Mode extension installed");
  }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log("QuickScribe Reader Mode extension started");
});
