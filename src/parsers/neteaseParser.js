function cleanText(str) {
    if (!str) return "";

    return String(str)
        .replace(/\u00A0/g, " ")
        .replace(/\r/g, "")
        .replace(/\s+/g, " ")
        .trim();
}


// ============================================================
// PARSE YRC / NETEASE KARAOKE
// ============================================================

function parseYRC(rawLyric) {
    if (!rawLyric) return null;

    const lines = [];
    const rawLines = String(rawLyric).split("\n");

    for (const lineStr of rawLines) {
        const trimmed = lineStr.trim();

        if (!trimmed) continue;

        /*
         * NetEase YRC:
         *
         * [lineStart,lineDuration]...
         *
         * Word:
         * (wordStart,wordDuration,wordFlag)text
         *
         * Timestamp word bersifat ABSOLUTE.
         */
        const lineMatch = trimmed.match(
            /^\[(\d+),(\d+)\](.*)$/
        );

        if (!lineMatch) continue;

        const lineStartMs = parseInt(lineMatch[1], 10);
        const lineDurationMs = parseInt(lineMatch[2], 10);
        const content = lineMatch[3];

        if (!content) continue;

        const wordRegex = /\((\d+),(\d+),\d+\)([^\(]*)/g;

        const words = [];
        let match;

        while ((match = wordRegex.exec(content)) !== null) {
            const wordStartMs = parseInt(match[1], 10);
            const wordDurationMs = parseInt(match[2], 10);

            const rawWordText = match[3];

            const text = cleanText(rawWordText);

            if (!text) continue;

            const start = wordStartMs / 1000;
            const end = (wordStartMs + wordDurationMs) / 1000;

            words.push({
                text,
                start: Number(start.toFixed(2)),
                end: Number(end.toFixed(2))
            });
        }

        /*
         * Beberapa YRC bisa punya line timestamp
         * tetapi word timestamp tidak berhasil diparse.
         *
         * Jangan buang line begitu saja.
         */
        if (words.length === 0) {
            const fallbackText = cleanText(
                content.replace(/\(\d+,\d+,\d+\)/g, "")
            );

            if (!fallbackText) continue;

            const start = lineStartMs / 1000;
            const end =
                (lineStartMs + lineDurationMs) / 1000;

            lines.push({
                start: Number(start.toFixed(2)),
                end: Number(end.toFixed(2)),
                text: fallbackText,
                isDuet: false,
                words: [
                    {
                        text: fallbackText,
                        start: Number(start.toFixed(2)),
                        end: Number(end.toFixed(2))
                    }
                ]
            });

            continue;
        }

        /*
         * Bangun text dari word.
         *
         * Jangan menambahkan spasi secara paksa di sini.
         * Renderer frontend kamu sudah menangani spacing.
         */
        const fullText = words
            .map(word => word.text)
            .join("")
            .trim();

        if (!fullText) continue;

        /*
         * Buang metadata composer/songwriter.
         */
        if (
            fullText.includes("作词") ||
            fullText.includes("作曲") ||
            fullText.includes("编曲") ||
            fullText.includes("制作人")
        ) {
            continue;
        }

        const isDuet =
            fullText.startsWith("(") ||
            fullText.startsWith("（") ||
            fullText.endsWith(")") ||
            fullText.endsWith("）");

        const displayText = fullText
            .replace(/[\(\)（）]/g, "")
            .trim();

        lines.push({
            start: words[0].start,
            end: words[words.length - 1].end,
            text: displayText,
            isDuet,
            words
        });
    }

    if (lines.length === 0) {
        return null;
    }

    lines.sort((a, b) => a.start - b.start);

    return {
        type: "karaoke",
        source: "netease",
        lines
    };
}


// ============================================================
// PARSE LRC
// ============================================================

function parseLRC(rawLyric) {
    if (!rawLyric) return null;

    const lines = [];

    for (const lineStr of String(rawLyric).split("\n")) {
        const trimmed = lineStr.trim();

        if (!trimmed) continue;

        /*
         * Support:
         *
         * [01:23.45]Text
         * [01:23:45]Text
         */
        const match = trimmed.match(
            /^\[(\d+):(\d+(?:\.\d+)?)(?::(\d+(?:\.\d+)?))?\](.*)$/
        );

        if (!match) continue;

        let minutes = parseInt(match[1], 10);
        let seconds = parseFloat(match[2]);

        if (match[3] !== undefined) {
            minutes = parseInt(match[1], 10) * 60 +
                      parseInt(match[2], 10);

            seconds = parseFloat(match[3]);
        }

        const start = minutes * 60 + seconds;

        const text = cleanText(match[4]);

        if (!text) continue;

        /*
         * Metadata LRC
         */
        if (
            /^\[(ar|ti|al|by|offset|re|ve|length):/i.test(trimmed)
        ) {
            continue;
        }

        lines.push({
            start: Number(start.toFixed(2)),
            end: null,
            text,
            isDuet: false
        });
    }

    if (lines.length === 0) {
        return null;
    }

    lines.sort((a, b) => a.start - b.start);

    /*
     * Hitung end berdasarkan line berikutnya.
     */
    for (let i = 0; i < lines.length; i++) {
        if (i < lines.length - 1) {
            lines[i].end = lines[i + 1].start;
        } else {
            /*
             * Tidak ada timestamp akhir dari LRC.
             * Kasih sedikit fallback duration.
             */
            lines[i].end = lines[i].start + 5;
        }
    }

    return {
        type: "line",
        source: "netease",
        lines
    };
}


// ============================================================
// PARSE PLAIN TEXT
// ============================================================

function parsePlainText(rawLyric) {
    if (!rawLyric) return null;

    const lines = String(rawLyric)
        .split("\n")
        .map(cleanText)
        .filter(Boolean);

    if (lines.length === 0) {
        return null;
    }

    return {
        type: "line",
        source: "netease",
        lines: lines.map(text => ({
            start: 0,
            end: 0,
            text,
            isDuet: false
        }))
    };
}


// ============================================================
// PARSE NETEASE RESPONSE
// ============================================================

function parseNetEase(rawData) {
    if (!rawData) return null;

    /*
     * Provider NetEase kita nanti mengembalikan:
     *
     * rawLyric   = YRC atau LRC utama
     * lrcLyric   = LRC
     * transLyric = translation
     * romaLyric  = romalrc
     */

    const yrcSource =
        rawData.yrcLyric ||
        (
            rawData.rawLyric &&
            /^\[\d+,\d+\]/m.test(rawData.rawLyric)
                ? rawData.rawLyric
                : null
        );

    const lrcSource =
        rawData.lrcLyric ||
        (
            rawData.rawLyric &&
            !/^\[\d+,\d+\]/m.test(rawData.rawLyric)
                ? rawData.rawLyric
                : null
        );

    let result = null;

    /*
     * PRIORITAS:
     *
     * YRC karaoke
     * ↓
     * LRC line
     */
    if (yrcSource) {
        result = parseYRC(yrcSource);
    }

    if (!result && lrcSource) {
        result = parseLRC(lrcSource);
    }

    if (!result && rawData.rawLyric) {
        result = parsePlainText(rawData.rawLyric);
    }

    if (!result) {
        return null;
    }

    /*
     * Simpan source tambahan.
     * Ini penting supaya lyricsEngine / frontend
     * bisa menggunakan data translation dan romaji.
     */
    result.translation = rawData.transLyric || null;
    result.romaji = rawData.romaLyric || null;

    /*
     * Metadata lagu dari provider.
     */
    if (rawData.song) {
        result.song = rawData.song;
    }

    /*
     * Simpan raw data tambahan untuk debugging / future parser.
     */
    result.raw = {
        yrc: rawData.yrcLyric || null,
        lrc: rawData.lrcLyric || null,
        translation: rawData.transLyric || null,
        romaji: rawData.romaLyric || null
    };

    return result;
}


module.exports = {
    parseNetEase,
    parseYRC,
    parseLRC,
    parsePlainText
};