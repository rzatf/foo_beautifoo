
// ============================================================
// Beaufoo - app.js
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

const container = document.getElementById("lyrics");
const romajiBtn = document.getElementById("toggle-romaji");


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

    // Jangan kasih spasi untuk CJK / Japanese / Korean
    if (isAsianScript(previousText) || isAsianScript(currentText)) {
        return false;
    }

    // Punctuation
    if (/^[,.;:!?%)\]}]/.test(current)) {
        return false;
    }

    // Apostrophe
    if (current.startsWith("'") || current.startsWith("’")) {
        return false;
    }

    // Kalau word sebelumnya sudah punya spasi
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

    // Tidak ada timing original
    if (origWords.length === 0) {
        return romajiTokens.map(token => ({
            text: token,
            start: line.start,
            end: line.end
        }));
    }

    // Jumlah token romaji sama dengan jumlah word original
    if (romajiTokens.length === origWords.length) {
        return romajiTokens.map((token, idx) => ({
            text: token,
            start: origWords[idx].start,
            end: origWords[idx].end
        }));
    }

    // Fallback:
    // Distribusikan timing berdasarkan panjang token romaji
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

    // Bukan mode romaji
    if (!isRomajiMode || !line.romajiText) {
        return originalWords;
    }

    const originalText = originalWords
        .map(word => word.text)
        .join("");

    // Latin tidak perlu diganti ke romaji
    if (isLatinLikeText(originalText)) {
        return originalWords;
    }

    return getRomajiWordsWithTiming(line);
}


// ============================================================
// LONG GAP HANDLER
// ============================================================
//
// Gap > 3 detik:
//
// previous lyric
//       |
//       | +0.65
//       v
//      ...
//       |
//       | sampai next.start - 0.65
//       v
//   next lyric
//
// Synthetic "..." TIDAK menjadi active lyric.
//
// Timing:
//
// gapStart = previous.end + 0.65
// gapEnd   = next.start - 0.65
//
// Tiga titik akan membagi durasi gap secara merata.
// ============================================================

function addLongGapLines(lyricsData) {
    if (!lyricsData || !Array.isArray(lyricsData.lines)) {
        return lyricsData;
    }

    const newLines = [];

    for (let i = 0; i < lyricsData.lines.length; i++) {
        const line = lyricsData.lines[i];

        newLines.push(line);

        // Tidak ada next line
        if (i >= lyricsData.lines.length - 1) {
            continue;
        }

        const nextLine = lyricsData.lines[i + 1];

        const gap =
            nextLine.start -
            line.end;

        // Hanya gap > 3 detik
        if (gap > 3) {
            const gapStart =
                line.end + 0.65;

            const gapEnd =
                nextLine.start - 0.65;

            newLines.push({
                start: gapStart,
                end: gapEnd,

                text: "...",

                // Penting:
                // synthetic line sekarang punya word timing
                words: [
                    {
                        text: ".",
                        start: gapStart,
                        end: gapStart +
                            ((gapEnd - gapStart) / 3)
                    },
                    {
                        text: ".",
                        start: gapStart +
                            ((gapEnd - gapStart) / 3),
                        end: gapStart +
                            ((gapEnd - gapStart) * 2 / 3)
                    },
                    {
                        text: ".",
                        start: gapStart +
                            ((gapEnd - gapStart) * 2 / 3),
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
    container.addEventListener(
        "wheel",
        markUserScrolling,
        { passive: true }
    );

    container.addEventListener(
        "touchmove",
        markUserScrolling,
        { passive: true }
    );
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
        const lineEl =
            document.createElement("div");

        lineEl.className =
            `lyric-line future ${line.isDuet ? "duet" : ""}`;

        lineEl.dataset.index = lineIndex;


        // --------------------------------------------------------
        // LONG GAP PLACEHOLDER (DIUBAH AGAR SELALU VISIBLE)
        // --------------------------------------------------------

        if (line.isGapLine) {
            lineEl.classList.add("gap-line");

            // Dot gap selalu ditampilkan, tidak di-hide
            lineEl.style.visibility = "visible";
            lineEl.style.opacity = "1";
        }


        // --------------------------------------------------------
        // KARAOKE
        // --------------------------------------------------------

        if (
            lyricsData.type === "karaoke" &&
            Array.isArray(line.words) &&
            line.words.length > 0
        ) {
            const displayWords =
                getDisplayWords(
                    lyricsData,
                    line
                );

            let previousText = "";


            displayWords.forEach(word => {
                const wordSpan =
                    document.createElement("span");

                wordSpan.className = "word";

                wordSpan.dataset.start =
                    word.start;

                wordSpan.dataset.end =
                    word.end;


                const chars =
                    Array.from(word.text);

                const charDuration =
                    chars.length > 0
                        ? (word.end - word.start) /
                          chars.length
                        : 0;


                chars.forEach((char, i) => {
                    const charSpan =
                        document.createElement("span");

                    charSpan.className = "char";

                    charSpan.textContent =
                        char;

                    charSpan.dataset.start =
                        word.start +
                        (i * charDuration);

                    charSpan.dataset.end =
                        word.start +
                        ((i + 1) * charDuration);

                    wordSpan.appendChild(
                        charSpan
                    );
                });


                // Jangan tambahkan spasi
                // antar titik pada gap line
                if (
                    !line.isGapLine &&
                    shouldAddWordSpace(
                        previousText,
                        word.text
                    )
                ) {
                    lineEl.appendChild(
                        document.createTextNode(" ")
                    );
                }


                lineEl.appendChild(
                    wordSpan
                );

                previousText =
                    word.text;
            });
        }


        // --------------------------------------------------------
        // PLAIN
        // --------------------------------------------------------

        else {
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
//
// Placeholder:
//
// hidden
//    |
//    | previous.end + 0.65
//    v
// visible + karaoke
//    |
//    | next.start - 0.65
//    v
// hidden
// ============================================================

function updateGapLineVisibility(time) {
    if (
        !currentLyrics ||
        !currentLyrics.lines
    ) {
        return;
    }

    const lineElements =
        container.querySelectorAll(
            ".lyric-line"
        );

    currentLyrics.lines.forEach(
        (line, index) => {
            if (!line.isGapLine) {
                return;
            }

            const el =
                lineElements[index];

            if (!el) {
                return;
            }

            // Memastikan baris gap selalu visible sepanjang lagu
            el.style.visibility = "visible";
            el.style.opacity = "1";
        }
    );
}


// ============================================================
// ACTIVE LINE
// ============================================================
//
// Gap line selalu di-skip.
//
// Jadi:
//
// previous lyric = active
// ...            = bukan active
// next lyric     = active tepat pada start original
// ============================================================

function getActiveLineIndex(time) {
    if (
        !currentLyrics ||
        !currentLyrics.lines
    ) {
        return -1;
    }

    let activeLineIndex = -1;


    for (
        let i = 0;
        i < currentLyrics.lines.length;
        i++
    ) {
        const line =
            currentLyrics.lines[i];


        // Synthetic "..." tidak pernah active
        if (line.isGapLine) {
            continue;
        }


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
//
// GAP < 1.5
//     -> next.start - 0.65
//
// GAP 1.5 - 3
//     -> previous.end + 0.65
//
// GAP > 3
//     -> "..." pada previous.end + 0.65
//     -> next lyric pada next.start - 0.65
// ============================================================

function getScrollLineIndex(time) {
    if (
        !currentLyrics ||
        !currentLyrics.lines
    ) {
        return -1;
    }

    let scrollIndex = -1;


    for (
        let i = 0;
        i < currentLyrics.lines.length;
        i++
    ) {
        const line =
            currentLyrics.lines[i];


        let triggerTime =
            line.start - 0.65;


        // --------------------------------------------------------
        // GAP PLACEHOLDER
        // --------------------------------------------------------

        if (line.isGapLine) {
            const prevLine =
                currentLyrics.lines[i - 1];

            if (prevLine) {
                triggerTime =
                    prevLine.end + 0.65;
            }
        }


        // --------------------------------------------------------
        // REAL LYRIC
        // --------------------------------------------------------

        else if (i > 0) {

            let previousRealLine = null;


            for (
                let j = i - 1;
                j >= 0;
                j--
            ) {
                if (
                    !currentLyrics.lines[j]
                        .isGapLine
                ) {
                    previousRealLine =
                        currentLyrics.lines[j];

                    break;
                }
            }


            if (previousRealLine) {

                const gap =
                    line.start -
                    previousRealLine.end;


                // GAP 1.5 - 3 DETIK

                if (
                    gap >= 1.5 &&
                    gap <= 3
                ) {
                    triggerTime =
                        previousRealLine.end +
                        0.65;
                }


                // GAP > 3 DETIK
                //
                // Next lyric tetap menggunakan
                // start - 0.65

                else if (gap > 3) {
                    triggerTime =
                        line.start -
                        0.65;
                }
            }
        }


        triggerTime =
            Math.max(
                0,
                triggerTime
            );


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
    if (isUserScrolling) {
        return;
    }


    const lineElements =
        container.querySelectorAll(
            ".lyric-line"
        );


    const activeEl =
        lineElements[scrollLineIndex];


    if (!activeEl) {
        return;
    }


    const targetScrollTop =
        activeEl.offsetTop -
        (container.clientHeight / 2) +
        (activeEl.clientHeight / 2);


    const startScrollTop =
        container.scrollTop;


    const delta =
        startScrollTop -
        targetScrollTop;


    if (Math.abs(delta) < 2) {
        return;
    }


    isProgrammaticScroll = true;


    if (staggerTimeoutId) {
        clearTimeout(
            staggerTimeoutId
        );

        staggerTimeoutId = null;
    }


    // ------------------------------------------------------------
    // LARGE JUMP
    // ------------------------------------------------------------

    if (Math.abs(delta) > 800) {

        container.scrollTop =
            targetScrollTop;


        lineElements.forEach(el => {
            el.style.transition = "";

            el.style.setProperty(
                "--y-offset",
                "0px"
            );
        });


        setTimeout(() => {
            isProgrammaticScroll =
                false;
        }, 50);


        return;
    }


    // ------------------------------------------------------------
    // FASE 1
    // ------------------------------------------------------------

    lineElements.forEach(el => {
        el.style.transition =
            `translate 0s,
             opacity 300ms ease,
             filter 300ms ease,
             transform 300ms ease`;

        el.style.setProperty(
            "--y-offset",
            `${-delta}px`
        );
    });


    // ------------------------------------------------------------
    // FASE 2
    // ------------------------------------------------------------

    container.scrollTop =
        targetScrollTop;

    void container.offsetHeight;


    // ------------------------------------------------------------
    // FASE 3
    // ------------------------------------------------------------

    lineElements.forEach(
        (el, index) => {

            const relativeIndex =
                index -
                (scrollLineIndex - 5);


            const delay =
                Math.max(
                    0,
                    relativeIndex
                ) * 0.035;


            el.style.transition =
                `translate 700ms cubic-bezier(0.42, 0, 0.58, 1) ${delay}s,
                 opacity 300ms ease,
                 filter 300ms ease,
                 transform 300ms ease`;


            el.style.setProperty(
                "--y-offset",
                "0px"
            );
        }
    );


    staggerTimeoutId =
        setTimeout(() => {

            lineElements.forEach(
                el => {
                    el.style.transition =
                        "";
                }
            );

            isProgrammaticScroll =
                false;

        }, 1500);
}


// ============================================================
// LINE STATE
// ============================================================

function updateLineState(activeLineIndex) {
    const lineElements =
        container.querySelectorAll(
            ".lyric-line"
        );


    lineElements.forEach(
        (el, index) => {

            el.classList.remove(
                "past",
                "active",
                "future"
            );


            const line =
                currentLyrics?.lines[index];


            // ----------------------------------------------------
            // GAP LINE
            // ----------------------------------------------------
            //
            // Jangan ikut state active/past/future
            // karena dia punya styling sendiri.
            // ----------------------------------------------------

            if (line?.isGapLine) {
                el.classList.add(
                    "future"
                );

                return;
            }


            // ----------------------------------------------------
            // PAST
            // ----------------------------------------------------

            if (
                index <
                activeLineIndex
            ) {

                el.classList.add(
                    "past"
                );


                if (
                    currentLyrics?.type ===
                    "karaoke"
                ) {

                    el.querySelectorAll(
                        ".word"
                    ).forEach(w => {

                        w.classList.add(
                            "word-passed"
                        );

                        w.classList.remove(
                            "word-active"
                        );


                        w.querySelectorAll(
                            ".char"
                        ).forEach(c => {

                            c.classList.add(
                                "char-active"
                            );

                        });
                    });
                }
            }


            // ----------------------------------------------------
            // ACTIVE
            // ----------------------------------------------------

            else if (
                index ===
                activeLineIndex
            ) {

                el.classList.add(
                    "active"
                );
            }


            // ----------------------------------------------------
            // FUTURE
            // ----------------------------------------------------

            else {

                el.classList.add(
                    "future"
                );


                if (
                    currentLyrics?.type ===
                    "karaoke"
                ) {

                    el.querySelectorAll(
                        ".word"
                    ).forEach(w => {

                        w.classList.remove(
                            "word-active",
                            "word-passed"
                        );


                        w.querySelectorAll(
                            ".char"
                        ).forEach(c => {

                            c.classList.remove(
                                "char-active"
                            );

                        });
                    });
                }
            }
        }
    );
}


// ============================================================
// WORD / CHARACTER PROGRESS
// ============================================================

function updateWordProgress(
    time,
    activeLineIndex
) {
    if (
        !currentLyrics ||
        currentLyrics.type !== "karaoke" ||
        activeLineIndex === -1
    ) {
        return;
    }


    const activeLineEl =
        container.querySelectorAll(
            ".lyric-line"
        )[activeLineIndex];


    if (!activeLineEl) {
        return;
    }


    activeLineEl
        .querySelectorAll(".word")
        .forEach(wordSpan => {

            const wStart =
                parseFloat(
                    wordSpan.dataset.start
                );


            const wEnd =
                parseFloat(
                    wordSpan.dataset.end
                );


            // ----------------------------------------------------
            // WORD PASSED
            // ----------------------------------------------------

            if (time >= wEnd) {

                wordSpan.classList.add(
                    "word-passed"
                );

                wordSpan.classList.remove(
                    "word-active"
                );


                wordSpan
                    .querySelectorAll(".char")
                    .forEach(c => {

                        c.classList.add(
                            "char-active"
                        );

                    });


                return;
            }


            // ----------------------------------------------------
            // WORD ACTIVE
            // ----------------------------------------------------

            if (
                time >= wStart &&
                time < wEnd
            ) {

                wordSpan.classList.add(
                    "word-active"
                );

                wordSpan.classList.remove(
                    "word-passed"
                );


                wordSpan
                    .querySelectorAll(".char")
                    .forEach(
                        charSpan => {

                            const cStart =
                                parseFloat(
                                    charSpan.dataset.start
                                );


                            if (
                                time >=
                                cStart
                            ) {

                                charSpan.classList.add(
                                    "char-active"
                                );

                            } else {

                                charSpan.classList.remove(
                                    "char-active"
                                );
                            }
                        }
                    );


                return;
            }


            // ----------------------------------------------------
            // WORD FUTURE
            // ----------------------------------------------------

            wordSpan.classList.remove(
                "word-active",
                "word-passed"
            );


            wordSpan
                .querySelectorAll(".char")
                .forEach(c => {

                    c.classList.remove(
                        "char-active"
                    );

                });
        });
}


// ============================================================
// GAP KARAOKE PROGRESS
// ============================================================
//
// Karena "..." bukan active lyric,
// progress-nya diproses terpisah.
//
// Setiap titik mempunyai timing sendiri.
//
// .   -> 0% - 33%
// .   -> 33% - 66%
// .   -> 66% - 100%
//
// Jadi visualnya tetap terlihat seperti
// karaoke character animation.
// ============================================================

// ============================================================
// GAP KARAOKE PROGRESS (FIXED)
// ============================================================

function updateGapWordProgress(time) {
    if (!currentLyrics || !currentLyrics.lines) {
        return;
    }

    const lineElements = container.querySelectorAll(".lyric-line");

    currentLyrics.lines.forEach((line, index) => {
        if (!line.isGapLine) {
            return;
        }

        const lineEl = lineElements[index];
        if (!lineEl) {
            return;
        }

        const words = lineEl.querySelectorAll(".word");

        words.forEach(wordSpan => {
            const wStart = parseFloat(wordSpan.dataset.start);
            const wEnd = parseFloat(wordSpan.dataset.end);

            // Cek apakah waktu saat ini berada di dalam rentang dot atau sudah lewat
            if (time >= wStart) {
                wordSpan.classList.add("word-active");
                wordSpan.classList.remove("word-passed");

                wordSpan.querySelectorAll(".char").forEach(charSpan => {
                    const cStart = parseFloat(charSpan.dataset.start);
                    // Biarkan animasi berjalan jika sudah melewati waktu mulai char
                    if (time >= cStart) {
                        if (!charSpan.classList.contains("char-active")) {
                            charSpan.classList.add("char-active");
                        }
                    }
                });

                // Jika waktu sudah melewati akhir dot, ubah ke passed tapi pertahankan state visualnya
                if (time >= wEnd) {
                    wordSpan.classList.add("word-passed");
                    wordSpan.classList.remove("word-active");
                }
            } else {
                // Belum waktunya
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
    if (
        !currentLyrics ||
        !currentLyrics.lines
    ) {
        return;
    }


    // --------------------------------------------------------
    // GAP VISIBILITY
    // --------------------------------------------------------

    updateGapLineVisibility(
        time
    );


    // --------------------------------------------------------
    // ACTIVE LINE
    // --------------------------------------------------------

    const activeLineIndex =
        getActiveLineIndex(
            time
        );


    // --------------------------------------------------------
    // SCROLL LINE
    // --------------------------------------------------------

    const scrollLineIndex =
        getScrollLineIndex(
            time
        );


    // --------------------------------------------------------
    // 1. HIGHLIGHT / LINE STATE
    // --------------------------------------------------------

    if (
        activeLineIndex !==
        lastActiveLineIndex
    ) {

        updateLineState(
            activeLineIndex
        );

        lastActiveLineIndex =
            activeLineIndex;
    }


    // --------------------------------------------------------
    // 2. SCROLL
    // --------------------------------------------------------

    if (
        scrollLineIndex !==
        lastScrollLineIndex
    ) {

        if (
            scrollLineIndex !== -1
        ) {

            scrollToActiveLine(
                scrollLineIndex
            );
        }


        lastScrollLineIndex =
            scrollLineIndex;
    }


    // --------------------------------------------------------
    // 3. NORMAL KARAOKE
    // --------------------------------------------------------

    updateWordProgress(
        time,
        activeLineIndex
    );


    // --------------------------------------------------------
    // 4. GAP KARAOKE
    // --------------------------------------------------------

    updateGapWordProgress(
        time
    );
}


// ============================================================
// PLAYBACK TIME FROM FOOBAR
// ============================================================

function updatePlaybackTime(time) {
    foobarTime =
        Number(time) || 0;

    lastFoobarUpdate =
        performance.now();
}


// ============================================================
// 60 FPS RENDER LOOP
// ============================================================

function renderLoop() {

    if (currentLyrics) {

        const now =
            performance.now();


        const delta =
            (now - lastFoobarUpdate) /
            1000;


        let interpolatedTime =
            foobarTime;


        // Interpolasi hanya kalau update
        // foobar masih fresh.

        if (delta < 0.5) {
            interpolatedTime +=
                delta;
        }


        currentTime =
            interpolatedTime;


        updateLyricsUI(
            currentTime
        );
    }


    requestAnimationFrame(
        renderLoop
    );
}


requestAnimationFrame(
    renderLoop
);


// ============================================================
// ROMAJI TOGGLE
// ============================================================

if (romajiBtn) {

    romajiBtn.addEventListener(
        "click",
        () => {

            isRomajiMode =
                !isRomajiMode;


            romajiBtn.classList.toggle(
                "active",
                isRomajiMode
            );


            if (currentLyrics) {

                renderLyricsDOM(
                    currentLyrics
                );


                updateGapLineVisibility(
                    currentTime
                );


                updateLineState(
                    lastActiveLineIndex
                );


                updateWordProgress(
                    currentTime,
                    lastActiveLineIndex
                );


                updateGapWordProgress(
                    currentTime
                );
            }
        }
    );
}


// ============================================================
// LOAD LYRICS
// ============================================================

function loadLyrics(data) {

    // Tambahkan synthetic "..."
    // untuk gap > 3 detik.

    currentLyrics =
        addLongGapLines(
            data
        );


    foobarTime = 0;
    currentTime = 0;


    lastActiveLineIndex = -1;
    lastScrollLineIndex = -1;


    renderLyricsDOM(
        currentLyrics
    );


    updateLyricsUI(0);
}


// ============================================================
// FETCH LYRICS
// ============================================================

async function fetchLyrics(metadata) {

    try {

        const res =
            await fetch(
                "http://localhost:3000/api/get-lyrics",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(
                            metadata
                        )
                }
            );


        if (!res.ok) {
            return null;
        }


        const data =
            await res.json();


        // Format utama

        if (
            data &&
            data.type &&
            Array.isArray(
                data.lines
            )
        ) {
            return data;
        }


        // Format legacy

        if (
            data &&
            data.success &&
            data.lyrics
        ) {
            return data.lyrics;
        }


        return null;

    } catch (err) {

        console.error(
            "[App] Gagal fetch lyrics:",
            err
        );

        return null;
    }
}


// ============================================================
// FOOBAR2000 BRIDGE
// ============================================================

if (
    typeof initFoobarBridge ===
    "function"
) {

    initFoobarBridge(

        // ------------------------------------------------------
        // TRACK CHANGED
        // ------------------------------------------------------

        async (trackMetadata) => {

            // Reset lyric sementara

            currentLyrics =
                null;

            container.innerHTML =
                "";


            // Reset active / scroll tracker

            lastActiveLineIndex =
                -1;

            lastScrollLineIndex =
                -1;


            // Fetch lyric baru

            const lyrics =
                await fetchLyrics(
                    trackMetadata
                );


            if (lyrics) {

                loadLyrics(
                    lyrics
                );
            }
        },


        // ------------------------------------------------------
        // POSITION UPDATE
        // ------------------------------------------------------

        position => {

            updatePlaybackTime(
                position
            );
        }
    );
}

