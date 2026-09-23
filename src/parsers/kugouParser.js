// src/parsers/kugouParser.js

function cleanText(str) {
    if (!str) return "";
    return str.replace(/\u00A0/g, " ").replace(/\s+/g, " ");
}

function parseKugou(rawData) {
    if (!rawData || !rawData.rawLyric) return null;

    const rawLines = rawData.rawLyric.split(/\r?\n/);
    const karaokeLines = [];

    const lineRegex = /^\[(\d+),(\d+)\](.*)$/;
    const wordRegex = /<(\d+),(\d+),\d+>([^<]*)/g;

    for (const rawLine of rawLines) {
        const line = rawLine.trim();
        if (!line.startsWith("[")) continue;

        const lineMatch = line.match(lineRegex);
        if (!lineMatch) continue;

        const lineStartMs = parseInt(lineMatch[1], 10);
        const lineContent = lineMatch[3];

        const words = [];
        let match;
        let fullLineText = "";

        while ((match = wordRegex.exec(lineContent)) !== null) {
            const relWordStartMs = parseInt(match[1], 10);
            const wordDurationMs = parseInt(match[2], 10);
            const wText = match[3];

            // Rumus Presisi Waktu: Absolut = Line Start + Word Start
            const absStartSec = (lineStartMs + relWordStartMs) / 1000;
            const absEndSec = (lineStartMs + relWordStartMs + wordDurationMs) / 1000;

            fullLineText += wText;

            words.push({
                text: wText,
                start: parseFloat(absStartSec.toFixed(2)),
                end: parseFloat(absEndSec.toFixed(2))
            });
        }

        if (words.length > 0) {
            const lineStartSec = lineStartMs / 1000;
            const lastWordEndSec = words[words.length - 1].end;

            karaokeLines.push({
                start: parseFloat(lineStartSec.toFixed(2)),
                end: parseFloat(lastWordEndSec.toFixed(2)),
                text: cleanText(fullLineText).trim(),
                words: words
            });
        }
    }

    if (karaokeLines.length === 0) return null;

    return {
        type: "karaoke",
        source: "kugou",
        lines: karaokeLines
    };
}

module.exports = { parseKugou };