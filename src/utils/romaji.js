// src/utils/romaji.js

const Kuroshiro = require("kuroshiro").default;
const KuromojiAnalyzer = require("kuroshiro-analyzer-kuromoji");
const { pinyin } = require("pinyin-pro");
const hangulRomanization = require("hangul-romanization");

const kuroshiro = new Kuroshiro();

let isKuroshiroInitialized = false;

async function initKuroshiro() {
    if (!isKuroshiroInitialized) {
        await kuroshiro.init(new KuromojiAnalyzer());
        isKuroshiroInitialized = true;
    }
}

function isJapanese(text) {
    return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
}

function isKorean(text) {
    return /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/.test(text);
}

function isChinese(text) {
    const hasCJK = /[\u4e00-\u9fff]/.test(text);
    const hasKana = /[\u3040-\u30ff]/.test(text);

    return hasCJK && !hasKana;
}

function normalizeText(str) {
    if (!str) {
        return "";
    }

    return str
        .replace(/ā/g, "aa")
        .replace(/ī/g, "ii")
        .replace(/ū/g, "uu")
        .replace(/ē/g, "ee")
        .replace(/ō/g, "ou")
        .trim();
}

/**
 * Mengambil teks asli yang akan diberikan ke romanizer.
 *
 * Untuk karaoke:
 *   line.words = [
 *       { text: "可" },
 *       { text: "愛" },
 *       { text: "く" },
 *       { text: "て" }
 *   ]
 *
 * Jangan menggunakan line.text jika line.text sudah mengandung
 * spasi antar karakter. Gabungkan word.text secara langsung.
 *
 * Hasil:
 *   "可愛くて"
 *
 * Untuk lyrics biasa:
 *   gunakan line.text seperti biasa.
 */
function getTextForRomaji(lyricsData, line) {
    if (
        lyricsData.type === "karaoke" &&
        Array.isArray(line.words) &&
        line.words.length > 0
    ) {
        return line.words
            .map(word => word?.text || "")
            .join("");
    }

    return line.text || "";
}

async function attachRomajiToLyrics(lyricsData) {
    if (!lyricsData || !lyricsData.lines) {
        return lyricsData;
    }

    for (const line of lyricsData.lines) {
        /**
         * Ambil teks untuk romanization.
         *
         * Karaoke:
         *   line.words -> digabung tanpa spasi
         *
         * Line:
         *   line.text langsung
         */
        const text = getTextForRomaji(lyricsData, line);

        if (!text) {
            continue;
        }

        /**
         * DEBUG
         *
         * Ini berguna untuk memastikan romanizer menerima
         * teks utuh, bukan teks karaoke yang sudah terpisah.
         */
        // if (lyricsData.type === "karaoke") {
        //     console.log(
        //         "[Romaji] Original line.text:",
        //         JSON.stringify(line.text)
        //     );

        //     console.log(
        //         "[Romaji] Karaoke words:",
        //         line.words?.map(word => word?.text)
        //     );

        //     console.log(
        //         "[Romaji] Input romanizer:",
        //         JSON.stringify(text)
        //     );
        // }

        // =========================================================
        // 1. KOREA
        // Hangul -> Revised Romanization
        // =========================================================
        if (isKorean(text)) {
            try {
                line.romajiText =
                    hangulRomanization.convert(text);
            } catch (e) {
                console.warn(
                    "[Romaji] Korean conversion gagal:",
                    e
                );

                line.romajiText = text;
            }
        }

        // =========================================================
        // 2. CINA
        // Hanzi -> Pinyin
        // =========================================================
        else if (isChinese(text)) {
            try {
                line.romajiText =
                    pinyin(text, {
                        toneType: "none",
                        type: "array"
                    }).join(" ");
            } catch (e) {
                console.warn(
                    "[Romaji] Chinese conversion gagal:",
                    e
                );

                line.romajiText = text;
            }
        }

        // =========================================================
        // 3. JEPANG
        // Kanji / Kana -> Romaji
        // =========================================================
        else if (isJapanese(text)) {
            try {
                await initKuroshiro();

                const rawFull =
                    await kuroshiro.convert(text, {
                        to: "romaji",
                        mode: "spaced",
                        romajiSystem: "hepburn"
                    });

                line.romajiText =
                    normalizeText(rawFull);
            } catch (e) {
                console.warn(
                    "[Romaji] Japanese conversion gagal:",
                    e
                );

                line.romajiText = text;
            }
        }

        // =========================================================
        // 4. LATIN / LAINNYA
        // Tidak perlu romanization
        // =========================================================
        else {
            line.romajiText = text;
        }

        /**
         * DEBUG HASIL
         */
        // if (lyricsData.type === "karaoke") {
        //     console.log(
        //         "[Romaji] Output:",
        //         JSON.stringify(line.romajiText)
        //     );
        // }
    }

    return lyricsData;
}

module.exports = {
    attachRomajiToLyrics
};