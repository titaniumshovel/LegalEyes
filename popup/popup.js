/**
 * popup.js: Handles the logic for the LegalEyes browser extension popup.
 * - Initializes the popup UI.
 * - Checks for API key and handles context menu actions.
 * - Triggers T&C extraction from the content script.
 * - Sends extracted text to the Gemini AI for analysis.
 * - Parses the AI response (summary, concerning clauses, severity, category).
 * - Displays the results, including filtering options.
 * - Provides Copy-to-Clipboard and Save-as-TXT functionality.
 * - Handles popping out the results into a new window.
 */

// Import PDF.js (using dynamic import as it's an ES module)
let pdfjsLib = null;
const pdfjsWorkerSrc = browser.runtime.getURL("lib/pdfjs/pdf.worker.mjs"); // Get correct URL

/**
 * Dynamically loads the PDF.js library.
 * Ensures it's loaded only once.
 */
async function loadPdfJs() {
    if (!pdfjsLib) {
        try {
            console.log("Loading PDF.js library...");
            // Dynamically import the ES module
            const pdfjsModule = await import(browser.runtime.getURL("lib/pdfjs/pdf.mjs"));
            pdfjsLib = pdfjsModule; // Assign the module object

            // Configure the worker source (IMPORTANT!)
            // Check if pdfjsLib.GlobalWorkerOptions exists (might vary slightly by version)
            if (pdfjsLib.GlobalWorkerOptions) {
                 pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc;
                 console.log("PDF.js worker source configured:", pdfjsWorkerSrc);
            } else if (pdfjsLib.PDFWorker) { // Older versions might use this
                 pdfjsLib.PDFWorker.workerSrc = pdfjsWorkerSrc;
                 console.log("PDF.js worker source configured (legacy):", pdfjsWorkerSrc);
            } else {
                 console.warn("Could not find GlobalWorkerOptions or PDFWorker on pdfjsLib. Worker may not function correctly.", pdfjsLib);
            }
            console.log("PDF.js loaded successfully.");
        } catch (error) {
            console.error("Failed to load PDF.js library:", error);
            pdfjsLib = null; // Reset on failure
            throw new Error("Could not load PDF processing library."); // Re-throw
        }
    }
    return pdfjsLib;
}


/**
 * Fetches a PDF from a URL and extracts text content using PDF.js.
 * @param {string} pdfUrl - The URL of the PDF file.
 * @returns {Promise<string|null>} - A promise resolving with the extracted text or null on failure.
 */
async function getTextFromPdfUrl(pdfUrl) {
    console.log(`Fetching PDF from: ${pdfUrl}`);
    const pdfjs = await loadPdfJs(); // Ensure library is loaded
    if (!pdfjs) return null; // Exit if library failed to load

    try {
        // 1. Fetch the PDF data as an ArrayBuffer
        const response = await fetch(pdfUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const pdfData = await response.arrayBuffer();
        console.log(`PDF data fetched (${pdfData.byteLength} bytes)`);

        // 2. Load the PDF document using PDF.js
        console.log("Loading PDF document with PDF.js...");
        // Use getDocument method from the loaded module
        const loadingTask = pdfjs.getDocument({ data: pdfData });
        const pdfDocument = await loadingTask.promise;
        console.log(`PDF loaded (${pdfDocument.numPages} pages)`);

        // 3. Extract text from each page
        let fullText = "";
        for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
            try {
                const page = await pdfDocument.getPage(pageNum);
                const textContent = await page.getTextContent();
                // Concatenate text items, adding spaces/newlines appropriately
                let pageText = "";
                if (textContent && textContent.items) {
                    textContent.items.forEach((item, index) => {
                        pageText += item.str;
                        // Add a space if the next item isn't immediately adjacent horizontally (heuristic)
                        // Or simply add space after each item if simpler. Consider adding newline on transform[5] change.
                        if (index < textContent.items.length - 1) {
                           pageText += " "; // Simple space joining
                        }
                    });
                }
                // Add double newline between pages for separation
                fullText += pageText.trim() + "\n\n";
                 console.log(`Extracted text from page ${pageNum}`);
            } catch (pageError) {
                 console.error(`Error processing page ${pageNum}:`, pageError);
                 // Optionally add placeholder text or just skip the page
                 fullText += `[Error extracting text from page ${pageNum}]\n\n`;
            }
        }

        console.log("Finished extracting text from PDF.");
        return fullText.trim(); // Return all extracted text

    } catch (error) {
        console.error("Error fetching or parsing PDF:", error);
        throw new Error(`Failed to process PDF: ${error.message}`); // Re-throw for handler
    }
}


document.addEventListener('DOMContentLoaded', function() {
  // --- Element Selections ---
  const summarizeBtn = document.getElementById('summarize-btn');
  const loadingDiv = document.getElementById('loading');
  const resultsDiv = document.getElementById('results');
  const errorDiv = document.getElementById('error');
  const summaryDiv = document.getElementById('summary');
  const concerningClausesDiv = document.getElementById('concerning-clauses');
  const apiKeyMissingDiv = document.getElementById('api-key-missing');
  const mainContentDiv = document.getElementById('main-content');
  const openOptionsBtn = document.getElementById('open-options-btn');
  const actionButtonsDiv = document.getElementById('action-buttons');
  const copySummaryBtn = document.getElementById('copy-summary-btn');
  const copyClausesBtn = document.getElementById('copy-clauses-btn');
  const copyAllBtn = document.getElementById('copy-all-btn');
  const saveTxtBtn = document.getElementById('save-txt-btn');
  const popoutBtn = document.getElementById('popout-btn');

  /**
   * @type {object | null} Stores the latest analysis result from the AI.
   * Used by action buttons (copy/save/popout).
   */
  let currentAnalysisResult = null;

  console.log("Popup script loaded");

  // --- Initial Setup ---

  /**
   * Checks local storage on startup (for debugging).
   */
  browser.storage.local.get(['selectedText', 'contextMenuClicked'], function(result) {
    console.log("Initial storage check:", result);
  });

  /**
   * Checks if the API key is set. If not, shows a message prompting the user
   * to set it in the options page. If set, checks if the popup was opened
   * via the context menu to automatically process selected text.
   */
  browser.storage.local.get('apiKey', function(result) {
    console.log("API key check:", result.apiKey ? "Key exists" : "No key");
    if (!result.apiKey) {
      // API Key Missing - Show setup prompt
      if(apiKeyMissingDiv) apiKeyMissingDiv.classList.remove('hidden');
      if(mainContentDiv) mainContentDiv.classList.add('hidden');
    } else {
      // API Key Present - Check for context menu trigger
      browser.storage.local.get(['selectedText', 'contextMenuClicked'], async function(storageData) {
        if (storageData.selectedText && storageData.contextMenuClicked) {
          console.log("Processing text from context menu...");
          // Clear the flag immediately to prevent re-processing on subsequent popup opens
          browser.storage.local.remove('contextMenuClicked');
          // Process the text
          await processSelectedText(storageData.selectedText);
        }
      });
    }
  });

  // --- Event Listeners ---

  /**
   * Opens the extension's options page.
   */
  if (openOptionsBtn) {
    openOptionsBtn.addEventListener('click', function() {
      browser.runtime.openOptionsPage();
    });
  }

  /**
   * Handles the main "Summarize Terms & Conditions" button click.
   * Gets the active tab, sends a message to the content script to extract text,
   * processes the text with the AI, and displays the results.
   */
    // --- Summarize Button Listener (UPDATED) ---
    if (summarizeBtn) {
      summarizeBtn.addEventListener('click', async function() {
        console.log("Summarize button clicked");
        // Reset UI
        if(loadingDiv) loadingDiv.classList.remove('hidden');
        if(resultsDiv) resultsDiv.classList.add('hidden');
        if(errorDiv) errorDiv.classList.add('hidden');
        if(actionButtonsDiv) actionButtonsDiv.classList.add('hidden');
        currentAnalysisResult = null;
  
        try {
          const tabs = await browser.tabs.query({ active: true, currentWindow: true });
          if (!tabs || tabs.length === 0) { throw new Error("Could not find the active tab."); }
          const activeTab = tabs[0]; // Get the full tab object
          const activeTabId = activeTab.id;
          const activeTabUrl = activeTab.url;
          console.log("Active tab:", activeTabId, "URL:", activeTabUrl);
  
          // --- >>> PDF Detection Logic <<< ---
          let isPdf = false;
          if (activeTabUrl && activeTabUrl.toLowerCase().endsWith('.pdf')) {
              isPdf = true;
          }
          // More robust check (requires 'tabs' permission potentially for headers) - Optional for now
          // try {
          //     const headers = await browser.webRequest.getHeaders({ tabId: activeTabId, url: activeTabUrl });
          //     const contentTypeHeader = headers.responseHeaders.find(h => h.name.toLowerCase() === 'content-type');
          //     if (contentTypeHeader && contentTypeHeader.value.toLowerCase().includes('application/pdf')) {
          //         isPdf = true;
          //     }
          // } catch (headerError) { console.warn("Could not check headers:", headerError); }
  
          console.log("Is PDF?", isPdf);
  
          let extractedText = null;
  
          if (isPdf) {
              // --- Handle PDF ---
              console.log("Handling as PDF...");
              if (!activeTabUrl) throw new Error("PDF URL not found.");
              // Call a new function to fetch and parse the PDF
              extractedText = await getTextFromPdfUrl(activeTabUrl);
          } else {
              // --- Handle HTML (Existing Logic) ---
              console.log("Handling as HTML...");
              console.log("Sending extractTC message to content script");
              const response = await browser.tabs.sendMessage(activeTabId, { action: "extractTC" });
              console.log("Response from content script:", response);
  
              if (response && response.error) {
                  throw new Error(`Error during HTML extraction: ${response.error}`);
              }
              extractedText = response?.text; // Use the text from the content script
          }
          // --- >>> End of Branching Logic <<< ---
  
  
          // --- Process and Display (Common Logic) ---
          if (typeof extractedText === 'string' && extractedText.length > 100) {
            console.log(`Got text (length: ${extractedText.length}). Processing with AI...`);
            const result = await processWithAI(extractedText);
            displayResults(result, summaryDiv, concerningClausesDiv, resultsDiv);
          } else {
            console.log("No substantial text extracted from", isPdf ? "PDF" : "HTML page");
            throw new Error(`Couldn't find sufficient text content on the ${isPdf ? 'PDF' : 'page'}.`);
          }
  
        } catch (error) {
          // Catch errors from PDF handling, HTML handling, AI processing, etc.
          console.error("Error in summarizeBtn handler:", error);
          let userMessage = `An error occurred: ${error.message}`;
           if (error.message.includes("Could not establish connection")) {
             userMessage = "Could not connect to the HTML page content. Ensure the extension has permission and try reloading the page.";
           } else if (error.message.includes("Failed to fetch")) {
               userMessage = "Failed to download the PDF. Check the URL and network connection.";
           } else if (error.message.includes("PDF")) { // Keep PDF specific errors somewhat clear
               userMessage = `Error processing PDF: ${error.message}`;
           }
          if(errorDiv) {
              errorDiv.textContent = userMessage;
              errorDiv.classList.remove('hidden');
          }
          if(resultsDiv) resultsDiv.classList.add('hidden');
          if(actionButtonsDiv) actionButtonsDiv.classList.add('hidden');
  
        } finally {
          if(loadingDiv) loadingDiv.classList.add('hidden');
        }
      });
    }

  /**
   * Handles the "Pop Out" button click.
   * Stores the current analysis results in local storage temporarily,
   * then creates a new window/tab loading the dedicated popout HTML page.
   */
  if (popoutBtn) {
    popoutBtn.addEventListener('click', async function() { // Use async/await as it works now
      console.log("Popout button clicked.");
      if (currentAnalysisResult) {
        if(errorDiv) errorDiv.classList.add('hidden'); // Clear previous errors

        try {
          // 1. Store data temporarily
          await browser.storage.local.set({ popoutData: currentAnalysisResult });
          console.log("Analysis data stored for popout.");

          // 2. Get the full URL for the popout page
          const popoutUrl = browser.runtime.getURL("popout/popout.html");
          console.log("Resolved popout URL:", popoutUrl);

          // 3. Create the new window, passing URL directly
          console.log("Attempting to create popout window with direct URL...");
          let createdWindow = await browser.windows.create({
            url: popoutUrl, // Pass the URL directly
            type: "popup", // Use 'popup' for simpler window; 'normal' for full tab/window
            width: 700,
            height: 650
          });

          // Check if window creation was successful
          if (createdWindow) {
            console.log("Popout window CREATED successfully. ID:", createdWindow.id);
            // Briefly disable the button to prevent rapid clicks
            popoutBtn.disabled = true;
            setTimeout(() => { if(popoutBtn) popoutBtn.disabled = false; }, 2000);
          } else {
             // Should not happen if create doesn't throw, but good check
             console.error("browser.windows.create resolved but returned falsy value.");
             throw new Error("Window creation failed unexpectedly.");
          }
        } catch (error) {
          // Catch errors from storage.set or windows.create
          console.error(">>> ERROR caught during popout storage/window creation:", error);
          if(errorDiv) {
            errorDiv.textContent = `Error opening popout: ${error.message}`;
            errorDiv.classList.remove('hidden');
          }
          if(popoutBtn) popoutBtn.disabled = false; // Re-enable button on error
        }
      } else {
        // Handle case where there are no results to pop out
        console.warn("No analysis results available to pop out.");
        if(errorDiv) {
          errorDiv.textContent = "Please run an analysis first before popping out.";
          errorDiv.classList.remove('hidden');
          // Hide message after a delay
          setTimeout(()=> { if(errorDiv) errorDiv.classList.add('hidden');}, 3000);
        }
      }
    }); // End popoutBtn listener
  } // End if(popoutBtn)


  // --- Core Logic Functions ---

  /**
   * Processes text selected via the context menu.
   * @param {string} text - The selected text.
   */
  async function processSelectedText(text) {
    console.log("Processing selected text...");
    if(loadingDiv) loadingDiv.classList.remove('hidden');
    if(resultsDiv) resultsDiv.classList.add('hidden');
    if(errorDiv) errorDiv.classList.add('hidden');
    if(actionButtonsDiv) actionButtonsDiv.classList.add('hidden');
    currentAnalysisResult = null; // Clear previous result

    try {
      const result = await processWithAI(text);
      displayResults(result, summaryDiv, concerningClausesDiv, resultsDiv);
    } catch (error) {
      console.error("Error processing selected text:", error);
      if(errorDiv) {
        errorDiv.textContent = `Error processing selection: ${error.message}`;
        errorDiv.classList.remove('hidden');
      }
      if(resultsDiv) resultsDiv.classList.add('hidden');
    } finally {
      if(loadingDiv) loadingDiv.classList.add('hidden');
      // Clean up selectedText from storage
      browser.storage.local.remove('selectedText');
      console.log("Cleaned up selectedText from storage.");
    }
  }

  /**
   * Sends text to the Gemini AI API for analysis.
   * @param {string} text - The text to analyze (e.g., T&C content).
   * @returns {Promise<object>} - A promise that resolves with the parsed AI response.
   */
  async function processWithAI(text) {
    console.log("Processing with AI...");
    const storageResult = await browser.storage.local.get('apiKey');
    const apiKey = storageResult.apiKey;
    if (!apiKey) { throw new Error("API key not found. Please set it in options."); }

    // The detailed prompt including requests for Summary, Clauses, Severity, Category
    const prompt = `
Analyze the following Terms and Conditions text. Provide the output in two distinct sections exactly as labeled below:

**1. SUMMARY:**
Provide a concise summary of the key points in 5-7 bullet points. Focus on what the service does, what the user agrees to, and key permissions granted.

**2. CONCERNING CLAUSES:**
Identify and list clauses that could be concerning for a user. For each concerning clause:
  a. Provide a clear, descriptive title in bold (e.g., "**Unilateral Changes Without Notice**").
  b. Explain concisely *why* it's concerning, referencing potential impacts on user rights, privacy, or control.
  c. **Assign a Severity level:** (Low, Medium, High) based on the potential negative impact. Label it clearly (e.g., "Severity: High").
  d. **Assign a Category:** (Privacy, Data Usage, Legal Rights, Service Changes, User Content) based on the main topic. Label it clearly (e.g., "Category: Legal Rights").

Focus specifically on identifying language related to:
  *   Unilateral Changes ("reserve the right to", "without notice") -> Category: Service Changes
  *   Broad Company Discretion ("sole discretion") -> Category: Service Changes / Legal Rights
  *   Third-Party Data Sharing ("share your information with", "third-party partners") -> Category: Privacy / Data Usage
  *   Vague Language ("including but not limited to") -> Apply to relevant category
  *   Waiver of User Rights ("waive your right", "class action waiver") -> Category: Legal Rights
  *   Binding Arbitration ("binding arbitration") -> Category: Legal Rights
  *   Data Handling (Anonymized/Aggregated) ("anonymized data") -> Category: Data Usage / Privacy
  *   Implicit Acceptance ("continued use constitutes acceptance") -> Category: Service Changes
  *   User Content Licensing (broad licenses to user posts/photos) -> Category: User Content / Legal Rights
  *   Indemnification ("you agree to indemnify") -> Category: Legal Rights

Ensure the explanation, Severity, and Category are provided for each concerning clause. If no concerning clauses are found, state that explicitly under the "CONCERNING CLAUSES:" heading.

--- START OF TERMS AND CONDITIONS TEXT ---
${text.substring(0, 10000)}
--- END OF TERMS AND CONDITIONS TEXT ---
`;

    // Select the appropriate API model and endpoint
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    // const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${apiKey}`; // Alternative

    console.log("Calling API:", apiUrl.split('key=')[0] + 'key=...');

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
          // Consider adding safetySettings here if needed
        })
      });

      console.log("API response status:", response.status);

      // Robust error handling for non-OK HTTP responses
      if (!response.ok) {
        let errorMsg = `API request failed with status ${response.status}`;
        try {
          const errorText = await response.text();
          console.error("API error response body:", errorText);
          if (errorText) errorMsg += `: ${errorText}`;
        } catch (readError) {
          console.error("Could not read error response body:", readError);
          errorMsg += " (Could not read error body)";
        }
        throw new Error(errorMsg);
      }

      // Parse successful JSON response
      const data = await response.json();
      console.log("API response received (structure check):", data ? 'Data received' : 'No data');

      // Validate the expected structure of the successful response
      if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        console.error("Unexpected API response structure:", data);
        throw new Error("Received an unexpected response format from the AI service.");
      }
      const aiResponse = data.candidates[0].content.parts[0].text;
      console.log("Raw AI response:", aiResponse.substring(0, 200) + "..."); // Log truncated response

      // Parse the raw AI text into structured data
      const parsedResponse = parseAIResponse(aiResponse);
      return parsedResponse;

    } catch (error) {
      // Catch errors from fetch or JSON parsing
      console.error('Error inside processWithAI:', error);
      throw error; // Re-throw to allow calling function to handle UI updates
    }
  }

  /**
   * Parses the raw text response from the AI into a structured object.
   * @param {string} aiResponse - The raw text string from the Gemini API.
   * @returns {object} An object containing `summary` (string, HTML) and `concerningClauses` (array of objects).
   */
  function parseAIResponse(aiResponse) {
    console.log("Parsing AI response...");
    let summary = "<p>Summary could not be parsed.</p>"; // Default value
    let concerningClauses = [];

    try {
      // --- Summary Parsing ---
      // Regex to find the summary section between **SUMMARY:** and **CONCERNING CLAUSES:** (or end of string)
      const summaryMatch = aiResponse.match(/\*\*1\. SUMMARY:\*\*([\s\S]*?)(?=\*\*2\. CONCERNING CLAUSES:|$)/i);
      if (summaryMatch && summaryMatch[1]) {
        const summaryText = summaryMatch[1].trim();
        // Regex to find lines starting with '*' or '-' (list items)
        const bulletPoints = summaryText.match(/^[\*\-]\s+(.*)/gm);

        if (bulletPoints && bulletPoints.length > 0) {
          console.log("Found bullet points:", bulletPoints.length);
          // Process matched bullet points into clean HTML list items
          const formattedBullets = bulletPoints
            .map(bullet => bullet.replace(/^[\*\-]\s+/, '').trim()) // Remove marker
            .filter(bullet => bullet.length > 0) // Remove empty lines
            .map(bullet => convertMarkdownToHtml(bullet)); // Convert inner markdown

          if (formattedBullets.length > 0) {
            summary = '<ul>' + formattedBullets.map(bullet => `<li>${bullet}</li>`).join('') + '</ul>';
            console.log("Successfully parsed summary bullets.");
          } else {
            console.log("Formatted bullet points array was empty after processing.");
            summary = '<p>' + convertMarkdownToHtml(summaryText) + '</p>'; // Fallback to paragraph
          }
        } else {
          console.log("No bullet points matched in summary section. Using raw text.");
          summary = '<p>' + convertMarkdownToHtml(summaryText) + '</p>'; // Fallback to paragraph
        }
      } else {
        console.log("Summary section regex did not match.");
      }

      // --- Concerning Clauses Parsing ---
      // Regex to find the concerning clauses section after **CONCERNING CLAUSES:**
      const clausesMatch = aiResponse.match(/\*\*2\. CONCERNING CLAUSES:\*\*([\s\S]*)/i);
      if (clausesMatch && clausesMatch[1]) {
        const clausesText = clausesMatch[1].trim();
        // Split *before* a line that starts (^) with optional bullet/space and then **Title**. Use 'm' flag for multiline ^.
        const clauseBlocks = clausesText.split(/(?=^[\*\-]?\s*\*\*.*?\*\*)/m);
        
        console.log(`Found ${clauseBlocks.length} potential clause blocks after split.`); // Log count

        // Filter out any empty strings resulting from the split (e.g., if text started with a title)
        const validBlocks = clauseBlocks.filter(block => block.trim().length > 0);
        console.log(`Found ${validBlocks.length} *valid* clause blocks after filtering empty strings.`); // Log valid count

        for (const block of validBlocks) {
          const trimmedBlock = block.trim();
          if (!trimmedBlock) continue; // Skip empty blocks

          // Regex to extract title (handles optional leading list marker)
          const titleMatch = trimmedBlock.match(/^[\*\-]?\s*\*\*(.*?)\*\*/);
          const title = titleMatch ? titleMatch[1].trim() : null;

          // Regex to extract severity
          const severityMatch = trimmedBlock.match(/Severity:\s*(High|Medium|Low)/i);
          const severity = severityMatch ? severityMatch[1].toLowerCase() : 'medium'; // Default

          // Regex to extract category (handles potential space)
          const categoryMatch = trimmedBlock.match(/Category:\s*(Privacy|Data\sUsage|Legal\sRights|Service\sChanges|User\sContent)/i);
          const category = categoryMatch ? categoryMatch[1].replace(/\s+/g, '-').toLowerCase() : 'general'; // Default

          // Extract the explanation text: starts after title, ends before Severity/Category
          let textContent = trimmedBlock;
          if (titleMatch) {
             textContent = textContent.substring(textContent.indexOf(titleMatch[0]) + titleMatch[0].length);
          }

          // Find where to cut (before Severity or Category label)
          // Remove Severity line (case-insensitive, multiline)
          textContent = textContent.replace(/^\s*Severity:\s*(High|Medium|Low)\s*$/gim, '');
          // Remove Category line (case-insensitive, multiline)
          textContent = textContent.replace(/^\s*Category:\s*(Privacy|Data\sUsage|Legal\sRights|Service\sChanges|User\sContent)\s*$/gim, '');
          // Trim remaining whitespace (especially blank lines left by removal)
          const cleanedTextContent = textContent.trim();

          // Convert the CLEANED text content to HTML
          const text = convertMarkdownToHtml(cleanedTextContent); // Pass the cleaner version

          // Add to results only if both title and text seem valid
          if (title && text) {
            concerningClauses.push({ title, text, severity, category });
          } else {
             console.warn(`Skipped clause block. Title found: ${!!title}, Text is truthy: ${!!text}`, trimmedBlock.substring(0,60)+"...");
          }
        } // End for loop
        console.log(`Finished processing blocks. Parsed ${concerningClauses.length} concerning clauses.`);

        if (concerningClauses.length > 1) { // Only sort if there's more than one clause
          console.log("Sorting concerning clauses (High severity first)...");
          concerningClauses.sort((a, b) => {
              const severityA = a.severity || 'medium'; // Default to medium if missing
              const severityB = b.severity || 'medium';

              // Prioritize 'high'
              if (severityA === 'high' && severityB !== 'high') {
                  return -1; // a comes first
              }
              if (severityA !== 'high' && severityB === 'high') {
                  return 1; // b comes first
              }
              return 0;
            });
             console.log("Sorting complete.");
        }
      } else {
        console.log("Concerning clauses section regex did not match or section was empty.");
        // Double-check if the AI *explicitly* mentioned no clauses in the *entire* response
        // (This is less critical now, as the main check failed, but doesn't hurt)
        if (/No concerning clauses/i.test(aiResponse)) {
            console.log("AI response explicitly stated no concerning clauses.");
        }
      }
    } catch (parseError) {
        console.error("Error during parsing AI response:", parseError);
    }
    console.log("Returning parsed data:", { summary: summary.substring(0,50)+"...", concerningClausesCount: concerningClauses.length });
    return { summary, concerningClauses };
  } // End parseAIResponse

  /**
   * Updates the popup's DOM to display the analysis results.
   * @param {object} result - The parsed result object from parseAIResponse.
   * @param {HTMLElement} summaryDiv - The DOM element for the summary.
   * @param {HTMLElement} concerningClausesDiv - The DOM element for concerning clauses.
   * @param {HTMLElement} resultsDiv - The main container for results.
   */
  function displayResults(result, summaryDiv, concerningClausesDiv, resultsDiv) {
    console.log("Displaying results...");
    if (!result || !summaryDiv || !concerningClausesDiv || !resultsDiv) {
      console.error("displayResults: Invalid arguments provided.");
      // Attempt to show a generic error if elements exist
      if(errorDiv) {
          errorDiv.textContent = "Failed to display results due to an internal error.";
          errorDiv.classList.remove('hidden');
      }
      return;
    }

    // Store result globally for action buttons
    currentAnalysisResult = result;

    // Display Summary
    summaryDiv.innerHTML = result.summary || '<p>Summary could not be displayed.</p>';

    // Get references to filter/action containers
    const filterControlsElement = document.getElementById('filter-controls');
    const actionButtonsElement = document.getElementById('action-buttons'); // Renamed from actionButtonsDiv for clarity

    // Display Concerning Clauses
    if (result.concerningClauses && result.concerningClauses.length > 0) {
      let concerningHTML = '';
      result.concerningClauses.forEach(clause => {
        const title = clause.title || 'Untitled Clause';
        const text = clause.text || 'No details provided.';
        const severity = clause.severity || 'medium';
        const category = clause.category || 'general';
        // Generate HTML for each clause item
        concerningHTML += `
          <div class="concerning-item" data-category="${category}" data-severity="${severity}">
            <div class="concerning-title">
              <span>${title}</span>
              <span class="severity-badge severity-${severity}">${severity}</span>
            </div>
            <div class="concerning-text">${text}</div>
          </div>`;
      });
      concerningClausesDiv.innerHTML = concerningHTML; // Update DOM
      concerningClausesDiv.classList.remove('no-clauses-message', 'success-message');

      // Show filter and action button containers
      if (filterControlsElement) filterControlsElement.classList.remove('hidden');
      if (actionButtonsElement) actionButtonsElement.classList.remove('hidden');
      console.log(`Displayed ${result.concerningClauses.length} concerning clauses.`);

    } else {
      // NO Clauses found - Display a specific message
      concerningClausesDiv.innerHTML = '<p>No particularly concerning clauses were identified.</p>'; // Use innerHTML for paragraph
      // Add classes for styling
      concerningClausesDiv.classList.add('no-clauses-message', 'success-message'); // Add success class
      // Hide filter and action buttons
      if (filterControlsElement) filterControlsElement.classList.add('hidden');
      if (actionButtonsElement) actionButtonsElement.classList.add('hidden');
      console.log("No concerning clauses to display.");
    }

    // Show the main results container and hide loading/error messages
    resultsDiv.classList.remove('hidden');
    // Use top-level variables for efficiency
    if (loadingDiv) loadingDiv.classList.add('hidden');
    if (errorDiv) errorDiv.classList.add('hidden');

    console.log("Results displayed. Calling setupFiltering...");
    // Initialize filtering functionality now that clauses are in the DOM
    setupFiltering();
  }

  /**
   * Sets up event listeners for the filter buttons.
   * Should be called *after* concerning clause items are added to the DOM.
   */
  function setupFiltering() {
    console.log("Attempting to set up filtering...");
    // Re-select elements inside to ensure they exist after potential DOM updates
    const controlsElement = document.getElementById('filter-controls');
    const clausesContainerElement = document.getElementById('concerning-clauses');

    // Defensive checks
    if (!controlsElement) { console.error("setupFiltering: Could not find #filter-controls."); return; }
    if (!clausesContainerElement) { console.error("setupFiltering: Could not find #concerning-clauses."); return; }

    const filterButtons = controlsElement.querySelectorAll('.filter-btn');
    // Query for items *within the specific container*
    const concerningItems = clausesContainerElement.querySelectorAll('.concerning-item');

    console.log(`setupFiltering - Found ${filterButtons.length} filter buttons.`);
    console.log(`setupFiltering - Found ${concerningItems.length} concerning items.`);

    // Only proceed if there's something to filter and buttons to control it
    if (filterButtons.length === 0 || concerningItems.length === 0) {
      console.log("Skipping filter event listener setup (no buttons or items).");
      controlsElement.classList.add('hidden'); // Hide controls if useless
      return;
    }

    controlsElement.classList.remove('hidden'); // Ensure controls are visible

    // --- Event Listener Setup (using cloning to prevent duplicates) ---
    // Clone the controls container to easily remove previous listeners
    const newControlsElement = controlsElement.cloneNode(true);
    controlsElement.parentNode.replaceChild(newControlsElement, controlsElement);
    // Get fresh button references from the cloned container
    const freshFilterButtons = newControlsElement.querySelectorAll('.filter-btn');

    freshFilterButtons.forEach(button => {
        button.addEventListener('click', function() {
            const filterType = this.dataset.filter; // 'all', 'high', 'privacy', etc.
            console.log(`Filter button clicked: ${filterType}`);

            // Update active state on buttons
            freshFilterButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');

            // Apply filter logic to each clause item
            let itemsShown = 0;
            concerningItems.forEach(item => { // Iterate over the actual items in the DOM
                const itemCategory = item.dataset.category;
                const itemSeverity = item.dataset.severity;
                let showItem = false;

                // Determine if the item should be shown based on the filter type
                if (filterType === 'all') {
                    showItem = true;
                } else if (['high', 'medium', 'low'].includes(filterType)) { // Check for severity filter
                    if (itemSeverity === filterType) showItem = true;
                } else { // Assume category filter
                    if (itemCategory === filterType) showItem = true;
                }

                // Add/remove 'filtered-out' class to hide/show
                if (showItem) {
                    item.classList.remove('filtered-out');
                    itemsShown++;
                } else {
                    item.classList.add('filtered-out');
                }
            });
            console.log(`Filtering applied. ${itemsShown} items visible.`);
        });
    });

    // --- Set Initial Filter State ---
    // Find the 'All' button within the new controls element
    const allButton = newControlsElement.querySelector('.filter-btn[data-filter="all"]');
    if (allButton) {
      // Ensure only 'All' is active initially
      freshFilterButtons.forEach(btn => btn.classList.remove('active'));
      allButton.classList.add('active');
      console.log("'All' filter button set to active.");
    } else {
      console.warn("Could not find the 'All' filter button to set initial state.");
    }
    // Ensure all items are visible initially
    concerningItems.forEach(item => item.classList.remove('filtered-out'));

    console.log("Filtering setup complete.");
  }


  // --- Helper Functions ---

  /**
   * Converts basic Markdown formatting (bold, italics, code, lists) in a string to HTML.
   * @param {string} text - The input text possibly containing Markdown.
   * @returns {string} - The text converted to HTML.
   */
  function convertMarkdownToHtml(text) {
    if (!text) return '';
    // Process line by line to handle list markers before other markdown
    const lines = text.split('\n');
    const processedLines = lines.map(line => {
        let processedLine = line.trim();
        // Handle list items specifically first to avoid italic conversion of '*'
        if (processedLine.startsWith('* ') || processedLine.startsWith('- ')) {
            processedLine = processedLine.substring(2); // Remove marker
        }
        // Standard Markdown conversion
        processedLine = processedLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                    .replace(/__(.*?)__/g, '<strong>$1</strong>')
                                    // Use lookarounds to avoid italics interfering with bold
                                    .replace(/(?<![\*_])\*([^\*]+)\*(?![\*_])/g, '<em>$1</em>')
                                    .replace(/(?<![\*_])_([^_]+)_(?![\*_])/g, '<em>$1</em>')
                                    .replace(/`([^`]+?)`/g, '<code>$1</code>');
        return processedLine;
    });
    // Join lines back with <br>, filtering out potentially empty lines
    return processedLines.filter(line => line.length > 0).join('<br>');
  }

  /**
   * Converts an HTML string into plain text, preserving paragraphs.
   * @param {string} htmlString - The HTML string to convert.
   * @returns {string} - The plain text representation.
   */
  function getPlainText(htmlString) {
    if (!htmlString) return "";
    try {
        // Create a temporary element to parse HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;
        // Replace <br> tags with newline characters for better formatting
        tempDiv.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        let text = tempDiv.textContent || ""; // Extract text content
        // Clean up excessive whitespace and multiple newlines
        return text.replace(/\n{3,}/g, '\n\n').trim();
    } catch (e) {
        console.error("Error converting HTML to plain text:", e);
        // Basic fallback: strip all tags (less accurate formatting)
        return htmlString.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim();
    }
  }

  /**
   * Provides temporary visual feedback on a button after an action.
   * @param {HTMLElement} buttonElement - The button element.
   * @param {string} [message="Copied!"] - The feedback message.
   */
  function showFeedback(buttonElement, message = "Copied!") {
      if (!buttonElement) { console.warn("showFeedback: buttonElement is null"); return; }
      const originalText = buttonElement.textContent;
      buttonElement.textContent = message;
      buttonElement.classList.add('copied-feedback');
      buttonElement.disabled = true;
      // Restore button after a delay
      setTimeout(() => {
          // Check if button still exists in the DOM
          if (document.body.contains(buttonElement)) {
              buttonElement.textContent = originalText;
              buttonElement.classList.remove('copied-feedback');
              buttonElement.disabled = false;
          }
      }, 1500); // 1.5 seconds feedback duration
  }


  // --- Event Listeners for Action Buttons ---
  // Wrap each listener in a check to ensure the button exists

  if (copySummaryBtn) {
    copySummaryBtn.addEventListener('click', function() {
      console.log("Copy Summary clicked.");
      if (currentAnalysisResult?.summary) {
        const summaryText = getPlainText(currentAnalysisResult.summary);
        navigator.clipboard.writeText(summaryText)
          .then(() => showFeedback(copySummaryBtn))
          .catch(err => { console.error('Failed to copy summary: ', err); showFeedback(copySummaryBtn, "Error!"); });
      } else { console.warn("No summary data to copy."); }
    });
  } else { console.warn("Copy Summary button not found."); }

  if (copyClausesBtn) {
    copyClausesBtn.addEventListener('click', function() {
      console.log("Copy Clauses clicked.");
      if (currentAnalysisResult?.concerningClauses?.length > 0) {
        let clausesText = "Concerning Clauses:\n\n";
        currentAnalysisResult.concerningClauses.forEach(clause => {
            const plainClauseText = getPlainText(clause.text || "");
            clausesText += `--- ${clause.title || 'Untitled'} (Severity: ${clause.severity || 'N/A'}, Category: ${clause.category || 'N/A'}) ---\n`;
            clausesText += `${plainClauseText}\n\n`;
        });
        navigator.clipboard.writeText(clausesText.trim())
          .then(() => showFeedback(copyClausesBtn))
          .catch(err => { console.error('Failed to copy clauses: ', err); showFeedback(copyClausesBtn, "Error!"); });
      } else { console.warn("No concerning clauses data to copy."); }
    });
  } else { console.warn("Copy Clauses button not found."); }

  if (copyAllBtn) {
    copyAllBtn.addEventListener('click', function() {
      console.log("Copy All clicked.");
      if (currentAnalysisResult) {
        let allText = "Summary:\n";
        allText += getPlainText(currentAnalysisResult.summary || "Not available.");
        allText += "\n\n---\n\nConcerning Clauses:\n\n";
        if (currentAnalysisResult.concerningClauses?.length > 0) {
          currentAnalysisResult.concerningClauses.forEach(clause => {
              const plainClauseText = getPlainText(clause.text || "");
              allText += `--- ${clause.title || 'Untitled'} (Severity: ${clause.severity || 'N/A'}, Category: ${clause.category || 'N/A'}) ---\n`;
              allText += `${plainClauseText}\n\n`;
          });
        } else { allText += "No concerning clauses were identified.\n"; }
        navigator.clipboard.writeText(allText.trim())
          .then(() => showFeedback(copyAllBtn))
          .catch(err => { console.error('Failed to copy all content: ', err); showFeedback(copyAllBtn, "Error!"); });
      } else { console.warn("No analysis data to copy."); }
    });
  } else { console.warn("Copy All button not found."); }

  if (saveTxtBtn) {
    saveTxtBtn.addEventListener('click', function() {
      console.log("Save TXT clicked.");
      if (currentAnalysisResult) {
        // Prepare text content for the file
        let allText = "LegalEyes Analysis\n========================\n\nSummary:\n--------\n";
        allText += getPlainText(currentAnalysisResult.summary || "Not available.");
        allText += "\n\n\nConcerning Clauses:\n---------------------\n";
        if (currentAnalysisResult.concerningClauses?.length > 0) {
          currentAnalysisResult.concerningClauses.forEach(clause => {
              const plainClauseText = getPlainText(clause.text || "");
              allText += `\n### ${clause.title || 'Untitled'} ###\n`;
              allText += `(Severity: ${clause.severity || 'N/A'}, Category: ${clause.category || 'N/A'})\n\n`;
              allText += `${plainClauseText}\n`;
              allText += `---------------------\n`;
          });
        } else { allText += "\nNo concerning clauses were identified.\n"; }

        // Create and trigger download
        try {
          const blob = new Blob([allText], { type: 'text/plain;charset=utf-8' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = 'legaleyes_analysis.txt'; // Filename
          document.body.appendChild(link); // Required for Firefox
          link.click();
          document.body.removeChild(link); // Clean up link
          URL.revokeObjectURL(link.href); // Free memory
          console.log('Save as TXT initiated.');
        } catch (err) {
            console.error('Failed to save text file: ', err);
            showFeedback(saveTxtBtn, "Error!");
        }
      } else { console.warn("No analysis data to save."); }
    });
  } else { console.warn("Save TXT button not found."); }

}); // --- End of DOMContentLoaded ---