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

// Provider dan Parser Lokal (Diaktifkan)
const { getLocalLyrics } = require("./providers/localLyrics");
const { parseLocalLrc } = require("./parsers/localParser");

/* =========================================================
 * LIMITED CACHE 
 * ========================================================= */
class LRUCache {
    constructor(limit = 300) {
        this.limit = limit;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return null;
        const val = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, val);
        return val;
    }

    set(key, val) {
        if (this.cache.has(key)) this.cache.delete(key);
        else if (this.cache.size >= this.limit) {
            // Hapus lagu paling lama
            this.cache.delete(this.cache.keys().next().value);
        }
        this.cache.set(key, val);
    }
}

const lyricsCache = new LRUCache(300);

/* =========================================================
 * HELPER METADATA & VALIDASI
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

function isMetadataMatch(itemMetadata, targetMetadata) {
    if (!itemMetadata) return true;

    const targetTitle = normalizeText(targetMetadata?.title);
    const targetArtist = normalizeText(targetMetadata?.artist);

    const itemTitle = normalizeText(itemMetadata?.title);
    const itemArtist = Array.isArray(itemMetadata?.artist)
        ? itemMetadata.artist.map(normalizeText).join(" ")
        : normalizeText(itemMetadata?.artist);

    if (!targetTitle || !targetArtist) return true;

    const titleSim = stringSimilarity.compareTwoStrings(itemTitle, targetTitle);
    const isTitleValid =
        titleSim >= 0.5 ||
        itemTitle.includes(targetTitle) ||
        targetTitle.includes(itemTitle);

    const artistSim = stringSimilarity.compareTwoStrings(itemArtist, targetArtist);
    const isArtistValid =
        artistSim >= 0.4 ||
        itemArtist.includes(targetArtist) ||
        targetArtist.includes(itemArtist);

    return isTitleValid && isArtistValid;
}

/* =========================================================
 * FUNGSI UTAMA ENGINE
 * ========================================================= */
/**
 * @param {Object} metadata - Metadata lagu
 * @param {Function} [onLocalFound] - Callback opsional saat lirik lokal langsung ketemu
 */
async function getLyrics(metadata, onLocalFound = null) {
    const cacheKey = `${normalizeText(metadata?.artist)}_${normalizeText(metadata?.title)}`;

    // 1. CEK MAP CACHE (0 ms)
    const cachedData = lyricsCache.get(cacheKey);
    if (cachedData) {
        console.log("[Engine] Lirik ditemukan di Memory Cache (300 Limit Map).");
        return cachedData;
    }

    // 2. JIKA CACHE KOSONG -> AMBIL EMBEDDED / LOKAL DULUAN (UNTUK PLACEHOLDER)
    let localLyrics = null;
    try {
        const rawLocal = await getLocalLyrics(metadata);
        if (rawLocal) {
            const parsedLocal = parseLocalLrc(rawLocal);
            if (parsedLocal && (parsedLocal.lines?.length > 0 || parsedLocal.karaoke)) {
                localLyrics = parsedLocal.karaoke || parsedLocal;
                localLyrics.source = "Local / Embedded";

                // Panggil callback agar UI langsung menampilkan lirik lokal tanpa menunggu online
                if (typeof onLocalFound === "function") {
                    onLocalFound(localLyrics);
                }
                console.log("[Engine] Lirik Embedded/Lokal ditemukan & ditayangkan sementara.");
            }
        }
    } catch (e) {
        console.warn("[Engine] Gagal mengambil lirik lokal:", e.message);
    }

    // 3. JALANKAN PENCARIAN ONLINE SECEPATNYA (BACKGROUND CONCURRENT)
    const providers = [
        { name: "NetEase", fetch: getNetEaseLyrics, parse: parseNetEase },
        { name: "SyncLRC", fetch: getSyncLRCLyrics, parse: parseSyncLRC },
        { name: "KaraLyr", fetch: getKaralyrLyrics, parse: parseKaralyr },
        { name: "Kugou", fetch: getKugouLyrics, parse: parseKugou },
        { name: "QQ Music", fetch: getQQLyrics, parse: parseQQMusic },
        { name: "LRCLIB", fetch: getLrclibLyrics, parse: parseLrclib }
    ];

    console.log("[Engine] Memulai pencarian provider online...");

    // Timeout longgar (8 detik) agar server China (Kugou/QQ/NetEase) sempat mengirim Karaoke
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const results = await Promise.all(
        providers.map(async (provider) => {
            try {
                const raw = await provider.fetch(metadata, { signal: controller.signal });
                if (!raw) return null;

                const parsed = provider.parse(raw);
                if (!parsed) return null;

                const songMeta = parsed.song || parsed.karaoke?.song || parsed.line?.song;
                if (!isMetadataMatch(songMeta, metadata)) return null;

                return { provider: provider.name, parsed };
            } catch (e) {
                return null;
            }
        })
    );
    clearTimeout(timeout);

    // Kumpulkan kandidat
    const karaokeCandidates = [];
    const lineCandidates = [];

    for (const res of results) {
        if (!res) continue;
        const { provider, parsed } = res;

        if (parsed.karaoke || parsed.type === "karaoke") {
            karaokeCandidates.push({ provider, lyrics: parsed.karaoke || parsed });
        } else if (parsed.line || parsed.type === "line") {
            lineCandidates.push({ provider, lyrics: parsed.line || parsed });
        }
    }

    // PRIORITAS 1: Karaoke Online -> PRIORITAS 2: Line Online -> PRIORITAS 3: Local Fallback
    let selected = karaokeCandidates[0] || lineCandidates[0] || null;
    let finalLyrics = null;

    if (selected) {
        console.log(`[Engine] Lirik online terpilih dari ${selected.provider}`);
        finalLyrics = selected.lyrics;
        finalLyrics.source = selected.provider;
    } else if (localLyrics) {
        console.log("[Engine] Online tidak ada hasil. Memakai lirik Embedded/Lokal.");
        finalLyrics = localLyrics;
    }

    if (!finalLyrics) {
        console.log("[Engine] Tidak ada lirik ditemukan (Lokal & Online Kosong).");
        return null;
    }

    // Convert Romaji
    await attachRomajiToLyrics(finalLyrics);

    // Simpan hasil terbaik ke Memory Map
    lyricsCache.set(cacheKey, finalLyrics);

    return finalLyrics;
}

module.exports = { getLyrics };