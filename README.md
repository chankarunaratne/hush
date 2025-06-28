# QuickScribe Reader Mode Chrome Extension

A Chrome extension that provides a clean reader mode experience with AI summarization capabilities. Similar to Safari's Reader Mode, it strips away webpage clutter and presents content in a clean, readable format.

## Features

- **Clean Reader Mode**: Extracts main content from any webpage using Mozilla's Readability.js
- **AI Summarization**: Generate AI-powered summaries of articles using the QuickScribe API
- **Floating Overlay**: Beautiful, responsive overlay that doesn't interfere with the original page
- **Keyboard Navigation**: Full keyboard support with Escape key to close
- **Session Caching**: Caches extracted content and summaries for better performance
- **Fallback Extraction**: Multiple content extraction strategies for maximum compatibility

## Installation

### For Development/Testing

1. **Clone or download this repository**

   ```bash
   git clone <repository-url>
   cd readerapp
   ```

2. **Open Chrome and navigate to Extensions**

   - Go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)

3. **Load the extension**

   - Click "Load unpacked"
   - Select the `public` folder from this project
   - The extension should now appear in your extensions list

4. **Test the extension**
   - Navigate to any article webpage (e.g., news sites, blogs)
   - Click the QuickScribe extension icon in your toolbar
   - The reader mode overlay should appear with the extracted content

## Usage

1. **Activate Reader Mode**

   - Click the QuickScribe extension icon on any webpage
   - The page will be overlaid with a clean reader view

2. **Generate AI Summary**

   - Click the "AI Summary" button in the reader header
   - Wait for the summary to be generated
   - The summary will appear at the top of the content

3. **Close Reader Mode**
   - Click the "Close Reader" button
   - Or press the Escape key
   - The overlay will disappear, returning you to the original page

## Technical Details

### Content Extraction Strategy

1. **Primary**: Mozilla's Readability.js library
2. **Fallback 1**: Largest `<article>` element's text content
3. **Fallback 2**: Full `document.body` text content

### API Integration

- **Endpoint**: `https://quickscribe-gl7p4e0o8-chandima-karunaratnes-projects.vercel.app/api/summarize`
- **Method**: POST with JSON body `{ content: "article text" }`
- **Response**: JSON with summary, title, author, date, and word count
- **Content Limit**: 4000 characters maximum

### File Structure

```
public/
├── manifest.json      # Chrome extension manifest (Manifest V3)
├── background.js      # Service worker for extension icon handling
├── content.js         # Main content script with reader functionality
├── style.css          # Styles for the reader overlay
└── readability.js     # Mozilla's Readability library
```

## Browser Compatibility

- Chrome 88+ (Manifest V3 support required)
- Chromium-based browsers (Edge, Brave, etc.)

## Development

### Making Changes

1. **Edit files in the `public/` directory**
2. **Reload the extension** in `chrome://extensions/`
3. **Refresh the webpage** you're testing on

### Debugging

- Open Chrome DevTools on any webpage
- Check the Console tab for extension logs
- Use the Sources tab to debug content scripts

### Common Issues

1. **Extension not working on certain sites**

   - Some sites may block content scripts
   - Check the console for error messages

2. **Content extraction fails**

   - The extension will show an error message
   - Try refreshing the page and clicking the extension again

3. **AI summary fails**
   - Check your internet connection
   - The API may be temporarily unavailable
   - Try again after a few seconds

## API Response Format

```json
{
  "summary": "AI generated summary text",
  "title": "Article title",
  "author": "Article author",
  "datePublished": "2024-01-01T00:00:00.000Z",
  "wordCount": 1500
}
```

## License

This project is for educational and personal use.

## Contributing

Feel free to submit issues or pull requests for improvements!
