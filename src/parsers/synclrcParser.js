// src/parsers/synclrcParser.js

function cleanText(str) {
    if (!str) return "";
    return str.replace(/\u00A0/g, " ").replace(/\s+/g, " ");
}

function parseTimestamp(timeStr) {
    const parts = timeStr.split(":");
    if (parts.length < 2) return 0;
    const min = parseFloat(parts[0]);
    const sec = parseFloat(parts[1]);
    return min * 60 + sec;
}

// Cek apakah karakter termasuk CJK (Kanji, Hiragana, Katakana, Hanzi)
function isCJK(str) {
    return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/.test(str);
}

function parseSyncLRC(rawData) {
    if (!rawData || !rawData.rawLyric) return null;

    const rawStr = typeof rawData.rawLyric === "string" ? rawData.rawLyric : "";
    const rawLines = rawStr.split("\n");
    const lines = [];
    let isKaraoke = false;

    rawLines.forEach((lineStr) => {
        const trimmed = lineStr.trim();
        if (!trimmed) return;

        const lineMatch = trimmed.match(/^\[(\d+:\d+(?:\.\d+)?)\](.*)/);
        if (!lineMatch) return;

        const lineStartSec = parseTimestamp(lineMatch[1]);
        const content = lineMatch[2];

        const wordRegex = /<(\d+:\d+(?:\.\d+)?)>([^<]+)/g;
        const words = [];
        let match;

        while ((match = wordRegex.exec(content)) !== null) {
            const wStartSec = parseTimestamp(match[1]);
            const rawWordText = match[2];
            
            // Trim spasi jika karakter CJK, biarkan spasi jika kata latin (English)
            const cleanedWord = isCJK(rawWordText) ? rawWordText.trim() : rawWordText;

            if (cleanedWord) {
                words.push({
                    text: cleanedWord,
                    start: parseFloat(wStartSec.toFixed(2)),
                    end: parseFloat((wStartSec + 0.3).toFixed(2))
                });
            }
        }

        if (words.length > 0) {
            isKaraoke = true;
            for (let i = 0; i < words.length - 1; i++) {
                words[i].end = words[i + 1].start;
            }

            const fullLineText = words.map(w => w.text).join("");

            lines.push({
                start: parseFloat(words[0].start.toFixed(2)),
                end: parseFloat(words[words.length - 1].end.toFixed(2)),
                text: cleanText(fullLineText).trim(),
                isDuet: false,
                words: words
            });
        } else {
            const plainText = cleanText(content.replace(/\[.*?\]/g, "")).trim();
            if (plainText) {
                lines.push({
                    start: parseFloat(lineStartSec.toFixed(2)),
                    end: parseFloat((lineStartSec + 4).toFixed(2)),
                    text: plainText,
                    isDuet: false
                });
            }
        }
    });

    if (lines.length === 0) return null;

    if (!isKaraoke) {
        for (let i = 0; i < lines.length - 1; i++) {
            lines[i].end = lines[i + 1].start;
        }
    }

    lines.sort((a, b) => a.start - b.start);

    return {
        type: isKaraoke ? "karaoke" : "line",
        source: "synclrc",
        lines: lines
    };
}

module.exports = { parseSyncLRC };