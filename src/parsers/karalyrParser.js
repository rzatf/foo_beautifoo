function parseKaralyr(data) {
    if (!data?.karalyr?.payload?.lines) {
        return null;
    }

    const lines = data.karalyr.payload.lines;

    return {
        type: "karaoke",
        source: "karalyr",

        lines: lines.map(line => ({
            start: line.start_ms / 1000,
            end: line.end_ms / 1000,
            text: line.text,

            words: (line.words || []).map(word => ({
                text: word.text,
                start: word.start_ms / 1000,
                end: word.end_ms / 1000,

                syllables: (word.syllables || []).map(syllable => ({
                    text: syllable.text,
                    start: syllable.start_ms / 1000,
                    end: syllable.end_ms / 1000
                }))
            }))
        }))
    };
}

module.exports = {
    parseKaralyr
};