const fs = require("fs");
const path = require("path");
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

// Provider dan Parser Lokal
const { getLocalLyrics } = require("./providers/localLyrics");
const { parseLocalLrc } = require("./parsers/localParser");

/* =========================================================

* DISK CACHE SYSTEM (FILE-BASED)
* ========================================================= */

const CACHE_DIR = path.join(__dirname, "../data/cache");
const MAX_DISK_CACHE_FILES = 2000;

// Pastikan direktori cache ada
if (!fs.existsSync(CACHE_DIR)) {
fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**

* Membuat nama file cache berdasarkan Artist + Title.
*
* Contoh:
*
* Artist  : Secondhand Serenade
* Title   : Your Call
*
* Hasil:
* secondhand_serenade___your_call.json
  */
  function getCacheFileName(artist, title) {
    const safeArtist = normalizeText(artist)
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

    const safeTitle = normalizeText(title)
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

    return `${safeArtist}___${safeTitle}.json`;
}

/**

* Membaca cache dari disk.
  */
  function getFromDiskCache(cacheFileName) {
  try {
  const filePath = path.join(CACHE_DIR, cacheFileName);

  
   if (!fs.existsSync(filePath)) {
       return null;
   }

   const data = fs.readFileSync(filePath, "utf8");

   if (!data.trim()) {
       console.warn(`[DiskCache] Cache kosong: ${cacheFileName}`);
       return null;
   }

   const parsed = JSON.parse(data);

   if (!parsed || typeof parsed !== "object") {
       console.warn(`[DiskCache] Format cache tidak valid: ${cacheFileName}`);
       return null;
   }

   if (!Array.isArray(parsed.lines) || parsed.lines.length === 0) {
       console.warn(`[DiskCache] Cache tidak memiliki lines: ${cacheFileName}`);
       return null;
   }

   return parsed;
 

  } catch (e) {
  console.warn(
  `[DiskCache] Gagal membaca cache ${cacheFileName}:`,
  e.message
  );

  
   return null;
  

  }
  }

/**

* Menyimpan hasil lyrics ke disk.
  */
  function saveToDiskCache(cacheFileName, data) {
  try {
  if (!data || !Array.isArray(data.lines) || data.lines.length === 0) {
  console.warn(
  `[DiskCache] Tidak menyimpan cache karena data lyrics tidak valid.`
  );
  return;
  }

  
   const filePath = path.join(CACHE_DIR, cacheFileName);

   fs.writeFileSync(
       filePath,
       JSON.stringify(data, null, 2),
       "utf8"
   );

   console.log(
       `[DiskCache] Cache tersimpan: ${cacheFileName}`
   );

   cleanOldDiskCache();
  

  } catch (e) {
  console.warn(
  `[DiskCache] Gagal menyimpan cache:`,
  e.message
  );
  }
  }

/**

* Hapus cache tertua jika jumlah file melebihi limit.
  */
  function cleanOldDiskCache() {
  try {
  const files = fs
  .readdirSync(CACHE_DIR)
  .filter(file => file.toLowerCase().endsWith(".json"));

  
   if (files.length <= MAX_DISK_CACHE_FILES) {
       return;
   }

   const fileStats = files.map(file => {
       const filePath = path.join(CACHE_DIR, file);

       return {
           file,
           time: fs.statSync(filePath).mtimeMs
       };
   });

   // Yang paling lama berada di awal
   fileStats.sort((a, b) => a.time - b.time);

   const deleteCount =
       files.length - MAX_DISK_CACHE_FILES;

   const toDelete = fileStats.slice(0, deleteCount);

   for (const item of toDelete) {
       try {
           fs.unlinkSync(
               path.join(CACHE_DIR, item.file)
           );

           console.log(
               `[DiskCache] Cache lama dihapus: ${item.file}`
           );

       } catch (e) {
           console.warn(
               `[DiskCache] Gagal menghapus cache ${item.file}:`,
               e.message
           );
       }
   }
  

  } catch (e) {
  console.warn(
  "[DiskCache] Gagal membersihkan cache lama:",
  e.message
  );
  }
  }

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

/**

* Validasi metadata hasil provider dengan metadata lagu
* yang sedang diputar.
  */
  function isMetadataMatch(itemMetadata, targetMetadata) {

  // Jika provider tidak memberikan metadata,
  // jangan langsung menolak.
  if (!itemMetadata) {
  return true;
  }

  const targetTitle =
  normalizeText(targetMetadata?.title);

  const targetArtist =
  normalizeText(targetMetadata?.artist);

  const itemTitle =
  normalizeText(itemMetadata?.title);

  const itemArtist =
  Array.isArray(itemMetadata?.artist)
  ? itemMetadata.artist
  .map(normalizeText)
  .join(" ")
  : normalizeText(itemMetadata?.artist);

  // Jika metadata target tidak lengkap,
  // biarkan provider lolos.
  if (!targetTitle || !targetArtist) {
  return true;
  }

  const titleSim =
  stringSimilarity.compareTwoStrings(
  itemTitle,
  targetTitle
  );

  const isTitleValid =
  titleSim >= 0.5 ||
  itemTitle.includes(targetTitle) ||
  targetTitle.includes(itemTitle);

  const artistSim =
  stringSimilarity.compareTwoStrings(
  itemArtist,
  targetArtist
  );

  const isArtistValid =
  artistSim >= 0.4 ||
  itemArtist.includes(targetArtist) ||
  targetArtist.includes(itemArtist);

  return isTitleValid && isArtistValid;
  }

/**

* Menolak hasil provider yang jelas-jelas bukan lirik.
  */
  function isInstrumentalOrGarbage(lyricsObj) {

  if (
  !lyricsObj ||
  !Array.isArray(lyricsObj.lines)
  ) {
  return true;
  }

  const lines = lyricsObj.lines;

  // Dua baris atau kurang dianggap tidak valid.
  if (lines.length <= 2) {
  return true;
  }

  const fullText = lines
  .map(line => line.text || "")
  .join(" ")
  .toLowerCase();

  const keywords = [
  "纯音乐",
  "请欣赏",
  "no lyrics",
  "instrumental",
  "tidak ada lirik"
  ];

  if (
  lines.length <= 4 &&
  keywords.some(keyword =>
  fullText.includes(keyword)
  )
  ) {
  return true;
  }

  return false;
  }

/* =========================================================

* FUNGSI UTAMA ENGINE
* ========================================================= */

async function getLyrics(
metadata,
onLocalFound = null,
forceReload = false
) {


/* -----------------------------------------------------
 * 0. VALIDASI METADATA
 * ----------------------------------------------------- */

const artist = metadata?.artist || "";
const title = metadata?.title || "";

if (!artist || !title) {
    console.warn(
        "[Engine] Metadata artist/title tidak lengkap."
    );
}


/* -----------------------------------------------------
 * 1. BUAT CACHE FILE KHUSUS LAGU INI
 * ----------------------------------------------------- */

const cacheFileName =
    getCacheFileName(artist, title);

const cacheFilePath =
    path.join(CACHE_DIR, cacheFileName);


console.log(
    `[Engine] Lagu: ${artist} - ${title}`
);

console.log(
    `[Engine] Cache: ${cacheFileName}`
);


/* -----------------------------------------------------
 * 2. FORCE RELOAD / BACA DISK CACHE
 * ----------------------------------------------------- */

if (forceReload) {

    console.log(
        "[Engine] Force Reload dipicu."
    );

    if (fs.existsSync(cacheFilePath)) {

        try {

            fs.unlinkSync(cacheFilePath);

            console.log(
                `[DiskCache] Cache dihapus: ${cacheFileName}`
            );

        } catch (err) {

            console.warn(
                `[DiskCache] Gagal menghapus cache ${cacheFileName}:`,
                err.message
            );
        }

    } else {

        console.log(
            `[DiskCache] Cache belum ada: ${cacheFileName}`
        );
    }

} else {

    const cachedData =
        getFromDiskCache(cacheFileName);

    if (cachedData) {

        console.log(
            `[Engine] ✓ Lirik ditemukan di Disk Cache: ${cacheFileName}`
        );

        return cachedData;
    }

    console.log(
        `[Engine] Cache tidak ditemukan: ${cacheFileName}`
    );
}


/* -----------------------------------------------------
 * 3. AMBIL EMBEDDED / LOKAL
 * ----------------------------------------------------- */

let localLyrics = null;

try {

    const rawLocal =
        await getLocalLyrics(metadata);

    if (rawLocal) {

        const parsedLocal =
            parseLocalLrc(rawLocal);

        if (
            parsedLocal &&
            (
                parsedLocal.lines?.length > 0 ||
                parsedLocal.karaoke
            )
        ) {

            localLyrics =
                parsedLocal.karaoke ||
                parsedLocal;

            localLyrics.source =
                "Local / Embedded";

            if (
                typeof onLocalFound === "function"
            ) {
                onLocalFound(localLyrics);
            }

            console.log(
                "[Engine] ✓ Lirik Embedded/Lokal ditemukan."
            );
        }
    }

} catch (e) {

    console.warn(
        "[Engine] Gagal mengambil lirik lokal:",
        e.message
    );
}


/* -----------------------------------------------------
 * 4. PROVIDER ONLINE
 * ----------------------------------------------------- */

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
    "[Engine] Memulai pencarian provider online (HARD LIMIT 4s)..."
);


/* -----------------------------------------------------
 * 5. ABORT CONTROLLER
 * ----------------------------------------------------- */

const controller =
    new AbortController();

const timeout =
    setTimeout(() => {

        console.log(
            "[Engine] Batas 4 detik tercapai, abort provider."
        );

        controller.abort();

    }, 4000);


/* -----------------------------------------------------
 * 6. FETCH SEMUA PROVIDER SECARA PARALEL
 * ----------------------------------------------------- */

const results =
    await Promise.all(

        providers.map(async provider => {

            try {

                const raw =
                    await provider.fetch(
                        metadata,
                        {
                            signal:
                                controller.signal
                        }
                    );

                if (!raw) {
                    return null;
                }


                const parsed =
                    provider.parse(raw);

                if (!parsed) {
                    return null;
                }


                const songMeta =
                    parsed.song ||
                    parsed.karaoke?.song ||
                    parsed.line?.song;


                if (
                    !isMetadataMatch(
                        songMeta,
                        metadata
                    )
                ) {

                    console.warn(
                        `[Engine] ${provider.name}: metadata tidak cocok.`
                    );

                    return null;
                }


                return {
                    provider: provider.name,
                    parsed
                };

            } catch (e) {

                // AbortError dan error provider
                // sengaja tidak menghentikan provider lain.
                return null;
            }

        })

    );


clearTimeout(timeout);


/* -----------------------------------------------------
 * 7. PISAHKAN KANDIDAT KARAOKE & LINE
 * ----------------------------------------------------- */

const karaokeCandidates = [];
const lineCandidates = [];


for (const result of results) {

    if (!result) {
        continue;
    }

    const {
        provider,
        parsed
    } = result;


    const lyricsData =
        parsed.karaoke ||
        parsed.line ||
        parsed;


    if (
        isInstrumentalOrGarbage(
            lyricsData
        )
    ) {

        console.warn(
            `[Engine] Ditolak: ${provider} mengembalikan lirik instrumental / tidak valid.`
        );

        continue;
    }


    if (
        parsed.karaoke ||
        parsed.type === "karaoke"
    ) {

        karaokeCandidates.push({
            provider,
            lyrics:
                parsed.karaoke ||
                parsed
        });

    } else if (
        parsed.line ||
        parsed.type === "line"
    ) {

        lineCandidates.push({
            provider,
            lyrics:
                parsed.line ||
                parsed
        });
    }
}


/* -----------------------------------------------------
 * 8. PRIORITAS HASIL
 *
 * Karaoke > Line > Local
 * ----------------------------------------------------- */

const selected =
    karaokeCandidates[0] ||
    lineCandidates[0] ||
    null;


let finalLyrics = null;


if (selected) {

    console.log(
        `[Engine] ✓ Lirik online terpilih dari ${selected.provider}`
    );

    finalLyrics =
        selected.lyrics;

    finalLyrics.source =
        selected.provider;

} else if (localLyrics) {

    console.log(
        "[Engine] Online tidak ada hasil. Memakai lirik Embedded/Lokal."
    );

    finalLyrics =
        localLyrics;
}


/* -----------------------------------------------------
 * 9. TIDAK ADA LIRIK
 * ----------------------------------------------------- */

if (!finalLyrics) {

    console.log(
        "[Engine] Tidak ada lirik ditemukan (Lokal & Online kosong)."
    );

    return null;
}


/* -----------------------------------------------------
 * 10. CONVERT ROMAJI
 * ----------------------------------------------------- */

try {

    await attachRomajiToLyrics(
        finalLyrics
    );

} catch (e) {

    console.warn(
        "[Engine] Gagal attach Romaji:",
        e.message
    );
}


/* -----------------------------------------------------
 * 11. SIMPAN KE DISK CACHE
 * ----------------------------------------------------- */

saveToDiskCache(
    cacheFileName,
    finalLyrics
);


/* -----------------------------------------------------
 * 12. RETURN
 * ----------------------------------------------------- */

return finalLyrics;


}

/* =========================================================

* EXPORT
* ========================================================= */

module.exports = {
getLyrics
};
