// src/providers/synclrc.js
const axios = require("axios");

const BASE_URL = "https://api.synclrc.dev";

async function getLyrics({ title, artist, duration, album }) {
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
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            }
        });

        const data = res.data;
        if (!data || !data.lyrics) return null;

        // SyncLRC mengembalikan string lirik di `data.lyrics` dan jenisnya di `data.type`
        if (data.type === "karaoke" && data.lyrics.includes("<")) {
            console.log(`[SyncLRC] Found Karaoke Lyrics for ${data.artist} - ${data.track}`);
            return {
                rawLyric: data.lyrics,
                source: "synclrc",
                format: "karaoke"
            };
        }

        if (data.type === "synced" || data.lyrics.includes("[")) {
            console.log(`[SyncLRC] Found Line Synced Lyrics for ${data.artist} - ${data.track}`);
            return {
                rawLyric: data.lyrics,
                source: "synclrc",
                format: "synced"
            };
        }

        return {
            rawLyric: data.lyrics,
            source: "synclrc",
            format: "plain"
        };

    } catch (err) {
        console.warn(`[SyncLRC Error]: ${err.message}`);
        return null;
    }
}

module.exports = { getLyrics };