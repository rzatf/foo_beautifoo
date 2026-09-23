const fsPromises = require("fs").promises;
const path = require("path");

/**
 * 1. Cari file .lrc persis di samping file musik (Fast Path)
 */
async function getLrcBesideFile(audioPath) {
    const ext = path.extname(audioPath);
    const lrcPath = audioPath.replace(new RegExp(`${ext}$`, "i"), ".lrc");

    try {
        await fsPromises.access(lrcPath);
        return await fsPromises.readFile(lrcPath, "utf-8");
    } catch {
        return null;
    }
}

/**
 * 2. Cari file .lrc di folder induk secara ASYNCHRONOUS (Max Depth 3 Level)
 */
async function findMisplacedLrc(baseFolder, songFileName, maxDepth = 3) {
    if (!baseFolder || maxDepth < 0) return null;

    const targetName = songFileName.toLowerCase() + ".lrc";

    try {
        const items = await fsPromises.readdir(baseFolder, { withFileTypes: true });

        for (const item of items) {
            const fullPath = path.join(baseFolder, item.name);

            if (item.isFile() && item.name.toLowerCase() === targetName) {
                return await fsPromises.readFile(fullPath, "utf-8");
            } else if (item.isDirectory() && maxDepth > 0) {
                const found = await findMisplacedLrc(fullPath, songFileName, maxDepth - 1);
                if (found) return found;
            }
        }
    } catch (e) {
        return null; // Abaikan folder terproteksi / akses ditolak
    }

    return null;
}

/**
 * 3. Baca embedded lyrics dari metadata file audio (Mendukung tag <LYRICS> foobar2000 & USLT standar)
 */
async function getEmbeddedLyrics(audioPath) {
    try {
        // Menggunakan dynamic import agar kompatibel dengan music-metadata v7 / v8+
        let musicMetadata;
        try {
            musicMetadata = require("music-metadata");
        } catch {
            musicMetadata = await import("music-metadata");
        }

        const metadata = await musicMetadata.parseFile(audioPath);

        // A. Cek tag standar USLT (metadata.common.lyrics)
        const commonLyrics = metadata.common.lyrics;
        if (commonLyrics && commonLyrics.length > 0) {
            return typeof commonLyrics[0] === "string" ? commonLyrics[0] : commonLyrics[0].text;
        }

        // B. FIX FOOBAR2000: Ekstrak dari Native Tags (<LYRICS>)
        if (metadata.native) {
            for (const tagType of Object.keys(metadata.native)) {
                const tags = metadata.native[tagType];
                const lyricTag = tags.find(
                    (t) => t.id && t.id.toUpperCase() === "LYRICS"
                );
                if (lyricTag && lyricTag.value) {
                    return String(lyricTag.value);
                }
            }
        }
    } catch (err) {
        console.warn("[Local] Gagal membaca metadata embedded:", err.message);
    }
    return null;
}

/**
 * Main Function Fallback Lokal
 */
async function getLocalLyrics(metadata) {
    const filePath = metadata?.filePath;
    if (!filePath) return null;

    const fileNameWithoutExt = path.basename(filePath, path.extname(filePath));

    // PRIORITAS 1: File .lrc persis di sebelah lagu (Paling Cepat)
    const besideLrc = await getLrcBesideFile(filePath);
    if (besideLrc) {
        console.log("[Local] Ditemukan file .lrc di sebelah lagu.");
        return besideLrc;
    }

    // PRIORITAS 2: Embedded Metadata (<LYRICS> foobar2000 / USLT Tag)
    const embedded = await getEmbeddedLyrics(filePath);
    if (embedded) {
        console.log("[Local] Ditemukan Embedded Lyrics di metadata audio.");
        return embedded;
    }

    // PRIORITAS 3: Cari file .lrc di folder induk (Kembali ke musicRootDir atau 3 level ke atas)
    const startFolder = metadata.musicRootDir || path.resolve(path.dirname(filePath), "../../");
    const misplacedLrc = await findMisplacedLrc(startFolder, fileNameWithoutExt, 3);
    if (misplacedLrc) {
        console.log("[Local] Ditemukan file .lrc di folder sekitar!");
        return misplacedLrc;
    }

    return null;
}

module.exports = { getLocalLyrics };