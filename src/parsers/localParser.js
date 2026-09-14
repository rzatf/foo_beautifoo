/**
 * Parser khusus untuk lirik lokal (.lrc / embedded metadata)
 * Format standar: [mm:ss.xx] Lyric text
 */

function parseLocalLrc(rawLrc) {
    if (!rawLrc || typeof rawLrc !== "string") return null;

    const lines = rawLrc.split(/\r?\n/);
    const parsedLines = [];
    
    // Regex untuk menangkap tag waktu [00:08.39]
    // Mendukung format menit >= 2 digit, dan detik dengan milidetik opsional
    const timeRegex = /\[(\d{2,}):(\d{2}(?:\.\d{1,3})?)\]/g;

    for (const line of lines) {
        // Hapus semua tag waktu untuk mendapatkan teks murni
        const text = line.replace(timeRegex, "").trim();
        
        // Ambil semua tag waktu yang ada di baris ini
        // (Bisa jadi ada multiple tags misal: [00:10.00][00:20.00] Chorus)
        const lineMatches = [...line.matchAll(timeRegex)];
        
        // Jika bukan baris lirik (misal [ti:Symphony] atau teks kosong), lewati
        if (lineMatches.length === 0) continue;
        if (!text) continue; // Abaikan baris instrumental/kosong

        for (const match of lineMatches) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseFloat(match[2]);
            const startTime = (minutes * 60) + seconds;

            parsedLines.push({
                start: startTime,
                text: text
            });
        }
    }

    if (parsedLines.length === 0) return null;

    // Urutkan baris berdasarkan waktu mulai (berjaga-jaga jika tag waktu acak)
    parsedLines.sort((a, b) => a.start - b.start);

    // Kalkulasi waktu "end" untuk kebutuhan app.js
    for (let i = 0; i < parsedLines.length; i++) {
        if (i < parsedLines.length - 1) {
            // End time adalah start time baris berikutnya
            parsedLines[i].end = parsedLines[i + 1].start;
        } else {
            // Baris terakhir diberi durasi default (misal 10 detik)
            parsedLines[i].end = parsedLines[i].start + 10;
        }
    }

    // Mengembalikan format struktur yang dibaca app.js
    return {
        type: "line",
        lines: parsedLines
    };
}

module.exports = { parseLocalLrc };