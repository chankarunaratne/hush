// QuickScribe Reader Mode Chrome Extension
// Main content script

class QuickScribeReader {
  constructor() {
    this.overlay = null;
    this.cachedContent = null;
    this.cachedSummary = null;
    this.isActive = false;
    this.apiUrl = "https://quickscribe-api.vercel.app/api/summarize";

    this.init();
  }

  init() {
    // Listen for extension icon clicks
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "activateReader") {
        this.activateReader();
        sendResponse({ success: true });
      }
    });
  }

  async activateReader() {
    if (this.isActive) {
      this.closeReader();
      return;
    }

    try {
      const content = await this.extractContent();
      if (!content || !content.text) {
        this.showError("No readable content found on this page.");
        return;
      }

      this.createOverlay(content);
      this.isActive = true;
    } catch (error) {
      console.error("Error activating reader mode:", error);
      this.showError("Failed to activate reader mode.");
    }
  }

  async extractContent() {
    // Check cache first
    if (this.cachedContent) {
      return this.cachedContent;
    }

    let content = null;

    // Try readability.js first
    try {
      if (typeof Readability !== "undefined") {
        const documentClone = document.cloneNode(true);
        const reader = new Readability(documentClone);
        const article = reader.parse();

        if (
          article &&
          article.textContent &&
          article.textContent.trim().length > 100
        ) {
          content = {
            title: article.title || document.title,
            text: article.textContent,
            excerpt: article.excerpt,
            byline: article.byline,
          };
        }
      }
    } catch (error) {
      console.warn("Readability.js extraction failed:", error);
    }

    // Fallback to article element
    if (!content) {
      const articleElement = document.querySelector("article");
      if (articleElement && articleElement.textContent.trim().length > 100) {
        content = {
          title: document.title,
          text: articleElement.textContent,
          excerpt: "",
          byline: "",
        };
      }
    }

    // Last resort: use body text
    if (!content) {
      const bodyText = document.body.textContent;
      if (bodyText && bodyText.trim().length > 100) {
        content = {
          title: document.title,
          text: bodyText,
          excerpt: "",
          byline: "",
        };
      }
    }

    // Cache the content
    if (content) {
      this.cachedContent = content;
    }

    return content;
  }

  createOverlay(content) {
    // Remove existing overlay if any
    if (this.overlay) {
      document.body.removeChild(this.overlay);
    }

    // Create overlay container
    this.overlay = document.createElement("div");
    this.overlay.className = "quickscribe-reader-overlay";

    // --- NEW NAVBAR START ---
    const navbar = document.createElement("nav");
    navbar.className = "qs-navbar";
    navbar.setAttribute("role", "navigation");

    // Logo
    const logo = document.createElement("img");
    logo.src = chrome.runtime.getURL("assets/logo.png");
    logo.alt = "QuickScribe Logo";
    logo.className = "qs-navbar-logo";

    // Right controls container
    const navControls = document.createElement("div");
    navControls.className = "qs-navbar-controls";

    // Summarize with AI button
    const summaryBtn = document.createElement("button");
    summaryBtn.className = "qs-btn qs-btn-primary";
    summaryBtn.type = "button";
    summaryBtn.innerHTML = `
      <span class="qs-btn-icon" aria-hidden="true">
        <img src="${chrome.runtime.getURL(
          "assets/summary-icon.svg"
        )}" alt="Summarize" class="qs-btn-svg" />
      </span>
      <span class="qs-btn-label">Summarize with AI</span>
    `;
    summaryBtn.addEventListener("click", () => this.generateSummary());

    // Close reader button
    const closeBtn = document.createElement("button");
    closeBtn.className = "qs-btn qs-btn-secondary";
    closeBtn.type = "button";
    closeBtn.innerHTML = `
      <span class="qs-btn-icon" aria-hidden="true">
        <img src="${chrome.runtime.getURL(
          "assets/close-icon.svg"
        )}" alt="Close" class="qs-btn-svg" />
      </span>
      <span class="qs-btn-label">Close reader</span>
    `;
    closeBtn.addEventListener("click", () => this.closeReader());

    navControls.appendChild(summaryBtn);
    navControls.appendChild(closeBtn);

    navbar.appendChild(logo);
    navbar.appendChild(navControls);
    // --- NEW NAVBAR END ---

    // Create content area
    const contentArea = document.createElement("div");
    contentArea.className = "quickscribe-reader-content";

    const article = document.createElement("div");
    article.className = "quickscribe-article";

    // Format the content for better readability
    const formattedContent = this.formatContent(content.text);
    article.innerHTML = formattedContent;

    contentArea.appendChild(article);

    // Assemble overlay
    this.overlay.appendChild(navbar); // Use new navbar
    this.overlay.appendChild(contentArea);

    // Add to page
    document.body.appendChild(this.overlay);

    // Handle escape key
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        this.closeReader();
      }
    };
    document.addEventListener("keydown", handleEscape);
    this.overlay.dataset.escapeHandler = "true";
  }

  formatContent(text) {
    // Basic content formatting
    return text
      .replace(/\n\s*\n/g, "</p><p>") // Convert double line breaks to paragraphs
      .replace(/^/, "<p>") // Start with paragraph
      .replace(/$/, "</p>") // End with paragraph
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") // Bold
      .replace(/\*(.*?)\*/g, "<em>$1</em>"); // Italic
  }

  async generateSummary() {
    if (!this.cachedContent) {
      this.showError("No content available for summarization.");
      return;
    }

    // Check if we already have a cached summary
    if (this.cachedSummary) {
      this.displaySummary(this.cachedSummary);
      return;
    }

    const summaryBtn = this.overlay.querySelector(".qs-btn-primary");
    const iconSpan = summaryBtn.querySelector(".qs-btn-icon");
    const labelSpan = summaryBtn.querySelector(".qs-btn-label");
    const originalLabel = "Summarize with AI";

    // Show loading state
    summaryBtn.disabled = true;
    summaryBtn.classList.add("generating");
    // Hide icon, show spinner (optional)
    if (iconSpan) iconSpan.style.display = "none";
    labelSpan.textContent = "Generating";

    try {
      // Prepare content (limit to 4000 characters)
      const content = this.cachedContent.text.substring(0, 4000);

      // Create request body with additional metadata as suggested by CTO
      const requestBody = {
        content: content,
        title: this.cachedContent.title || document.title,
        author: this.cachedContent.byline || "Unknown",
      };

      console.log("Sending request to API:", requestBody);

      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      console.log("API Response status:", response.status);

      if (!response.ok) {
        throw new Error(
          `API request failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      console.log("API Response data:", data);

      if (!data.summary) {
        throw new Error("Invalid response from API - no summary field");
      }

      // Cache the summary
      this.cachedSummary = data;

      // Display the summary
      this.displaySummary(data);
    } catch (error) {
      console.error("Summary generation failed:", error);

      // More specific error messages
      if (error.name === "TypeError" && error.message.includes("fetch")) {
        this.showError("Network error. Please check your internet connection.");
      } else if (error.message.includes("API request failed")) {
        this.showError(`API error: ${error.message}`);
      } else {
        this.showError("Failed to generate summary. Please try again.");
      }
    } finally {
      // Restore button state and icon
      summaryBtn.disabled = false;
      summaryBtn.classList.remove("generating");
      if (iconSpan) iconSpan.style.display = "flex";
      labelSpan.textContent = originalLabel;
    }
  }

  displaySummary(summaryData) {
    const contentArea = this.overlay.querySelector(
      ".quickscribe-reader-content"
    );

    // Remove existing summary if any
    const existingSummary = contentArea.querySelector(".quickscribe-summary");
    if (existingSummary) {
      existingSummary.remove();
    }

    // Create summary section
    const summarySection = document.createElement("div");
    summarySection.className = "quickscribe-summary";

    const summaryTitle = document.createElement("h3");
    summaryTitle.textContent = "AI Summary";

    const summaryMeta = document.createElement("div");
    summaryMeta.className = "quickscribe-summary-meta";

    if (summaryData.title) {
      const titleSpan = document.createElement("span");
      titleSpan.innerHTML = `<strong>Title:</strong> ${summaryData.title}`;
      summaryMeta.appendChild(titleSpan);
    }

    if (summaryData.author) {
      const authorSpan = document.createElement("span");
      authorSpan.innerHTML = `<strong>Author:</strong> ${summaryData.author}`;
      summaryMeta.appendChild(authorSpan);
    }

    if (summaryData.datePublished) {
      const dateSpan = document.createElement("span");
      const date = new Date(summaryData.datePublished).toLocaleDateString();
      dateSpan.innerHTML = `<strong>Published:</strong> ${date}`;
      summaryMeta.appendChild(dateSpan);
    }

    if (summaryData.wordCount) {
      const wordSpan = document.createElement("span");
      wordSpan.innerHTML = `<strong>Words:</strong> ${summaryData.wordCount}`;
      summaryMeta.appendChild(wordSpan);
    }

    const summaryText = document.createElement("div");

    // Format bullet points nicely
    const lines = summaryData.summary.split("•").filter(Boolean);
    lines.forEach((line) => {
      const bullet = document.createElement("p");
      bullet.textContent = "• " + line.replace(/\*\*/g, "").trim();
      bullet.style.marginBottom = "8px";
      summaryText.appendChild(bullet);
    });

    summarySection.appendChild(summaryTitle);
    summarySection.appendChild(summaryMeta);
    summarySection.appendChild(summaryText);

    // Insert summary at the top of content area
    const article = contentArea.querySelector(".quickscribe-article");
    contentArea.insertBefore(summarySection, article);

    // Scroll to summary
    summarySection.scrollIntoView({ behavior: "smooth" });
  }

  showError(message) {
    // Create a simple error notification
    const errorDiv = document.createElement("div");
    errorDiv.className = "quickscribe-error";
    errorDiv.textContent = message;
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 2147483648;
      max-width: 300px;
      padding: 16px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
      border-radius: 6px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    `;

    document.body.appendChild(errorDiv);

    // Remove after 5 seconds
    setTimeout(() => {
      if (errorDiv.parentNode) {
        errorDiv.parentNode.removeChild(errorDiv);
      }
    }, 5000);
  }

  closeReader() {
    if (this.overlay && this.overlay.parentNode) {
      // Remove escape key handler
      if (this.overlay.dataset.escapeHandler) {
        document.removeEventListener("keydown", this.handleEscape);
      }

      document.body.removeChild(this.overlay);
      this.overlay = null;
    }

    this.isActive = false;
  }

  // Clean up on page navigation
  cleanup() {
    this.closeReader();
    this.cachedContent = null;
    this.cachedSummary = null;
  }
}

// Initialize the reader when the script loads
const reader = new QuickScribeReader();

// Clean up on page unload
window.addEventListener("beforeunload", () => {
  reader.cleanup();
});

// Listen for navigation events (for SPA support)
let currentUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    reader.cleanup();
  }
});

observer.observe(document, { subtree: true, childList: true });
