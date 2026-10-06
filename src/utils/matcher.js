// src/utils/matcher.js
//
// ============================================================
// AUTHORITATIVE METADATA MATCHER
// ============================================================
//
// Modul ini adalah SATU-SATUNYA sumber kebenaran untuk
// membandingkan metadata lagu (title / artist / duration) baik
// untuk pemilihan kandidat di provider maupun verifikasi ulang
// di lyricsEngine.
//
// Tujuan:
// - Menghindari salah ambil lirik lagu dari artis yang sama
//   tetapi judul berbeda.
// - Menghindari salah ambil lirik karena judul sama tetapi
//   artis berbeda.
// - Memastikan title dan artist yang dipakai tetap benar.
//
// Prinsip:
// - Title TIDAK boleh cocok hanya karena substring (mis.
//   "Love" vs "Endless Love") kecuali perbedaan hanya berupa
//   suffix versi ("- Live", "(Remastered)").
// - Artist harus benar-benar match (set irisan artis),
//   bukan sekadar substring.
// - Duration dipakai sebagai penguat / pemecah seri.
// ============================================================

const stringSimilarity = require("string-similarity");

// Ambang batas kemiripan title yang ketat.
const TITLE_SIMILARITY_THRESHOLD = 0.9;

// Ambang batas kemiripan artis.
const ARTIST_SIMILARITY_THRESHOLD = 0.9;

// Toleransi durasi (detik) agar dianggap lagu yang sama.
const DURATION_TOLERANCE_OK = 5;
const DURATION_TOLERANCE_LOOSE = 12;

// Token versi yang dianggap sebagai bagian dari judul yang sama
// (bukan lagu berbeda).
const VERSION_TOKENS = [
    "live", "acoustic", "acoustic version", "instrumental",
    "remix", "remaster", "remastered", "radio edit",
    "radio version", "single version", "album version", "demo",
    "edit", "version", "ver", "cover", "karaoke", "off vocal",
    "offvocal", "tv size", "tv ver", "short ver", "short version",
    "full ver", "full version", "mv", "live ver", "live version",
    "feat", "ft"
];

/* ============================================================
 * NORMALIZATION
 * ============================================================ */

/**
 * Normalisasi teks umum (lowercase, NFKC, buang quote/bracket).
 */
function normalizeText(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFKC")
        .replace(/[“”"‘’]/g, "")
        .replace(/[【】「」『』]/g, "")
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Normalisasi judul:
 * - buang isi (...) dan [...]
 * - buang tanda baca ekor
 * - rapikan spasi
 */
function normalizeTitle(text) {
    return normalizeText(text)
        .replace(/\([^)]*\)/g, " ")
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/[!?.,;:~]+$/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Normalisasi nama artis (buang spasi ganda, tanda baca ringan).
 */
function normalizeArtist(text) {
    return normalizeText(text)
        .replace(/[!?.,]+$/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Pecah string "A feat. B & C" menjadi daftar artis unik.
 */
function splitArtists(value) {
    const rawList = Array.isArray(value) ? value : [value];

    const parts = [];

    for (const raw of rawList) {
        const text = normalizeArtist(raw);

        if (!text) continue;

        text
            .split(
                /\s*(?:feat\.?|ft\.?|featuring|&|,|\/|;|\bx\b|、|・)\s*/i
            )
            .map(normalizeArtist)
            .filter(Boolean)
            .forEach(name => parts.push(name));
    }

    return [...new Set(parts)];
}

/* ============================================================
 * TITLE MATCH
 * ============================================================ */

/**
 * Cek apakah `songTitle` adalah judul yang sama dengan
 * `targetTitle`.
 *
 * Aturan ketat:
 * 1. Exact match setelah normalisasi.
 * 2. Salah satu judul adalah judul lain + suffix versi
 *    (mis. "song - live", "song (remastered)").
 * 3. Kemiripan Dice tinggi (>= 0.9) DAN panjang mirip.
 */
function isTitleMatch(songTitle, targetTitle) {
    const song = normalizeTitle(songTitle);
    const target = normalizeTitle(targetTitle);

    if (!song || !target) {
        return false;
    }

    // 1. Exact
    if (song === target) {
        return true;
    }

    // 2. Suffix versi
    if (isVersionOf(song, target) || isVersionOf(target, song)) {
        return true;
    }

    // 3. Kemiripan tinggi + panjang mirip
    const sim = stringSimilarity.compareTwoStrings(song, target);

    if (sim >= TITLE_SIMILARITY_THRESHOLD) {
        const shortest = Math.min(song.length, target.length);
        const longest = Math.max(song.length, target.length);

        if (shortest / longest >= 0.7) {
            return true;
        }
    }

    return false;
}

/**
 * Cek apakah `candidate` adalah `base` yang diberi suffix versi.
 *
 * Contoh:
 *   base = "im yours"
 *   candidate = "im yours live"       -> true
 *   candidate = "im yours - live"     -> true
 *   candidate = "im yours (remaster)" -> true
 *   candidate = "im yours 2"          -> true (angka versi)
 *   candidate = "im yours part"       -> false
 */
function isVersionOf(candidate, base) {
    if (!candidate || !base) {
        return false;
    }

    if (candidate === base) {
        return true;
    }

    if (!candidate.startsWith(base)) {
        return false;
    }

    const suffix = candidate
        .slice(base.length)
        .replace(/^[\s\-\u2013\u2014:()\/[\]|,]+/, "")
        .trim();

    if (!suffix) {
        return true;
    }

    if (/^v?\d+$/.test(suffix)) {
        return true;
    }

    return VERSION_TOKENS.some(token => {
        const normalized = normalizeTitle(token);

        return (
            suffix === normalized ||
            suffix.startsWith(normalized + " ") ||
            suffix.startsWith(normalized + " - ")
        );
    });
}

/* ============================================================
 * ARTIST MATCH
 * ============================================================ */

/**
 * Cek apakah ada artis target yang benar-benar match dengan
 * artis kandidat.
 *
 * @param {string|string[]} songArtists
 * @param {string|string[]} targetArtists
 */
function isArtistMatch(songArtists, targetArtists) {
    const songList = splitArtists(songArtists);
    const targetList = splitArtists(targetArtists);

    if (!songList.length || !targetList.length) {
        return false;
    }

    // 1. Minimal satu artis harus benar-benar sama.
    for (const target of targetList) {
        for (const candidate of songList) {
            if (candidate === target) {
                return true;
            }
        }
    }

    // 2. Kemiripan tinggi tanpa substring loosy.
    for (const target of targetList) {
        for (const candidate of songList) {
            const sim = stringSimilarity.compareTwoStrings(
                candidate,
                target
            );

            if (
                sim >= ARTIST_SIMILARITY_THRESHOLD &&
                Math.min(candidate.length, target.length) /
                    Math.max(candidate.length, target.length) >=
                    0.7
            ) {
                return true;
            }
        }
    }

    return false;
}

/* ============================================================
 * DURATION MATCH
 * ============================================================ */

/**
 * Skor durasi antara kandidat dan target (detik). 0..1
 */
function durationScore(songDuration, targetDuration) {
    const a = Number(songDuration) || 0;
    const b = Number(targetDuration) || 0;

    if (a <= 0 || b <= 0) {
        // Tidak bisa menilai. Beri nilai netral.
        return 0.5;
    }

    const diff = Math.abs(a - b);

    if (diff <= DURATION_TOLERANCE_OK) {
        return 1;
    }

    if (diff <= DURATION_TOLERANCE_LOOSE) {
        return 0.6;
    }

    // Terlalu jauh.
    return 0;
}

/* ============================================================
 * FULL METADATA VERIFICATION
 * ============================================================ */

/**
 * Verifikasi lengkap metadata kandidat terhadap target.
 *
 * Title dan Artist WAJIB benar. Duration dipakai sebagai
 * penguat / pemecah seri.
 *
 * @param {object} candidate  { title, artist, duration }
 * @param {object} target     { title, artist, duration }
 * @returns {{ok: boolean, score: number, reason: string}}
 */
function verifyMetadata(candidate, target) {
    if (!target || !target.title || !target.artist) {
        // Target tidak lengkap: tidak bisa memverifikasi ketat.
        return { ok: true, score: 0, reason: "target-incomplete" };
    }

    if (!candidate) {
        return { ok: false, score: 0, reason: "candidate-missing" };
    }

    if (!isTitleMatch(candidate.title, target.title)) {
        return { ok: false, score: 0, reason: "title-mismatch" };
    }

    if (!isArtistMatch(candidate.artist, target.artist)) {
        return { ok: false, score: 0, reason: "artist-mismatch" };
    }

    const dScore = durationScore(candidate.duration, target.duration);

    // Durasi jelas-jelas beda -> tolak.
    if (dScore === 0) {
        return { ok: false, score: 0, reason: "duration-mismatch" };
    }

    const exactTitle =
        normalizeTitle(candidate.title) ===
        normalizeTitle(target.title);

    const score =
        (exactTitle ? 100 : 70) +
        50 +
        Math.round(dScore * 20);

    return { ok: true, score, reason: "ok" };
}

/* ============================================================
 * LYRIC CONTENT VERIFICATION
 * ============================================================ */

const GARBAGE_KEYWORDS = [
    "纯音乐",
    "请欣赏",
    "no lyrics",
    "instrumental",
    "tidak ada lirik",
    "暂无歌词",
    "无歌词"
];

/**
 * Sanity check isi lirik agar tidak menerima lirik sampah /
 * lagu yang jelas berbeda.
 *
 * @param {object} parsed  hasil parser
 * @returns {{ok: boolean, reason: string}}
 */
function verifyLyricContent(parsed) {
    if (!parsed) {
        return { ok: false, reason: "empty" };
    }

    const lyricsObj = parsed.karaoke || parsed.line || parsed;
    const lines = lyricsObj?.lines;

    if (!Array.isArray(lines) || lines.length === 0) {
        return { ok: false, reason: "no-lines" };
    }

    // Terlalu pendek -> kemungkinan bukan lirik.
    if (lines.length <= 2) {
        return { ok: false, reason: "too-short" };
    }

    const fullText = lines
        .map(line => line?.text || "")
        .join(" ")
        .toLowerCase();

    const hasGarbage = GARBAGE_KEYWORDS.some(keyword =>
        fullText.includes(keyword)
    );

    if (hasGarbage) {
        return { ok: false, reason: "garbage-keyword" };
    }

    // Minimal harus ada karakter alfabet/aksara nyata.
    const meaningful = fullText.replace(
        /[^a-z0-9\u00c0-\uffff]/g,
        ""
    );

    if (meaningful.length < 10) {
        return { ok: false, reason: "too-little-text" };
    }

    return { ok: true, reason: "ok" };
}

module.exports = {
    normalizeText,
    normalizeTitle,
    normalizeArtist,
    splitArtists,
    isTitleMatch,
    isVersionOf,
    isArtistMatch,
    durationScore,
    verifyMetadata,
    verifyLyricContent,
    TITLE_SIMILARITY_THRESHOLD,
    ARTIST_SIMILARITY_THRESHOLD
};
