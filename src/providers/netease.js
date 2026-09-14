const axios = require('axios');
const crypto = require('crypto');

const { getDeviceId } = require('./netease/deviceIds');

const {
    eapiParamsEncrypt,
    eapiResponseDecrypt,
    getAnonymousUsername
} = require('../decryptor/eapi');

const NETEASE_API = 'https://interface.music.163.com';
const APP_VERSION = '3.1.3.203419';

// LDDC cache session sekitar 10 hari
const SESSION_EXPIRE = 864000 * 1000;

let session = null;
let sessionPromise = null;


/* ============================================================
 * HTTP CLIENT
 * ============================================================ */

const client = axios.create({
    baseURL: NETEASE_API,

    timeout: 15000,

    headers: {
        accept: '*/*',

        'content-type':
            'application/x-www-form-urlencoded',

        'mconfig-info':
            '{"IuRPVVmc3WWul9fT":{"version":733184,"appver":"3.1.3.203419"}}',

        origin:
            'orpheus://orpheus',

        'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; WOW64) ' +
            'AppleWebKit/537.36 (KHTML, like Gecko) ' +
            'Safari/537.36 Chrome/91.0.4472.164 ' +
            'NeteaseMusicDesktop/3.1.3.203419',

        'sec-ch-ua':
            '"Chromium";v="91"',

        'sec-ch-ua-mobile':
            '?0',

        'sec-fetch-site':
            'cross-site',

        'sec-fetch-mode':
            'cors',

        'sec-fetch-dest':
            'empty',

        'accept-encoding':
            'gzip, deflate, br',

        'accept-language':
            'en-US,en;q=0.9'
    }
});


/* ============================================================
 * RANDOM HELPERS
 * ============================================================ */

function randomHex(length) {
    return crypto
        .randomBytes(Math.ceil(length / 2))
        .toString('hex')
        .slice(0, length);
}


function randomUpper(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    let result = '';

    for (let i = 0; i < length; i++) {
        result += chars[
            crypto.randomInt(0, chars.length)
        ];
    }

    return result;
}


function randomLower(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz';

    let result = '';

    for (let i = 0; i < length; i++) {
        result += chars[
            crypto.randomInt(0, chars.length)
        ];
    }

    return result;
}


/* ============================================================
 * MAC ADDRESS
 * ============================================================ */

function generateMac() {
    const parts = [];

    for (let i = 0; i < 6; i++) {
        parts.push(
            crypto
                .randomInt(0, 256)
                .toString(16)
                .padStart(2, '0')
                .toUpperCase()
        );
    }

    return parts.join(':');
}


/* ============================================================
 * COOKIE HELPERS
 * ============================================================ */

function cookiesToHeader(cookies) {
    return Object.entries(cookies)
        .filter(([, value]) =>
            value !== undefined &&
            value !== ''
        )
        .map(([key, value]) =>
            `${key}=${value}`
        )
        .join('; ');
}


/* ============================================================
 * CLIENT SIGN
 *
 * Sama pola LDDC:
 *
 * MAC@@@RANDOM@@@@@@HASH
 * ============================================================ */

function generateClientSign() {
    const mac = generateMac();
    const randomStr = randomUpper(8);
    const hashPart = randomHex(64);

    return (
        `${mac}@@@` +
        `${randomStr}@@@@@@` +
        `${hashPart}`
    );
}


/* ============================================================
 * NETEASE PARAM HEADER
 *
 * Header ini ikut masuk ke parameter EAPI.
 * ============================================================ */

function getParamsHeader(cookies) {
    return JSON.stringify({
        clientSign:
            cookies.clientSign,

        os:
            cookies.os,

        appver:
            cookies.appver,

        deviceId:
            cookies.deviceId,

        requestId:
            0,

        osver:
            cookies.osver
    });
}


/* ============================================================
 * HTTP HEADER
 * ============================================================ */

function getHeaders(cookies) {
    return {
        accept:
            '*/*',

        'content-type':
            'application/x-www-form-urlencoded',

        cookie:
            cookiesToHeader(cookies),

        'mconfig-info':
            '{"IuRPVVmc3WWul9fT":{"version":733184,"appver":"3.1.3.203419"}}',

        origin:
            'orpheus://orpheus',

        'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; WOW64) ' +
            'AppleWebKit/537.36 (KHTML, like Gecko) ' +
            'Safari/537.36 Chrome/91.0.4472.164 ' +
            'NeteaseMusicDesktop/3.1.3.203419',

        'sec-ch-ua':
            '"Chromium";v="91"',

        'sec-ch-ua-mobile':
            '?0',

        'sec-fetch-site':
            'cross-site',

        'sec-fetch-mode':
            'cors',

        'sec-fetch-dest':
            'empty',

        'accept-encoding':
            'gzip, deflate, br',

        'accept-language':
            'en-US,en;q=0.9'
    };
}


/* ============================================================
 * RESPONSE DECRYPT
 *
 * Penting:
 * responseType = arraybuffer
 *
 * supaya EAPI menerima raw bytes, bukan string.
 * ============================================================ */

function decryptResponse(data) {
    const buffer = Buffer.isBuffer(data)
        ? data
        : Buffer.from(data);

    const decrypted =
        eapiResponseDecrypt(buffer);

    return JSON.parse(
        decrypted.toString('utf8')
    );
}


/* ============================================================
 * ANONYMOUS LOGIN
 *
 * Mengikuti pola LDDC:
 *
 * - Device ID dari pool ne_deviceids
 * - random MAC
 * - random clientSign
 * - random Windows build
 * - random motherboard mode
 * ============================================================ */

async function loginAnonymous() {

    const deviceId = getDeviceId();

    if (!deviceId) {
        throw new Error(
            'NetEase: Device ID tidak tersedia'
        );
    }

    const clientSign =
        generateClientSign();

    const osver =
        `Microsoft-Windows-10--build-` +
        `${crypto.randomInt(200, 301)}00-64bit`;

    const modes = [
        'MS-iCraft B760M WIFI',
        'ASUS ROG STRIX Z790',
        'MSI MAG B550 TOMAHAWK',
        'ASRock X670E Taichi'
    ];

    const cookies = {
        os: 'pc',

        deviceId,

        osver,

        clientSign,

        channel: 'netease',

        mode:
            modes[
                crypto.randomInt(
                    0,
                    modes.length
                )
            ],

        appver:
            APP_VERSION
    };


    const path =
        '/eapi/register/anonimous';


    const params = {
        username:
            getAnonymousUsername(
                cookies.deviceId
            ),

        e_r: true,

        header:
            getParamsHeader(cookies)
    };


    const apiPath =
        path.replace(
            'eapi',
            'api'
        );


    const encrypted =
        eapiParamsEncrypt(
            apiPath,
            params
        );


    console.log(
        '[NetEase] Anonymous login...'
    );

    console.log(
        `[NetEase] Device ID: ${deviceId}`
    );


    const response =
        await client.post(
            path,
            encrypted,
            {
                headers:
                    getHeaders(cookies),

                timeout:
                    15000,

                // Sangat penting untuk EAPI
                responseType:
                    'arraybuffer'
            }
        );


    if (!response.data) {
        throw new Error(
            'NetEase anonymous login: response kosong'
        );
    }


    const data =
        decryptResponse(
            response.data
        );


    if (data.code !== 200) {
        throw new Error(
            `NetEase anonymous login gagal: ` +
            `${data.code} ` +
            `${data.message || ''}`
        );
    }


    /* ========================================================
     * PARSE SET-COOKIE
     * ======================================================== */

    const responseCookies =
        response.headers['set-cookie'] || [];

    const parsedCookies = {};


    for (const cookie of responseCookies) {

        const firstPart =
            cookie.split(';')[0];

        const separator =
            firstPart.indexOf('=');

        if (separator === -1) {
            continue;
        }

        const key =
            firstPart.slice(
                0,
                separator
            );

        const value =
            firstPart.slice(
                separator + 1
            );

        parsedCookies[key] =
            value;
    }


    /* ========================================================
     * FINAL COOKIE
     * ======================================================== */

    const finalCookies = {

        WEVNSM:
            '1.0.0',

        ...cookies,

        NMTID:
            parsedCookies.NMTID || '',

        MUSIC_A:
            parsedCookies.MUSIC_A || '',

        __csrf:
            parsedCookies.__csrf || '',

        WNMCID:
            `${randomLower(6)}.` +
            `${Date.now() - crypto.randomInt(1000, 10001)}.01.0`
    };


    /* ========================================================
     * REMOVE EMPTY COOKIE
     * ======================================================== */

    for (const key of Object.keys(finalCookies)) {

        if (!finalCookies[key]) {
            delete finalCookies[key];
        }
    }


    session = {

        userId:
            data.userId,

        cookies:
            finalCookies,

        expire:
            Date.now() +
            SESSION_EXPIRE
    };


    console.log(
        `[NetEase] Anonymous login berhasil ` +
        `(userId=${session.userId})`
    );


    return session;
}


/* ============================================================
 * SESSION
 * ============================================================ */

async function initSession() {

    // Session masih valid
    if (
        session &&
        Date.now() < session.expire
    ) {
        return session;
    }


    // Kalau login sedang berlangsung,
    // request lain ikut promise yang sama.
    if (sessionPromise) {
        return sessionPromise;
    }


    sessionPromise =
        loginAnonymous();


    try {
        return await sessionPromise;

    } finally {
        sessionPromise = null;
    }
}


/* ============================================================
 * EAPI REQUEST
 * ============================================================ */

async function request(
    path,
    params = {},
    retry = true
) {

    const currentSession =
        await initSession();


    const requestParams = {
        ...params,

        e_r:
            true,

        header:
            getParamsHeader(
                currentSession.cookies
            )
    };


    const apiPath =
        path.replace(
            'eapi',
            'api'
        );


    const encrypted =
        eapiParamsEncrypt(
            apiPath,
            requestParams
        );


    const config = {

        headers:
            getHeaders(
                currentSession.cookies
            ),

        timeout:
            10000,

        responseType:
            'arraybuffer'
    };


    /*
     * LDDC:
     *
     * params={"cache_key": ...}
     *
     * hanya kalau cache_key tersedia.
     */

    if (requestParams.cache_key) {

        config.params = {
            cache_key:
                requestParams.cache_key
        };
    }


    try {

        const response =
            await client.post(
                path,
                encrypted,
                config
            );


        const data =
            decryptResponse(
                response.data
            );


        if (data.code !== 200) {
            throw new Error(
                `NetEase API error: ` +
                `${data.code} ` +
                `${data.message || ''}`
            );
        }


        return data;

    } catch (error) {

        /*
         * Session kemungkinan expired.
         *
         * Buat session baru sekali,
         * lalu ulangi request.
         */

        if (
            retry &&
            session
        ) {

            console.warn(
                '[NetEase] Session gagal, ' +
                'membuat session baru...'
            );

            session = null;

            return request(
                path,
                params,
                false
            );
        }


        throw error;
    }
}


/* ============================================================
 * SEARCH SONGS
 *
 * LDDC:
 *
 * /eapi/search/song/list/page
 *
 * page size = 20
 * ============================================================ */

async function searchSongs(
    keyword,
    page = 1
) {

    const pageSize = 20;


    const params = {

        limit:
            String(pageSize),

        offset:
            String(
                (page - 1) *
                pageSize
            ),

        keyword,

        scene:
            'NORMAL',

        needCorrect:
            'true'
    };


    const data =
        await request(
            '/eapi/search/song/list/page',
            params
        );


    const resources =
        data?.data?.resources || [];


    return resources
        .map(resource =>
            resource
                ?.baseInfo
                ?.simpleSongData
        )
        .filter(Boolean);
}


/* ============================================================
 * NORMALIZATION
 * ============================================================ */

function normalizeText(text) {

    return String(text || '')
        .toLowerCase()
        .normalize('NFKC')
        .replace(
            /[“”"‘’]/g,
            ''
        )
        .replace(
            /[【】「」『』]/g,
            ''
        )
        .replace(
            /\s+/g,
            ' '
        )
        .trim();
}


/* ============================================================
 * ARTISTS
 * ============================================================ */

function getArtists(song) {

    return (song?.ar || [])
        .map(
            artist =>
                artist?.name
        )
        .filter(Boolean);
}


/* ============================================================
 * DURATION
 * ============================================================ */

function getDuration(song) {

    return Number(
        song?.dt ||
        song?.duration ||
        0
    );
}


/* ============================================================
 * ARTIST MATCH
 * ============================================================ */

function isArtistMatch(
    song,
    targetArtist
) {

    const target =
        normalizeText(
            targetArtist
        );


    if (!target) {
        return false;
    }


    const artists =
        getArtists(song)
            .map(normalizeText);


    if (!artists.length) {
        return false;
    }


    /*
     * Exact artist.
     */

    if (
        artists.some(
            artist =>
                artist === target
        )
    ) {
        return true;
    }


    /*
     * Contoh:
     *
     * target:
     * Linkin Park feat. Kiiara
     *
     * NetEase:
     * Linkin Park
     * Kiiara
     */

    const targetParts =
        target
            .split(
                /\s*(?:feat\.?|ft\.?|&|,|\/|;|\bx\b)\s*/i
            )
            .map(normalizeText)
            .filter(Boolean);


    if (
        targetParts.length > 1
    ) {

        const matched =
            targetParts.filter(
                part =>
                    artists.some(
                        artist =>
                            artist === part
                    )
            );


        if (
            matched.length ===
            targetParts.length
        ) {
            return true;
        }
    }


    return false;
}


/* ============================================================
 * TITLE MATCH
 * ============================================================ */

function isTitleMatch(
    songTitle,
    targetTitle
) {

    const song =
        normalizeText(
            songTitle
        );

    const target =
        normalizeText(
            targetTitle
        );


    if (!song || !target) {
        return false;
    }


    /*
     * Exact.
     */

    if (
        song === target
    ) {
        return true;
    }


    /*
     * Versi suffix:
     *
     * I'm Yours
     * I'm Yours - Live
     */

    if (
        song.startsWith(
            target + ' - '
        )
    ) {
        return true;
    }


    if (
        song.startsWith(
            target + ' '
        )
    ) {

        const suffix =
            song
                .slice(
                    target.length
                )
                .trim();


        if (
            /^[-–—:]/.test(
                suffix
            )
        ) {
            return true;
        }
    }


    if (
        target.startsWith(
            song + ' - '
        )
    ) {
        return true;
    }


    return false;
}


/* ============================================================
 * SONG RANKING
 * ============================================================ */

function rankSong(
    song,
    title,
    artist,
    duration
) {

    /*
     * Title wajib.
     */

    if (
        !isTitleMatch(
            song?.name,
            title
        )
    ) {
        return null;
    }


    /*
     * Artist wajib.
     */

    if (
        !isArtistMatch(
            song,
            artist
        )
    ) {
        return null;
    }


    let score = 0;


    const songTitle =
        normalizeText(
            song.name
        );

    const targetTitle =
        normalizeText(
            title
        );


    /*
     * Exact title.
     */

    if (
        songTitle ===
        targetTitle
    ) {

        score += 100;

    } else {

        score += 70;
    }


    /*
     * Artist match.
     */

    score += 50;


    /*
     * Duration.
     */

    const songDuration =
        getDuration(song);


    if (
        duration > 0 &&
        songDuration > 0
    ) {

        const targetMs =
            Number(duration) *
            1000;

        const diff =
            Math.abs(
                songDuration -
                targetMs
            );


        if (diff <= 1000) {

            score += 20;

        } else if (diff <= 3000) {

            score += 10;

        } else if (diff <= 10000) {

            score += 3;
        }
    }


    return score;
}


/* ============================================================
 * FIND SONG
 * ============================================================ */

async function findSong(
    title,
    artist,
    duration
) {

    const queries = [
        `${artist} ${title}`,
        title
    ];


    const candidates = [];


    for (
        const query of queries
    ) {

        for (
            let page = 1;
            page <= 2;
            page++
        ) {

            let songs;

            try {

                songs =
                    await searchSongs(
                        query,
                        page
                    );

            } catch (error) {

                console.warn(
                    `[NetEase] Search gagal ` +
                    `"${query}" page ${page}:`,
                    error.message
                );

                continue;
            }


            for (
                const song of songs
            ) {

                const score =
                    rankSong(
                        song,
                        title,
                        artist,
                        duration
                    );


                if (
                    score === null
                ) {
                    continue;
                }


                candidates.push({
                    song,
                    score
                });
            }


            /*
             * Page kurang dari 20 =
             * sudah halaman terakhir.
             */

            if (
                songs.length < 20
            ) {
                break;
            }
        }


        /*
         * Kalau sudah dapat kandidat
         * dari artist + title,
         * query title-only tidak perlu.
         */

        if (
            candidates.length > 0
        ) {
            break;
        }
    }


    candidates.sort(
        (a, b) =>
            b.score -
            a.score
    );


    if (
        candidates.length === 0
    ) {

        console.log(
            `[NetEase] Tidak menemukan ` +
            `lagu yang benar: ` +
            `${artist} - ${title}`
        );

        return null;
    }


    console.log(
        `[NetEase] Kandidat terpilih: ` +
        `${candidates[0].song.name} ` +
        `(score=${candidates[0].score}, ` +
        `ID=${candidates[0].song.id})`
    );


    console.log(
        '[NetEase] Ranking kandidat:'
    );


    candidates
        .slice(0, 5)
        .forEach(
            (candidate, index) => {

                const song =
                    candidate.song;


                console.log(
                    `  ${index + 1}. ` +
                    `${song.name} | ` +
                    `${getArtists(song).join('/')} | ` +
                    `${(
                        getDuration(song) /
                        1000
                    ).toFixed(1)}s | ` +
                    `score=${candidate.score} | ` +
                    `ID=${song.id}`
                );
            }
        );


    return candidates[0].song;
}


/* ============================================================
 * GET LYRICS
 *
 * LDDC meminta:
 *
 * lv  = -1
 * tv  = -1
 * rv  = -1
 * yv  = -1
 *
 * sehingga:
 * - LRC
 * - YRC
 * - Translation
 * - Romaji
 *
 * semuanya dicoba.
 * ============================================================ */

async function getLyrics({
    title,
    artist,
    duration = 0
}) {

    try {

        console.log(
            `[NetEase] Mencari: ` +
            `${artist} - ${title}`
        );


        const song =
            await findSong(
                title,
                artist,
                duration
            );


        if (!song) {
            return null;
        }


        console.log(
            `[NetEase] Mengambil lyric ID=${song.id}`
        );


        const params = {

            id:
                Number(song.id),

            lv:
                '-1',

            tv:
                '-1',

            rv:
                '-1',

            yv:
                '-1'
        };


        const data =
            await request(
                '/eapi/song/lyric/v1',
                params
            );


        /*
         * Original YRC
         */

        const yrc =
            data?.yrc?.lyric ||
            '';


        /*
         * Original LRC
         */

        const lrc =
            data?.lrc?.lyric ||
            '';


        /*
         * Translation
         */

        const tlyric =
            data?.tlyric?.lyric ||
            '';


        /*
         * Romaji / Romanization
         */

        const romalrc =
            data?.romalrc?.lyric ||
            '';


        /* ====================================================
         * LYRIC STATUS
         * ==================================================== */

        console.log(
            `[NetEase] Lyric status: ` +
            `YRC=${Boolean(yrc)} ` +
            `LRC=${Boolean(lrc)} ` +
            `TRANS=${Boolean(tlyric)} ` +
            `ROMA=${Boolean(romalrc)}`
        );


        /*
         * LDDC:
         *
         * YRC tersedia
         * -> original = YRC
         *
         * YRC tidak ada
         * -> original = LRC
         */

        if (yrc) {

            console.log(
                '[NetEase] YRC ditemukan'
            );

        } else if (lrc) {

            console.log(
                '[NetEase] YRC tidak tersedia, ' +
                'menggunakan LRC'
            );

        } else {

            console.log(
                '[NetEase] Original lyric tidak tersedia'
            );

            return null;
        }


        /* ====================================================
         * RESULT
         * ==================================================== */

        return {

            source:
                'netease',

            song: {

                id:
                    String(song.id),

                title:
                    song.name,

                artist:
                    getArtists(song),

                album:
                    song?.al?.name ||
                    '',

                duration:
                    getDuration(song) /
                    1000
            },


            /*
             * Provider utama.
             *
             * YRC > LRC
             */

            rawLyric:
                yrc || lrc,


            /*
             * Tetap simpan LRC
             * untuk fallback parser.
             */

            lrcLyric:
                lrc,


            /*
             * Translation dari NetEase.
             */

            transLyric:
                tlyric,


            /*
             * Romaji asli dari NetEase.
             */

            romaLyric:
                romalrc,


            /*
             * Type provider.
             */

            type:
                yrc
                    ? 'karaoke'
                    : 'line',


            yrcAvailable:
                Boolean(yrc),

            translationAvailable:
                Boolean(tlyric),

            romajiAvailable:
                Boolean(romalrc)
        };


    } catch (error) {

        console.error(
            '[NetEase] Provider Error:',
            error.message
        );

        return null;
    }
}


/* ============================================================
 * EXPORT
 * ============================================================ */

module.exports = {

    getLyrics,

    searchSongs,

    findSong

};