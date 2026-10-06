const http = require("http");

const { getLyrics } =
    require("./src/lyricsEngine");

const { getCoverArt } =
    require("./src/providers/coverArt");

const PORT = 3000;

// Cache sederhana cover art berdasar path file (maks ~300 entri)
const coverCache = new Map();


const server =
    http.createServer(
        async (req, res) => {

            // =================================================
            // CORS
            // =================================================

            res.setHeader(
                "Access-Control-Allow-Origin",
                "*"
            );

            res.setHeader(
                "Access-Control-Allow-Methods",
                "POST, OPTIONS"
            );

            res.setHeader(
                "Access-Control-Allow-Headers",
                "Content-Type"
            );


            // =================================================
            // OPTIONS
            // =================================================

            if (
                req.method ===
                "OPTIONS"
            ) {

                res.writeHead(
                    204
                );

                res.end();

                return;
            }


            // =================================================
            // HEALTH CHECK
            // =================================================

            if (
                req.method === "GET" &&
                req.url === "/"
            ) {

                res.writeHead(
                    200,
                    {
                        "Content-Type":
                            "application/json"
                    }
                );

                res.end(
                    JSON.stringify({
                        status: "ok",
                        service:
                            "Beaufoo Lyrics API"
                    })
                );

                return;
            }


            // =================================================
            // GET COVER ART (untuk background dinamis)
            // =================================================

            if (
                req.method === "POST" &&
                req.url === "/api/get-cover"
            ) {

                let coverBody = "";

                req.on(
                    "data",
                    chunk => {
                        coverBody += chunk.toString();
                    }
                );

                req.on(
                    "end",
                    async () => {

                        try {

                            const payload =
                                JSON.parse(coverBody);

                            const filePath =
                                payload && payload.filePath;

                            if (!filePath) {

                                res.writeHead(
                                    400,
                                    {
                                        "Content-Type":
                                            "application/json"
                                    }
                                );

                                res.end(
                                    JSON.stringify({
                                        success: false,
                                        error:
                                            "filePath diperlukan."
                                    })
                                );

                                return;
                            }

                            // Cache sederhana berdasar path file
                            if (coverCache.has(filePath)) {

                                res.writeHead(
                                    200,
                                    {
                                        "Content-Type":
                                            "application/json"
                                    }
                                );

                                res.end(
                                    JSON.stringify(
                                        coverCache.get(filePath)
                                    )
                                );

                                return;
                            }

                            const cover =
                                await getCoverArt(filePath);

                            const result = cover
                                ? {
                                    success: true,
                                    dataUrl: cover.dataUrl,
                                    source: cover.source
                                }
                                : {
                                    success: false,
                                    error:
                                        "Cover art tidak ditemukan."
                                };

                            // Simpan ke cache (termasuk hasil kosong
                            // supaya tidak spam baca file)
                            if (coverCache.size > 300) {
                                coverCache.clear();
                            }
                            coverCache.set(filePath, result);

                            res.writeHead(
                                200,
                                {
                                    "Content-Type":
                                        "application/json"
                                }
                            );

                            res.end(
                                JSON.stringify(result)
                            );

                        }
                        catch (err) {

                            console.error(
                                "[API] Error cover:",
                                err
                            );

                            res.writeHead(
                                500,
                                {
                                    "Content-Type":
                                        "application/json"
                                }
                            );

                            res.end(
                                JSON.stringify({
                                    success: false,
                                    error: err.message
                                })
                            );
                        }
                    }
                );

                return;
            }


            // =================================================
            // GET LYRICS
            // =================================================

            if (
                req.method === "POST" &&
                req.url === "/api/get-lyrics"
            ) {

                let body = "";


                req.on(
                    "data",
                    chunk => {
                        body +=
                            chunk.toString();
                    }
                );


                req.on(
                    "end",
                    async () => {

                        try {

                            const metadata =
                                JSON.parse(body);


                            console.log(
                                "\n================================"
                            );

                            console.log(
                                "[API] Request lyrics"
                            );

                            console.log(
                                "[API] Artist :",
                                metadata.artist
                            );

                            console.log(
                                "[API] Title  :",
                                metadata.title
                            );

                            console.log(
                                "[API] Album  :",
                                metadata.album
                            );

                            console.log(
                                "[API] Duration:",
                                metadata.duration
                            );

                            console.log(
                                "================================"
                            );


                            // =================================
                            // VALIDASI
                            // =================================

                            if (
                                !metadata.title ||
                                !metadata.artist
                            ) {

                                res.writeHead(
                                    400,
                                    {
                                        "Content-Type":
                                            "application/json"
                                    }
                                );

                                res.end(
                                    JSON.stringify({
                                        success: false,
                                        error:
                                            "Title dan artist diperlukan."
                                    })
                                );

                                return;
                            }


                            // =================================
                            // LYRICS ENGINE
                            // =================================

                            console.log(
                                "[API] Memanggil lyricsEngine..."
                            );


                            // Force reload: hapus cache lagu yang
                            // sedang diputar lalu cari ulang online.
                            const forceReload =
                                Boolean(
                                    metadata.forceReload
                                );

                            if (forceReload) {

                                console.log(
                                    "[API] Force Reload: cache lagu akan dihapus."
                                );
                            }

                            const lyrics =
                                await getLyrics(
                                    {
                                        title:
                                            metadata.title,

                                        artist:
                                            metadata.artist,

                                        album:
                                            metadata.album ||
                                            "",

                                        duration:
                                            Number(
                                                metadata.duration
                                            ) || 0
                                    },
                                    null,
                                    forceReload
                                );


                            // =================================
                            // TIDAK DITEMUKAN
                            // =================================

                            if (!lyrics) {

                                console.log(
                                    "[API] Lyrics tidak ditemukan."
                                );

                                res.writeHead(
                                    404,
                                    {
                                        "Content-Type":
                                            "application/json"
                                    }
                                );

                                res.end(
                                    JSON.stringify({
                                        success: false,
                                        error:
                                            "Lyrics tidak ditemukan."
                                    })
                                );

                                return;
                            }


                            // =================================
                            // BERHASIL
                            // =================================

                            console.log(
                                "[API] Lyrics ditemukan!"
                            );

                            console.log(
                                "[API] Type  :",
                                lyrics.type
                            );

                            console.log(
                                "[API] Source:",
                                lyrics.source
                            );

                            console.log(
                                "[API] Lines :",
                                lyrics.lines?.length || 0
                            );


                            res.writeHead(
                                200,
                                {
                                    "Content-Type":
                                        "application/json"
                                }
                            );


                            // LANGSUNG KIRIM LYRICS
                            res.end(
                                JSON.stringify(
                                    lyrics
                                )
                            );

                        }
                        catch (err) {

                            console.error(
                                "[API] Error:",
                                err
                            );


                            res.writeHead(
                                500,
                                {
                                    "Content-Type":
                                        "application/json"
                                }
                            );


                            res.end(
                                JSON.stringify({
                                    success: false,
                                    error:
                                        err.message
                                })
                            );
                        }
                    }
                );

                return;
            }


            // =================================================
            // 404
            // =================================================

            res.writeHead(
                404,
                {
                    "Content-Type":
                        "application/json"
                }
            );

            res.end(
                JSON.stringify({
                    success: false,
                    error:
                        "Endpoint tidak ditemukan."
                })
            );
        }
    );


// ============================================================
// START SERVER
// ============================================================

server.listen(
    PORT,
    "127.0.0.1",
    () => {

        console.log("");

        console.log(
            "========================================"
        );

        console.log(
            " Beaufoo Lyrics API"
        );

        console.log(
            "========================================"
        );

        console.log(
            ` Server : http://localhost:${PORT}`
        );

        console.log(
            ` API    : http://localhost:${PORT}/api/get-lyrics`
        );

        console.log(
            "========================================"
        );

        console.log("");
    }
);

