let currentLyrics = null;

let currentTime = 0;

let isPlaying = false;

let isUserScrolling = false;

let userScrollTimeout = null;

let isProgrammaticScroll = false;

let lastActiveLineIndex = -1;

let isRomajiMode = false;

const container = document.getElementById("lyrics");

const romajiBtn =
    document.getElementById("toggle-romaji");


// ============================================================
// HELPER: DETEKSI SCRIPT
// ============================================================

function isCJKOrJapanese(text) {
    if (!text) {
        return false;
    }

    return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(
        text
    );
}

function isKorean(text) {
    if (!text) {
        return false;
    }

    return /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/.test(
        text
    );
}

function isAsianScript(text) {
    return (
        isCJKOrJapanese(text) ||
        isKorean(text)
    );
}


// ============================================================
// HELPER: SPASI ANTAR WORD KARAOKE
// ============================================================

function shouldAddWordSpace(
    previousText,
    currentText
) {
    if (!previousText) {
        return false;
    }

    if (!currentText) {
        return false;
    }

    const current =
        currentText.trimStart();


    // --------------------------------------------------------
    // JAPANG / CINA / KOREA
    //
    // Jangan tambahkan spasi antar karakter/word.
    //
    // Contoh:
    // 可 + 愛 + く + て
    //
    // menjadi:
    // 可愛くて
    //
    // bukan:
    // 可 愛 く て
    // --------------------------------------------------------

    if (
        isAsianScript(previousText) ||
        isAsianScript(currentText)
    ) {
        return false;
    }


    // --------------------------------------------------------
    // TANDA BACA
    //
    // Tanda baca harus menempel ke kata sebelumnya.
    // --------------------------------------------------------

    const punctuation =
        /^[,.;:!?%)\]}]/;

    if (punctuation.test(current)) {
        return false;
    }


    // --------------------------------------------------------
    // APOSTROPHE
    //
    // don't
    // I'm
    // you're
    // --------------------------------------------------------

    if (
        current.startsWith("'") ||
        current.startsWith("’")
    ) {
        return false;
    }


    // --------------------------------------------------------
    // Jika word sebelumnya sudah punya spasi
    // jangan tambahkan lagi.
    // --------------------------------------------------------

    if (
        /\s$/.test(previousText)
    ) {
        return false;
    }


    // --------------------------------------------------------
    // LATIN
    //
    // Word normal tetap diberi spasi.
    //
    // But + you
    // menjadi:
    // But you
    // --------------------------------------------------------

    return true;
}


// ============================================================
// HELPER: DETEKSI APAKAH LINE ADALAH LATIN
// ============================================================

function isLatinLikeText(text) {
    if (!text) {
        return false;
    }

    return !isAsianScript(text);
}


// ============================================================
// HELPER: GET ORIGINAL KARAOKE WORDS
// ============================================================

function getOriginalWords(line) {
    if (
        !line ||
        !Array.isArray(line.words)
    ) {
        return [];
    }

    return line.words.filter(
        word =>
            word &&
            typeof word.text === "string" &&
            word.text.length > 0
    );
}


// ============================================================
// HELPER: CALCULATE ROMAJI WORD TIMING
// ============================================================

function getRomajiWordsWithTiming(line) {

    if (!line || !line.romajiText) {
        return [];
    }


    // --------------------------------------------------------
    // Ambil token romaji.
    //
    // Contoh:
    //
    // "kawaii kute"
    //
    // menjadi:
    //
    // ["kawaii", "kute"]
    // --------------------------------------------------------

    const romajiTokens =
        line.romajiText
            .split(/\s+/)
            .filter(Boolean);


    if (
        romajiTokens.length === 0
    ) {
        return [];
    }


    const origWords =
        getOriginalWords(line);


    // --------------------------------------------------------
    // Tidak ada timing word asli.
    // --------------------------------------------------------

    if (
        origWords.length === 0
    ) {
        return romajiTokens.map(
            token => ({
                text: token,
                start: line.start,
                end: line.end
            })
        );
    }


    // --------------------------------------------------------
    // Jumlah token sama dengan word asli.
    //
    // Paling ideal karena timing bisa
    // dipasangkan langsung.
    // --------------------------------------------------------

    if (
        romajiTokens.length ===
        origWords.length
    ) {
        return romajiTokens.map(
            (token, idx) => ({
                text: token,
                start:
                    origWords[idx].start,
                end:
                    origWords[idx].end
            })
        );
    }


    // --------------------------------------------------------
    // FALLBACK
    //
    // Jumlah token romaji berbeda dengan
    // jumlah word asli.
    //
    // Distribusikan timing berdasarkan
    // panjang token.
    // --------------------------------------------------------

    const totalDuration =
        line.end - line.start;

    const lineStart =
        line.start;

    const totalChars =
        romajiTokens.reduce(
            (acc, token) =>
                acc + token.length,
            0
        );

    let currentStart =
        lineStart;


    return romajiTokens.map(
        token => {

            const weight =
                totalChars > 0
                    ? token.length /
                      totalChars
                    : 1 /
                      romajiTokens.length;

            const duration =
                totalDuration * weight;

            const wordStart =
                currentStart;

            const wordEnd =
                wordStart + duration;

            currentStart =
                wordEnd;


            return {
                text: token,
                start: wordStart,
                end: wordEnd
            };
        }
    );
}


// ============================================================
// HELPER: ROMAJI KARAOKE WORDS
// ============================================================
//
// Kalau lagu Latin:
//   jangan gunakan line.romajiText yang mungkin sudah
//   kehilangan spasi karena proses backend.
//
// Gunakan word asli.
//
// Kalau Jepang/Cina/Korea:
//   gunakan hasil romanization.
//

function getDisplayWords(
    lyricsData,
    line
) {
    const originalWords =
        getOriginalWords(line);


    // --------------------------------------------------------
    // Bukan mode romaji
    // --------------------------------------------------------

    if (!isRomajiMode) {
        return originalWords;
    }


    // --------------------------------------------------------
    // Tidak ada romaji
    // --------------------------------------------------------

    if (!line.romajiText) {
        return originalWords;
    }


    // --------------------------------------------------------
    // Cari tahu apakah teks aslinya Asian Script.
    //
    // Kita cek gabungan word asli, bukan line.text,
    // karena line.text dari provider karaoke bisa saja
    // memiliki spacing yang aneh.
    // --------------------------------------------------------

    const originalText =
        originalWords
            .map(word => word.text)
            .join("");


    // --------------------------------------------------------
    // LATIN
    //
    // Tidak perlu romanization.
    //
    // Jangan menggunakan:
    //
    // line.romajiText
    //
    // karena romaji.js sekarang mungkin menghasilkan:
    //
    // Butyouturnedinto...
    //
    // Gunakan word asli agar spacing tetap benar.
    // --------------------------------------------------------

    if (
        isLatinLikeText(originalText)
    ) {
        return originalWords;
    }


    // --------------------------------------------------------
    // NON-LATIN
    //
    // Gunakan hasil romanization.
    // --------------------------------------------------------

    return getRomajiWordsWithTiming(
        line
    );
}


// ============================================================
// 1. DETEKSI USER SCROLL
// ============================================================

container.addEventListener(
    "wheel",
    markUserScrolling,
    {
        passive: true
    }
);

container.addEventListener(
    "touchmove",
    markUserScrolling,
    {
        passive: true
    }
);


function markUserScrolling() {

    isUserScrolling = true;


    if (userScrollTimeout) {
        clearTimeout(
            userScrollTimeout
        );
    }


    userScrollTimeout =
        setTimeout(
            () => {
                isUserScrolling = false;
            },
            3000
        );
}


// ============================================================
// 2. DETEKSI PROGRAMMATIC SCROLL
// ============================================================

container.addEventListener(
    "scroll",
    () => {

        if (isProgrammaticScroll) {

            setTimeout(
                () => {
                    isProgrammaticScroll =
                        false;
                },
                100
            );
        }
    }
);


// ============================================================
// 3. RENDER LYRICS KE DOM
// ============================================================

function renderLyricsDOM(
    lyricsData
) {

    container.innerHTML = "";


    if (
        !lyricsData ||
        !lyricsData.lines
    ) {
        return;
    }


    container.className =
        lyricsData.type === "karaoke"
            ? "mode-karaoke"
            : "mode-plain";


    lyricsData.lines.forEach(
        (line, lineIndex) => {

            const lineEl =
                document.createElement(
                    "div"
                );


            lineEl.className =
                `lyric-line future ${
                    line.isDuet
                        ? "duet"
                        : ""
                }`;


            lineEl.dataset.index =
                lineIndex;


            // =================================================
            // KARAOKE
            // =================================================

            if (
                lyricsData.type ===
                    "karaoke" &&
                Array.isArray(
                    line.words
                ) &&
                line.words.length > 0
            ) {

                const displayWords =
                    getDisplayWords(
                        lyricsData,
                        line
                    );


                let previousText = "";


                displayWords.forEach(
                    word => {

                        const wordSpan =
                            document.createElement(
                                "span"
                            );


                        wordSpan.className =
                            "word";


                        wordSpan.textContent =
                            word.text;


                        wordSpan.dataset.start =
                            word.start;


                        wordSpan.dataset.end =
                            word.end;


                        wordSpan.style.setProperty(
                            "--progress",
                            "0%"
                        );


                        // -------------------------------------
                        // Tambahkan spasi hanya jika memang perlu
                        // -------------------------------------

                        if (
                            shouldAddWordSpace(
                                previousText,
                                word.text
                            )
                        ) {

                            lineEl.appendChild(
                                document.createTextNode(
                                    " "
                                )
                            );
                        }


                        lineEl.appendChild(
                            wordSpan
                        );


                        previousText =
                            word.text;
                    }
                );
            }


            // =================================================
            // LYRIC BIASA
            // =================================================

            else {

                lineEl.textContent =
                    (
                        isRomajiMode &&
                        line.romajiText
                    )
                        ? line.romajiText
                        : line.text;
            }


            container.appendChild(
                lineEl
            );
        }
    );
}


// ============================================================
// 4. CARI BARIS AKTIF
// ============================================================

function getActiveLineIndex(
    time
) {

    if (
        !currentLyrics ||
        !currentLyrics.lines
    ) {
        return -1;
    }


    let activeLineIndex = -1;


    for (
        let i = 0;
        i <
        currentLyrics.lines.length;
        i++
    ) {

        const line =
            currentLyrics.lines[i];


        if (
            time >= line.start
        ) {

            activeLineIndex = i;

        } else {

            break;
        }
    }


    return activeLineIndex;
}


// ============================================================
// 5. UPDATE STATUS BARIS
// ============================================================

function updateLineState(
    activeLineIndex
) {

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


            // -----------------------------------------------
            // BARIS SUDAH LEWAT
            // -----------------------------------------------

            if (
                index <
                activeLineIndex
            ) {

                el.classList.add(
                    "past"
                );


                if (
                    currentLyrics &&
                    currentLyrics.type ===
                        "karaoke"
                ) {

                    const wordSpans =
                        el.querySelectorAll(
                            ".word"
                        );


                    wordSpans.forEach(
                        span => {

                            span.style.setProperty(
                                "--progress",
                                "100%"
                            );


                            span.classList.add(
                                "word-passed"
                            );


                            span.classList.remove(
                                "word-active"
                            );
                        }
                    );
                }
            }


            // -----------------------------------------------
            // BARIS AKTIF
            // -----------------------------------------------

            else if (
                index ===
                activeLineIndex
            ) {

                el.classList.add(
                    "active"
                );
            }


            // -----------------------------------------------
            // BARIS BELUM LEWAT
            // -----------------------------------------------

            else {

                el.classList.add(
                    "future"
                );


                if (
                    currentLyrics &&
                    currentLyrics.type ===
                        "karaoke"
                ) {

                    const wordSpans =
                        el.querySelectorAll(
                            ".word"
                        );


                    wordSpans.forEach(
                        span => {

                            span.style.setProperty(
                                "--progress",
                                "0%"
                            );


                            span.classList.remove(
                                "word-active",
                                "word-passed"
                            );
                        }
                    );
                }
            }
        }
    );
}


// ============================================================
// 6. AUTO SCROLL
// ============================================================

function scrollToActiveLine(
    activeLineIndex
) {

    if (isUserScrolling) {
        return;
    }


    const lineElements =
        container.querySelectorAll(
            ".lyric-line"
        );


    const activeEl =
        lineElements[
            activeLineIndex
        ];


    if (!activeEl) {
        return;
    }


    const targetScrollTop =
        activeEl.offsetTop -
        (
            container.clientHeight /
            2
        ) +
        (
            activeEl.clientHeight /
            2
        );


    isProgrammaticScroll =
        true;


    container.scrollTo({
        top: targetScrollTop,
        behavior: "smooth"
    });
}


// ============================================================
// 7. UPDATE ANIMASI PER KATA
// ============================================================

function updateWordProgress(
    time,
    activeLineIndex
) {

    if (
        !currentLyrics ||
        currentLyrics.type !==
            "karaoke" ||
        activeLineIndex === -1
    ) {
        return;
    }


    const lineElements =
        container.querySelectorAll(
            ".lyric-line"
        );


    const activeLineEl =
        lineElements[
            activeLineIndex
        ];


    if (!activeLineEl) {
        return;
    }


    const wordSpans =
        activeLineEl.querySelectorAll(
            ".word"
        );


    wordSpans.forEach(
        span => {

            const wStart =
                parseFloat(
                    span.dataset.start
                );


            const wEnd =
                parseFloat(
                    span.dataset.end
                );


            // ------------------------------------------------
            // WORD SUDAH SELESAI
            // ------------------------------------------------

            if (
                time >= wEnd
            ) {

                span.style.setProperty(
                    "--progress",
                    "100%"
                );


                span.classList.add(
                    "word-passed"
                );


                span.classList.remove(
                    "word-active"
                );


                return;
            }


            // ------------------------------------------------
            // WORD SEDANG DINYANYIKAN
            // ------------------------------------------------

            if (
                time >= wStart &&
                time < wEnd
            ) {

                const duration =
                    wEnd - wStart;


                if (
                    duration <= 0
                ) {

                    span.style.setProperty(
                        "--progress",
                        "100%"
                    );


                    span.classList.add(
                        "word-passed"
                    );


                    span.classList.remove(
                        "word-active"
                    );


                    return;
                }


                const elapsed =
                    time - wStart;


                const progressPercent =
                    Math.min(
                        100,
                        Math.max(
                            0,
                            (
                                elapsed /
                                duration
                            ) *
                            100
                        )
                    );


                span.style.setProperty(
                    "--progress",
                    `${progressPercent}%`
                );


                span.classList.add(
                    "word-active"
                );


                span.classList.remove(
                    "word-passed"
                );


                return;
            }


            // ------------------------------------------------
            // WORD BELUM DINYANYIKAN
            // ------------------------------------------------

            span.style.setProperty(
                "--progress",
                "0%"
            );


            span.classList.remove(
                "word-active",
                "word-passed"
            );
        }
    );
}


// ============================================================
// 8. UPDATE SEMUA UI
// ============================================================

function updateLyricsUI(
    time
) {

    if (
        !currentLyrics ||
        !currentLyrics.lines
    ) {
        return;
    }


    const activeLineIndex =
        getActiveLineIndex(
            time
        );


    if (
        activeLineIndex !==
        lastActiveLineIndex
    ) {

        updateLineState(
            activeLineIndex
        );


        if (
            activeLineIndex !== -1
        ) {

            scrollToActiveLine(
                activeLineIndex
            );
        }


        lastActiveLineIndex =
            activeLineIndex;
    }


    updateWordProgress(
        time,
        activeLineIndex
    );
}


// ============================================================
// 9. PLAYBACK TIME DARI FOOBAR
// ============================================================

function updatePlaybackTime(
    time
) {

    currentTime =
        Number(time) || 0;


    updateLyricsUI(
        currentTime
    );
}


// ============================================================
// 10. TOGGLE ROMAJI
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


                updateLineState(
                    lastActiveLineIndex
                );


                updateWordProgress(
                    currentTime,
                    lastActiveLineIndex
                );
            }
        }
    );
}


// ============================================================
// 11. LOAD LYRICS
// ============================================================

function loadLyrics(
    data
) {

    currentLyrics = data;

    currentTime = 0;

    lastActiveLineIndex = -1;


    console.log(
        "[App] Lyrics berhasil dimuat."
    );


    console.log(
        "[App] Type:",
        data.type
    );


    console.log(
        "[App] Source:",
        data.source
    );


    console.log(
        "[App] Lines:",
        data.lines?.length || 0
    );


    console.table(
        data.lines.map(
            (line, i) => ({
                index: i,
                start: line.start,
                end: line.end,
                text: line.text
            })
        )
    );


    renderLyricsDOM(
        data
    );


    updateLyricsUI(
        currentTime
    );
}


// ============================================================
// 12. FETCH LYRICS DARI BACKEND
// ============================================================

async function fetchLyrics(
    metadata
) {

    console.log(
        "[App] Meminta lyrics ke backend..."
    );


    console.log(
        "[App] Metadata:",
        metadata
    );


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


        console.log(
            "[App] Backend HTTP:",
            res.status
        );


        if (!res.ok) {

            let errorData =
                null;


            try {

                errorData =
                    await res.json();

            } catch (e) {}


            console.warn(
                "[App] Backend gagal:",
                errorData
            );


            return null;
        }


        const data =
            await res.json();


        console.log(
            "[App] Response backend:",
            data
        );


        // ----------------------------------------------------
        // RESPONSE LANGSUNG
        //
        // {
        //   type: "line",
        //   source: "...",
        //   lines: [...]
        // }
        // ----------------------------------------------------

        if (
            data &&
            data.type &&
            Array.isArray(
                data.lines
            )
        ) {

            return data;
        }


        // ----------------------------------------------------
        // RESPONSE WRAPPER
        //
        // {
        //   success: true,
        //   lyrics: {...}
        // }
        // ----------------------------------------------------

        if (
            data &&
            data.success &&
            data.lyrics
        ) {

            return data.lyrics;
        }


        console.error(
            "[App] Format response lyrics tidak dikenali:",
            data
        );


        return null;

    } catch (err) {

        console.error(
            "[App] Gagal menghubungi backend:",
            err
        );


        return null;
    }
}


// ============================================================
// 13. FOOBAR2000 BRIDGE
// ============================================================

if (
    typeof initFoobarBridge ===
    "function"
) {

    console.log(
        "[App] Menghubungkan ke foobar2000..."
    );


    initFoobarBridge(

        // ====================================================
        // TRACK BERUBAH
        // ====================================================

        async (
            trackMetadata
        ) => {

            console.log(
                "================================"
            );


            console.log(
                "[App] TRACK BERUBAH"
            );


            console.log(
                "[App] Title:",
                trackMetadata.title
            );


            console.log(
                "[App] Artist:",
                trackMetadata.artist
            );


            console.log(
                "[App] Album:",
                trackMetadata.album
            );


            console.log(
                "[App] Duration:",
                trackMetadata.duration
            );


            console.log(
                "================================"
            );


            // ------------------------------------------------
            // RESET LAGU LAMA
            // ------------------------------------------------

            currentLyrics = null;

            container.innerHTML = "";

            lastActiveLineIndex = -1;

            currentTime = 0;


            // ------------------------------------------------
            // AMBIL LYRICS BARU
            //
            // PENTING:
            //
            // isRomajiMode TIDAK di-reset.
            //
            // Jadi kalau user memang sedang memakai
            // mode romaji, tombol tetap ON.
            //
            // Tapi renderer sekarang bisa membedakan:
            //
            // Latin karaoke
            // vs
            // Jepang/Cina/Korea karaoke
            // ------------------------------------------------

            const lyrics =
                await fetchLyrics(
                    trackMetadata
                );


            if (lyrics) {

                loadLyrics(
                    lyrics
                );


                updateLyricsUI(
                    currentTime
                );

            } else {

                console.warn(
                    "[App] Lyrics tidak ditemukan."
                );
            }
        },


        // ====================================================
        // PLAYBACK POSITION
        // ====================================================

        position => {

            updatePlaybackTime(
                position
            );
        }
    );

} else {

    console.warn(
        "[App] initFoobarBridge tidak ditemukan."
    );


    console.warn(
        "[App] Pastikan bridge.js dimuat sebelum app.js."
    );
}