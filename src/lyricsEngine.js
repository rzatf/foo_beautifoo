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


    console.log("[Engine] Mencari lirik dari semua provider secara concurrent...");


    // Jalankan SEMUA provider secara bersamaan
    const results = await Promise.all(
        providers.map(async (provider) => {

            try {

                const raw = await provider.fetch(metadata);

                if (!raw) {
                    console.log(`[Engine] ${provider.name}: tidak ada hasil`);
                    return null;
                }

                const lyrics = provider.parse(raw);

                if (!lyrics) {
                    console.log(`[Engine] ${provider.name}: gagal parse`);
                    return null;
                }

                console.log(
                    `[Engine] ${provider.name}: ${lyrics.type}`
                );

                return {
                    provider: provider.name,
                    lyrics
                };

            } catch (e) {

                console.warn(
                    `[Engine] ${provider.name} error:`,
                    e.message
                );

                return null;
            }

        })
    );


    // =========================================================
    // PILIH KARAOKE BERDASARKAN PRIORITAS PROVIDER
    // =========================================================

    let selectedLyrics = null;
    let fallbackLineLyrics = null;


    for (const result of results) {

        if (!result) {
            continue;
        }

        const lyrics = result.lyrics;


        // Karaoke selalu lebih diutamakan
        if (lyrics.type === "karaoke") {

            selectedLyrics = lyrics;

            console.log(
                `[Engine] Karaoke terpilih dari ${result.provider}`
            );

            break;
        }


        // Simpan line lyrics pertama berdasarkan prioritas
        if (!fallbackLineLyrics) {

            fallbackLineLyrics = lyrics;

            console.log(
                `[Engine] Line lyrics fallback dari ${result.provider}`
            );
        }
    }


    // Karaoke > line lyrics
    const result = selectedLyrics || fallbackLineLyrics;


    if (!result) {
        console.log("[Engine] Tidak ada lirik ditemukan.");
        return null;
    }


    // =========================================================
    // ROMAJI
    // =========================================================

    console.log("[Engine] Mengonversi teks ke Romaji...");

    await attachRomajiToLyrics(result);


    return result;
}


module.exports = { getLyrics };