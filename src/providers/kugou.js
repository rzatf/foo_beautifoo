// src/providers/kugou.js

const axios = require("axios");
const crypto = require("crypto");

const {
    verifyMetadata,
    splitArtists
} = require("../utils/matcher");

let krcDecrypt = null;

try {
    const krc = require("../decryptor/krc");
    krcDecrypt =
        krc.krcDecrypt ||
        krc.decryptKRC ||
        krc.krcDecode ||
        krc.decrypt ||
        null;
} catch (err) {
    console.warn("[Kugou] KRC decryptor tidak ditemukan:", err.message);
}

// Timeout diperketat ke 2000ms agar super kencang & tidak bikin nyangkut
const client = axios.create({
    timeout: 2000,
    headers: {
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate",
    }
});

const SIGN_KEY = "LnT6xpN3khm36zse0QzvmgTZ3waWdRSA";
const SEARCH_URL = "http://complexsearch.kugou.com/v2/search/song";
const LYRIC_SEARCH_URL = "https://lyrics.kugou.com/v1/search";
const LYRIC_DOWNLOAD_URL = "http://lyrics.kugou.com/download";

function md5(value) {
    return crypto.createHash("md5").update(String(value)).digest("hex");
}

function generateMid() {
    return md5(String(Date.now()));
}

function buildSignature(params, data = "") {
    const sortedKeys = Object.keys(params).sort();
    let query = "";

    for (const key of sortedKeys) {
        const value = params[key];
        let serialized = (value !== null && typeof value === "object" && !Array.isArray(value))
            ? JSON.stringify(value)
            : String(value);
        query += `${key}=${serialized}`;
    }

    return md5(SIGN_KEY + query + (data || "") + SIGN_KEY);
}

async function kugouRequest({ url, params = {}, module, method = "GET", data = null, signal = null }) {
    const mid = generateMid();
    const headers = {
        "User-Agent": `Android14-1070-11070-201-0-${module}-wifi`,
        "Connection": "Keep-Alive",
        "Accept-Encoding": "gzip, deflate",
        "KG-Rec": "1",
        "KG-RC": "1",
        "KG-CLIENTTIMEMS": String(Date.now()),
        mid
    };

    if (module === "Lyric") {
        params = { appid: "3116", clientver: "11070", ...params };
    } else {
        params = {
            userid: "0", appid: "3116", token: "",
            clienttime: Math.floor(Date.now() / 1000),
            iscorrection: "1", uuid: "-", mid, dfid: "-",
            clientver: "11070", platform: "AndroidFilter",
            ...params
        };
    }

    params.signature = buildSignature(params, data);

    try {
        const response = await client({
            url,
            method,
            params,
            data,
            headers,
            signal
        });
        return response.data || {};
    } catch (err) {
        return {};
    }
}

function normalizeSong(info) {
    if (!info) return null;
    return {
        id: String(info.ID ?? info.album_audio_id ?? ""),
        hash: info.FileHash ?? info.hash ?? "",
        title: info.SongName ?? info.songname ?? "",
        artist: Array.isArray(info.Singers)
            ? info.Singers.map(x => x?.name).filter(Boolean)
            : String(info.singername || "").split("、").filter(Boolean),
        album: info.AlbumName ?? info.album_name ?? "",
        duration: Number(info.Duration ?? info.duration ?? 0)
    };
}

async function searchSongs(keyword, signal) {
    const data = await kugouRequest({
        url: SEARCH_URL,
        params: { sorttype: "0", keyword, pagesize: 10, page: 1 },
        module: "SearchSong",
        signal
    });

    const list = data?.data?.lists || [];
    return list.map(normalizeSong).filter(Boolean);
}

/**
 * Pilih lagu kandidat terbaik dengan verifikasi title + artist
 * + duration yang ketat. Jangan pernah asal ambil songs[0].
 */
function pickBestSong(songs, target) {
    const ranked = [];

    for (const song of songs) {
        const result = verifyMetadata(
            {
                title: song.title,
                artist: song.artist,
                duration: song.duration
            },
            target
        );

        if (!result.ok) {
            console.log(
                `[Kugou] Tolak kandidat: ` +
                `${song.artist?.join?.("/") || song.artist} - ` +
                `${song.title} (${result.reason})`
            );
            continue;
        }

        ranked.push({ song, score: result.score });
    }

    if (!ranked.length) {
        return null;
    }

    ranked.sort((a, b) => b.score - a.score);

    return ranked[0].song;
}

async function searchLyrics(song, signal) {
    const artistText = Array.isArray(song.artist) ? song.artist.join("、") : String(song.artist || "");
    const keyword = `${artistText} - ${song.title}`;

    const data = await kugouRequest({
        url: LYRIC_SEARCH_URL,
        params: {
            album_audio_id: song.id,
            duration: song.duration * 1000,
            hash: song.hash,
            keyword,
            lrctxt: "1",
            man: "no"
        },
        module: "Lyric",
        signal
    });

    return data?.candidates || [];
}

async function downloadLyrics(candidate, signal) {
    return await kugouRequest({
        url: LYRIC_DOWNLOAD_URL,
        params: { accesskey: candidate.accesskey, charset: "utf8", client: "mobi", fmt: "krc", id: candidate.id, ver: "1" },
        module: "Lyric",
        signal
    });
}

async function getLyrics({ title, artist, album, duration }, options = {}) {
    try {
        if (!title) return null;

        const artistText = Array.isArray(artist)
            ? artist.join(" ")
            : String(artist || "");
        const keyword = `${artistText} ${title}`.trim();

        const target = {
            title,
            artist: Array.isArray(artist) ? artist : [artistText],
            duration
        };

        // 1. Search Song
        const songs = await searchSongs(keyword, options.signal);
        if (!songs || !songs.length) return null;

        // 2. Pilih lagu dengan verifikasi ketat (title + artist).
        const song = pickBestSong(songs, target);

        if (!song) {
            console.log(
                `[Kugou] Tidak ada kandidat yang lolos verifikasi: ` +
                `${artistText} - ${title}`
            );

            return null;
        }

        // 3. Search Lyrics List
        const candidates = await searchLyrics(song, options.signal);
        if (!candidates || !candidates.length) return null;

        const candidate = candidates[0];

        // 4. Download Lyrics Content
        const data = await downloadLyrics(candidate, options.signal);
        if (!data || !data.content) return null;

        // Gunakan metadata lagu ASLI dari pencarian untuk
        // verifikasi ulang di lyricsEngine (bukan metadata request).
        const songMeta = {
            id: song.id,
            title: song.title,
            artist: splitArtists(song.artist),
            album: song.album,
            duration: song.duration
        };

        if (data.contenttype === 2) {
            const text = Buffer.from(data.content, "base64").toString("utf8");
            return text.trim()
                ? { rawLyric: text, source: "kugou", type: "line", song: songMeta }
                : null;
        }

        if (!krcDecrypt) return null;

        // 5. Decrypt KRC
        const lyric = krcDecrypt(data.content);
        if (!lyric?.trim()) return null;

        return {
            rawLyric: lyric,
            source: "kugou",
            type: "karaoke",
            song: songMeta
        };
    } catch (err) {
        return null;
    }
}

module.exports = { getLyrics };