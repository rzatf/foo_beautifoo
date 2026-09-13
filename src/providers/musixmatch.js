// src/providers/musixmatch.js
const axios = require("axios");

const BASE_URL = "https://apic-desktop.musixmatch.com/ws/1.1";
const HEADERS = {
    "User-Agent": "Musixmatch/1.4.31 (Windows; x64)",
    "Cookie": "awselb=1;"
};

let cachedToken = null;

// Step 1: Ambil anonymous user_token
async function getToken(forceRefresh = false) {
    if (cachedToken && !forceRefresh) return cachedToken;

    try {
        const res = await axios.get(`${BASE_URL}/token.get`, {
            params: { app_id: "desktop-app-v1.0" },
            headers: HEADERS
        });

        const token = res.data?.message?.body?.user_token;
        if (token) {
            cachedToken = token;
            return token;
        }
    } catch (err) {
        console.error("[Musixmatch Token Error]:", err.message);
    }
    return null;
}

// Main Fetcher
async function getLyrics({ title, artist, duration }) {
    try {
        const token = await getToken();
        if (!token) return null;

        // Step 2: Search Track & Match Subtitle
        const searchRes = await axios.get(`${BASE_URL}/macro.subtitles.get`, {
            params: {
                app_id: "desktop-app-v1.0",
                usertoken: token,
                q_artist: artist,
                q_track: title,
                q_duration: duration || undefined,
                f_subtitle_length_max_deviation: 3
            },
            headers: HEADERS
        });

        const body = searchRes.data?.message?.body?.macro_calls;
        if (!body) return null;

        // Cek jika token expired (401 quota)
        const statusCode = searchRes.data?.message?.header?.status_code;
        if (statusCode === 401) {
            await getToken(true); // Refresh token
            return getLyrics({ title, artist, duration });
        }

        const trackMeta = body["matcher.track.get"]?.message?.body?.track;
        const commontrackId = trackMeta?.commontrack_id;

        if (!commontrackId) {
            console.log("[Musixmatch] Track tidak ditemukan.");
            return null;
        }

        // Step 3: Ambil Per-Word Timing (Richsync)
        try {
            const richRes = await axios.get(`${BASE_URL}/track.richsync.get`, {
                params: {
                    app_id: "desktop-app-v1.0",
                    usertoken: token,
                    commontrack_id: commontrackId
                },
                headers: HEADERS
            });

            const richsyncRaw = richRes.data?.message?.body?.richsync?.richsync_body;
            if (richsyncRaw) {
                const parsedRichsync = typeof richsyncRaw === "string" ? JSON.parse(richsyncRaw) : richsyncRaw;
                return {
                    rawLyric: parsedRichsync,
                    source: "musixmatch",
                    format: "richsync"
                };
            }
        } catch (e) {
            // Richsync (karaoke) gagal/tidak tersedia
        }

        // Fallback Step 4: Jika Richsync tidak ada, ambil Subtitle (Line Sync)
        const subtitleRaw = body["track.subtitles.get"]?.message?.body?.subtitle_list?.[0]?.subtitle?.subtitle_body;
        if (subtitleRaw) {
            return {
                rawLyric: subtitleRaw,
                source: "musixmatch",
                format: "subtitle"
            };
        }

    } catch (err) {
        console.error("[Musixmatch Provider Error]:", err.message);
    }

    return null;
}

module.exports = { getLyrics };