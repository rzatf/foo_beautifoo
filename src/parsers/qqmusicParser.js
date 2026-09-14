

/**
 * QQ Music / QRC parser
 *
 * Mendukung:
 * 1. QQ Music QRC:
 *    <Lyric_1 LyricType="1" LyricContent="..."/>
 *
 *    [lineStart,lineDuration]word(wordStart,wordDuration)...
 *
 * 2. LRC biasa:
 *    [mm:ss.xx]text
 *
 * Output:
 * {
 *     type: "karaoke" | "line",
 *     source: "qqmusic",
 *     lines: [...]
 * }
 */

/* =========================================================
 * Utility
 * ========================================================= */

function roundTime(ms) {
    return parseFloat((ms / 1000).toFixed(2));
}

function cleanText(text) {
    if (!text) return "";

    return String(text)
        .replace(/\r/g, "")
        .replace(/\u00A0/g, " ");
}

function decodeXmlEntities(text) {
    if (!text) return "";

    return String(text)
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

/* =========================================================
 * QRC parser
 * ========================================================= */

/*
 * LDDC:
 *
 * _LINE_SPLIT_PATTERN =
 * /^\[(\d+),(\d+)\](.*)$/
 *
 * _WORD_SPLIT_PATTERN =
 * /(?:\[\d+,\d+\])?
 *   (?P<content>(?:(?!\(\d+,\d+\)).)*)
 *   \((?P<start>\d+),(?P<duration>\d+)\)/
 *
 * Yang penting:
 *
 * word start = ABSOLUTE timestamp.
 *
 * Jadi TIDAK:
 *
 * lineStart + wordOffset
 *
 * melainkan:
 *
 * wordStartMs
 */

function parseQRCContent(content) {
    if (!content) return null;

    const lines = [];
    const rawLines = String(content).split(/\r?\n/);

    for (const rawLine of rawLines) {
        const line = rawLine.trim();

        if (!line) continue;

        /*
         * QRC line:
         *
         * [start,duration]content
         */
        const lineMatch = line.match(
            /^\[(\d+),(\d+)\](.*)$/
        );

        if (!lineMatch) {
            continue;
        }

        const lineStartMs = parseInt(lineMatch[1], 10);
        const lineDurationMs = parseInt(lineMatch[2], 10);
        const lineContent = lineMatch[3];

        if (
            Number.isNaN(lineStartMs) ||
            Number.isNaN(lineDurationMs)
        ) {
            continue;
        }

        const lineEndMs =
            lineStartMs + lineDurationMs;

        /*
         * QRC bisa punya empty timestamp line:
         *
         * [123,456](123,456)
         *
         * Ini bukan teks.
         */
        const onlyTimestamp = lineContent.match(
            /^\(\d+,\d+\)$/
        );

        if (onlyTimestamp) {
            lines.push({
                start: roundTime(lineStartMs),
                end: roundTime(lineEndMs),
                text: "",
                words: []
            });

            continue;
        }

        /*
         * Match word:
         *
         * text(start,duration)
         *
         * Contoh:
         *
         * Hello(1000,500) world(1500,400)
         *
         * Timestamp word QQ Music adalah ABSOLUTE.
         */
        const wordRegex =
            /(?:\[\d+,\d+\])?((?:(?!\(\d+,\d+\)).)*?)\((\d+),(\d+)\)/g;

        const words = [];
        let match;

        while ((match = wordRegex.exec(lineContent)) !== null) {
            let wordText = match[1];
            const wordStartMs = parseInt(match[2], 10);
            const wordDurationMs = parseInt(match[3], 10);

            if (
                Number.isNaN(wordStartMs) ||
                Number.isNaN(wordDurationMs)
            ) {
                continue;
            }

            wordText = cleanText(wordText);

            /*
             * Jangan membuang whitespace.
             *
             * QRC bisa menyimpan:
             *
             * "hello "
             * "world"
             *
             * sehingga text gabungan tetap sama dengan
             * lyric asli.
             */
            if (!wordText && wordDurationMs <= 0) {
                continue;
            }

            const wordEndMs =
                wordStartMs + wordDurationMs;

            words.push({
                text: wordText,
                start: roundTime(wordStartMs),
                end: roundTime(wordEndMs)
            });
        }

        /*
         * Kalau berhasil mendapatkan word timestamps,
         * jadikan karaoke.
         */
        if (words.length > 0) {
            const fullLineText = words
                .map(word => word.text)
                .join("");

            /*
             * LDDC menggunakan line timestamp sebagai fallback,
             * tetapi kalau word timestamp tersedia maka end
             * yang lebih akurat adalah word terakhir.
             */
            const actualStart =
                words[0].start;

            const actualEnd =
                words[words.length - 1].end;

            lines.push({
                start: actualStart,
                end: actualEnd,
                text: fullLineText,
                words
            });

            continue;
        }

        /*
         * Tidak ada word timestamp.
         *
         * LDDC menjadikan seluruh line sebagai satu LyricsWord:
         *
         * [lineStart, lineEnd, lineContent]
         */
        const text = cleanText(lineContent);

        if (!text) {
            continue;
        }

        lines.push({
            start: roundTime(lineStartMs),
            end: roundTime(lineEndMs),
            text,
            words: [
                {
                    text,
                    start: roundTime(lineStartMs),
                    end: roundTime(lineEndMs)
                }
            ]
        });
    }

    if (lines.length === 0) {
        return null;
    }

    lines.sort((a, b) => a.start - b.start);

    const hasRealWordTiming = lines.some(
        line =>
            Array.isArray(line.words) &&
            line.words.length > 0 &&
            line.words.some(
                word =>
                    word.start !== line.start ||
                    word.end !== line.end
            )
    );

    return {
        type: hasRealWordTiming ? "karaoke" : "line",
        source: "qqmusic",
        lines
    };
}

/* =========================================================
 * QRC XML wrapper
 * ========================================================= */

/**
 * QQ Music QRC hasil decrypt biasanya bisa berbentuk:
 *
 * <Lyric_1 LyricType="1" LyricContent="..."/>
 *
 * Ambil isi LyricContent terlebih dahulu.
 */
function extractQRCContent(rawLyric) {
    if (!rawLyric) return null;

    const text = String(rawLyric).trim();

    const match = text.match(
        /<Lyric_1\s+LyricType="1"\s+LyricContent="([\s\S]*?)"\s*\/>/
    );

    if (match) {
        return decodeXmlEntities(match[1]);
    }

    /*
     * Kadang data sudah berupa QRC content langsung.
     */
    if (/^\[\d+,\d+\]/m.test(text)) {
        return text;
    }

    return null;
}

/* =========================================================
 * LRC parser
 * ========================================================= */

function parseLRCTime(timeString) {
    if (!timeString) return null;

    const parts = timeString.split(":");

    if (parts.length !== 2) {
        return null;
    }

    const minutes = parseInt(parts[0], 10);
    const seconds = parseFloat(parts[1]);

    if (
        Number.isNaN(minutes) ||
        Number.isNaN(seconds)
    ) {
        return null;
    }

    return (
        minutes * 60 +
        seconds
    );
}

function parseLRC(rawLyric) {
    if (!rawLyric) return null;

    const rawLines =
        String(rawLyric).split(/\r?\n/);

    const parsed = [];

    for (const rawLine of rawLines) {
        if (!rawLine.trim()) continue;

        /*
         * Bisa ada beberapa timestamp dalam satu line:
         *
         * [00:12.34][00:15.20]hello
         */
        const timestamps = [];

        const timestampRegex =
            /\[(\d+):(\d+(?:\.\d+)?)\]/g;

        let timestampMatch;

        while (
            (timestampMatch =
                timestampRegex.exec(rawLine)) !== null
        ) {
            const time = parseLRCLineTime(
                timestampMatch[1],
                timestampMatch[2]
            );

            if (time !== null) {
                timestamps.push(time);
            }
        }

        if (timestamps.length === 0) {
            continue;
        }

        /*
         * Hilangkan semua timestamp dari text.
         */
        const text = rawLine
            .replace(
                /\[\d+:\d+(?:\.\d+)?\]/g,
                ""
            )
            .trim();

        if (!text) continue;

        for (const start of timestamps) {
            parsed.push({
                start,
                text
            });
        }
    }

    if (parsed.length === 0) {
        return null;
    }

    parsed.sort(
        (a, b) => a.start - b.start
    );

    /*
     * LDDC menyimpan end timestamp pada LyricsLine.
     *
     * Untuk line biasa kita gunakan timestamp line
     * berikutnya sebagai end.
     *
     * Untuk line terakhir, end tetap null.
     */
    const lines = parsed.map((line, index) => {
        const next =
            parsed[index + 1];

        const end =
            next
                ? next.start
                : null;

        return {
            start: roundTime(line.start * 1000),
            ...(end !== null
                ? {
                    end: roundTime(end * 1000)
                }
                : {}),
            text: line.text
        };
    });

    return {
        type: "line",
        source: "qqmusic",
        lines
    };
}

function parseLRCLineTime(minutes, seconds) {
    const m = parseInt(minutes, 10);
    const s = parseFloat(seconds);

    if (
        Number.isNaN(m) ||
        Number.isNaN(s)
    ) {
        return null;
    }

    return m * 60 + s;
}

/* =========================================================
 * Plain text fallback
 * ========================================================= */

function parsePlainText(rawLyric) {
    if (!rawLyric) return null;

    const lines = String(rawLyric)
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    if (lines.length === 0) {
        return null;
    }

    return {
        type: "line",
        source: "qqmusic",
        lines: lines.map(text => ({
            start: 0,
            text
        }))
    };
}

/* =========================================================
 * Main parser
 * ========================================================= */

function parseQQMusic(rawData) {
    if (!rawData) {
        return null;
    }

    /*
     * Bisa dipanggil:
     *
     * parseQQMusic({
     *     rawLyric: "..."
     * })
     *
     * atau langsung:
     *
     * parseQQMusic("...")
     */
    const rawLyric =
        typeof rawData === "string"
            ? rawData
            : rawData.rawLyric;

    if (!rawLyric) {
        return null;
    }

    const text =
        String(rawLyric).trim();

    if (!text) {
        return null;
    }

    /*
     * -----------------------------------------------------
     * 1. QRC
     * -----------------------------------------------------
     */
    const qrcContent =
        extractQRCContent(text);

    if (qrcContent) {
        const qrcResult =
            parseQRCContent(qrcContent);

        if (qrcResult) {
            return {
                ...qrcResult,
                source: "qqmusic"
            };
        }
    }

    /*
     * -----------------------------------------------------
     * 2. LRC
     * -----------------------------------------------------
     */
    if (
        text.includes("[") &&
        text.includes("]")
    ) {
        const lrcResult =
            parseLRC(text);

        if (lrcResult) {
            return {
                ...lrcResult,
                source: "qqmusic"
            };
        }
    }

    /*
     * -----------------------------------------------------
     * 3. Plain text
     * -----------------------------------------------------
     */
    return parsePlainText(text);
}

module.exports = {
    parseQQMusic,
    parseQRCContent,
    parseLRC
};
