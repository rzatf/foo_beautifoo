const stringSimilarity = require("string-similarity");

const { attachRomajiToLyrics } = require("./utils/romaji");

const { getLyrics: getNetEaseLyrics } = require("./providers/netease");
const { parseNetEase } = require("./parsers/neteaseParser");

const { getLyrics: getSyncLRCLyrics } = require("./providers/synclrc");
const { parseSyncLRC } = require("./parsers/synclrcParser");

const { getLyrics: getKaralyrLyrics } = require("./providers/karalyr");
const { parseKaralyr } = require("./parsers/karalyrParser");

const { getLyrics: getKugouLyrics } = require("./providers/kugou");
const { parseKugou } = require("./parsers/kugouParser");

const { getLyrics: getQQLyrics } = require("./providers/qqmusic");
const { parseQQMusic } = require("./parsers/qqmusicParser");

const { getLyrics: getLrclibLyrics } = require("./providers/lrclib");
const { parseLrclib } = require("./parsers/lrclibParser");

// Import Provider dan Parser Lokal
// const { getLocalLyrics } = require("./providers/localLyrics");
// const { parseLocalLrc } = require("./parsers/localParser");

/* =========================================================
 * FUNGSI HELPER VALIDASI METADATA (JUDUL & ARTIS)
 * ========================================================= */

function normalizeText(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFKC")
        .replace(/[“”"‘’]/g, "")
        .replace(/[【】「」『』]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Validasi ganda: memastikan Judul DAN Artis keduanya cocok.
 */
function isMetadataMatch(itemMetadata, targetMetadata) {
    if (!itemMetadata) return true; // Jika provider tidak mengembalikan objek metadata lagu, teruskan ke verifikasi berikutnya

    const targetTitle = normalizeText(targetMetadata?.title);
    const targetArtist = normalizeText(targetMetadata?.artist);

    const itemTitle = normalizeText(itemMetadata?.title);
    const itemArtist = Array.isArray(itemMetadata?.artist)
        ? itemMetadata.artist.map(normalizeText).join(" ")
        : normalizeText(itemMetadata?.artist);

    if (!targetTitle || !targetArtist) return true;

    // 1. Validasi Judul (Similarity score >= 0.5 ATAU substring match)
    const titleSim = stringSimilarity.compareTwoStrings(itemTitle, targetTitle);
    const isTitleValid =
        titleSim >= 0.5 ||
        itemTitle.includes(targetTitle) ||
        targetTitle.includes(itemTitle);

    // 2. Validasi Artis (Similarity score >= 0.4 ATAU substring match)
    const artistSim = stringSimilarity.compareTwoStrings(itemArtist, targetArtist);
    const isArtistValid =
        artistSim >= 0.4 ||
        itemArtist.includes(targetArtist) ||
        targetArtist.includes(itemArtist);

    // Keduanya WAJIB BERNILAI TRUE
    return isTitleValid && isArtistValid;
}

async function getLyrics(metadata) {

    // Urutan array = URUTAN PRIORITAS
    const providers = [
        {
            name: "NetEase",
            fetch: getNetEaseLyrics,
            parse: parseNetEase
        },
        {
            name: "SyncLRC",
            fetch: getSyncLRCLyrics,
            parse: parseSyncLRC
        },
        {
            name: "KaraLyr",
            fetch: getKaralyrLyrics,
            parse: parseKaralyr
        },
        {
            name: "Kugou",
            fetch: getKugouLyrics,
            parse: parseKugou
        },
        {
            name: "QQ Music",
            fetch: getQQLyrics,
            parse: parseQQMusic
        },
        {
            name: "LRCLIB",
            fetch: getLrclibLyrics,
            parse: parseLrclib
        }
    ];

    console.log(
        "[Engine] Mencari lirik dari semua provider secara concurrent..."
    );

    // =========================================================
    // JALANKAN SEMUA PROVIDER
    // =========================================================

    const results = await Promise.all(
        providers.map(async (provider) => {
            try {
                const raw = await provider.fetch(metadata);

                if (!raw) {
                    console.log(`[Engine] ${provider.name}: tidak ada hasil`);
                    return null;
                }

                const parsed = provider.parse(raw);

                if (!parsed) {
                    console.log(`[Engine] ${provider.name}: gagal parse`);
                    return null;
                }

                console.log(`[Engine] ${provider.name}: hasil parse`, parsed);

                return {
                    provider: provider.name,
                    parsed
                };

            } catch (e) {
                console.warn(`[Engine] ${provider.name} error:`, e.message);
                return null;
            }
        })
    );

    // =========================================================
    // KUMPULKAN SEMUA KANDIDAT
    // =========================================================

    const karaokeCandidates = [];
    const lineCandidates = [];

    for (const result of results) {
        if (!result) continue;

        const { provider, parsed } = result;

        // Ambil info metadata lagu dari parser
        const songMetadata = parsed.song || parsed.karaoke?.song || parsed.line?.song;

        // =========================================================
        // VALIDASI 1: FILTER KANDIDAT PERTAMA (CEK METADATA PROVIDER)
        // =========================================================
        if (!isMetadataMatch(songMetadata, metadata)) {
            console.warn(
                `[Engine] [Validasi 1 Ditolak] ${provider}: Judul atau Artis tidak sesuai request.`
            );
            continue;
        }

        if (parsed.karaoke) {
            karaokeCandidates.push({ provider, lyrics: parsed.karaoke });
            console.log(`[Engine] ${provider}: kandidat KARAOKE ditemukan`);
        }

        if (parsed.line) {
            lineCandidates.push({ provider, lyrics: parsed.line });
            console.log(`[Engine] ${provider}: kandidat LINE ditemukan`);
        }

        if (parsed.type === "karaoke") {
            karaokeCandidates.push({ provider, lyrics: parsed });
            console.log(`[Engine] ${provider}: kandidat KARAOKE ditemukan`);
        }

        if (parsed.type === "line") {
            lineCandidates.push({ provider, lyrics: parsed });
            console.log(`[Engine] ${provider}: kandidat LINE ditemukan`);
        }
    }

    // =========================================================
    // PILIH HASIL TERBAIK
    // =========================================================

    let selected = null;

    if (karaokeCandidates.length > 0) {
        selected = karaokeCandidates[0];
        console.log(`[Engine] Karaoke terpilih dari ${selected.provider}`);
    } else if (lineCandidates.length > 0) {
        selected = lineCandidates[0];
        console.log(`[Engine] Line lyrics terpilih dari ${selected.provider}`);
    }

    // =========================================================
    // FALLBACK TERAKHIR: LOKAL & EMBEDDED
    // =========================================================

    // if (!selected) {
    //     console.log("[Engine] Provider online tidak ada hasil. Mencoba fallback lokal...");

    //     try {
    //         const rawLocal = await getLocalLyrics(metadata);

    //         if (rawLocal) {
    //             const parsedLocal = parseLocalLrc(rawLocal);

    //             if (parsedLocal && parsedLocal.lines && parsedLocal.lines.length > 0) {
    //                 selected = {
    //                     provider: "Local Storage / Embedded",
    //                     lyrics: parsedLocal
    //                 };
    //                 console.log("[Engine] Lirik berhasil didapatkan dari file lokal/metadata.");
    //             } else {
    //                 console.log("[Engine] Local/Embedded: Gagal parse lirik lokal atau lirik kosong");
    //             }
    //         } else {
    //             console.log("[Engine] Local/Embedded: Tidak ada file .lrc atau metadata lirik");
    //         }
    //     } catch (e) {
    //         console.warn("[Engine] Local/Embedded error:", e.message);
    //     }
    // }

    // =========================================================
    // TIDAK ADA LIRIK
    // =========================================================

    if (!selected) {
        console.log("[Engine] Tidak ada lirik ditemukan.");
        return null;
    }

    // =========================================================
    // VALIDASI 2: CEK VERIFIKASI AKHIR SEBELUM DITERUSKAN
    // =========================================================

    const finalSongMetadata = selected.lyrics.song;

    if (!isMetadataMatch(finalSongMetadata, metadata)) {
        console.error(
            `[Engine] [Validasi 2 Ditolak] Lirik terpilih dari ${selected.provider} gagal verifikasi akhir!`
        );
        return null;
    }

    console.log(`[Engine] [Validasi 2 Lolos] Metadata kandidat terpilih terverifikasi cocok.`);

    // =========================================================
    // ROMAJI & PENYESUAIAN APP.JS
    // =========================================================

    console.log(`[Engine] Mengonversi teks ${selected.provider} ke Romaji...`);
    await attachRomajiToLyrics(selected.lyrics);

    // Menyuntikkan nama provider ke dalam data lirik agar terbaca di console.log app.js
    selected.lyrics.source = selected.provider;

    return selected.lyrics;
}

module.exports = { getLyrics };