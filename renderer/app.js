// ============================================================
// Beaufoo - app.js (Optimized with Force Reload)
// ============================================================

// ============================================================
// STATE
// ============================================================

let currentLyrics = null;
let currentTime = 0;
let isPlaying = false;
let isUserScrolling = false;
let userScrollTimeout = null;
let isProgrammaticScroll = false;
let lastActiveLineIndex = -1;
let lastScrollLineIndex = -1;
let isRomajiMode = false;
let foobarTime = 0;
let lastFoobarUpdate = performance.now();
let staggerTimeoutId = null;

// METADATA LAGU AKTIF
let currentTrackMetadata = null;

// STATE OFFSET (dalam detik)
let timeOffset = 0;

const container = document.getElementById("lyrics");
const romajiBtn = document.getElementById("toggle-romaji");
const btnMinus = document.getElementById("offset-minus");
const btnPlus = document.getElementById("offset-plus");
const offsetIndicator = document.getElementById("offset-indicator");
const reloadBtn = document.getElementById("btn-reload");


// ============================================================
// TEXT / SCRIPT HELPERS
// ============================================================

function isCJKOrJapanese(text) {
    if (!text) return false;
    return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
}

function isKorean(text) {
    if (!text) return false;
    return /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/.test(text);
}

function isAsianScript(text) {
    return isCJKOrJapanese(text) || isKorean(text);
}

function shouldAddWordSpace(previousText, currentText) {
    if (!previousText || !currentText) return false;

    const current = currentText.trimStart();

    if (isAsianScript(previousText) || isAsianScript(currentText)) {
        return false;
    }

    if (/^[,.;:!?%)\]}]/.test(current)) {
        return false;
    }

    if (current.startsWith("'") || current.startsWith("’")) {
        return false;
    }

    if (/\s$/.test(previousText)) {
        return false;
    }

    return true;
}

function isLatinLikeText(text) {
    if (!text) return false;
    return !isAsianScript(text);
}


// ============================================================
// KARAOKE WORD HELPERS
// ============================================================

function getOriginalWords(line) {
    if (!line || !Array.isArray(line.words)) {
        return [];
    }

    return line.words.filter(word =>
        word &&
        typeof word.text === "string" &&
        word.text.length > 0
    );
}

function getRomajiWordsWithTiming(line) {
    if (!line || !line.romajiText) {
        return [];
    }

    const romajiTokens = line.romajiText
        .split(/\s+/)
        .filter(Boolean);

    if (romajiTokens.length === 0) {
        return [];
    }

    const origWords = getOriginalWords(line);

    if (origWords.length === 0) {
        return romajiTokens.map(token => ({
            text: token,
            start: line.start,
            end: line.end
        }));
    }

    if (romajiTokens.length === origWords.length) {
        return romajiTokens.map((token, idx) => ({
            text: token,
            start: origWords[idx].start,
            end: origWords[idx].end
        }));
    }

    const totalDuration = line.end - line.start;
    const totalChars = romajiTokens.reduce(
        (acc, token) => acc + token.length,
        0
    );

    let currentStart = line.start;

    return romajiTokens.map(token => {
        const weight =
            totalChars > 0
                ? token.length / totalChars
                : 1 / romajiTokens.length;

        const duration = totalDuration * weight;
        const wordStart = currentStart;
        const wordEnd = wordStart + duration;

        currentStart = wordEnd;

        return {
            text: token,
            start: wordStart,
            end: wordEnd
        };
    });
}

function getDisplayWords(lyricsData, line) {
    const originalWords = getOriginalWords(line);

    if (!isRomajiMode || !line.romajiText) {
        return originalWords;
    }

    const originalText = originalWords
        .map(word => word.text)
        .join("");

    if (isLatinLikeText(originalText)) {
        return originalWords;
    }

    return getRomajiWordsWithTiming(line);
}


// ============================================================
// LONG GAP HANDLER
// ============================================================

function addLongGapLines(lyricsData) {
    if (!lyricsData || !Array.isArray(lyricsData.lines)) {
        return lyricsData;
    }

    const newLines = [];

    for (let i = 0; i < lyricsData.lines.length; i++) {
        const line = lyricsData.lines[i];

        newLines.push(line);

        if (i >= lyricsData.lines.length - 1) {
            continue;
        }

        const nextLine = lyricsData.lines[i + 1];
        const gap = nextLine.start - line.end;

        if (gap > 3) {
            const gapStart = line.end + 0.65;
            const gapEnd = nextLine.start - 0.65;

            newLines.push({
                start: gapStart,
                end: gapEnd,
                text: "...",
                words: [
                    {
                        text: ".",
                        start: gapStart,
                        end: gapStart + ((gapEnd - gapStart) / 3)
                    },
                    {
                        text: ".",
                        start: gapStart + ((gapEnd - gapStart) / 3),
                        end: gapStart + ((gapEnd - gapStart) * 2 / 3)
                    },
                    {
                        text: ".",
                        start: gapStart + ((gapEnd - gapStart) * 2 / 3),
                        end: gapEnd
                    }
                ],
                isGapLine: true
            });
        }
    }

    return {
        ...lyricsData,
        lines: newLines
    };
}


// ============================================================
// USER SCROLL DETECTION
// ============================================================

if (container) {
    container.addEventListener("wheel", markUserScrolling, { passive: true });
    container.addEventListener("touchmove", markUserScrolling, { passive: true });
}

function markUserScrolling() {
    isUserScrolling = true;

    if (userScrollTimeout) {
        clearTimeout(userScrollTimeout);
    }

    userScrollTimeout = setTimeout(() => {
        isUserScrolling = false;
    }, 3000);
}

if (container) {
    container.addEventListener("scroll", () => {
        if (isProgrammaticScroll) {
            setTimeout(() => {
                isProgrammaticScroll = false;
            }, 100);
        }
    });
}


// ============================================================
// RENDER LYRICS DOM
// ============================================================

function renderLyricsDOM(lyricsData) {
    if (!container) return;

    container.innerHTML = "";

    if (!lyricsData || !lyricsData.lines) {
        return;
    }

    container.className =
        lyricsData.type === "karaoke"
            ? "mode-karaoke"
            : "mode-plain";

    lyricsData.lines.forEach((line, lineIndex) => {
        const lineEl = document.createElement("div");
        lineEl.className = `lyric-line future ${line.isDuet ? "duet" : ""}`;
        lineEl.dataset.index = lineIndex;

        if (line.isGapLine) {
            lineEl.classList.add("gap-line");
            lineEl.style.visibility = "visible";
            lineEl.style.opacity = "1";
        }

        if (
            lyricsData.type === "karaoke" &&
            Array.isArray(line.words) &&
            line.words.length > 0
        ) {
            const displayWords = getDisplayWords(lyricsData, line);
            let previousText = "";

            displayWords.forEach(word => {
                const wordSpan = document.createElement("span");
                wordSpan.className = "word";
                wordSpan.dataset.start = word.start;
                wordSpan.dataset.end = word.end;

                const chars = Array.from(word.text);
                const charDuration =
                    chars.length > 0
                        ? (word.end - word.start) / chars.length
                        : 0;

                chars.forEach((char, i) => {
                    const charSpan = document.createElement("span");
                    charSpan.className = "char";
                    charSpan.textContent = char;
                    charSpan.dataset.start = word.start + (i * charDuration);
                    charSpan.dataset.end = word.start + ((i + 1) * charDuration);

                    wordSpan.appendChild(charSpan);
                });

                if (!line.isGapLine && shouldAddWordSpace(previousText, word.text)) {
                    lineEl.appendChild(document.createTextNode(" "));
                }

                lineEl.appendChild(wordSpan);
                previousText = word.text;
            });
        } else {
            lineEl.textContent =
                (isRomajiMode && line.romajiText)
                    ? line.romajiText
                    : line.text;
        }

        container.appendChild(lineEl);
    });
}


// ============================================================
// GAP LINE VISIBILITY
// ============================================================

function updateGapLineVisibility(time) {
    if (!currentLyrics || !currentLyrics.lines) return;

    const lineElements = container.querySelectorAll(".lyric-line");

    currentLyrics.lines.forEach((line, index) => {
        if (!line.isGapLine) return;
        const el = lineElements[index];
        if (!el) return;

        el.style.visibility = "visible";
        el.style.opacity = "1";
    });
}


// ============================================================
// ACTIVE LINE
// ============================================================

function getActiveLineIndex(time) {
    if (!currentLyrics || !currentLyrics.lines) return -1;

    let activeLineIndex = -1;

    for (let i = 0; i < currentLyrics.lines.length; i++) {
        const line = currentLyrics.lines[i];
        if (line.isGapLine) continue;

        if (time >= line.start) {
            activeLineIndex = i;
        } else {
            break;
        }
    }

    return activeLineIndex;
}


// ============================================================
// SCROLL TRIGGER
// ============================================================

function getScrollLineIndex(time) {
    if (!currentLyrics || !currentLyrics.lines) return -1;

    let scrollIndex = -1;

    for (let i = 0; i < currentLyrics.lines.length; i++) {
        const line = currentLyrics.lines[i];
        let triggerTime = line.start - 0.65;

        if (line.isGapLine) {
            const prevLine = currentLyrics.lines[i - 1];
            if (prevLine) {
                triggerTime = prevLine.end + 0.65;
            }
        } else if (i > 0) {
            let previousRealLine = null;
            for (let j = i - 1; j >= 0; j--) {
                if (!currentLyrics.lines[j].isGapLine) {
                    previousRealLine = currentLyrics.lines[j];
                    break;
                }
            }

            if (previousRealLine) {
                const gap = line.start - previousRealLine.end;
                if (gap >= 1.5 && gap <= 3) {
                    triggerTime = previousRealLine.end + 0.65;
                } else if (gap > 3) {
                    triggerTime = line.start - 0.65;
                }
            }
        }

        triggerTime = Math.max(0, triggerTime);

        if (time >= triggerTime) {
            scrollIndex = i;
        } else {
            break;
        }
    }

    return scrollIndex;
}


// ============================================================
// SCROLL ANIMATION
// ============================================================

function scrollToActiveLine(scrollLineIndex) {
    if (isUserScrolling) return;

    const lineElements = container.querySelectorAll(".lyric-line");
    const activeEl = lineElements[scrollLineIndex];
    if (!activeEl) return;

    const targetScrollTop =
        activeEl.offsetTop -
        (container.clientHeight / 2) +
        (activeEl.clientHeight / 2);

    const startScrollTop = container.scrollTop;
    const delta = startScrollTop - targetScrollTop;

    if (Math.abs(delta) < 2) return;

    isProgrammaticScroll = true;

    if (staggerTimeoutId) {
        clearTimeout(staggerTimeoutId);
        staggerTimeoutId = null;
    }

    if (Math.abs(delta) > 800) {
        container.scrollTop = targetScrollTop;

        lineElements.forEach(el => {
            el.style.transition = "";
            el.style.setProperty("--y-offset", "0px");
        });

        setTimeout(() => {
            isProgrammaticScroll = false;
        }, 50);

        return;
    }

    lineElements.forEach(el => {
        el.style.transition =
            `translate 0s,
             opacity 300ms ease,
             filter 300ms ease,
             transform 300ms ease`;

        el.style.setProperty("--y-offset", `${-delta}px`);
    });

    container.scrollTop = targetScrollTop;

    requestAnimationFrame(() => {
        lineElements.forEach((el, index) => {
            const relativeIndex = index - (scrollLineIndex - 5);
            const delay = Math.max(0, relativeIndex) * 0.035;

            el.style.transition =
                `translate 700ms cubic-bezier(0.42, 0, 0.58, 1) ${delay}s,
                 opacity 300ms ease,
                 filter 300ms ease,
                 transform 300ms ease`;

            el.style.setProperty("--y-offset", "0px");
        });
    });

    staggerTimeoutId = setTimeout(() => {
        lineElements.forEach(el => {
            el.style.transition = "";
        });
        isProgrammaticScroll = false;
    }, 1500);
}


// ============================================================
// LINE STATE
// ============================================================

function updateLineState(activeLineIndex) {
    const lineElements = container.querySelectorAll(".lyric-line");

    lineElements.forEach((el, index) => {
        el.classList.remove("past", "active", "future");

        const line = currentLyrics?.lines[index];

        if (line?.isGapLine) {
            el.classList.add("future");
            return;
        }

        if (index < activeLineIndex) {
            el.classList.add("past");

            if (currentLyrics?.type === "karaoke") {
                el.querySelectorAll(".word").forEach(w => {
                    w.classList.add("word-passed");
                    w.classList.remove("word-active");

                    w.querySelectorAll(".char").forEach(c => {
                        c.classList.add("char-active");
                    });
                });
            }
        } else if (index === activeLineIndex) {
            el.classList.add("active");
        } else {
            el.classList.add("future");

            if (currentLyrics?.type === "karaoke") {
                el.querySelectorAll(".word").forEach(w => {
                    w.classList.remove("word-active", "word-passed");

                    w.querySelectorAll(".char").forEach(c => {
                        c.classList.remove("char-active");
                    });
                });
            }
        }
    });
}


// ============================================================
// WORD / CHARACTER PROGRESS
// ============================================================

function updateWordProgress(time, activeLineIndex) {
    if (
        !currentLyrics ||
        currentLyrics.type !== "karaoke" ||
        activeLineIndex === -1
    ) {
        return;
    }

    const activeLineEl = container.querySelectorAll(".lyric-line")[activeLineIndex];
    if (!activeLineEl) return;

    activeLineEl.querySelectorAll(".word").forEach(wordSpan => {
        const wStart = parseFloat(wordSpan.dataset.start);
        const wEnd = parseFloat(wordSpan.dataset.end);

        if (time >= wEnd) {
            wordSpan.classList.add("word-passed");
            wordSpan.classList.remove("word-active");

            wordSpan.querySelectorAll(".char").forEach(c => {
                c.classList.add("char-active");
            });

            return;
        }

        if (time >= wStart && time < wEnd) {
            wordSpan.classList.add("word-active");
            wordSpan.classList.remove("word-passed");

            wordSpan.querySelectorAll(".char").forEach(charSpan => {
                const cStart = parseFloat(charSpan.dataset.start);
                if (time >= cStart) {
                    charSpan.classList.add("char-active");
                } else {
                    charSpan.classList.remove("char-active");
                }
            });

            return;
        }

        wordSpan.classList.remove("word-active", "word-passed");
        wordSpan.querySelectorAll(".char").forEach(c => {
            c.classList.remove("char-active");
        });
    });
}


// ============================================================
// GAP KARAOKE PROGRESS
// ============================================================

function updateGapWordProgress(time) {
    if (!currentLyrics || !currentLyrics.lines) return;

    const lineElements = container.querySelectorAll(".lyric-line");

    currentLyrics.lines.forEach((line, index) => {
        if (!line.isGapLine) return;
        const lineEl = lineElements[index];
        if (!lineEl) return;

        const words = lineEl.querySelectorAll(".word");

        words.forEach(wordSpan => {
            const wStart = parseFloat(wordSpan.dataset.start);
            const wEnd = parseFloat(wordSpan.dataset.end);

            if (time >= wStart) {
                wordSpan.classList.add("word-active");
                wordSpan.classList.remove("word-passed");

                wordSpan.querySelectorAll(".char").forEach(charSpan => {
                    const cStart = parseFloat(charSpan.dataset.start);
                    if (time >= cStart) {
                        if (!charSpan.classList.contains("char-active")) {
                            charSpan.classList.add("char-active");
                        }
                    }
                });

                if (time >= wEnd) {
                    wordSpan.classList.add("word-passed");
                    wordSpan.classList.remove("word-active");
                }
            } else {
                wordSpan.classList.remove("word-active", "word-passed");
                wordSpan.querySelectorAll(".char").forEach(c => {
                    c.classList.remove("char-active");
                });
            }
        });
    });
}


// ============================================================
// MASTER UI UPDATE
// ============================================================

function updateLyricsUI(time) {
    if (!currentLyrics || !currentLyrics.lines) return;

    updateGapLineVisibility(time);

    const activeLineIndex = getActiveLineIndex(time);
    const scrollLineIndex = getScrollLineIndex(time);

    if (activeLineIndex !== lastActiveLineIndex) {
        updateLineState(activeLineIndex);
        lastActiveLineIndex = activeLineIndex;
    }

    if (scrollLineIndex !== lastScrollLineIndex) {
        if (scrollLineIndex !== -1) {
            scrollToActiveLine(scrollLineIndex);
        }
        lastScrollLineIndex = scrollLineIndex;
    }

    updateWordProgress(time, activeLineIndex);
    updateGapWordProgress(time);
}


// ============================================================
// PLAYBACK TIME FROM FOOBAR
// ============================================================

function updatePlaybackTime(time) {
    foobarTime = Number(time) || 0;
    lastFoobarUpdate = performance.now();
}


// ============================================================
// 60 FPS RENDER LOOP
// ============================================================

function renderLoop() {
    if (currentLyrics) {
        const now = performance.now();
        const delta = (now - lastFoobarUpdate) / 1000;

        let interpolatedTime = foobarTime;

        if (delta < 0.5) {
            interpolatedTime += delta;
        }

        currentTime = Math.max(0, interpolatedTime + timeOffset);
        updateLyricsUI(currentTime);
    }

    requestAnimationFrame(renderLoop);
}

requestAnimationFrame(renderLoop);


// ============================================================
// OFFSET INDICATOR UI HELPER (FIXED TEMPLATE LITERAL)
// ============================================================

function updateOffsetIndicator() {
    if (!offsetIndicator) return;

    if (timeOffset === 0) {
        offsetIndicator.classList.add("hidden");
    } else {
        const sign = timeOffset > 0 ? "+" : "";
        // Pakai gabungan string biasa biar aman dari error escaping
        offsetIndicator.textContent = sign + timeOffset.toFixed(1) + "s";
        offsetIndicator.classList.remove("hidden");
    }
}


// ============================================================
// CONTROLS EVENT LISTENERS (ROMAJI, OFFSET, & FORCE RELOAD)
// ============================================================

if (btnMinus) {
    btnMinus.addEventListener("click", () => {
        timeOffset -= 0.5;
        updateOffsetIndicator();
    });
}

if (btnPlus) {
    btnPlus.addEventListener("click", () => {
        timeOffset += 0.5;
        updateOffsetIndicator();
    });
}

if (romajiBtn) {
    romajiBtn.addEventListener("click", () => {
        isRomajiMode = !isRomajiMode;
        romajiBtn.classList.toggle("active", isRomajiMode);

        if (currentLyrics) {
            renderLyricsDOM(currentLyrics);
            updateGapLineVisibility(currentTime);
            updateLineState(lastActiveLineIndex);
            updateWordProgress(currentTime, lastActiveLineIndex);
            updateGapWordProgress(currentTime);
        }
    });
}

// LOGIKA TOMBOL FORCE RELOAD (DAPAT DIPANGGIL DARI POJOK KANAN BAWAH)
if (reloadBtn) {
    reloadBtn.addEventListener("click", async () => {
        if (!currentTrackMetadata) return;

        reloadBtn.classList.add("spinning");
        console.log("[App] Force Reload dipicu: Menghapus cache & mencari ulang secara online...");

        const freshLyrics = await fetchLyrics(currentTrackMetadata, true);

        if (freshLyrics) {
            loadLyrics(freshLyrics);
            console.log("[App] Lirik online baru berhasil dimuat!");
        } else {
            console.warn("[App] Force reload gagal menemukan lirik online baru.");
        }

        reloadBtn.classList.remove("spinning");
    });
}


// ============================================================
// LOAD LYRICS
// ============================================================

function loadLyrics(data) {
    currentLyrics = addLongGapLines(data);

    timeOffset = 0;
    updateOffsetIndicator();

    foobarTime = 0;
    currentTime = 0;

    lastActiveLineIndex = -1;
    lastScrollLineIndex = -1;

    renderLyricsDOM(currentLyrics);
    updateLyricsUI(0);
}


// ============================================================
// FETCH LYRICS (DENGAN DUKUNGAN FORCE RELOAD)
// ============================================================

async function fetchLyrics(metadata, forceReload = false) {
    try {
        currentTrackMetadata = metadata; // Simpan metadata lagu aktif

        const res = await fetch("http://localhost:3000/api/get-lyrics", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ ...metadata, forceReload })
        });

        if (!res.ok) return null;

        const data = await res.json();

        if (data && data.type && Array.isArray(data.lines)) {
            return data;
        }

        if (data && data.success && data.lyrics) {
            return data.lyrics;
        }

        return null;
    } catch (err) {
        console.error("[App] Gagal fetch lyrics:", err);
        return null;
    }
}


// ============================================================
// FOOBAR2000 BRIDGE
// ============================================================

if (typeof initFoobarBridge === "function") {
    initFoobarBridge(
        async (trackMetadata) => {
            currentLyrics = null;
            container.innerHTML = "";

            lastActiveLineIndex = -1;
            lastScrollLineIndex = -1;

            // Simpan metadata & ambil cover art untuk background dinamis
            currentTrackMetadata = trackMetadata || null;

            if (trackMetadata && trackMetadata.filePath) {
                fetchCoverArt(trackMetadata.filePath);
            } else {
                currentCoverArt = null;
                applySettings();
            }

            const lyrics = await fetchLyrics(trackMetadata);

            if (lyrics) {
                loadLyrics(lyrics);
                return lyrics;
            }

            return null;
        },
        position => {
            updatePlaybackTime(position);
        }
    );
}


// ============================================================
// SETTINGS MODULE
// ============================================================

const SETTINGS_STORAGE_KEY = "beaufoo.settings.v1";

// Nilai default (harus sinkron dengan CSS fallback & markup HTML)
const DEFAULT_SETTINGS = {
    bgMode: "radial",

    solidColor: "#001410",

    // Gradient linear (2 warna + sudut)
    gradA: "#002621",
    gradB: "#006a5a",
    gradientAngle: 135,

    // Gradient 4 titik (4 sudut)
    gradC1: "#002621",
    gradC2: "#006a5a",
    gradC3: "#003d33",
    gradC4: "#000000",

    // Background dinamis (cover art)
    coverBlur: 40,
    coverDarken: 45,
    coverFit: "cover",

    bgOverlay: 0,

    fontSize: 36,
    fontFamily: "system",
    textColor: "#ffffff",
    accentColor: "#ffffff",

    idleOpacity: 35,
    idleBlur: 1.5,
    lineWidth: 80,

    glow: true,
    romajiDefault: false
};

// Preset font yang tersedia di panel pengaturan
const FONT_PRESETS = {
    system:
        "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif",
    inter:
        "\"Inter\", \"Segoe UI\", Roboto, sans-serif",
    poppins:
        "\"Poppins\", \"Segoe UI\", sans-serif",
    montserrat:
        "\"Montserrat\", \"Segoe UI\", sans-serif",
    lato:
        "\"Lato\", \"Segoe UI\", sans-serif",
    nunito:
        "\"Nunito\", \"Segoe UI\", sans-serif",
    oswald:
        "\"Oswald\", \"Segoe UI\", sans-serif",
    "noto-jp":
        "\"Noto Sans JP\", \"Yu Gothic\", \"Meiryo\", sans-serif",
    "noto-kr":
        "\"Noto Sans KR\", \"Malgun Gothic\", sans-serif",
    serif:
        "Georgia, \"Times New Roman\", serif",
    mono:
        "\"Consolas\", \"Courier New\", monospace"
};

// State cover art lagu yang sedang diputar
let currentCoverArt = null;

let appSettings = Object.assign({}, DEFAULT_SETTINGS);


// ============================================================
// HEX / RGB HELPERS
// ============================================================

function normalizeHex(value, fallback) {
    if (typeof value !== "string") return fallback;

    let hex = value.trim().toLowerCase();

    if (!hex.startsWith("#")) {
        hex = "#" + hex;
    }

    // #abc -> #aabbcc
    if (/^#[0-9a-f]{3}$/.test(hex)) {
        hex =
            "#" +
            hex[1] + hex[1] +
            hex[2] + hex[2] +
            hex[3] + hex[3];
    }

    if (/^#[0-9a-f]{6}$/.test(hex)) {
        return hex;
    }

    return fallback;
}

function hexToRgbTriplet(hex) {
    const clean = normalizeHex(hex, "#ffffff").slice(1);

    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);

    return r + ", " + g + ", " + b;
}


// ============================================================
// LOAD / SAVE SETTINGS
// ============================================================

function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);

        if (raw) {
            const parsed = JSON.parse(raw);
            appSettings = Object.assign(
                {},
                DEFAULT_SETTINGS,
                parsed
            );
        }
    } catch (err) {
        console.warn("[Settings] Gagal memuat pengaturan:", err);
    }
}

function saveSettings() {
    try {
        localStorage.setItem(
            SETTINGS_STORAGE_KEY,
            JSON.stringify(appSettings)
        );
    } catch (err) {
        console.warn("[Settings] Gagal menyimpan pengaturan:", err);
    }
}


// ============================================================
// THEME APPLICATION
// ============================================================

function buildActiveBackground(s) {
    // ---- Solid ----
    if (s.bgMode === "solid") {
        return s.solidColor;
    }

    // ---- Gradient 4 Titik (4 sudut warna berbeda) ----
    if (s.bgMode === "gradient4") {
        const angle = s.gradientAngle + "deg";

        // Dua linear-gradient diagonal disilangkan agar tiap sudut
        // memakai warnanya sendiri (efek "4 titik").
        return (
            "linear-gradient(" + angle + ", " +
            s.gradC1 + " 0%, " + s.gradC2 + " 100%), " +
            "linear-gradient(" + (s.gradientAngle + 90) + "deg, " +
            s.gradC3 + " 0%, transparent 60%), " +
            "linear-gradient(" + (s.gradientAngle - 90) + "deg, " +
            s.gradC4 + " 0%, transparent 60%)"
        );
    }

    // ---- Gradient (linear 2 warna + sudut) ----
    if (s.bgMode === "gradient") {
        const angle = s.gradientAngle + "deg";
        return "linear-gradient(" + angle + ", " + s.gradA + ", " + s.gradB + ")";
    }

    // ---- Dinamis (mengikuti cover art lagu) ----
    if (s.bgMode === "dynamic") {
        return "var(--bg-dynamic)";
    }

    // ---- Radial (preset default) ----
    return "var(--bg-radial)";
}

// Ambil cover art lagu aktif dari server lalu terapkan ke background.
async function fetchCoverArt(filePath) {
    if (!filePath) {
        currentCoverArt = null;
        applySettings();
        return;
    }

    try {
        const res = await fetch("http://127.0.0.1:3000/api/get-cover", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ filePath })
        });

        if (!res.ok) {
            currentCoverArt = null;
            applySettings();
            return;
        }

        const data = await res.json();

        currentCoverArt =
            data && data.success && data.dataUrl ? data.dataUrl : null;

        applySettings();
    } catch (err) {
        console.warn("[App] Gagal mengambil cover art:", err);
        currentCoverArt = null;
        applySettings();
    }
}

function applySettings() {
    const root = document.body.style;
    const s = appSettings;

    // ---- Background ----
    root.setProperty("--bg-solid", s.solidColor);

    // Gradient linear
    root.setProperty("--bg-grad-a", s.gradA);
    root.setProperty("--bg-grad-b", s.gradB);

    // Gradient 4 titik
    root.setProperty("--bg-c1", s.gradC1);
    root.setProperty("--bg-c2", s.gradC2);
    root.setProperty("--bg-c3", s.gradC3);
    root.setProperty("--bg-c4", s.gradC4);

    root.setProperty("--bg-angle", s.gradientAngle + "deg");
    root.setProperty("--bg-overlay", (s.bgOverlay / 100).toString());

    // Dinamis (cover art)
    root.setProperty("--cover-blur", s.coverBlur + "px");
    root.setProperty("--cover-darken", (s.coverDarken / 100).toString());

    // Mode Animated (fluid mesh ala Apple Music) memakai cover penuh,
    // jadi paksa fit "cover" agar blob mesh punya sumber warna yang utuh.
    const isAnimated =
        s.bgMode === "dynamic" && s.coverFit === "animated";

    root.setProperty("--cover-size", isAnimated ? "cover" : s.coverFit);

    const coverUrl = currentCoverArt
        ? "url(\"" + currentCoverArt + "\")"
        : "none";

    root.setProperty("--bg-cover-image", coverUrl);

    // Background dinamis: cover ter-blur dirender lewat body::after.
    // Body cukup pakai warna dasar gelap agar tidak ada cover tajam ganda.
    root.setProperty("--bg-dynamic", "#000000");

    root.setProperty("--bg-active", buildActiveBackground(s));

    // Aktifkan layer cover ter-blur hanya saat mode dinamis
    document.body.classList.toggle("bg-dynamic", s.bgMode === "dynamic");

    // Layer animated (mesh gradient + liquid distortion) hanya saat dinamis + fit animated
    document.body.classList.toggle("bg-animated", isAnimated);

    // ---- Tipografi ----
    root.setProperty("--lyric-font-size", s.fontSize + "px");

    const fontStack =
        FONT_PRESETS[s.fontFamily] || FONT_PRESETS.system;

    root.setProperty("--lyric-font-family", fontStack);

    root.setProperty("--lyric-color", hexToRgbTriplet(s.textColor));
    root.setProperty("--accent-rgb", hexToRgbTriplet(s.accentColor));

    // ---- Tampilan ----
    root.setProperty(
        "--lyric-idle-opacity",
        (s.idleOpacity / 100).toString()
    );
    root.setProperty("--lyric-idle-blur", s.idleBlur + "px");
    root.setProperty("--lyric-width", s.lineWidth + "%");

    // ---- Glow toggle ----
    document.body.classList.toggle("no-glow", !s.glow);

    // ---- Romaji default ----
    if (romajiBtn && s.romajiDefault && !isRomajiMode) {
        isRomajiMode = true;
        romajiBtn.classList.add("active");
    }
}


// ============================================================
// SETTINGS UI WIRING
// ============================================================

const settingsBtn = document.getElementById("btn-settings");
const settingsPanel = document.getElementById("settings-panel");
const settingsBackdrop = document.getElementById("settings-backdrop");
const settingsClose = document.getElementById("settings-close");
const settingsDone = document.getElementById("settings-done");
const settingsReset = document.getElementById("settings-reset");

function openSettings() {
    if (!settingsPanel) return;

    settingsPanel.classList.remove("hidden");
    if (settingsBackdrop) settingsBackdrop.classList.remove("hidden");

    settingsPanel.setAttribute("aria-hidden", "false");
    if (settingsBtn) {
        settingsBtn.classList.add("active");
        settingsBtn.setAttribute("aria-expanded", "true");
    }
}

function closeSettings() {
    if (!settingsPanel) return;

    settingsPanel.classList.add("hidden");
    if (settingsBackdrop) settingsBackdrop.classList.add("hidden");

    settingsPanel.setAttribute("aria-hidden", "true");
    if (settingsBtn) {
        settingsBtn.classList.remove("active");
        settingsBtn.setAttribute("aria-expanded", "false");
    }
}

// Sync semua kontrol UI dengan appSettings saat ini
function syncSettingsUI() {
    const s = appSettings;

    // Tabs mode background
    document.querySelectorAll(".bg-mode-tab").forEach(tab => {
        tab.classList.toggle(
            "active",
            tab.dataset.bgMode === s.bgMode
        );
    });

    document.querySelectorAll(".bg-section").forEach(sec => {
        sec.classList.toggle(
            "visible",
            sec.dataset.bgSection === s.bgMode
        );
    });

    // Solid
    setInputValue("solid-color", s.solidColor);
    setInputValue("solid-color-hex", s.solidColor);

    // Gradient linear (2 warna)
    setInputValue("grad-a", s.gradA);
    setInputValue("grad-a-hex", s.gradA);
    setInputValue("grad-b", s.gradB);
    setInputValue("grad-b-hex", s.gradB);

    // Gradient corners
    setInputValue("grad-c1", s.gradC1);
    setInputValue("grad-c2", s.gradC2);
    setInputValue("grad-c3", s.gradC3);
    setInputValue("grad-c4", s.gradC4);

    // Angle
    setInputValue("gradient-angle", s.gradientAngle);
    setText("gradient-angle-value", s.gradientAngle + "°");

    // Dinamis (cover art)
    setInputValue("cover-blur", s.coverBlur);
    setText("cover-blur-value", s.coverBlur + "px");
    setInputValue("cover-darken", s.coverDarken);
    setText("cover-darken-value", s.coverDarken + "%");
    setInputValue("cover-fit", s.coverFit);

    // Overlay
    setInputValue("bg-overlay", s.bgOverlay);
    setText("bg-overlay-value", s.bgOverlay + "%");

    // Typography
    setInputValue("font-size", s.fontSize);
    setText("font-size-value", s.fontSize + "px");
    setInputValue("font-family", s.fontFamily);
    setInputValue("text-color", s.textColor);
    setInputValue("text-color-hex", s.textColor);
    setInputValue("accent-color", s.accentColor);
    setInputValue("accent-color-hex", s.accentColor);

    // Appearance
    setInputValue("idle-opacity", s.idleOpacity);
    setText("idle-opacity-value", s.idleOpacity + "%");
    setInputValue("idle-blur", s.idleBlur);
    setText("idle-blur-value", s.idleBlur + "px");
    setInputValue("line-width", s.lineWidth);
    setText("line-width-value", s.lineWidth + "%");

    setChecked("glow-toggle", s.glow);
    setChecked("show-romaji-default", s.romajiDefault);
}

function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function setChecked(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = !!value;
}

// Update satu properti + apply + save
function updateSetting(key, value) {
    appSettings[key] = value;
    applySettings();
    saveSettings();
}


// ============================================================
// SETTINGS EVENT BINDINGS
// ============================================================

function bindSettingsEvents() {
    // Buka / tutup panel
    if (settingsBtn) {
        settingsBtn.addEventListener("click", () => {
            const isHidden = settingsPanel.classList.contains("hidden");
            if (isHidden) {
                syncSettingsUI();
                openSettings();
            } else {
                closeSettings();
            }
        });
    }

    if (settingsClose) settingsClose.addEventListener("click", closeSettings);
    if (settingsDone) settingsDone.addEventListener("click", closeSettings);
    if (settingsBackdrop) {
        settingsBackdrop.addEventListener("click", closeSettings);
    }

    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && settingsPanel &&
            !settingsPanel.classList.contains("hidden")) {
            closeSettings();
        }
    });

    // ---- Background mode tabs ----
    document.querySelectorAll(".bg-mode-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            const mode = tab.dataset.bgMode;
            updateSetting("bgMode", mode);
            syncSettingsUI();

            // Saat memilih mode dinamis, pastikan cover sudah dimuat
            if (mode === "dynamic" && currentTrackMetadata?.filePath) {
                fetchCoverArt(currentTrackMetadata.filePath);
            }
        });
    });

    // ---- Solid color ----
    bindColorPair("solid-color", "solid-color-hex", "solidColor");

    // ---- Gradient linear (2 warna) ----
    bindColorPair("grad-a", "grad-a-hex", "gradA", "gradient");
    bindColorPair("grad-b", "grad-b-hex", "gradB", "gradient");

    // ---- Gradient corners ----
    bindColorPair("grad-c1", null, "gradC1", "gradient4");
    bindColorPair("grad-c2", null, "gradC2", "gradient4");
    bindColorPair("grad-c3", null, "gradC3", "gradient4");
    bindColorPair("grad-c4", null, "gradC4", "gradient4");

    // ---- Gradient angle ----
    bindRange("gradient-angle", "gradient-angle-value", "gradientAngle",
        v => v + "°", null);

    // ---- Dinamis (cover art) ----
    bindRange("cover-blur", "cover-blur-value", "coverBlur",
        v => v + "px", "dynamic");
    bindRange("cover-darken", "cover-darken-value", "coverDarken",
        v => v + "%", "dynamic");
    bindSelect("cover-fit", "coverFit", "dynamic");

    // ---- Overlay ----
    bindRange("bg-overlay", "bg-overlay-value", "bgOverlay",
        v => v + "%", null);

    // ---- Typography ----
    bindRange("font-size", "font-size-value", "fontSize",
        v => v + "px", null);
    bindSelect("font-family", "fontFamily", null);
    bindColorPair("text-color", "text-color-hex", "textColor");
    bindColorPair("accent-color", "accent-color-hex", "accentColor");

    // ---- Appearance ----
    bindRange("idle-opacity", "idle-opacity-value", "idleOpacity",
        v => v + "%", null);
    bindRange("idle-blur", "idle-blur-value", "idleBlur",
        v => v + "px", null);
    bindRange("line-width", "line-width-value", "lineWidth",
        v => v + "%", null);

    bindCheckbox("glow-toggle", "glow");
    bindCheckbox("show-romaji-default", "romajiDefault", () => {
        if (romajiBtn) {
            isRomajiMode = appSettings.romajiDefault;
            romajiBtn.classList.toggle("active", isRomajiMode);
            if (currentLyrics) {
                renderLyricsDOM(currentLyrics);
                updateGapLineVisibility(currentTime);
                updateLineState(lastActiveLineIndex);
                updateWordProgress(currentTime, lastActiveLineIndex);
                updateGapWordProgress(currentTime);
            }
        }
    });

    // ---- Reset ----
    if (settingsReset) {
        settingsReset.addEventListener("click", () => {
            appSettings = Object.assign({}, DEFAULT_SETTINGS);
            applySettings();
            saveSettings();
            syncSettingsUI();
        });
    }
}

// Range slider -> value label + setting
function bindRange(rangeId, valueId, key, formatter, forceBgMode) {
    const range = document.getElementById(rangeId);
    if (!range) return;

    range.addEventListener("input", () => {
        const value = parseFloat(range.value);
        updateSetting(key, value);

        if (forceBgMode && appSettings.bgMode !== forceBgMode) {
            updateSetting("bgMode", forceBgMode);
        }

        if (valueId) setText(valueId, formatter(value));

        // Sinkronkan tab & section jika bgMode dipaksa
        if (forceBgMode) syncSettingsUI();
    });
}

// Pasangan color picker + input hex
function bindColorPair(colorId, hexId, key, forceBgMode) {
    const colorEl = document.getElementById(colorId);
    const hexEl = hexId ? document.getElementById(hexId) : null;

    const forceMode = () => {
        if (forceBgMode && appSettings.bgMode !== forceBgMode) {
            updateSetting("bgMode", forceBgMode);
            syncSettingsUI();
        }
    };

    if (colorEl) {
        colorEl.addEventListener("input", () => {
            const hex = normalizeHex(colorEl.value, appSettings[key]);
            updateSetting(key, hex);
            if (hexEl) hexEl.value = hex;
            forceMode();
        });
    }

    if (hexEl) {
        const commitHex = () => {
            const hex = normalizeHex(hexEl.value, appSettings[key]);
            updateSetting(key, hex);
            hexEl.value = hex;
            if (colorEl) colorEl.value = hex;
            forceMode();
        };

        hexEl.addEventListener("change", commitHex);
        hexEl.addEventListener("blur", commitHex);
    }
}

// Dropdown native <select> -> setting
function bindSelect(id, key, forceBgMode) {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener("change", () => {
        updateSetting(key, el.value);

        if (forceBgMode && appSettings.bgMode !== forceBgMode) {
            updateSetting("bgMode", forceBgMode);
            syncSettingsUI();
        }
    });
}

// Toggle checkbox
function bindCheckbox(id, key, onAfter) {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener("change", () => {
        updateSetting(key, el.checked);
        if (typeof onAfter === "function") onAfter();
    });
}


// ============================================================
// SETTINGS INIT
// ============================================================

function initSettings() {
    loadSettings();
    applySettings();

    if (settingsBtn) {
        bindSettingsEvents();
        syncSettingsUI();
    }

    console.log("[Settings] Dimuat:", appSettings);
}

initSettings();


