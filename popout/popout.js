/**
 * popout.js: Handles the logic for the LegalEyes pop-out window.
 * - Loads analysis data passed from the main popup via local storage.
 * - Renders the summary and concerning clauses.
 * - Provides Copy-to-Clipboard and Save-as-TXT functionality within the popout window.
 * - Cleans up temporary storage data.
 */
document.addEventListener('DOMContentLoaded', function () {
    console.log("Popout script starting..."); // Log: Script start

    // --- Element Selections ---
    // Select all necessary elements from popout.html
    const summaryDiv = document.getElementById('popout-summary');
    const clausesDiv = document.getElementById('popout-clauses');
    const errorDiv = document.getElementById('popout-error');
    const actionButtonsDiv = document.getElementById('action-buttons');
    const copySummaryBtn = document.getElementById('copy-summary-btn');
    const copyClausesBtn = document.getElementById('copy-clauses-btn');
    const copyAllBtn = document.getElementById('copy-all-btn');
    const saveTxtBtn = document.getElementById('save-txt-btn');

    // --- Initial Validation ---
    // Verify essential display elements were found in popout.html
    if (!summaryDiv || !clausesDiv || !errorDiv || !actionButtonsDiv) {
        console.error("Popout Fatal Error: Could not find essential page elements (summary, clauses, error, actions). Aborting script.");
        // Attempt to display an error message even if some elements are missing
        const body = document.body;
        if (body) {
            body.innerHTML = '<p style="color: red; padding: 20px;">Error: Popout window failed to initialize correctly. Please close and try again.</p>';
        }
        return; // Stop script execution
    }
    console.log("Popout essential display elements found."); // Log: Elements found

    // --- State Variable ---
    /**
     * @type {object | null} Stores the analysis result loaded from storage.
     */
    let currentPopoutResult = null;

    // --- Helper Functions ---

    /**
     * Converts basic Markdown in a string to HTML.
     * Consistent with the version in popup.js.
     * @param {string} text - Input text.
     * @returns {string} - HTML converted string.
     */
    function convertMarkdownToHtml(text) {
        if (!text) return '';
        const lines = text.split('\n');
        const processedLines = lines.map(line => {
            let processedLine = line.trim();
            if (processedLine.startsWith('* ') || processedLine.startsWith('- ')) {
                processedLine = processedLine.substring(2);
            }
            processedLine = processedLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                        .replace(/__(.*?)__/g, '<strong>$1</strong>')
                                        .replace(/(?<!\*)\*([^\*]+)\*(?!\*)/g, '<em>$1</em>')
                                        .replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>')
                                        .replace(/`([^`]+?)`/g, '<code>$1</code>');
            return processedLine;
        });
        return processedLines.filter(line => line.length > 0).join('<br>');
    }

    /**
     * Converts an HTML string into formatted plain text.
     * Consistent with the version in popup.js.
     * @param {string} htmlString - HTML string to convert.
     * @returns {string} - Plain text representation.
     */
    function getPlainText(htmlString) {
        if (!htmlString) return "";
        try {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlString;
            tempDiv.querySelectorAll('br').forEach(br => br.replaceWith('\n')); // Handle <br>
            let text = tempDiv.textContent || "";
            return text.replace(/\n{3,}/g, '\n\n').trim(); // Clean up newlines
        } catch (e) {
            console.error("Error converting HTML to plain text:", e);
            return htmlString.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim(); // Basic fallback
        }
    }

    /**
     * Provides temporary visual feedback on a button.
     * Consistent with the version in popup.js.
     * @param {HTMLElement} buttonElement - The button to provide feedback on.
     * @param {string} [message="Copied!"] - Feedback message.
     */
    function showFeedback(buttonElement, message = "Copied!") {
        if (!buttonElement) {
            console.warn("showFeedback called on null button element");
            return;
        }
        const originalText = buttonElement.textContent;
        buttonElement.textContent = message;
        buttonElement.classList.add('copied-feedback'); // Assumes class exists in popup.css
        buttonElement.disabled = true;
        setTimeout(() => {
            // Check if button still exists in DOM before restoring
            if (document.body.contains(buttonElement)) {
                buttonElement.textContent = originalText;
                buttonElement.classList.remove('copied-feedback');
                buttonElement.disabled = false;
            }
        }, 1500);
    }

    // --- Action Button Handlers ---
    // These functions handle clicks on the Copy/Save buttons

    /** Handles "Copy Summary" button click */
    function copySummaryHandler() {
        console.log("Copy Summary clicked (popout)");
        if (currentPopoutResult?.summary) {
            navigator.clipboard.writeText(getPlainText(currentPopoutResult.summary))
                .then(() => showFeedback(copySummaryBtn))
                .catch(err => { console.error("Popout copy summary failed:", err); showFeedback(copySummaryBtn, "Error!"); });
        } else { console.warn("Popout: No summary data to copy."); }
    }

    /** Handles "Copy Clauses" button click */
    function copyClausesHandler() {
        console.log("Copy Clauses clicked (popout)");
        if (currentPopoutResult?.concerningClauses?.length > 0) {
            let text = "Concerning Clauses:\n\n";
            currentPopoutResult.concerningClauses.forEach(c => {
                text += `--- ${c.title || 'Untitled'} (Severity: ${c.severity || 'N/A'}, Category: ${c.category || 'N/A'}) ---\n${getPlainText(c.text || "")}\n\n`;
            });
            navigator.clipboard.writeText(text.trim())
                .then(() => showFeedback(copyClausesBtn))
                .catch(err => { console.error("Popout copy clauses failed:", err); showFeedback(copyClausesBtn, "Error!"); });
        } else { console.warn("Popout: No clause data to copy."); }
    }

    /** Handles "Copy All" button click */
     function copyAllHandler() {
        console.log("Copy All clicked (popout)");
         if (currentPopoutResult) {
            let text = "Summary:\n" + getPlainText(currentPopoutResult.summary || "Not available.") + "\n\n---\n\nConcerning Clauses:\n\n";
             if (currentPopoutResult.concerningClauses?.length > 0) {
                currentPopoutResult.concerningClauses.forEach(c => {
                    text += `--- ${c.title || 'Untitled'} (Severity: ${c.severity || 'N/A'}, Category: ${c.category || 'N/A'}) ---\n${getPlainText(c.text || "")}\n\n`;
                });
            } else { text += "No concerning clauses identified.\n"; }
             navigator.clipboard.writeText(text.trim())
                .then(() => showFeedback(copyAllBtn))
                .catch(err => { console.error("Popout copy all failed:", err); showFeedback(copyAllBtn, "Error!"); });
         } else { console.warn("Popout: No analysis data to copy all."); }
     }

     /** Handles "Save as TXT" button click */
     function saveTxtHandler() {
        console.log("Save TXT clicked (popout)");
         if (currentPopoutResult) {
             let text = "LegalEyes Analysis (Popout)\n=============================\n\nSummary:\n--------\n" + getPlainText(currentPopoutResult.summary || "Not available.") + "\n\n\nConcerning Clauses:\n---------------------\n";
              if (currentPopoutResult.concerningClauses?.length > 0) {
                currentPopoutResult.concerningClauses.forEach(c => {
                    text += `\n### ${c.title || 'Untitled'} ###\n(Severity: ${c.severity || 'N/A'}, Category: ${c.category || 'N/A'})\n\n${getPlainText(c.text || "")}\n---------------------\n`;
                });
            } else { text += "\nNo concerning clauses identified.\n"; }
              try {
                // Create a Blob and trigger download
                const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'legaleyes_analysis_popout.txt'; // Filename
                link.click(); // Trigger download
                URL.revokeObjectURL(link.href); // Clean up Blob URL
                console.log('Popout: Save as TXT initiated.');
             } catch (err) {
                 console.error("Popout save TXT failed:", err);
                 showFeedback(saveTxtBtn, "Error!");
             }
         } else { console.warn("Popout: No analysis data to save."); }
     }


    // --- Main Logic: Load Data and Render ---
    console.log("Attempting to load data from browser.storage.local..."); // Log: Start loading
    browser.storage.local.get('popoutData', function (result) {
        console.log("Storage.local.get callback executed."); // Log: Callback runs

        // Check for errors during storage access (important for callbacks)
        if (browser.runtime.lastError) {
            console.error("Popout Storage Error:", browser.runtime.lastError);
            errorDiv.textContent = `Error loading analysis data: ${browser.runtime.lastError.message}`;
            errorDiv.classList.remove('hidden');
            actionButtonsDiv.classList.add('hidden');
            return; // Stop processing
        }

        // Check if the expected data key exists in the result
        if (result && result.popoutData) {
            console.log("Popout data FOUND in storage."); // Log: Data Found
            currentPopoutResult = result.popoutData; // Store data for button handlers

            // --- Render Summary ---
            console.log("Rendering summary...");
            summaryDiv.innerHTML = currentPopoutResult.summary || '<p>Summary data missing or empty.</p>'; // Render or show fallback

            // --- Render Concerning Clauses ---
            console.log("Rendering concerning clauses...");
            // Log the raw clauses data for debugging rendering issues
            console.log("Clauses data from storage:", JSON.stringify(currentPopoutResult.concerningClauses, null, 2));

            if (currentPopoutResult.concerningClauses && currentPopoutResult.concerningClauses.length > 0) {
                let concerningHTML = ''; // Initialize empty string to build HTML
                currentPopoutResult.concerningClauses.forEach((clause, index) => {
                    // Log details for each clause being processed
                     console.log(`Processing Clause ${index + 1}:`, {
                        title: clause.title,
                        severity: clause.severity,
                        category: clause.category,
                        textExists: !!clause.text,
                        textPreview: clause.text ? clause.text.substring(0, 50) + "..." : "N/A"
                    });

                    // Defensive defaults in case data is malformed
                    const title = clause.title || 'Untitled Clause';
                    const text = clause.text || 'No details provided.'; // Check if this is empty in logs if rendering fails
                    const severity = clause.severity || 'medium';
                    const category = clause.category || 'general';

                    // Generate HTML structure for the clause item
                    try {
                        concerningHTML += `
                          <div class="concerning-item" data-category="${category}" data-severity="${severity}">
                            <div class="concerning-title">
                              <span>${title}</span>
                              <span class="severity-badge severity-${severity}">${severity}</span>
                            </div>
                            <div class="concerning-text">${text}</div>
                          </div>`;
                    } catch (htmlError) {
                         console.error(`Error generating HTML for clause ${index + 1}:`, htmlError, clause);
                    }
                }); // End forEach loop

                // Log the final generated HTML before assigning it
                console.log("Final concerningHTML generated (length " + concerningHTML.length + "):", concerningHTML.substring(0, 500) + "...");

                // Assign the generated HTML to the DOM element
                console.log("Assigning generated HTML to clausesDiv.innerHTML");
                clausesDiv.innerHTML = concerningHTML;
                 // Log the content *after* assignment to check if it stuck
                console.log("clausesDiv innerHTML after assignment (length " + clausesDiv.innerHTML.length + "):", clausesDiv.innerHTML.substring(0, 500) + "...");

                actionButtonsDiv.classList.remove('hidden'); // Show action buttons
                console.log(`${currentPopoutResult.concerningClauses.length} clauses rendering complete.`);

            } else {
                // Handle case where no concerning clauses exist in the data
                clausesDiv.textContent = "No concerning clauses were identified.";
                actionButtonsDiv.classList.add('hidden'); // Hide action buttons
                console.log("No concerning clauses found in data to render.");
            }

            // --- Add Event Listeners to Action Buttons ---
            console.log("Adding action button listeners...");
            // Add checks to ensure buttons exist before adding listeners
            if (copySummaryBtn) copySummaryBtn.addEventListener('click', copySummaryHandler);
            else console.warn("Copy Summary button not found in popout.");
            if (copyClausesBtn) copyClausesBtn.addEventListener('click', copyClausesHandler);
            else console.warn("Copy Clauses button not found in popout.");
            if (copyAllBtn) copyAllBtn.addEventListener('click', copyAllHandler);
            else console.warn("Copy All button not found in popout.");
            if (saveTxtBtn) saveTxtBtn.addEventListener('click', saveTxtHandler);
            else console.warn("Save TXT button not found in popout.");

            // --- Clean up temporary data from storage ---
            console.log("Attempting to remove popoutData from storage...");
            browser.storage.local.remove('popoutData', function() {
                if (browser.runtime.lastError) {
                    console.error("Error removing popout data from storage:", browser.runtime.lastError);
                } else {
                    console.log("Popout data successfully removed from storage.");
                }
            });

            errorDiv.classList.add('hidden'); // Ensure error div is hidden on success

        } else {
            // Handle case where 'popoutData' key was missing in storage result
            console.error("Popout data key ('popoutData') NOT FOUND in storage result.");
            summaryDiv.textContent = "Error: Analysis data not found.";
            clausesDiv.textContent = ""; // Clear placeholder
            errorDiv.textContent = "Could not load analysis data. It might not have been saved correctly. Please close this window and try popping out again.";
            errorDiv.classList.remove('hidden');
            actionButtonsDiv.classList.add('hidden'); // Hide actions
        }
    }); // End of browser.storage.local.get callback

}); // --- End of DOMContentLoaded Listener ---