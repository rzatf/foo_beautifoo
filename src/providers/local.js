const fs = require("fs");
const path = require("path");
const musicMetadata = require("music-metadata");

/**
 * 1. Cari file .lrc persis di samping file musik
 */
function getLrcBesideFile(audioPath) {
    const ext = path.extname(audioPath);
    const lrcPath = audioPath.replace(new RegExp(`${ext}$`, "i"), ".lrc");

    if (fs.existsSync(lrcPath)) {
        return fs.readFileSync(lrcPath, "utf-8");
    }
    return null;
}

/**
 * 2. Baca embedded lyrics dari metadata file audio
 */
async function getEmbeddedLyrics(audioPath) {
    try {
        const metadata = await musicMetadata.parseFile(audioPath);
        const lyrics = metadata.common.lyrics;
        if (lyrics && lyrics.length > 0) {
            // Bisa berupa string lirik langsung atau object { text: ... }
            return typeof lyrics[0] === "string" ? lyrics[0] : lyrics[0].text;
        }
    } catch (err) {
        console.warn("[Local] Gagal membaca metadata embedded:", err.message);
    }
    return null;
}

/**
 * 3. Cari file .lrc yang nyasar di folder induk (rekursif)
 */
function findMisplacedLrc(baseFolder, songFileName) {
    if (!baseFolder || !fs.existsSync(baseFolder)) return null;

    const targetName = songFileName.toLowerCase() + ".lrc";
    const items = fs.readdirSync(baseFolder, { withFileTypes: true });

    for (const item of items) {
        const fullPath = path.join(baseFolder, item.name);

        if (item.isDirectory()) {
            const found = findMisplacedLrc(fullPath, songFileName);
            if (found) return found;
        } else if (item.isFile() && item.name.toLowerCase() === targetName) {
            return fs.readFileSync(fullPath, "utf-8");
        }
    }
    return null;
}

/**
 * Main Function Fallback Lokal
 */
async function getLocalLyrics(metadata) {
    const filePath = metadata?.filePath;
    if (!filePath || !fs.existsSync(filePath)) return null;

    const fileNameWithoutExt = path.basename(filePath, path.extname(filePath));

    // Fallback A: File .lrc di sebelah lagu
    const besideLrc = getLrcBesideFile(filePath);
    if (besideLrc) {
        console.log("[Local] Ditemukan file .lrc di sebelah lagu.");
        return besideLrc;
    }

    // Fallback B: Embedded Metadata
    const embedded = await getEmbeddedLyrics(filePath);
    if (embedded) {
        console.log("[Local] Ditemukan Embedded Lyrics di metadata audio.");
        return embedded;
    }

    // Fallback C: Cari .lrc nyasar di folder induk (misal folder 'Music' kamu)
    // Atur `musicRootDir` sesuai lokasi folder utama musikmu
    const musicRootDir = metadata.musicRootDir || path.resolve(filePath, "../../.."); 
    console.log(`[Local] Mencari file ${fileNameWithoutExt}.lrc yang nyasar di: ${musicRootDir}`);
    
    const misplacedLrc = findMisplacedLrc(musicRootDir, fileNameWithoutExt);
    if (misplacedLrc) {
        console.log("[Local] Ditemukan file .lrc yang nyasar di folder lain!");
        return misplacedLrc;
    }

    return null;
}

module.exports = { getLocalLyrics };