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

    // Send message to content script to activate reader mode
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "activateReader",
    });

    if (response && response.success) {
      console.log("Reader mode activated successfully");
    }
  } catch (error) {
    console.error("Error activating reader mode:", error);

    // If content script is not loaded, inject it manually
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["readability.js", "content.js"],
      });

      // Try sending message again
      setTimeout(async () => {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: "activateReader",
          });
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
