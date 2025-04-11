/**
 * Gets the text content of an element and its descendants,
 * excluding the content of <script> and <style> tags.
 * @param {Node} node The node to extract text from.
 * @returns {string} The filtered text content.
 */
function getTextContentWithoutScriptsStyles(node) {
  if (!node) return '';

  let text = '';
  // Create a clone to avoid modifying the original DOM while iterating (optional but safer)
  const clone = node.cloneNode(true);

  // Remove script and style elements from the clone
  clone.querySelectorAll('script, style').forEach(el => el.remove());

  // Use textContent on the cleaned clone
  text = clone.textContent || '';

  // Optional: Clean up excessive whitespace often left by removed elements
  return text.replace(/\s{2,}/g, ' ').trim();
}

async function getIframeContentWithTimeout(iframe, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timeout waiting for iframe content after ${timeoutMs}ms`));
    }, timeoutMs);

    iframe.addEventListener('load', () => {  // Listen for the 'load' event
      clearTimeout(timeoutId);
      try {
        if (iframe.contentDocument) {
          const frameContent = iframe.contentDocument.body.textContent;
          resolve(frameContent.trim());
        } else {
          reject(new Error("iframe.contentDocument is null"));
        }
      } catch (e) {
        reject(e); // Reject if there's an error accessing content
      }
    });

    // Check immediately if iframe is already loaded (in cache)
    if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
        iframe.dispatchEvent(new Event('load')); // Manually trigger the load event
    }
  });
}

async function extractTermsAndConditions() { // Make sure it's async if using await inside
  console.log("Attempting to extract Terms and Conditions");

  const possibleSelectors = [
    // Keep your specific selectors
    '#terms', '#terms-and-conditions', '#termsAndConditions', '#terms-of-service',
    '#termsOfService', '#tos', '#legal-terms', '#legalTerms', '#legal',
    '#privacy-policy', '#privacyPolicy', '#privacy',
    '#user-agreement', '#userAgreement', '#eula', '#license-agreement',
    '.terms', '.terms-and-conditions', '.termsAndConditions', '.terms-of-service',
    '.termsOfService', '.tos', '.legal-terms', '.legalTerms', '.legal',
    '.privacy-policy', '.privacyPolicy', '.privacy',
    '.user-agreement', '.userAgreement', '.eula', '.license-agreement',
    'article.terms', 'section.terms', 'div.terms', 'div.legal',
    'article.policy', 'section.policy', 'div.policy',
    // Maybe make these slightly more specific or move them lower priority
    // 'main', 'article', '.content-main', '.main-content',
    // '.page-content', '.site-content', '.document'
  ];

  const isLikelyTCPage = /terms|conditions|tos|legal|policy|agreement|privacy/i.test(document.title) ||
                          /terms|conditions|tos|legal|policy|agreement|privacy/i.test(window.location.href);

  // --- MODIFY: Use the helper function when getting text from selectors ---
  for (const selector of possibleSelectors) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        // *** USE HELPER FUNCTION HERE ***
        const elementText = getTextContentWithoutScriptsStyles(element);
        if (elementText.length > 500) { // Check length of *cleaned* text
          console.log(`Found T&C using selector: ${selector}`);
          return elementText;
        }
      }
    } catch (e) {
      // Skip selector errors
      continue;
    }
  }

  const headingKeywords = ['terms', 'conditions', 'terms of service', 'terms of use',
                           'tos', 'legal', 'agreement', 'privacy policy', 'policy',
                           'user agreement', 'eula', 'license'];

  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  for (const heading of headings) {
    const headingText = heading.textContent.toLowerCase();
    if (headingKeywords.some(keyword => headingText.includes(keyword))) {
      // --- MODIFY: Use helper for parent check and sibling collection ---
      const parentElement = heading.parentElement;
      if (parentElement) {
          // *** USE HELPER FUNCTION FOR PARENT CHECK ***
          const parentContent = getTextContentWithoutScriptsStyles(parentElement);
          if (parentContent.length > 1000 &&
              parentContent.length < 100000 && // Avoid massive pages
              parentContent.includes(heading.textContent)) { // Check if heading is still present after cleaning
              console.log(`Found T&C using heading parent: ${heading.textContent}`);
              return parentContent;
          }
      }


      let content = '';
      let currentElement = heading.nextElementSibling;
      let collectedLength = 0; // Track collected length separately

      while (currentElement &&
             !currentElement.tagName.match(/^H[1-6]$/) &&
             collectedLength < 100000) { // Limit iterations

        // *** SKIP SCRIPT/STYLE TAGS EXPLICITLY ***
        if (currentElement.tagName !== 'SCRIPT' && currentElement.tagName !== 'STYLE') {
             // *** USE HELPER FUNCTION FOR SIBLING CONTENT ***
            const siblingText = getTextContentWithoutScriptsStyles(currentElement);
            content += siblingText + '\n\n'; // Add paragraph breaks
            collectedLength += siblingText.length;
        }
        currentElement = currentElement.nextElementSibling;
      }

      content = content.trim(); // Trim final result
      if (content.length > 500) { // Check length of *cleaned* text
        console.log(`Found T&C collecting siblings after heading: ${heading.textContent}`);
        return content;
      }
    }
  }

  // --- Iframe handling (Needs async function) ---
  // Make sure getIframeContentWithTimeout also cleans the text or use the helper after getting it
  const iframes = document.querySelectorAll('iframe');
  for (const iframe of iframes) {
    try {
      const timeoutMs = 3000;
      const frameContentRaw = await getIframeContentWithTimeout(iframe, timeoutMs); // Assuming this returns raw text
      // *** CLEAN IFRAME CONTENT ***
      const frameContentClean = frameContentRaw.replace(/\s{2,}/g, ' ').trim(); // Basic clean, or use a more complex cleaner if needed
      if (frameContentClean.length > 1000 && isLikelyTCPage) {
         console.log(`Found T&C in iframe: ${iframe.src || 'inline iframe'}`);
        return frameContentClean;
      }
    } catch (e) {
      console.warn(`Error extracting iframe content: ${e.message}`);
      continue;
    }
  }


  // --- MODIFY: Largest text block logic ---
  // This part is complex. A simpler approach might be better,
  // but if keeping it, ensure it ignores script/style content.
  // The current TreeWalker might need adjustment, or apply getTextContentWithoutScriptsStyles
  // to the 'bestContainer'.

  if (isLikelyTCPage) {
       // Simplified fallback: Try common content containers first
       const commonContainers = ['main', 'article', '#content', '.content', '.main-content', '.entry-content'];
       for (const selector of commonContainers) {
           const container = document.querySelector(selector);
           if (container) {
               const containerText = getTextContentWithoutScriptsStyles(container);
               if (containerText.length > 1000) { // Adjust length threshold as needed
                   console.log(`Found T&C using common container fallback: ${selector}`);
                   return containerText;
               }
           }
       }


       // --- MODIFY: Last Resort - Use the helper function on the body ---
       console.log("Using last resort: getTextContentWithoutScriptsStyles(document.body)");
       const bodyText = getTextContentWithoutScriptsStyles(document.body);
       // Add a stricter length check for the body fallback to avoid grabbing tiny pages
       if (bodyText.length > 1500) {
           return bodyText;
       } else {
           console.log("Last resort (body text) was too short or empty after cleaning.");
       }
  }


  console.log("Could not find sufficiently long T&C content after cleaning.");
  return null; // Explicitly return null if nothing substantial is found
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Content Script] Message received:", message); // Log 1
  if (message.action === "extractTC") {
    console.log("[Content Script] Action 'extractTC' matched. Calling extractor..."); // Log 2
    extractTermsAndConditions().then(tcText => {
       console.log("[Content Script] Extractor finished. Sending response."); // Log 3a
       // ... (the existing log with substring check) ...
       if (typeof tcText === 'string' && tcText.length > 0) {
           console.log(`[Content Script] Extracted text: ${tcText.substring(0, 50)}...`);
       } else {
           console.log("[Content Script] Extracted text: null or empty");
       }
       sendResponse({ text: tcText });
    }).catch(error => {
        console.error("[Content Script] Error during T&C extraction:", error); // Log 3b
        sendResponse({ text: null, error: error.message });
    });
    console.log("[Content Script] Listener returning true (waiting for async response)."); // Log 4
    return true; // Required for async response
  } else {
    console.log("[Content Script] Received message with unknown action:", message.action); // Log 5
  }
  // If the action doesn't match, sendResponse is never called, which is expected,
  // but the popup would wait indefinitely. Ensure the action name is correct.
});