# Beautifoo Lyrics (Beta)

A dynamic, web-based karaoke lyrics renderer designed to run seamlessly as a panel within **foobar2000**. Built with HTML, CSS, and vanilla JavaScript, Beaufoo provides real-time, syllable-synced lyric animations with a focus on high-performance rendering directly inside Chromium environments. 


---

## 🌟 Features

*   **Real-Time Karaoke Swipe:** Smooth, GPU-accelerated word-by-word lyric highlighting tailored for Chromium WebView2 (fully patched against rendering glitches and black-text bugs).
*   **Dynamic Data Synchronization:** Automatically fetches lyrics and tracks playback progress directly from foobar2000.
*   **Romaji Toggle:** Built-in floating button to instantly switch between native Japanese characters and Romaji.
*   **Smart Scrolling:** Automatically centers the active lyric line, pausing gracefully when user scrolling is detected.
*   **Perfected Typography:** Japanese characters (Kanji/Kana) render flawlessly without awkward spacing issues.
*   **Custom Aesthetics:** Features a modern, hardware-accelerated 4-point radial gradient background (`#002621` to `#006a5a`).

## 📋 Prerequisites

To run this panel, you only need the following installed on your system:

1.  **[foobar2000](https://www.foobar2000.org/)** (v1.5 or v2.0+)
2.  **[foo_webview2](https://www.foobar2000.org/components/view/foo_webview2)** component installed in foobar2000.

## 🚀 Installation & Setup

1.  Extract the `beaufoo` project folder to your preferred local directory (e.g., `D:\beaufoo\`).
2.  Add a WebView2 panel to your foobar2000 layout.
3.  Right-click the panel or go to **Preferences** > **Default User Interface** > **WebView**.
4.  Set the **Template file path** to your local `loader.html` file using the `file:///` protocol. 
    *Example:* `file:///D:/beaufoo/renderer/loader.html`
5.  Apply the settings. The panel will handle the rest natively!

## 🛠️ Project Structure

```
beaufoo/
├── renderer/
│   ├── loader.html      # Entry point bridge for foo_webview2
│   ├── index.html       # Main UI structure
│   ├── style.css        # Styling and GPU-safe swipe animations
│   └── app.js           # Core logic, timing, and DOM manipulation
├── src/
│   └── utils/
│       └── bridge.js    # Handles foobar2000 metadata and playback state
└── sample.json          # Fallback lyric data
```

## ⚠️ Known Issues (Beta)
While critical rendering and CORS bugs have been resolved, you may currently experience the following as the project is still in development:

Load Times: Fetching lyrics for a new track currently takes about 3 to 5 seconds before appearing on the panel.

Accuracy: The auto-fetch system may occasionally pull incorrect or mismatched lyrics depending on the track metadata.

Format Limitations: The renderer does not yet support loading local/embedded lyrics directly from audio files or standard local .lrc files.

## 🤝 Contributing
Feel free to tweak the CSS to match your foobar2000 theme or submit pull requests to help improve lyric fetching speeds and local .lrc parsing. Report any bugs or desyncs to the issue tracker.
