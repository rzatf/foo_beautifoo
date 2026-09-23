// ============================================================
// Beaufoo - app.js (Optimized)
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

// STATE OFFSET (dalam detik)
let timeOffset = 0;

const container = document.getElementById("lyrics");
const romajiBtn = document.getElementById("toggle-romaji");
const btnMinus = document.getElementById("offset-minus");
const btnPlus = document.getElementById("offset-plus");
const offsetIndicator = document.getElementById("offset-indicator");


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
// SCROLL ANIMATION (FORCED REFLOW FIXED)
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

    // KITA REMOVE VOID CONTAINER.OFFSETHIGHT AGAR BERJALAN MULUS DAN TIDAK PACK FORCED REFLOW
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
// OFFSET INDICATOR UI HELPER
// ============================================================

function updateOffsetIndicator() {
    if (!offsetIndicator) return;

    if (timeOffset === 0) {
        offsetIndicator.classList.add("hidden");
    } else {
        const sign = timeOffset > 0 ? "+" : "";
        offsetIndicator.textContent = `${sign}${timeOffset.toFixed(1)}s`;
        offsetIndicator.classList.remove("hidden");
    }
}


// ============================================================
// CONTROLS EVENT LISTENERS (ROMAJI & OFFSET)
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
// FETCH LYRICS
// ============================================================

async function fetchLyrics(metadata) {
    try {
        const res = await fetch("http://localhost:3000/api/get-lyrics", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(metadata)
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