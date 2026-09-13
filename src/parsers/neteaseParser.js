function cleanText(str) {
    if (!str) return "";
    return str.replace(/\u00A0/g, " ").replace(/\s+/g, " ");
}

function parseNetEase(rawData) {
    if (!rawData || !rawData.rawLyric) return null;

    const lines = [];
    const rawLines = rawData.rawLyric.split('\n');

    rawLines.forEach(lineStr => {
        const trimmed = lineStr.trim();
        if (!trimmed) return;

        const lineMatch = trimmed.match(/^\[(\d+),(\d+)\](.*)/);
        if (!lineMatch) return;

        const lineStartMs = parseInt(lineMatch[1], 10);
        const lineDurationMs = parseInt(lineMatch[2], 10);
        const content = lineMatch[3];

        const wordRegex = /\((\d+),(\d+),\d+\)([^\(]+)/g;
        const words = [];
        let match;
        let fullLineText = "";

        while ((match = wordRegex.exec(content)) !== null) {
            const wordOffsetMs = parseInt(match[1], 10);
            const wordDurationMs = parseInt(match[2], 10);
            let rawWordText = match[3];

            let cleanedWordText = cleanText(rawWordText);

            if (cleanedWordText) {

                // NetEase memberi timestamp kata dalam bentuk ABSOLUTE time.
                const wordStartSec = wordOffsetMs / 1000;
                const wordEndSec = wordStartSec + (wordDurationMs / 1000);

                fullLineText += (fullLineText ? " " : "") + cleanedWordText.trim();

                const displayText = cleanedWordText
                    .replace(/[\(\)（）]/g, "")
                    .trim();

                if (displayText) {
                    words.push({
                        text: displayText,
                        start: parseFloat(wordStartSec.toFixed(2)),
                        end: parseFloat(wordEndSec.toFixed(2))
                    });
                }
            }
        }

        if (words.length > 0) {
            if (fullLineText.includes("作词") || fullLineText.includes("作曲")) {
                return;
            }

            const rawFullText = cleanText(fullLineText).trim();

            const isDuet = rawFullText.startsWith("(") ||
                           rawFullText.startsWith("（") ||
                           rawFullText.endsWith(")") ||
                           rawFullText.endsWith("）");

            const displayFullText = rawFullText
                .replace(/[\(\)（）]/g, "")
                .trim();

            lines.push({
                start: words[0].start,
                end: words[words.length - 1].end,
                text: displayFullText,
                isDuet: isDuet,
                words: words
            });
        }
    });

    if (lines.length === 0) return null;

    lines.sort((a, b) => a.start - b.start);

    return {
        type: "karaoke",
        source: "netease",
        lines: lines
    };
}

module.exports = { parseNetEase };