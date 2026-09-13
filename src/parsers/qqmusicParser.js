// src/parsers/qqmusicParser.js

function parseQQMusic(rawData) {
    if (!rawData || !rawData.rawLyric) return null;

    const lines = [];
    const rawLines = rawData.rawLyric.split('\n');

    rawLines.forEach(lineStr => {
        // Match timestamp baris: [mm:ss.xx]
        const lineMatch = lineStr.match(/^\[(\d+):(\d+[\.:]\d+)\](.*)/);
        if (!lineMatch) return;

        const minutes = parseFloat(lineMatch[1]);
        const seconds = parseFloat(lineMatch[2].replace(':', '.'));
        const lineStart = minutes * 60 + seconds;
        const content = lineMatch[3].trim();

        if (!content) return;

        // Cek apakah baris ini punya format kata-per-kata: Kata(offset,duration)
        const wordRegex = /([^(]+)\((\d+),(\d+)\)/g;
        const words = [];
        let match;
        let fullLineText = "";

        while ((match = wordRegex.exec(content)) !== null) {
            const wordText = match[1];
            const wordOffsetMs = parseInt(match[2], 10);
            const wordDurationMs = parseInt(match[3], 10);

            const wordStart = lineStart + (wordOffsetMs / 1000);
            const wordEnd = wordStart + (wordDurationMs / 1000);

            fullLineText += wordText;
            words.push({
                text: wordText,
                start: parseFloat(wordStart.toFixed(2)),
                end: parseFloat(wordEnd.toFixed(2))
            });
        }

        if (words.length > 0) {
            // Tipe Karaoke
            lines.push({
                start: parseFloat(lineStart.toFixed(2)),
                end: words[words.length - 1].end,
                text: fullLineText,
                words: words
            });
        } else {
            // Fallback ke Tipe Line biasa (jika QQ Music hanya menyediakan LRC biasa)
            lines.push({
                start: parseFloat(lineStart.toFixed(2)),
                text: content.replace(/\[\d+:\d+[\.:]\d+\]/g, '') // Bersihkan tag sisa jika ada
            });
        }
    });

    if (lines.length === 0) return null;

    // Tentukan apakah hasilnya karaoke atau line biasa
    const isKaraoke = lines.some(l => l.words && l.words.length > 0);

    return {
        type: isKaraoke ? "karaoke" : "line",
        source: "qqmusic",
        lines: lines
    };
}

module.exports = { parseQQMusic };