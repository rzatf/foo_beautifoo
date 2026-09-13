
// src/parsers/kugouParser.js

function parseKugou(rawData) {

    if (!rawData || !rawData.rawLyric) {
        return null;
    }

    const rawLines = rawData.rawLyric.split(/\r?\n/);

    // =========================================================
    // 1. COBA PARSE KRC / KARAOKE
    // =========================================================

    const karaokeLines = [];

    for (const lineStr of rawLines) {

        // Format KRC:
        // [start_ms,duration_ms]<word_start_ms,word_duration_ms,0>Word...
        //
        // Contoh:
        // [21610,3570]<21610,180,0>I'm <21790,450,0>tired

        const lineMatch = lineStr.match(
            /^\[(\d+),(\d+)\](.*)$/
        );

        if (!lineMatch) {
            continue;
        }

        const lineStartMs = parseInt(lineMatch[1], 10);
        const lineDurationMs = parseInt(lineMatch[2], 10);
        const content = lineMatch[3];

        // Cari word timing
        const wordRegex = /<(\d+),(\d+),\d+>([^<]*)/g;

        const words = [];
        let match;
        let fullLineText = "";

        while ((match = wordRegex.exec(content)) !== null) {

            const wordStartMs = parseInt(match[1], 10);
            const wordDurationMs = parseInt(match[2], 10);
            const wordText = match[3];

            // Kugou KRC menggunakan timestamp absolute
            const wordStartSec = wordStartMs / 1000;
            const wordEndSec =
                (wordStartMs + wordDurationMs) / 1000;

            fullLineText += wordText;

            words.push({
                text: wordText,
                start: parseFloat(wordStartSec.toFixed(2)),
                end: parseFloat(wordEndSec.toFixed(2))
            });
        }

        // Hanya masukkan sebagai karaoke kalau
        // benar-benar menemukan word timing.
        if (words.length > 0) {

            const lineStartSec = lineStartMs / 1000;

            // Gunakan durasi line sebagai fallback,
            // tetapi end berdasarkan word terakhir lebih akurat.
            const lineEndFromDuration =
                (lineStartMs + lineDurationMs) / 1000;

            const lastWordEnd =
                words[words.length - 1].end;

            karaokeLines.push({
                start: parseFloat(lineStartSec.toFixed(2)),
                end: parseFloat(
                    Math.max(
                        lastWordEnd,
                        lineEndFromDuration
                    ).toFixed(2)
                ),
                text: fullLineText.trim(),
                words: words
            });
        }
    }

    // Kalau berhasil menemukan KRC karaoke,
    // prioritaskan hasil ini.
    if (karaokeLines.length > 0) {

        return {
            type: "karaoke",
            source: "kugou",
            lines: karaokeLines
        };
    }


    // =========================================================
    // 2. PARSE LRC / LINE SYNC
    // =========================================================

    const lineLyrics = [];

    for (const lineStr of rawLines) {

        // Format:
        // [00:24.38]小さな肩を並べて歩いた
        //
        // Mendukung:
        // [00:24]
        // [00:24.38]
        // [01:02.123]

        const lineMatch = lineStr.match(
            /^\[(\d{2}):(\d{2}(?:\.\d+)?)\](.*)$/
        );

        if (!lineMatch) {
            continue;
        }

        const minutes = parseInt(lineMatch[1], 10);
        const seconds = parseFloat(lineMatch[2]);

        const startSec =
            (minutes * 60) + seconds;

        const text = lineMatch[3].trim();

        if (!text) {
            continue;
        }

        lineLyrics.push({
            start: parseFloat(startSec.toFixed(2)),
            text: text
        });
    }


    // Tidak ada LRC juga
    if (lineLyrics.length === 0) {
        return null;
    }


    // =========================================================
    // 3. HITUNG END TIME LRC
    // =========================================================

    for (let i = 0; i < lineLyrics.length; i++) {

        const currentLine = lineLyrics[i];
        const nextLine = lineLyrics[i + 1];

        if (nextLine) {

            currentLine.end =
                parseFloat(nextLine.start.toFixed(2));

        } else {

            // Baris terakhir tidak punya timestamp berikutnya.
            // Beri durasi default 5 detik.
            currentLine.end =
                parseFloat(
                    (currentLine.start + 5).toFixed(2)
                );
        }
    }


    // =========================================================
    // 4. RETURN LRC
    // =========================================================

    return {
        type: "line",
        source: "kugou",
        lines: lineLyrics
    };
}

module.exports = { parseKugou };
