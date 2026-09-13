// src/parsers/musixmatchParser.js

function parseMusixmatch(rawData) {
    if (!rawData || !rawData.rawLyric) return null;

    // A. Format Richsync (Word-by-Word Karaoke)
    if (rawData.format === "richsync" && Array.isArray(rawData.rawLyric)) {
        const lines = [];

        rawData.rawLyric.forEach(lineItem => {
            const lineTs = lineItem.ts; // Timestamp awal baris (detik)
            const lineEndTs = lineItem.te; // Timestamp akhir baris (detik)
            const chunks = lineItem.l; // Array kata: [{ c: "Word", o: offset_sec }]

            if (chunks && Array.isArray(chunks) && chunks.length > 0) {
                const words = [];
                let lineText = "";

                chunks.forEach((chunk, idx) => {
                    const text = chunk.c ? chunk.c.trim() : "";
                    if (!text) return;

                    const wordStart = lineTs + chunk.o;
                    
                    let wordEnd = lineEndTs;
                    if (idx < chunks.length - 1) {
                        wordEnd = lineTs + chunks[idx + 1].o;
                    }

                    words.push({
                        text: text,
                        start: parseFloat(wordStart.toFixed(2)),
                        end: parseFloat(wordEnd.toFixed(2))
                    });

                    lineText += (lineText ? " " : "") + text;
                });

                if (words.length > 0) {
                    lines.push({
                        start: words[0].start,
                        end: words[words.length - 1].end,
                        text: lineText,
                        isDuet: false,
                        words: words
                    });
                }
            }
        });

        if (lines.length > 0) {
            return {
                type: "karaoke",
                source: "musixmatch",
                lines: lines
            };
        }
    }

    // B. Format Line Subtitle (Fallback Line Lyrics)
    if (rawData.format === "subtitle" && typeof rawData.rawLyric === "string") {
        try {
            const parsedArray = JSON.parse(rawData.rawLyric);
            const lines = parsedArray.map(item => ({
                start: item.time.total,
                end: item.time.total + item.duration,
                text: item.text,
                isDuet: false
            }));

            return {
                type: "line",
                source: "musixmatch",
                lines: lines
            };
        } catch (e) {
            // Jika subtitle formatnya text biasa
            return null;
        }
    }

    return null;
}

module.exports = { parseMusixmatch };