// QuickScribe Reader Mode Chrome Extension
// Main content script

class QuickScribeReader {
  constructor() {
    // Feature flags
    this.AI_SUMMARY_ENABLED = false; // Set to true to re-enable AI Summary feature

    this.overlay = null;
    this.cachedContent = null;
    this.cachedSummary = null;
    this.isActive = false;
    this.apiUrl = "https://quickscribe-api.vercel.app/api/summarize";

    this.init();
  }

  // --- What's New helpers ---
  async getExtensionVersion() {
    try {
      // MV3 content scripts can access chrome.runtime.getManifest
      const manifest = chrome.runtime.getManifest();
      return manifest && manifest.version ? manifest.version : "0";
    } catch (e) {
      return "0";
    }
  }

  async hasSeenWhatsNew(version) {
    try {
      const key = `qs_whatsnew_seen_${version}`;
      const data = await chrome.storage.local.get([key]);
      return Boolean(data[key]);
    } catch (e) {
      // Fallback to localStorage if storage API not available
      return localStorage.getItem(`qs_whatsnew_seen_${version}`) === "1";
    }
  }

  async markWhatsNewSeen(version) {
    const key = `qs_whatsnew_seen_${version}`;
    try {
      await chrome.storage.local.set({ [key]: true });
    } catch (e) {
      localStorage.setItem(key, "1");
    }
  }

  async showWhatsNewIfNeeded() {
    try {
      const version = await this.getExtensionVersion();
      const seen = await this.hasSeenWhatsNew(version);
      if (seen) return;
      this.renderWhatsNew(version);
    } catch (e) {
      // Silent fail
    }
  }

  renderWhatsNew(version) {
    if (!this.overlay) return;

    // Backdrop
    const backdrop = document.createElement("div");
    backdrop.className = "qs-whatsnew-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    // Allow closing by clicking outside the modal
    backdrop.addEventListener("click", async (e) => {
      if (e.target === backdrop) {
        await this.markWhatsNewSeen(version);
        backdrop.remove();
      }
    });

    // Modal
    const modal = document.createElement("div");
    modal.className = "qs-whatsnew";
    // Prevent clicks inside the modal from bubbling to backdrop
    modal.addEventListener("click", (e) => e.stopPropagation());

    const header = document.createElement("div");
    header.className = "qs-whatsnew__header";

    const title = document.createElement("h3");
    title.className = "qs-whatsnew__title";

    // Version-specific content - only show popup for explicitly defined versions
    if (version === "1.0.4") {
      title.textContent = "What's new on Hush ✨";
      header.appendChild(title);

      const body = document.createElement("div");
      body.className = "qs-whatsnew__body";

      // Add label element above the body copy
      const label = document.createElement("div");
      label.className = "qs-whatsnew__label";
      label.textContent = "Added Sepia mode! 🌅";

      // Body copy for 1.0.4
      body.textContent =
        "After many of you asked for this feature, we have now added Sepia as a theme. Simply click the new theme icon (paintbrush) and select Sepia.\n\nHope you like it. Keep the feedback coming!\n\nCheers,\nChan.";

      // Insert label before body content
      modal.appendChild(header);
      modal.appendChild(label);
      modal.appendChild(body);
    } else {
      // No fallback popup - only show for explicitly defined versions
      backdrop.remove();
      return;
    }

    const footer = document.createElement("div");
    footer.className = "qs-whatsnew__footer";

    const gotIt = document.createElement("button");
    gotIt.className = "qs-whatsnew__button qs-whatsnew__button--primary";
    gotIt.type = "button";
    gotIt.textContent = "Got it";
    gotIt.addEventListener("click", async () => {
      await this.markWhatsNewSeen(version);
      backdrop.remove();
    });

    footer.appendChild(gotIt);
    modal.appendChild(body);
    modal.appendChild(footer);
    backdrop.appendChild(modal);

    // Mount inside overlay so dark mode styles apply
    this.overlay.appendChild(backdrop);
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
            html: this.cleanArticleContent(article.content),
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
        const cleanedHtml = this.cleanArticleContent(articleElement.innerHTML);
        content = {
          title: document.title,
          text: articleElement.textContent,
          html: cleanedHtml,
          excerpt: "",
          byline: "",
        };
      }
    }

    // Enhanced fallback: try to find main content areas
    if (!content) {
      const contentSelectors = [
        'main[role="main"]',
        'div[role="main"]',
        ".main-content",
        ".article-content",
        ".post-content",
        ".entry-content",
        ".content",
        "main",
      ];

      for (const selector of contentSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim().length > 100) {
          const cleanedHtml = this.cleanArticleContent(element.innerHTML);
          content = {
            title: document.title,
            text: element.textContent,
            html: cleanedHtml,
            excerpt: "",
            byline: "",
          };
          break;
        }
      }
    }

    // Last resort: use body text but heavily filter it
    if (!content) {
      const bodyClone = document.body.cloneNode(true);
      const cleanedHtml = this.cleanArticleContent(bodyClone.innerHTML);
      if (cleanedHtml && cleanedHtml.trim().length > 100) {
        content = {
          title: document.title,
          text: bodyClone.textContent,
          html: cleanedHtml,
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

  cleanArticleContent(htmlString) {
    if (!htmlString) return htmlString;

    // Create a temporary div to manipulate the HTML
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = DOMPurify.sanitize(htmlString);

    // Remove navigation elements
    const navSelectors = [
      "nav",
      "header",
      "footer",
      "aside",
      ".nav",
      ".navbar",
      ".navigation",
      ".menu",
      ".header",
      ".footer",
      ".sidebar",
      ".aside",
      ".breadcrumb",
      ".breadcrumbs",
      ".social-share",
      ".share-buttons",
      ".author-bio",
      ".related-posts",
      ".comments",
      ".advertisement",
      ".ads",
      ".ad",
      '[role="navigation"]',
      '[role="banner"]',
      '[role="contentinfo"]',
    ];

    navSelectors.forEach((selector) => {
      const elements = tempDiv.querySelectorAll(selector);
      elements.forEach((el) => el.remove());
    });

    // Remove logo images and icons (but keep article images)
    const logoSelectors = [
      'img[alt*="logo" i]',
      'img[src*="logo" i]',
      'img[class*="logo" i]',
      'img[id*="logo" i]',
      ".logo img",
      ".brand img",
      ".site-logo img",
    ];

    logoSelectors.forEach((selector) => {
      const elements = tempDiv.querySelectorAll(selector);
      elements.forEach((el) => {
        // Additional check: remove if image is small (likely a logo/icon)
        if (el.width && el.height && (el.width < 150 || el.height < 150)) {
          el.remove();
        } else if (
          el.naturalWidth &&
          el.naturalHeight &&
          (el.naturalWidth < 150 || el.naturalHeight < 150)
        ) {
          el.remove();
        } else {
          el.remove(); // Remove all logo-related images
        }
      });
    });

    // Remove small images that are likely icons/logos
    const allImages = tempDiv.querySelectorAll("img");
    allImages.forEach((img) => {
      // Check if image has dimensions and is very small
      if (
        (img.width && img.height && img.width < 50 && img.height < 50) ||
        (img.naturalWidth &&
          img.naturalHeight &&
          img.naturalWidth < 50 &&
          img.naturalHeight < 50)
      ) {
        img.remove();
      }

      // Remove images with icon-related classes or attributes
      const iconPatterns = ["icon", "sprite", "bullet", "arrow", "social"];
      const imgClasses = (img.className || "").toLowerCase();
      const imgSrc = (img.src || "").toLowerCase();
      const imgAlt = (img.alt || "").toLowerCase();

      if (
        iconPatterns.some(
          (pattern) =>
            imgClasses.includes(pattern) ||
            imgSrc.includes(pattern) ||
            imgAlt.includes(pattern)
        )
      ) {
        img.remove();
      }
    });

    // Remove navigation links
    const linkSelectors = [
      'a[href="#"]',
      'a[href^="#"]',
      'a[href="/"]',
      'a[href^="/category"]',
      'a[href^="/tag"]',
      ".nav-link",
      ".menu-item a",
    ];

    linkSelectors.forEach((selector) => {
      const elements = tempDiv.querySelectorAll(selector);
      elements.forEach((el) => el.remove());
    });

    // Remove elements with common navigation class names
    const navClassSelectors = [
      ".skip-link",
      ".screen-reader-text",
      ".sr-only",
      ".visually-hidden",
    ];

    navClassSelectors.forEach((selector) => {
      const elements = tempDiv.querySelectorAll(selector);
      elements.forEach((el) => el.remove());
    });

    // Remove empty elements
    const emptyElements = tempDiv.querySelectorAll(
      "p:empty, div:empty, span:empty"
    );
    emptyElements.forEach((el) => el.remove());

    return tempDiv.innerHTML;
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

    // Conditionally create Summarize with AI button
    if (this.AI_SUMMARY_ENABLED) {
      // Summarize with AI button
      const summaryBtn = document.createElement("button");
      summaryBtn.className = "qs-btn qs-btn--primary";
      summaryBtn.type = "button";

      const summaryBtnIcon = document.createElement("span");
      summaryBtnIcon.className = "qs-btn__icon";
      summaryBtnIcon.setAttribute("aria-hidden", "true");

      const summaryBtnImg = document.createElement("img");
      summaryBtnImg.src = chrome.runtime.getURL("assets/summary-icon.svg");
      summaryBtnImg.alt = "Summarize";
      summaryBtnImg.className = "qs-btn__svg";

      summaryBtnIcon.appendChild(summaryBtnImg);

      const summaryBtnLabel = document.createElement("span");
      summaryBtnLabel.className = "qs-btn__label";
      summaryBtnLabel.textContent = "Summarize with AI";

      summaryBtn.appendChild(summaryBtnIcon);
      summaryBtn.appendChild(summaryBtnLabel);
      summaryBtn.addEventListener("click", () => this.generateSummary());

      navControls.appendChild(summaryBtn);
    }

    // --- Theme picker button ---
    const themePickerBtn = document.createElement("button");
    themePickerBtn.className = "qs-btn qs-btn--icon qs-btn--theme";
    themePickerBtn.type = "button";
    themePickerBtn.setAttribute("aria-label", "Choose theme");
    themePickerBtn.setAttribute("aria-haspopup", "menu");
    themePickerBtn.setAttribute("aria-expanded", "false");
    themePickerBtn.setAttribute("role", "button");

    const themePickerBtnIcon = document.createElement("span");
    themePickerBtnIcon.className = "qs-btn__icon";
    themePickerBtnIcon.setAttribute("aria-hidden", "true");

    const themePickerImg = document.createElement("img");
    themePickerImg.src = chrome.runtime.getURL("assets/theme-picker.svg");
    themePickerImg.alt = "Theme picker";
    themePickerImg.className = "qs-btn__svg";

    themePickerBtnIcon.appendChild(themePickerImg);
    themePickerBtn.appendChild(themePickerBtnIcon);
    themePickerBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleThemeDropdown(themePickerBtn);
    });

    // --- Feedback button (icon-only) ---
    const feedbackBtn = document.createElement("button");
    feedbackBtn.className = "qs-btn qs-btn--icon";
    feedbackBtn.type = "button";
    feedbackBtn.setAttribute("aria-label", "Open feedback");
    feedbackBtn.setAttribute("role", "button");

    const feedbackBtnIcon = document.createElement("span");
    feedbackBtnIcon.className = "qs-btn__icon";
    feedbackBtnIcon.setAttribute("aria-hidden", "true");

    const feedbackBtnImg = document.createElement("img");
    feedbackBtnImg.src = chrome.runtime.getURL("assets/feedback.svg");
    feedbackBtnImg.alt = "Feedback";
    feedbackBtnImg.className = "qs-btn__svg";

    feedbackBtnIcon.appendChild(feedbackBtnImg);
    feedbackBtn.appendChild(feedbackBtnIcon);
    feedbackBtn.addEventListener("click", () => {
      const subject = encodeURIComponent("Hush feedback");
      window.open(
        `mailto:chankarunaratne@gmail.com?subject=${subject}`,
        "_blank"
      );
    });

    // --- About button (icon-only) ---
    const aboutBtn = document.createElement("button");
    aboutBtn.className = "qs-btn qs-btn--icon";
    aboutBtn.type = "button";
    aboutBtn.setAttribute("aria-label", "Open About page");
    aboutBtn.setAttribute("role", "button");

    const aboutBtnIcon = document.createElement("span");
    aboutBtnIcon.className = "qs-btn__icon";
    aboutBtnIcon.setAttribute("aria-hidden", "true");

    const aboutBtnImg = document.createElement("img");
    aboutBtnImg.src = chrome.runtime.getURL("assets/heart.svg");
    aboutBtnImg.alt = "About";
    aboutBtnImg.className = "qs-btn__svg";

    aboutBtnIcon.appendChild(aboutBtnImg);
    aboutBtn.appendChild(aboutBtnIcon);
    aboutBtn.addEventListener("click", () => {
      const url = chrome.runtime.getURL("about.html");
      window.open(url, "_blank");
    });

    // Close reader button
    const closeBtn = document.createElement("button");
    closeBtn.className = "qs-btn qs-btn--icon";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close reader");
    closeBtn.setAttribute("role", "button");

    const closeBtnIcon = document.createElement("span");
    closeBtnIcon.className = "qs-btn__icon";
    closeBtnIcon.setAttribute("aria-hidden", "true");

    const closeBtnImg = document.createElement("img");
    closeBtnImg.src = chrome.runtime.getURL("assets/close-icon.svg");
    closeBtnImg.alt = "Close";
    closeBtnImg.className = "qs-btn__svg";

    closeBtnIcon.appendChild(closeBtnImg);
    closeBtn.appendChild(closeBtnIcon);
    closeBtn.addEventListener("click", () => this.closeReader());

    navControls.appendChild(themePickerBtn);
    navControls.appendChild(feedbackBtn);
    navControls.appendChild(aboutBtn);
    navControls.appendChild(closeBtn);

    navbar.appendChild(logo);
    navbar.appendChild(navControls);
    // --- NEW NAVBAR END ---

    // Create content area
    const contentArea = document.createElement("div");
    contentArea.className = "quickscribe-reader-content";

    // Show loading spinner initially
    const loadingDiv = document.createElement("div");
    loadingDiv.className = "quickscribe-loading";
    loadingDiv.textContent = "Loading article...";
    contentArea.appendChild(loadingDiv);

    // Assemble overlay
    this.overlay.appendChild(navbar); // Use new navbar
    this.overlay.appendChild(contentArea);

    // Add to page
    document.body.appendChild(this.overlay);

    // Set initial theme
    this.applyInitialTheme();

    // Show What's New popup if needed (once per version)
    this.showWhatsNewIfNeeded();

    // Handle escape key
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        this.closeReader();
      }
    };
    document.addEventListener("keydown", handleEscape);
    this.overlay.dataset.escapeHandler = "true";

    // After 1s, remove spinner and inject article content with animation
    setTimeout(() => {
      // Remove loading spinner
      loadingDiv.remove();

      // Article source (domain)
      function getRootDomain(hostname) {
        const parts = hostname.split(".");
        if (parts.length > 2) {
          return parts.slice(-2).join(".");
        }
        return hostname;
      }
      const rootDomain = getRootDomain(window.location.hostname);
      const sourceEl = document.createElement("div");
      sourceEl.className = "quickscribe-article-source";
      sourceEl.textContent = rootDomain;
      contentArea.appendChild(sourceEl);

      // Article title
      if (content.title) {
        const titleEl = document.createElement("h1");
        titleEl.className = "quickscribe-article-title";
        titleEl.textContent = content.title;
        contentArea.appendChild(titleEl);
      }

      // Article subtitle (optional)
      let subtitle = null;
      if (content.excerpt && content.excerpt.trim().length > 0) {
        subtitle = content.excerpt.trim();
      } else {
        const metaDesc = document.querySelector('meta[name="description"]');
        if (
          metaDesc &&
          metaDesc.content &&
          metaDesc.content.trim().length > 0
        ) {
          subtitle = metaDesc.content.trim();
        } else {
          const articleEl = document.querySelector("article");
          let subtitleEl = null;
          if (articleEl) {
            subtitleEl =
              articleEl.querySelector(".subtitle") ||
              articleEl.querySelector("h2") ||
              articleEl.querySelector(".article-subtitle");
          }
          if (
            subtitleEl &&
            subtitleEl.textContent &&
            subtitleEl.textContent.trim().length > 0
          ) {
            subtitle = subtitleEl.textContent.trim();
          }
        }
      }
      if (subtitle) {
        const subtitleEl = document.createElement("div");
        subtitleEl.className = "quickscribe-subtitle";
        subtitleEl.textContent = subtitle;
        contentArea.appendChild(subtitleEl);
      }

      // Article content with animation
      const articleWrapper = document.createElement("div");
      articleWrapper.className = "quickscribe-article";
      articleWrapper.style.opacity = "0";
      articleWrapper.style.transform = "translateY(20px)";
      articleWrapper.style.transition =
        "opacity 400ms ease-out, transform 400ms ease-out";

      if (content.html) {
        articleWrapper.innerHTML = DOMPurify.sanitize(content.html);
        this.stripInlineStyles(articleWrapper);
      } else {
        articleWrapper.innerHTML = DOMPurify.sanitize(
          this.formatContent(content.text)
        );
      }
      contentArea.appendChild(articleWrapper);

      // Trigger animation
      setTimeout(() => {
        articleWrapper.style.opacity = "1";
        articleWrapper.style.transform = "translateY(0)";
      }, 10);
    }, 1000);
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
    // Early return if AI Summary feature is disabled
    if (!this.AI_SUMMARY_ENABLED) {
      return;
    }

    // If summary is already cached, just toggle visibility with animation
    if (this.cachedSummary) {
      const summaryEl = this.overlay.querySelector(".quickscribe-summary");
      if (summaryEl) {
        const isCurrentlyVisible =
          !summaryEl.classList.contains("summary-hidden");
        summaryEl.classList.toggle("summary-hidden", isCurrentlyVisible);
        this.updateSummaryButton(!isCurrentlyVisible);

        // If we are making it visible, scroll to the top of the overlay
        if (!isCurrentlyVisible) {
          this.overlay.scrollTo({ top: 0, behavior: "smooth" });
        }
      }
      return;
    }

    const summaryBtn = this.overlay.querySelector(".qs-btn--primary");
    const iconSpan = summaryBtn.querySelector(".qs-btn__icon");
    const labelSpan = summaryBtn.querySelector(".qs-btn__label");
    const originalLabel = "Summarize with AI";

    // Show loading state
    summaryBtn.disabled = true;
    summaryBtn.classList.add("generating");
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

      // Display the summary. This will also update the button state.
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
      // On failure, restore button to its initial state
      this.updateSummaryButton(false);
    } finally {
      // Restore button from loading state, but keep its current text/icon
      summaryBtn.disabled = false;
      summaryBtn.classList.remove("generating");
      if (iconSpan) iconSpan.style.display = "flex";
    }
  }

  updateSummaryButton(isVisible) {
    // Early return if AI Summary feature is disabled
    if (!this.AI_SUMMARY_ENABLED) {
      return;
    }

    const summaryBtn = this.overlay.querySelector(".qs-btn--primary");
    if (!summaryBtn) return;

    const iconSpan = summaryBtn.querySelector(".qs-btn__icon");
    const labelSpan = summaryBtn.querySelector(".qs-btn__label");
    const iconImg = iconSpan ? iconSpan.querySelector(".qs-btn__svg") : null;

    if (isVisible) {
      labelSpan.textContent = "Hide AI Summary";
      if (iconImg) iconImg.src = chrome.runtime.getURL("assets/eye-slash.svg");
      summaryBtn.classList.add("summary-visible");
    } else {
      labelSpan.textContent = "Summarize with AI";
      if (iconImg)
        iconImg.src = chrome.runtime.getURL("assets/summary-icon.svg");
      summaryBtn.classList.remove("summary-visible");
    }
  }

  displaySummary(summaryData) {
    // Early return if AI Summary feature is disabled
    if (!this.AI_SUMMARY_ENABLED) {
      return;
    }

    const contentArea = this.overlay.querySelector(
      ".quickscribe-reader-content"
    );

    // Remove existing summary if any
    const existingSummary = contentArea.querySelector(".quickscribe-summary");
    if (existingSummary) {
      existingSummary.remove();
    }

    // Create summary section and start it as hidden for animation
    const summarySection = document.createElement("div");
    summarySection.className = "quickscribe-summary summary-hidden";

    // --- New Figma-style label row ---
    const labelRow = document.createElement("div");
    labelRow.className = "quickscribe-summary-label-row";

    // Icon
    const icon = document.createElement("img");
    icon.src = chrome.runtime.getURL("assets/summary-icon.svg");
    icon.alt = "Summary Icon";
    icon.className = "quickscribe-summary-icon";

    // Label text
    const labelText = document.createElement("span");
    labelText.className = "quickscribe-summary-label-text";
    labelText.textContent = "AI Summary";

    labelRow.appendChild(icon);
    labelRow.appendChild(labelText);
    summarySection.appendChild(labelRow);

    // --- Bullet points ---
    const summaryText = document.createElement("div");
    summaryText.className = "quickscribe-summary-bullets";

    const lines = summaryData.summary.split("•").filter(Boolean);
    lines.forEach((line) => {
      const bullet = document.createElement("p");
      bullet.className = "quickscribe-summary-bullet";
      bullet.textContent = "• " + line.replace(/\*\*/g, "").trim();
      summaryText.appendChild(bullet);
    });

    summarySection.appendChild(summaryText);

    // Insert summary at the very top of content area, before any other content
    const firstChild = contentArea.firstChild;
    contentArea.insertBefore(summarySection, firstChild);

    // After displaying, update button to "Hide" state
    this.updateSummaryButton(true);

    // After inserting, remove the hidden class to trigger the fade-in animation
    setTimeout(() => {
      summarySection.classList.remove("summary-hidden");
      // Scroll to the top of the overlay to ensure it's in view
      this.overlay.scrollTo({ top: 0, behavior: "smooth" });
    }, 10); // Small delay to allow CSS transition

    this.stripInlineStyles(summarySection);
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

    this.stripInlineStyles(errorDiv);
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

  // Helper to strip inline styles from an element and its children
  stripInlineStyles(element) {
    if (!element) return;
    const all = element.querySelectorAll("*");
    all.forEach((el) => el.removeAttribute("style"));
    element.removeAttribute("style");
  }

  // --- DARK MODE LOGIC ---
  applyInitialTheme() {
    const saved = localStorage.getItem("qs_reader_theme");
    if (saved === "dark" || saved === "light" || saved === "sepia") {
      this.setTheme(saved);
      return;
    }
    const systemPrefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    this.setTheme(systemPrefersDark ? "dark" : "light");
  }

  toggleDarkMode() {
    const overlay = this.overlay;
    const isDark = overlay.getAttribute("data-theme") === "dark";
    this.setDarkMode(!isDark);
    localStorage.setItem("qs_reader_theme", !isDark ? "dark" : "light");
  }

  setDarkMode(enabled) {
    // Backward-compatible wrapper that toggles between light and dark
    this.setTheme(enabled ? "dark" : "light");
  }

  // --- Unified theme setter: light | dark | sepia ---
  setTheme(themeKey) {
    const overlay = this.overlay;
    if (!overlay) return;
    const logo = overlay.querySelector(".qs-navbar-logo");

    if (themeKey === "dark") {
      overlay.setAttribute("data-theme", "dark");
      if (logo) logo.src = chrome.runtime.getURL("assets/logodark.png");
    } else if (themeKey === "sepia") {
      overlay.setAttribute("data-theme", "sepia");
      if (logo) logo.src = chrome.runtime.getURL("assets/logo.png");
    } else {
      overlay.removeAttribute("data-theme");
      if (logo) logo.src = chrome.runtime.getURL("assets/logo.png");
    }
  }

  // --- THEME PICKER DROPDOWN ---
  toggleThemeDropdown(anchorEl) {
    if (this._themeDropdownEl && this._themeDropdownEl.parentNode) {
      this.closeThemeDropdown();
      return;
    }
    this.openThemeDropdown(anchorEl);
  }

  openThemeDropdown(anchorEl) {
    if (!this.overlay) return;
    // Ensure any existing dropdown is closed
    this.closeThemeDropdown();

    const dropdown = document.createElement("div");
    dropdown.className = "qs-dropdown";
    dropdown.setAttribute("role", "menu");
    dropdown.setAttribute("aria-label", "Theme picker");

    // Build items
    const themes = [
      { key: "light", label: "Light", icon: "assets/light.svg" },
      { key: "dark", label: "Dark", icon: "assets/dark.svg" },
      { key: "sepia", label: "Sepia", icon: "assets/sepia.svg" },
    ];

    themes.forEach((t) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "qs-dropdown__item";
      item.setAttribute("role", "menuitem");
      // Use a neutral data attribute to avoid conflicting with dark-mode CSS
      // selectors that target [data-theme="dark"] on ancestors
      item.dataset.themeKey = t.key;

      const iconWrap = document.createElement("span");
      iconWrap.className = "qs-dropdown__icon";
      const iconImg = document.createElement("img");
      iconImg.src = chrome.runtime.getURL(t.icon);
      iconImg.alt = `${t.label} theme`;
      iconWrap.appendChild(iconImg);

      const label = document.createElement("span");
      label.className = "qs-dropdown__label";
      label.textContent = t.label;

      item.appendChild(iconWrap);
      item.appendChild(label);

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectTheme(t.key);
      });

      dropdown.appendChild(item);
    });

    this.overlay.appendChild(dropdown);
    this._themeDropdownEl = dropdown;
    this._themeAnchorEl = anchorEl;
    anchorEl.setAttribute("aria-expanded", "true");

    // Position below the anchor
    this.positionThemeDropdown();

    // Listeners to close
    this._onThemeDocumentClick = (evt) => {
      const target = evt.target;
      if (
        !this._themeDropdownEl ||
        this._themeDropdownEl.contains(target) ||
        this._themeAnchorEl.contains(target)
      ) {
        return;
      }
      this.closeThemeDropdown();
    };
    document.addEventListener("click", this._onThemeDocumentClick, true);

    this._onThemeKeydown = (evt) => {
      if (evt.key === "Escape") {
        this.closeThemeDropdown();
      }
    };
    document.addEventListener("keydown", this._onThemeKeydown);
  }

  positionThemeDropdown() {
    if (!this._themeDropdownEl || !this._themeAnchorEl) return;
    const rect = this._themeAnchorEl.getBoundingClientRect();
    // Position relative to the overlay (fixed at 0,0)
    const top = rect.bottom + 6; // 6px gap
    let left = rect.left;

    // Prevent overflow on right edge
    const dropdownWidth = 180; // approximate width
    const maxLeft = Math.max(8, window.innerWidth - dropdownWidth - 8);
    left = Math.min(left, maxLeft);

    this._themeDropdownEl.style.position = "absolute";
    this._themeDropdownEl.style.top = `${top}px`;
    this._themeDropdownEl.style.left = `${left}px`;
    this._themeDropdownEl.style.minWidth = `${Math.max(160, rect.width)}px`;
    this._themeDropdownEl.style.zIndex = "100";
  }

  closeThemeDropdown() {
    if (this._themeAnchorEl) {
      this._themeAnchorEl.setAttribute("aria-expanded", "false");
    }
    if (this._themeDropdownEl && this._themeDropdownEl.parentNode) {
      this._themeDropdownEl.parentNode.removeChild(this._themeDropdownEl);
    }
    this._themeDropdownEl = null;
    this._themeAnchorEl = null;
    this.destroyThemeDropdownListeners();
  }

  destroyThemeDropdownListeners() {
    if (this._onThemeDocumentClick) {
      document.removeEventListener("click", this._onThemeDocumentClick, true);
      this._onThemeDocumentClick = null;
    }
    if (this._onThemeKeydown) {
      document.removeEventListener("keydown", this._onThemeKeydown);
      this._onThemeKeydown = null;
    }
  }

  selectTheme(themeKey) {
    if (themeKey !== "dark" && themeKey !== "light" && themeKey !== "sepia") {
      themeKey = "light";
    }
    this.setTheme(themeKey);
    try {
      localStorage.setItem("qs_reader_theme", themeKey);
    } catch (e) {}
    this.closeThemeDropdown();
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
