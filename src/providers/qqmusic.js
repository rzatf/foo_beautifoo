// src/providers/qqmusic.js

const axios = require('axios');
const { qrcDecrypt } = require('../decryptor/qrc');

const QQMUSIC_API = 'https://u.y.qq.com/cgi-bin/musicu.fcg';


// ============================================================
// QQMUSIC CLIENT
// ============================================================

let session = null;
let sessionPromise = null;

const comm = {
    ct: 11,
    cv: '1003006',
    v: '1003006',

    os_ver: '15',
    phonetype: '24122RKC7C',

    rom:
        'Redmi/miro/miro:15/' +
        'AE3A.240806.005/' +
        'OS2.0.105.0.VOMCNXM:user/release-keys',

    tmeAppID: 'qqmusiclight',
    nettype: 'NETWORK_WIFI',
    udid: '0'
};

const client = axios.create({
    baseURL: QQMUSIC_API,

    timeout: 10000,

    headers: {
        cookie: 'tmeLoginType=-1;',
        'content-type': 'application/json',
        'accept-encoding': 'gzip',
        'user-agent': 'okhttp/3.14.9'
    }
});


// ============================================================
// UTIL
// ============================================================

function generateSearchId() {
    return String(
        Math.floor(Math.random() * 20) * 18014398509481984 +
        Math.floor(Math.random() * 4194304) * 4294967296 +
        (Date.now() % 86400000)
    );
}


function base64Encode(text) {
    return Buffer
        .from(String(text || ''), 'utf8')
        .toString('base64');
}


function normalizeText(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFKC')

        // Hapus isi (...) dan [...]
        .replace(/\([^)]*\)/g, '')
        .replace(/\[[^\]]*\]/g, '')

        // Chinese / Japanese brackets
        .replace(/[【】「」『』]/g, '')

        // Quotes
        .replace(/[“”"‘’]/g, '')

        // whitespace
        .replace(/\s+/g, ' ')
        .trim();
}


function getArtists(song) {
    return (song?.singer || [])
        .map(singer => singer?.name)
        .filter(Boolean);
}


function getAlbum(song) {
    return song?.album?.name || '';
}


// ============================================================
// SESSION
// ============================================================

async function initSession() {
    if (session) {
        return session;
    }

    // Kalau ada request lain yang sedang membuat session,
    // tunggu request tersebut daripada membuat session kedua.
    if (sessionPromise) {
        return sessionPromise;
    }

    sessionPromise = (async () => {
        const body = {
            comm: {
                ...comm
            },

            request: {
                method: 'GetSession',
                module: 'music.getSession.session',

                param: {
                    caller: 0,
                    uid: '0',
                    vkey: 0
                }
            }
        };

        const response = await client.post('', body);
        const result = response.data;

        if (result?.code !== 0) {
            throw new Error(
                `GetSession outer code: ${result?.code}`
            );
        }

        if (result?.request?.code !== 0) {
            throw new Error(
                `GetSession inner code: ${result?.request?.code}`
            );
        }

        const data = result?.request?.data?.session;

        if (!data) {
            throw new Error(
                'QQMusic session tidak ditemukan'
            );
        }

        session = {
            uid: data.uid,
            sid: data.sid,
            userip: data.userip
        };

        console.log(
            `[QQMusic] Session OK: uid=${session.uid}, sid=${session.sid}`
        );

        return session;
    })();

    try {
        return await sessionPromise;
    } finally {
        sessionPromise = null;
    }
}


// ============================================================
// GENERIC QQMUSIC REQUEST
// ============================================================

async function request(method, module, param) {
    const currentSession = await initSession();

    const body = {
        comm: {
            ...comm,

            uid: currentSession.uid,
            sid: currentSession.sid,
            userip: currentSession.userip
        },

        request: {
            method,
            module,
            param
        }
    };

    const response = await client.post('', body);
    const data = response.data;

    if (data?.code !== 0) {
        throw new Error(
            `QQMusic outer code: ${data?.code}`
        );
    }

    if (data?.request?.code !== 0) {
        throw new Error(
            `QQMusic inner code: ${data?.request?.code}`
        );
    }

    return data.request.data;
}


// ============================================================
// SEARCH
// ============================================================

async function searchSongs(keyword, page = 1) {
    const data = await request(
        'DoSearchForQQMusicLite',
        'music.search.SearchCgiService',
        {
            search_id: generateSearchId(),

            remoteplace: 'search.android.keyboard',

            query: keyword,

            search_type: 0,

            num_per_page: 20,

            page_num: page,

            highlight: 0,

            nqc_flag: 0,

            page_id: 1,

            grp: 1
        }
    );

    return data?.body?.item_song || [];
}


// ============================================================
// SONG MATCHING
// ============================================================

function isTitleMatch(songTitle, targetTitle) {
    const song = normalizeText(songTitle);
    const target = normalizeText(targetTitle);

    if (!song || !target) {
        return false;
    }

    return (
        song === target ||
        song.includes(target) ||
        target.includes(song)
    );
}


function isArtistMatch(songArtists, targetArtist) {
    const target = normalizeText(targetArtist);

    if (!target) {
        return false;
    }

    return songArtists.some(artist => {
        const current = normalizeText(artist);

        return (
            current === target ||
            current.includes(target) ||
            target.includes(current)
        );
    });
}


function calculateDurationScore(song, targetDuration) {
    const songDuration = Number(song?.interval) || 0;
    const duration = Number(targetDuration) || 0;

    if (songDuration <= 0 || duration <= 0) {
        return 0;
    }

    const diff = Math.abs(songDuration - duration);

    if (diff <= 1) {
        return 20;
    }

    if (diff <= 3) {
        return 10;
    }

    if (diff <= 10) {
        return 3;
    }

    return 0;
}


function rankSong(song, title, artist, duration) {
    if (!song) {
        return null;
    }

    const songTitle = song.title || '';

    // ========================================================
    // HARD REQUIREMENT:
    // TITLE HARUS MATCH.
    //
    // Jangan pernah memilih lagu hanya karena artist/duration
    // kalau title-nya salah.
    // ========================================================

    if (!isTitleMatch(songTitle, title)) {
        return null;
    }

    const artists = getArtists(song);

    const normalizedSongTitle = normalizeText(songTitle);
    const normalizedTargetTitle = normalizeText(title);

    let score = 0;

    // Exact title
    if (normalizedSongTitle === normalizedTargetTitle) {
        score += 100;
    }

    // Partial title
    else {
        score += 50;
    }

    // Artist
    if (isArtistMatch(artists, artist)) {
        score += 50;
    }

    // Duration
    score += calculateDurationScore(song, duration);

    return score;
}


// ============================================================
// FIND SONG
// ============================================================

async function findSong(title, artist, duration) {
    const queries = [
        `${artist} ${title}`,
        title
    ];

    const candidates = [];
    const seenIds = new Set();

    for (const query of queries) {
        console.log(
            `[QQMusic] Search: "${query}"`
        );

        let songs;

        try {
            // Page 1 = 20 hasil.
            songs = await searchSongs(query, 1);
        } catch (error) {
            console.warn(
                `[QQMusic] Search gagal "${query}":`,
                error.message
            );

            continue;
        }

        if (!Array.isArray(songs)) {
            continue;
        }

        for (const song of songs) {
            const id = String(song?.id || '');

            // Hindari kandidat duplicate dari query kedua.
            if (id && seenIds.has(id)) {
                continue;
            }

            if (id) {
                seenIds.add(id);
            }

            const score = rankSong(
                song,
                title,
                artist,
                duration
            );

            // null = title tidak cocok.
            if (score === null) {
                continue;
            }

            candidates.push({
                song,
                score
            });
        }

        // ====================================================
        // PENTING:
        //
        // Kalau query pertama sudah menghasilkan title match,
        // tidak perlu query kedua.
        //
        // Kalau belum ada title match, baru fallback ke query
        // title saja.
        // ====================================================

        if (candidates.length > 0) {
            break;
        }
    }

    if (candidates.length === 0) {
        return null;
    }

    candidates.sort((a, b) => {
        return b.score - a.score;
    });

    const best = candidates[0];

    console.log(
        `[QQMusic] Best match: ` +
        `${getArtists(best.song).join(', ')} - ` +
        `${best.song.title} ` +
        `(score=${best.score}, id=${best.song.id})`
    );

    return best.song;
}


// ============================================================
// GET PLAY LYRIC INFO
// ============================================================

async function getPlayLyricInfo(song) {
    const albumName = getAlbum(song);
    const songName = song?.title || '';
    const singerName = getArtists(song).join(',');

    return request(
        'GetPlayLyricInfo',
        'music.musichallSong.PlayLyricInfo',
        {
            albumName: base64Encode(albumName),

            crypt: 1,

            ct: 19,
            cv: 2111,

            interval: Number(song?.interval) || 0,

            lrc_t: 0,

            // Native QRC
            qrc: 1,
            qrc_t: 0,

            // Native romaji
            roma: 1,
            roma_t: 0,

            singerName: base64Encode(singerName),

            songID: Number(song?.id),

            songName: base64Encode(songName),

            // Translation
            trans: 1,
            trans_t: 0,

            type: 0
        }
    );
}


// ============================================================
// QRC DECRYPT HELPER
// ============================================================

function decryptQRC(label, encrypted) {
    if (!encrypted) {
        return '';
    }

    try {
        const decrypted = qrcDecrypt(encrypted);

        if (!decrypted) {
            return '';
        }

        console.log(
            `[QQMusic] ${label}: QRC decrypt OK`
        );

        return decrypted;
    } catch (error) {
        console.warn(
            `[QQMusic] ${label}: QRC decrypt gagal:`,
            error.message
        );

        return '';
    }
}


// ============================================================
// LYRIC RESPONSE
// ============================================================

function processLyricResponse(data) {
    if (!data) {
        return null;
    }

    // ========================================================
    // ORIGINAL
    // ========================================================

    const originalEncrypted =
        data?.orig?.lyric ||
        data?.lyric ||
        '';

    const rawLyric = decryptQRC(
        'Original',
        originalEncrypted
    );

    // ========================================================
    // TRANSLATION
    // ========================================================

    const translationEncrypted =
        data?.ts?.trans ||
        '';

    const transLyric = decryptQRC(
        'Translation',
        translationEncrypted
    );

    // ========================================================
    // ROMAJI
    // ========================================================

    const romaEncrypted =
        data?.roma?.roma ||
        '';

    const romaLyric = decryptQRC(
        'Romaji',
        romaEncrypted
    );

    // Tidak ada original lyric.
    if (!rawLyric) {
        return null;
    }

    return {
        rawLyric,

        // Parser utama nanti bisa menggunakan ini untuk
        // menggabungkan native translation + native romaji.
        transLyric,

        romaLyric,

        // Metadata tambahan dari QQMusic.
        qrc_t: data?.qrc_t,
        lrc_t: data?.lrc_t,
        trans_t: data?.trans_t,
        roma_t: data?.roma_t
    };
}


// ============================================================
// PUBLIC PROVIDER
// ============================================================

async function getLyrics({
    title,
    artist,
    duration = 0
}) {
    try {
        if (!title) {
            return null;
        }

        console.log(
            `[QQMusic] Mencari: ${artist || 'Unknown'} - ${title}`
        );

        // ====================================================
        // 1. Cari lagu
        // ====================================================

        const song = await findSong(
            title,
            artist,
            duration
        );

        if (!song) {
            console.log(
                `[QQMusic] Lagu tidak ditemukan: ` +
                `${artist || 'Unknown'} - ${title}`
            );

            return null;
        }

        console.log(
            `[QQMusic] Match: ` +
            `${getArtists(song).join(', ')} - ` +
            `${song.title} ` +
            `[ID: ${song.id}]`
        );

        // ====================================================
        // 2. Ambil QRC + translation + romaji
        // ====================================================

        const lyricData = await getPlayLyricInfo(song);

        if (!lyricData) {
            console.log(
                '[QQMusic] Response lyrics kosong'
            );

            return null;
        }

        console.log(
            '[QQMusic] Lyric response:',
            {
                orig: !!lyricData?.orig?.lyric,
                trans: !!lyricData?.ts?.trans,
                roma: !!lyricData?.roma?.roma,

                qrc_t: lyricData?.qrc_t,
                lrc_t: lyricData?.lrc_t,
                trans_t: lyricData?.trans_t,
                roma_t: lyricData?.roma_t
            }
        );

        // ====================================================
        // 3. Decrypt semuanya
        // ====================================================

        const processed = processLyricResponse(
            lyricData
        );

        if (!processed) {
            console.log(
                '[QQMusic] Original lyric tidak tersedia'
            );

            return null;
        }

        // ====================================================
        // 4. Return format provider
        //
        // Parser qqmusicParser.js akan menerima rawLyric.
        // transLyric + romaLyric tersedia untuk parser agar
        // nantinya dapat digabungkan ke line yang sama.
        // ====================================================

        return {
            source: 'qqmusic',

            rawLyric: processed.rawLyric,

            transLyric: processed.transLyric,

            romaLyric: processed.romaLyric,

            song: {
                id: String(song.id),

                mid: song.mid || '',

                title: song.title || '',

                artist: getArtists(song),

                album: getAlbum(song),

                duration:
                    Number(song.interval) || 0
            },

            qrc_t: processed.qrc_t,
            lrc_t: processed.lrc_t,
            trans_t: processed.trans_t,
            roma_t: processed.roma_t
        };

    } catch (error) {
        console.error(
            '[QQMusic] Provider Error:',
            error.message
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