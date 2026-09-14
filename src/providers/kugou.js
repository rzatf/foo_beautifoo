// src/providers/kugou.js

const axios = require("axios");
const crypto = require("crypto");

// Pakai decryptor KRC yang sudah ada di project Beaufoo.
// Support beberapa kemungkinan nama export supaya tidak terlalu mengikat.
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

const client = axios.create({
    timeout: 10000,
    headers: {
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate",
    }
});


// ============================================================
// CONSTANTS
// ============================================================

const SIGN_KEY = "LnT6xpN3khm36zse0QzvmgTZ3waWdRSA";

const SEARCH_URL =
    "http://complexsearch.kugou.com/v2/search/song";

const OLD_SEARCH_DOMAINS = [
    "mobiles.kugou.com",
    "msearchcdn.kugou.com",
    "mobilecdnbj.kugou.com",
    "msearch.kugou.com"
];

const LYRIC_SEARCH_URL =
    "https://lyrics.kugou.com/v1/search";

const LYRIC_DOWNLOAD_URL =
    "http://lyrics.kugou.com/download";

const DFID_URL =
    "https://userservice.kugou.com/risk/v1/r_register_dev";


// ============================================================
// DFID
// ============================================================

let cachedDfid = null;
let dfidExpireAt = 0;

async function getDfid() {
    const now = Date.now();

    if (cachedDfid && now < dfidExpireAt) {
        return cachedDfid;
    }

    try {
        const mid = md5(String(Date.now()));

        const params = {
            appid: "1014",
            platid: "4",
            mid
        };

        // LDDC:
        //
        // sorted([str(v) for v in params.values() if v != ""])
        // signature = md5("1014" + values + "1014")
        //
        const sortedValues = Object.values(params)
            .filter(v => v !== "")
            .map(String)
            .sort();

        params.signature = md5(
            `1014${sortedValues.join("")}1014`
        );

        const content = Buffer
            .from(JSON.stringify({ uuid: "" }))
            .toString("base64");

        const response = await axios.post(
            DFID_URL,
            content,
            {
                params,
                timeout: 10000,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            }
        );

        const dfid = response.data?.data?.dfid;

        if (typeof dfid === "string" && dfid) {
            cachedDfid = dfid;

            // LDDC cache 1800 detik
            dfidExpireAt = Date.now() + 1800 * 1000;

            console.log("[Kugou] DFID obtained");

            return dfid;
        }

        console.warn("[Kugou] Gagal mendapatkan DFID");

    } catch (err) {
        console.warn(
            "[Kugou] DFID request failed:",
            err.message
        );
    }

    // Sama seperti LDDC fallback
    return "-";
}


// ============================================================
// UTILS
// ============================================================

function md5(value) {
    return crypto
        .createHash("md5")
        .update(String(value))
        .digest("hex");
}


function generateMid() {
    return md5(String(Date.now()));
}


// ============================================================
// KUGOU SIGNATURE
// ============================================================

function buildSignature(params, data = "") {

    const sortedKeys = Object.keys(params)
        .sort();

    let query = "";

    for (const key of sortedKeys) {
        const value = params[key];

        // LDDC:
        //
        // json.dumps(v) if isinstance(v, dict) else v
        //
        let serialized;

        if (
            value !== null &&
            typeof value === "object" &&
            !Array.isArray(value)
        ) {
            serialized = JSON.stringify(value);
        } else {
            serialized = String(value);
        }

        query += `${key}=${serialized}`;
    }

    return md5(
        SIGN_KEY +
        query +
        (data || "") +
        SIGN_KEY
    );
}


// ============================================================
// REQUEST
// ============================================================

async function kugouRequest({
    url,
    params = {},
    module,
    method = "GET",
    data = null,
    extraHeaders = {}
}) {

    const headers = {
        "User-Agent":
            `Android14-1070-11070-201-0-${module}-wifi`,

        "Connection": "Keep-Alive",
        "Accept-Encoding": "gzip, deflate",

        "KG-Rec": "1",
        "KG-RC": "1",

        "KG-CLIENTTIMEMS":
            String(Date.now()),

        ...extraHeaders
    };

    const mid = generateMid();

    // --------------------------------------------------------
    // LDDC parameter construction
    // --------------------------------------------------------

    if (module === "Lyric") {

        params = {
            appid: "3116",
            clientver: "11070",
            ...params
        };

    } else if (module === "album_song_list") {

        params = {
            dfid: await getDfid(),
            appid: "3116",
            mid,
            clientver: "11070",
            clienttime: Math.floor(Date.now() / 1000),
            uuid: "-",
            ...params
        };

        headers["KG-TID"] = "221";

    } else {

        params = {
            userid: "0",
            appid: "3116",
            token: "",
            clienttime: Math.floor(Date.now() / 1000),
            iscorrection: "1",
            uuid: "-",
            mid,
            dfid: "-",
            clientver: "11070",
            platform: "AndroidFilter",
            ...params
        };
    }

    headers.mid = mid;

    // --------------------------------------------------------
    // Signature
    // --------------------------------------------------------

    params.signature = buildSignature(
        params,
        data
    );

    let response;

    if (method === "POST") {

        response = await client.post(
            url,
            data,
            {
                params,
                headers
            }
        );

    } else {

        response = await client.get(
            url,
            {
                params,
                headers
            }
        );
    }

    response.data = response.data || {};

    const errorCode =
        response.data.error_code ?? 0;

    if (errorCode !== 0 && errorCode !== 200) {

        const error = new Error(
            `Kugou API error ${errorCode}: ` +
            `${response.data.error_msg || "Unknown error"}`
        );

        error.kugouCode = errorCode;

        throw error;
    }

    return response.data;
}


// ============================================================
// SEARCH - NEW API
// ============================================================

async function searchNew(keyword, page = 1) {

    const params = {
        sorttype: "0",
        keyword,
        pagesize: 20,
        page
    };

    return kugouRequest({
        url: SEARCH_URL,
        params,
        module: "SearchSong",
        extraHeaders: {
            "x-router": "complexsearch.kugou.com"
        }
    });
}


// ============================================================
// SEARCH - OLD API FALLBACK
// ============================================================

async function searchOld(keyword, page = 1) {

    const domain =
        OLD_SEARCH_DOMAINS[
            Math.floor(
                Math.random() *
                OLD_SEARCH_DOMAINS.length
            )
        ];

    const url =
        `http://${domain}/api/v3/search/song`;

    const params = {
        showtype: "14",
        highlight: "",
        pagesize: "30",
        tag_aggr: "1",
        plat: "0",
        sver: "5",
        keyword,
        correct: "1",
        api_ver: "1",
        version: "9108",
        page
    };

    const response = await client.get(
        url,
        {
            params,
            timeout: 5000
        }
    );

    return response.data;
}


// ============================================================
// NORMALIZE SEARCH RESULT
// ============================================================

function normalizeNewSong(info) {

    if (!info) return null;

    return {
        id: String(
            info.ID ??
            info.album_audio_id ??
            ""
        ),

        hash:
            info.FileHash ??
            info.hash ??
            "",

        title:
            info.SongName ??
            info.songname ??
            "",

        subtitle:
            info.Auxiliary ??
            info.topic ??
            "",

        artist:
            Array.isArray(info.Singers)
                ? info.Singers
                    .map(x => x?.name)
                    .filter(Boolean)
                : String(
                    info.singername ||
                    ""
                )
                    .split("、")
                    .filter(Boolean),

        album:
            info.AlbumName ??
            info.album_name ??
            "",

        duration: Number(
            info.Duration ??
            info.duration ??
            0
        )
    };
}


function normalizeOldSong(info) {

    if (!info) return null;

    return {
        id: String(
            info.album_audio_id ??
            ""
        ),

        hash:
            info.hash ??
            "",

        title:
            info.songname ??
            "",

        subtitle:
            info.topic ??
            "",

        artist:
            String(
                info.singername ||
                ""
            )
                .split("、")
                .filter(Boolean),

        album:
            info.album_name ??
            "",

        duration: Number(
            info.duration ??
            0
        )
    };
}


// ============================================================
// SEARCH SONG
// ============================================================

async function searchSongs(keyword) {

    // --------------------------------------------------------
    // NEW API
    // --------------------------------------------------------

    try {

        const data =
            await searchNew(keyword, 1);

        const list =
            data?.data?.lists || [];

        if (list.length > 0) {

            console.log(
                `[Kugou] Search: ${list.length} candidates`
            );

            return list
                .map(normalizeNewSong)
                .filter(Boolean);
        }

        console.log(
            "[Kugou] New search returned no results"
        );

    } catch (err) {

        console.warn(
            "[Kugou] New search failed:",
            err.message
        );

        console.log(
            "[Kugou] Trying old search API..."
        );
    }

    // --------------------------------------------------------
    // OLD API FALLBACK
    // --------------------------------------------------------

    try {

        const data =
            await searchOld(keyword, 1);

        const list =
            data?.data?.info || [];

        console.log(
            `[Kugou] Old search: ${list.length} candidates`
        );

        return list
            .map(normalizeOldSong)
            .filter(Boolean);

    } catch (err) {

        console.warn(
            "[Kugou] Old search failed:",
            err.message
        );

        return [];
    }
}


// ============================================================
// LYRIC SEARCH
// ============================================================

async function searchLyrics(song) {

    const artistText =
        Array.isArray(song.artist)
            ? song.artist.join("、")
            : String(song.artist || "");

    const keyword =
        `${artistText} - ${song.title}`;

    const params = {

        album_audio_id:
            song.id,

        duration:
            song.duration * 1000,

        hash:
            song.hash,

        keyword,

        lrctxt: "1",

        man: "no"
    };

    try {

        const data =
            await kugouRequest({
                url: LYRIC_SEARCH_URL,
                params,
                module: "Lyric"
            });

        const candidates =
            data?.candidates || [];

        console.log(
            `[Kugou] Lyric candidates: ${candidates.length}`
        );

        return candidates;

    } catch (err) {

        console.warn(
            "[Kugou] Lyric search failed:",
            err.message
        );

        return [];
    }
}


// ============================================================
// KRC DOWNLOAD
// ============================================================

async function downloadLyrics(candidate) {

    const params = {

        accesskey:
            candidate.accesskey,

        charset:
            "utf8",

        client:
            "mobi",

        fmt:
            "krc",

        id:
            candidate.id,

        ver:
            "1"
    };

    try {

        const data =
            await kugouRequest({
                url: LYRIC_DOWNLOAD_URL,
                params,
                module: "Lyric"
            });

        if (!data?.content) {
            return null;
        }

        return data;

    } catch (err) {

        console.warn(
            "[Kugou] Lyric download failed:",
            err.message
        );

        return null;
    }
}


// ============================================================
// KRC DECRYPT
// ============================================================

function decryptKRCContent(base64Content) {

    if (!base64Content) {
        return null;
    }

    const encrypted =
        Buffer.from(
            base64Content,
            "base64"
        );

    if (!encrypted.length) {
        return null;
    }

    // --------------------------------------------------------
    // Kalau contenttype = 2, LDDC menganggapnya plaintext.
    // --------------------------------------------------------

    // Caller akan menangani plaintext.
    // Untuk KRC normal, gunakan decryptor.
    if (!krcDecrypt) {

        throw new Error(
            "KRC decryptor tidak tersedia. " +
            "Pastikan src/decryptor/krc.js ada."
        );
    }

    const decrypted =
        krcDecrypt(encrypted);

    if (Buffer.isBuffer(decrypted)) {
        return decrypted.toString("utf8");
    }

    return String(decrypted || "");
}


// ============================================================
// GET LYRICS FOR SONG
// ============================================================

async function getLyricsForSong(song) {

    const candidates =
        await searchLyrics(song);

    if (!candidates.length) {
        return null;
    }

    // LDDC mengambil kandidat pertama.
    // Kita pertahankan perilaku ini dulu.
    const candidate =
        candidates[0];

    console.log(
        `[Kugou] Lyric match: ` +
        `${candidate.nickname || "unknown"} ` +
        `[ID: ${candidate.id}] ` +
        `(score=${candidate.score ?? "?"})`
    );

    const data =
        await downloadLyrics(candidate);

    if (!data) {
        return null;
    }

    // --------------------------------------------------------
    // contenttype 2 = plaintext
    // --------------------------------------------------------

    if (data.contenttype === 2) {

        const text =
            Buffer.from(
                data.content,
                "base64"
            ).toString("utf8");

        if (!text.trim()) {
            return null;
        }

        console.log(
            "[Kugou] Got plaintext lyrics"
        );

        return {
            rawLyric: text,
            source: "kugou",
            type: "line"
        };
    }

    // --------------------------------------------------------
    // contenttype normal = encrypted KRC
    // --------------------------------------------------------

    const lyric =
        decryptKRCContent(
            data.content
        );

    if (!lyric?.trim()) {
        return null;
    }

    console.log(
        "[Kugou] Got KRC karaoke lyrics"
    );

    return {
        rawLyric: lyric,
        source: "kugou",
        type: "karaoke"
    };
}


// ============================================================
// MAIN PROVIDER
// ============================================================

async function getLyrics({
    title,
    artist,
    album,
    duration
}) {

    try {

        if (!title) {
            return null;
        }

        const artistText =
            Array.isArray(artist)
                ? artist.join(" ")
                : String(artist || "");

        // ----------------------------------------------------
        // LDDC search menggunakan keyword bebas.
        // Kita sertakan artist + title.
        // ----------------------------------------------------

        const keyword =
            `${artistText} ${title}`.trim();

        console.log(
            `[Kugou] Searching: ${keyword}`
        );

        const songs =
            await searchSongs(keyword);

        if (!songs.length) {

            console.log(
                "[Kugou] No search result"
            );

            return null;
        }

        // ----------------------------------------------------
        // Untuk sekarang ambil kandidat search pertama,
        // sama seperti alur lama provider.
        //
        // Nanti matching bisa kita upgrade terpisah.
        // ----------------------------------------------------

        const song =
            songs[0];

        console.log(
            `[Kugou] Song: ` +
            `${song.artist.join(", ")} - ` +
            `${song.title} ` +
            `[ID: ${song.id}]`
        );

        // ----------------------------------------------------
        // Get lyrics
        // ----------------------------------------------------

        const lyrics =
            await getLyricsForSong(song);

        if (!lyrics) {

            console.log(
                "[Kugou] No lyrics found"
            );

            return null;
        }

        // ----------------------------------------------------
        // Metadata tambahan
        // ----------------------------------------------------

        return {
            ...lyrics,

            song: {
                id: song.id,
                title: song.title,
                artist: song.artist,
                album: song.album,
                duration: song.duration
            }
        };

    } catch (err) {

        console.error(
            "[Kugou] Provider Error:",
            err.message
        );

        return null;
    }
}


// ============================================================
// EXPORT
// ============================================================

module.exports = {
    getLyrics
};