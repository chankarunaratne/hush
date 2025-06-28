# PRD: QuickScribe Reader Mode Chrome Extension

## Purpose

A Chrome extension that activates a clean **Reader Mode** view when the user clicks the extension icon. The extension strips away clutter from the current webpage and shows only the readable article content in a floating panel—like Safari's Reader Mode. It also includes a toggle button to generate an AI summary of the article content using a hosted API.

---

## Stack

| Layer              | Tech                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| UI                 | Plain HTML + CSS (no React/framework)                                                                         |
| Script logic       | Vanilla JavaScript (ES6+)                                                                                     |
| Content extraction | [`readability.js`](https://github.com/mozilla/readability) or fallback to `document.querySelector("article")` |
| AI Summary API     | POST request to **https://quickscribe-gl7p4e0o8-chandima-karunaratnes-projects.vercel.app/api/summarize**     |
| Manifest           | Chrome Manifest V3                                                                                            |

---

## Features

- On extension icon click, activate the reader mode overlay.
- Extract main article text using `readability.js` (or fallback).
- Inject a floating, full-width Reader Panel over the page, styled cleanly for readability.
- Floating header with:
  - “AI Summary” button
  - “Close Reader” button
- When “AI Summary” is clicked, send a POST request to: https://quickscribe-gl7p4e0o8-chandima-karunaratnes-projects.vercel.app/api/summarize

Include the full article text in the request body as `{ content: "..." }`.

- Display the AI-generated summary below the article content inside the reader panel.
- Use plain HTML, CSS, and vanilla JavaScript only.
- Keep all extension files inside a `/public` folder:
- `manifest.json`
- `content.js`
- `style.css`
- (optional) `readability.js` if not loaded externally

---

## Folder structure

/public
└─ manifest.json
└─ content.js
└─ style.css
└─ readability.js (optional)

---

## Notes for Cursor

- Don’t use React or frontend frameworks.
- Inject DOM elements manually with `document.createElement`.
- Style with CSS or utility classes.
- Use `fetch()` to call the above API URL.
- Target a lightweight, performant, minimal UI.
- Make it easy to test locally by loading unpacked extension.
