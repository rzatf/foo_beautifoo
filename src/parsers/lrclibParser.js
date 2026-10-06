// src/parsers/lrclibParser.js

function parseLrclib(data) {
    if (!data) {
        return null;
    }

    // Metadata lagu dari LRCLIB untuk verifikasi ulang.
    const song = {
        id: data.id ? String(data.id) : "",
        title: data.trackName || "",
        artist: data.artistName ? [data.artistName] : [],
        album: data.albumName || "",
        duration: Number(data.duration) || 0
    };

    // HANYA gunakan syncedLyrics untuk lirik ber-timestamp.
    // Jangan fallback ke plainLyrics karena akan menghasilkan start: null
    // yang merusak siklus auto-scroll pada renderer.
    if (data.syncedLyrics) {
        const lines = parseLrc(data.syncedLyrics);

        if (lines.length > 0) {
            return {
                type: "line",
                source: "lrclib",
                song,
                lines
            };
        }
    }

    // Jika tidak ada syncedLyrics, kembalikan null agar lyricsEngine 
    // bisa lanjut mencari di provider/sumber lain
    return null;
}

function parseLrc(lrc) {
    const lines = [];

    for (const rawLine of lrc.split("\n")) {
        // Regex diperluas untuk menangani tanda [mm:ss.xx] maupun [mm:ss:xx]
        const match = rawLine.match(
            /^\[(\d+):(\d+(?:[\.:]\d+)?)\](.*)$/
        );

        if (!match) {
            continue;
        }

        const minutes = Number(match[1]);
        // Handle format titik maupun titik dua pada bagian detik (misal: 01:23:45 -> 01:23.45)
        const seconds = Number(match[2].replace(":", "."));
        const text = match[3].trim();

        // Abaikan baris kosong
        if (!text) {
            continue;
        }

        const timeInSeconds = minutes * 60 + seconds;

        lines.push({
            start: parseFloat(timeInSeconds.toFixed(2)),
            text
        });
    }

    return lines;
}

module.exports = {
    parseLrclib
};