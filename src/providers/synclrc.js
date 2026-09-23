// src/providers/synclrc.js
const axios = require("axios");

const BASE_URL = "https://api.synclrc.dev";

function normalizeString(str) {
    return String(str || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ""); // Hapus simbol untuk pencocokan ketat
}

async function getLyrics({ title, artist, duration, album }, options = {}) {
    try {
        const res = await axios.get(`${BASE_URL}/lyrics`, {
            params: {
                track: title,
                artist: artist,
                type: "karaoke",
                album: album || undefined,
                duration: duration ? Math.round(duration) : undefined
            },
            timeout: 5000,
            signal: options.signal, // Dukungan AbortSignal
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            }
        });

        const data = res.data;
        if (!data || !data.lyrics) return null;

        // =========================================================
        // 1. CEK BUG DEFAULT FALLBACK (IMAGINE DRAGONS - DEMONS BUG)
        // =========================================================
        const reqTitleNorm = normalizeString(title);
        const reqArtistNorm = normalizeString(artist);
        const resTitleNorm = normalizeString(data.track);
        const resArtistNorm = normalizeString(data.artist);

        // Jika API mengembalikan 'Demons' padahal kamu tidak minta 'Demons'
        if (!reqTitleNorm.includes("demons") && resTitleNorm.includes("demons") && resArtistNorm.includes("imaginedragons")) {
            console.warn(`[SyncLRC] Ditolak: API mengembalikan default fallback 'Imagine Dragons - Demons'.`);
            return null;
        }

        // =========================================================
        // 2. FILTER INSTRUMENTAL / GARBAGE TEXT
        // =========================================================
        const rawText = String(data.lyrics).toLowerCase();
        const instrumentalKeywords = ["纯音乐", "请欣赏", "no lyrics", "instrumental", "tidak ada lirik"];

        if (instrumentalKeywords.some(keyword => rawText.includes(keyword))) {
            console.warn(`[SyncLRC] Ditolak: Terdeteksi placeholder instrumental ("纯音乐" / "Instrumental").`);
            return null;
        }

        // =========================================================
        // 3. PROSES PENERIMAAN KANDIDAT
        // =========================================================
        if (data.type === "karaoke" && data.lyrics.includes("<")) {
            console.log(`[SyncLRC] Found Karaoke Lyrics for ${data.artist || artist} - ${data.track || title}`);
            return {
                rawLyric: data.lyrics,
                source: "synclrc",
                format: "karaoke",
                song: { title: data.track || title, artist: data.artist || artist }
            };
        }

        if (data.type === "synced" || data.lyrics.includes("[")) {
            console.log(`[SyncLRC] Found Line Synced Lyrics for ${data.artist || artist} - ${data.track || title}`);
            return {
                rawLyric: data.lyrics,
                source: "synclrc",
                format: "synced",
                song: { title: data.track || title, artist: data.artist || artist }
            };
        }

        return {
            rawLyric: data.lyrics,
            source: "synclrc",
            format: "plain",
            song: { title: data.track || title, artist: data.artist || artist }
        };

    } catch (err) {
        // Jangan tampilkan log error jika ini dibatalkan oleh AbortSignal
        if (axios.isCancel(err) || err.code === "ERR_CANCELED") return null;

        console.warn(`[SyncLRC Error]: ${err.message}`);
        return null;
    }
}

module.exports = { getLyrics };