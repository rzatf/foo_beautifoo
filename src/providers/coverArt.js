const fs = require("fs");
const path = require("path");

/**
 * Nama file cover yang umum dipakai player / album folder.
 */
const EXTERNAL_COVER_NAMES = [
    "cover",
    "folder",
    "front",
    "album",
    "albumart",
    "artwork",
    "thumb"
];

const EXTERNAL_COVER_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"];

function mimeFromExtension(ext) {
    switch (String(ext).toLowerCase()) {
        case ".png":
            return "image/png";
        case ".webp":
            return "image/webp";
        case ".bmp":
            return "image/bmp";
        case ".gif":
            return "image/gif";
        case ".jpg":
        case ".jpeg":
        default:
            return "image/jpeg";
    }
}

/**
 * Cari file cover eksternal di folder yang sama dengan file audio.
 */
async function findExternalCover(audioPath) {
    const directory = path.dirname(audioPath);

    for (const name of EXTERNAL_COVER_NAMES) {
        for (const ext of EXTERNAL_COVER_EXTS) {
            const candidate = path.join(directory, name + ext);

            try {
                await fs.promises.access(candidate);
                return candidate;
            } catch {
                // lanjut cari kandidat berikutnya
            }
        }
    }

    return null;
}

/**
 * Ekstrak picture embedded dari metadata audio memakai music-metadata.
 */
async function findEmbeddedCover(audioPath) {
    let musicMetadata;

    try {
        musicMetadata = require("music-metadata");
    } catch {
        musicMetadata = await import("music-metadata");
    }

    const metadata = await musicMetadata.parseFile(audioPath);
    const pictures = metadata?.common?.picture;

    if (pictures && pictures.length > 0) {
        return pictures[0];
    }

    return null;
}

/**
 * Ambil cover art dari file audio.
 * Return: { dataUrl, mime, source } atau null.
 */
async function getCoverArt(filePath) {
    if (!filePath) return null;

    // PRIORITAS 1: Embedded cover (id3/apic/cover.flac)
    try {
        const embedded = await findEmbeddedCover(filePath);

        if (embedded && embedded.data) {
            const mime = embedded.format || "image/jpeg";
            const base64 = Buffer.from(embedded.data).toString("base64");
            return {
                dataUrl: `data:${mime};base64,${base64}`,
                mime,
                source: "embedded"
            };
        }
    } catch (err) {
        console.warn("[Cover] Gagal membaca embedded cover:", err.message);
    }

    // PRIORITAS 2: File cover eksternal di folder
    try {
        const external = await findExternalCover(filePath);

        if (external) {
            const buffer = await fs.promises.readFile(external);
            const mime = mimeFromExtension(path.extname(external));
            const base64 = buffer.toString("base64");

            return {
                dataUrl: `data:${mime};base64,${base64}`,
                mime,
                source: "external"
            };
        }
    } catch (err) {
        console.warn("[Cover] Gagal membaca cover eksternal:", err.message);
    }

    return null;
}

module.exports = { getCoverArt };
