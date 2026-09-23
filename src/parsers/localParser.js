/**
 * Parser khusus untuk lirik lokal (.lrc / embedded metadata)
 * Format standar: [mm:ss.xx] Lyric text
 */

function parseLocalLrc(rawLrc) {
    if (!rawLrc || typeof rawLrc !== "string") return null;

    const lines = rawLrc.split(/\r?\n/);
    const parsedLines = [];
    let songMetadata = {};

    // Regex yang disempurnakan:
    // - \d{1,} : mendukung menit 1 digit atau lebih ([0:05.00] atau [00:05.00])
    // - [\.,:] : mendukung pemisah milidetik berupa titik, koma, atau titik dua
    const timeRegex = /\[(\d{1,}):(\d{2}(?:[\.,:]\d{1,3})?)\]/g;
    const headerRegex = /^\[(ti|ar|al|by|offset):(.*)\]$/i;

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        // Cek jika ini adalah header metadata (misal [ti:Title], [ar:Artist])
        const headerMatch = trimmedLine.match(headerRegex);
        if (headerMatch) {
            const key = headerMatch[1].toLowerCase();
            const value = headerMatch[2].trim();
            songMetadata[key] = value;
            continue;
        }

        // Hapus semua tag waktu untuk mendapatkan teks murni
        const text = trimmedLine.replace(timeRegex, "").trim();

        // Ambil semua tag waktu di baris ini
        const lineMatches = [...trimmedLine.matchAll(timeRegex)];
        if (lineMatches.length === 0) continue;

        for (const match of lineMatches) {
            const minutes = parseInt(match[1], 10);
            // Ganti koma dengan titik jika ada (misal: 05,50 -> 05.50)
            const secondsStr = match[2].replace(",", ".");
            const seconds = parseFloat(secondsStr);
            const startTime = minutes * 60 + seconds;

            parsedLines.push({
                start: startTime,
                text: text // Jika text kosong, tetap dimasukkan agar bisa jadi penanda jeda
            });
        }
    }

    if (parsedLines.length === 0) return null;

    // Urutkan baris berdasarkan waktu mulai
    parsedLines.sort((a, b) => a.start - b.start);

    // Filter ulang: Hapus baris kosong HANYA JIKA berada di paling awal
    while (parsedLines.length > 0 && !parsedLines[0].text) {
        parsedLines.shift();
    }

    if (parsedLines.length === 0) return null;

    // Kalkulasi durasi (end time)
    for (let i = 0; i < parsedLines.length; i++) {
        if (i < parsedLines.length - 1) {
            parsedLines[i].end = parsedLines[i + 1].start;
        } else {
            parsedLines[i].end = parsedLines[i].start + 8; // Default 8 detik untuk baris terakhir
        }
    }

    // Kembalikan struktur data lirik
    return {
        type: "line",
        song: {
            title: songMetadata.ti || "",
            artist: songMetadata.ar || "",
            album: songMetadata.al || ""
        },
        lines: parsedLines
    };
}

module.exports = { parseLocalLrc };