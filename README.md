# LegalEyes - AI-Powered T&C Summarizer

LegalEyes is a browser extension that helps you quickly understand long and complex Terms & Conditions documents, whether on web pages or in PDF files displayed in your browser. It uses Google's Gemini AI to provide a concise summary and flags potentially concerning clauses based on common patterns that might affect your rights or privacy.

NOTE: LegalEyes provides AI-generated analysis and is NOT a substitute for legal advice. Always review terms carefully and consult a legal professional if you have significant concerns.

## Features

*   AI Summarization: Get a bullet-point summary of key points from Terms & Conditions pages or PDF documents.
*   Concerning Clause Detection: Automatically flags clauses related to:
    *   Unilateral service changes
    *   Broad company discretion
    *   Third-party data sharing
    *   Waivers of user rights
    *   Binding arbitration
    *   Vague language
    *   And more...
*   Severity & Category: Concerning clauses are assigned a severity level (Low, Medium, High) and categorized (Privacy, Legal Rights, etc.), with High severity clauses prioritized in the display.
*   Filtering: Filter concerning clauses by severity or category.
*   PDF Scanning: Analyzes text content directly from PDF files opened in the browser.
*   Context Menu Integration: Right-click selected text on any page to summarize it directly.
*   Copy & Save: Easily copy the summary, clauses, or the entire analysis to your clipboard or save it as a `.txt` file.
*   Pop Out: Open the analysis results in a separate window for easier reading.

## How to Use

1.  Install the Extension: Follow the instructions for installing a temporary or development extension in Firefox.
2.  Set API Key:
    *   The first time you install, the Options page should open automatically.
    *   If not, right-click the LegalEyes icon (logo) in your toolbar and select "Options".
    *   You need a Google AI Gemini API Key. Get one for free at Google AI Studio (link provided on options page).
    *   Paste your API key into the input field on the Options page and click "Save".
    *   Security Note: (See Limitations below)
3.  Summarize a Page or PDF:
    *   Navigate to a webpage containing Terms & Conditions OR open a PDF file directly in Firefox.
    *   Click the LegalEyes icon (logo) in your toolbar.
    *   Click the "Summarize Terms & Conditions" button.
    *   The extension will attempt to find/extract the relevant text (from HTML or PDF), send it for analysis, and display the results.
4.  Summarize Selected Text (HTML Pages Only):
    *   Highlight any block of text on a standard webpage.
    *   Right-click the highlighted text.
    *   Select "Summarize Selected Text" from the context menu.
    *   The LegalEyes popup will open with the summary of the selected text.
5.  Interact with Results:
    *   If concerning clauses are found, use the filter buttons to narrow them down. High severity clauses appear first.
    *   If no concerning clauses are identified, a confirmation message will be shown.
    *   Use the Copy/Save buttons above the summary to export the analysis.
    *   Click the Pop Out button (the arrow symbol ⇗) in the header to view results in a new window.

## Limitations & Security Considerations

*   PDF Extraction Quality: While PDF scanning is supported, the accuracy of text extraction depends on the PDF structure. Complex layouts, columns, tables, or image-based PDFs (scans) may result in incomplete or poorly formatted text being sent for analysis. Encrypted or password-protected PDFs cannot be processed.
*   HTML Extraction Accuracy: Automatically finding the correct block of T&C text on diverse websites is challenging. The extension uses various methods, but may occasionally fail or extract the wrong content. Summarizing selected text is often more reliable for specific sections on HTML pages.
*   AI Analysis Quality: The summary and concerning clause identification are performed by an AI (Google Gemini). While powerful, AI can make mistakes, misinterpret nuances, or miss important details. This is not legal advice.
*   API Key Storage: Your Google AI Gemini API key is stored in your browser's local storage (`browser.storage.local`).
    *   Security Risk: Browser local storage is not designed for highly sensitive secrets. Other extensions or malware on your computer could potentially access it, although browser protections aim to mitigate this.
    *   Recommendation: Use an API key generated specifically for this extension. Monitor its usage via your Google AI Studio dashboard. Avoid using keys associated with paid quotas or sensitive projects if possible. Revoke the key if you suspect misuse.
*   API Costs: While Google AI Studio offers a free tier for Gemini, heavy usage could potentially exceed free limits and incur costs. Monitor your usage.