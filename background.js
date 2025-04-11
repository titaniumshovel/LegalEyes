// This script runs in the background
browser.runtime.onInstalled.addListener(() => {
  console.log('LegalEyes extension installed');
  
  // Create context menu item
  browser.contextMenus.create({
    id: "summarize-selection",
    title: "Summarize Selected Text",
    contexts: ["selection"]
  });
  
  // Check if API key is set
  browser.storage.local.get('apiKey', function(result) {
    if (!result.apiKey) {
      // Open the options page to prompt for API key
      browser.runtime.openOptionsPage();
    }
  });
});

// Handle context menu clicks
browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "summarize-selection" && info.selectionText) {
    console.log("Selected text:", info.selectionText.substring(0, 50) + "...");
    // Store the selected text
    browser.storage.local.set({ 
      selectedText: info.selectionText,
      contextMenuClicked: true
    });
    
    // Open the popup
    try {
      browser.action.openPopup();
    }
    catch (error) {
      console.error("Error opening popup:", error);
      // Fallback to opening the options page if popup fails
      browser.runtime.openOptionsPage();
    }
  }
});
