
// =============================================================
// Beaufoo Node Server
// =============================================================

let beaufooServerStarting = null;


// =============================================================
// Konfigurasi
// =============================================================

// server.js berada 2 folder di atas bridge.js.
//
// Contoh:
//
// Beaufoo/
// ├── server.js
// └── folder/
//     └── bridge/
//         └── bridge.js
//
// Maka:
// bridge.js
//   ↓ ..
// folder/
//   ↓ ..
// Beaufoo/
//   ↓
// server.js

const BEAUFOO_SERVER_RELATIVE_PATH =
    "..\\..\\server.js";

const BEAUFOO_SERVER_RELATIVE_DIR =
    "..\\..";

const BEAUFOO_PORT =
    3000;

const BEAUFOO_URL =
    `http://127.0.0.1:${BEAUFOO_PORT}/`;


// =============================================================
// Node.js Candidate Paths
// =============================================================
//
// Urutan:
// 1. node.exe dari PATH
// 2. lokasi Node.js standar Windows
// 3. lokasi Node.js user
//
// Kita tidak hardcode username user.
// =============================================================

function getNodeCandidates() {

    return [

        // -----------------------------------------------------
        // 1. PATH
        // -----------------------------------------------------

        "node.exe",


        // -----------------------------------------------------
        // 2. Node.js system installation
        // -----------------------------------------------------

        "C:\\Program Files\\nodejs\\node.exe",

        "C:\\Program Files (x86)\\nodejs\\node.exe",


        // -----------------------------------------------------
        // 3. Node.js user installation
        // -----------------------------------------------------

        "%LOCALAPPDATA%\\Programs\\nodejs\\node.exe",

        "%APPDATA%\\npm\\node.exe"

    ];
}


// =============================================================
// Expand Windows Environment Variable
// =============================================================
//
// Contoh:
//
// %LOCALAPPDATA%\Programs\nodejs\node.exe
//
// menjadi:
//
// C:\Users\NamaUser\AppData\Local\Programs\nodejs\node.exe
// =============================================================

function expandEnvironmentVariables(path) {

    return path.replace(
        /%([^%]+)%/g,
        (_, name) => {

            try {

                return (
                    window
                        ?.chrome
                        ?.webview
                        ?.hostObjects
                        ?.sync
                        ?.foo_uie_webview
                        ?.getEnvironmentVariable?.(name)
                    ?? `%${name}%`
                );

            } catch (err) {

                return `%${name}%`;
            }
        }
    );
}


// =============================================================
// Check Beaufoo Server
// =============================================================

async function isBeaufooServerRunning() {

    try {

        const response = await fetch(
            BEAUFOO_URL,
            {
                method: "GET"
            }
        );

        return response.ok;

    } catch (err) {

        return false;
    }
}


// =============================================================
// Wait Until Beaufoo Server Is Ready
// =============================================================

async function waitForBeaufooServer(
    timeout = 6000
) {

    const startTime =
        Date.now();

    while (
        Date.now() - startTime <
        timeout
    ) {

        if (
            await isBeaufooServerRunning()
        ) {

            return true;
        }

        await new Promise(
            resolve =>
                setTimeout(resolve, 200)
        );
    }

    return false;
}


// =============================================================
// Try Start Beaufoo With Node
// =============================================================

async function tryStartBeaufooServer(
    nodePath
) {

    try {

        console.log(
            "[Bridge] Mencoba Node.js:",
            nodePath
        );

        const result =
            await fb2k.invoke(
                "shell.execute",
                {

                    // -------------------------------------------------
                    // Node executable
                    // -------------------------------------------------

                    filePath:
                        expandEnvironmentVariables(
                            nodePath
                        ),


                    // -------------------------------------------------
                    // server.js
                    // -------------------------------------------------
                    //
                    // server.js berada 2 folder di atas bridge.js.
                    //
                    // -------------------------------------------------

                    parameters:
                        `"${BEAUFOO_SERVER_RELATIVE_PATH}"`,


                    // -------------------------------------------------
                    // Working directory
                    // -------------------------------------------------

                    directoryPath:
                        BEAUFOO_SERVER_RELATIVE_DIR,


                    // -------------------------------------------------
                    // Windows shell operation
                    // -------------------------------------------------

                    operation:
                        "open",


                    // -------------------------------------------------
                    // Jangan tampilkan console window
                    // -------------------------------------------------

                    showMode:
                        0
                }
            );

        console.log(
            "[Bridge] shell.execute:",
            result
        );


        // ---------------------------------------------------------
        // Tunggu server
        // ---------------------------------------------------------

        const ready =
            await waitForBeaufooServer(
                6000
            );

        if (ready) {

            console.log(
                "[Bridge] Beaufoo server berhasil dijalankan."
            );

            return true;
        }


        console.warn(
            "[Bridge] Node berhasil dipanggil tetapi server tidak merespons."
        );

        return false;

    } catch (err) {

        console.warn(
            "[Bridge] Gagal menjalankan Node:",
            nodePath,
            err
        );

        return false;
    }
}


// =============================================================
// Ensure Beaufoo Server
// =============================================================

async function ensureBeaufooServer() {

    // ---------------------------------------------------------
    // 1. Kalau server sudah hidup
    // ---------------------------------------------------------

    if (
        await isBeaufooServerRunning()
    ) {

        console.log(
            "[Bridge] Beaufoo server sudah berjalan."
        );

        return true;
    }


    // ---------------------------------------------------------
    // 2. Kalau sedang ada proses start
    // ---------------------------------------------------------

    if (beaufooServerStarting) {

        console.log(
            "[Bridge] Menunggu proses start server..."
        );

        return await beaufooServerStarting;
    }


    // ---------------------------------------------------------
    // 3. Mulai proses start
    // ---------------------------------------------------------

    beaufooServerStarting =
        (async () => {

            try {

                console.log(
                    "[Bridge] Beaufoo server belum berjalan."
                );

                console.log(
                    "[Bridge] Mencari Node.js..."
                );


                const candidates =
                    getNodeCandidates();


                // -------------------------------------------------
                // Coba setiap Node.js
                // -------------------------------------------------

                for (
                    const nodePath
                    of candidates
                ) {

                    console.log(
                        "[Bridge] Mencoba candidate:",
                        nodePath
                    );


                    const success =
                        await tryStartBeaufooServer(
                            nodePath
                        );


                    if (success) {

                        console.log(
                            "[Bridge] Node.js yang berhasil:",
                            nodePath
                        );

                        return true;
                    }
                }


                // -------------------------------------------------
                // Semua gagal
                // -------------------------------------------------

                console.error(
                    "[Bridge] Tidak dapat menjalankan Beaufoo server."
                );

                console.error(
                    "[Bridge] Tidak ditemukan Node.js yang dapat menjalankan server.js."
                );

                return false;

            } catch (err) {

                console.error(
                    "[Bridge] Error saat memulai Beaufoo server:",
                    err
                );

                return false;

            } finally {

                beaufooServerStarting =
                    null;
            }

        })();


    return await beaufooServerStarting;
}


// =============================================================
// Foobar2000 Bridge
// =============================================================

async function initFoobarBridge(
    onTrackChange,
    onTimeUpdate
) {

    console.log(
        "[Bridge] Inisialisasi bridge foobar2000..."
    );


    // ---------------------------------------------------------
    // 1. Pastikan Beaufoo server hidup
    // ---------------------------------------------------------

    const serverReady =
        await ensureBeaufooServer();


    if (!serverReady) {

        console.error(
            "[Bridge] Server tidak siap. Bridge tetap dilanjutkan."
        );
    }


    // ---------------------------------------------------------
    // 2. Ambil host object WebView2
    // ---------------------------------------------------------

    const host =
        window
            .chrome
            ?.webview
            ?.hostObjects
            ?.sync
            ?.foo_uie_webview;


    if (host) {

        console.log(
            "[Bridge] WebView2 host object ditemukan."
        );

        try {

            console.log(
                "[Bridge] host.length:",
                host.length
            );

            console.log(
                "[Bridge] host.position:",
                host.position
            );

            console.log(
                "[Bridge] host.isPlaying:",
                host.isPlaying
            );

            console.log(
                "[Bridge] host.isPaused:",
                host.isPaused
            );

        } catch (err) {

            console.warn(
                "[Bridge] Gagal membaca host:",
                err
            );
        }

    } else {

        console.warn(
            "[Bridge] WebView2 host object tidak ditemukan."
        );
    }


    // ---------------------------------------------------------
    // 3. Pasang event foobar2000
    // ---------------------------------------------------------

    if (window.fb2k) {

        console.log(
            "[Bridge] fb2k facade ditemukan."
        );

        try {

            fb2k.on(
                "playback:trackChanged",
                async () => {

                    console.log(
                        "[Bridge] Track berubah."
                    );

                    try {

                        const metadata =
                            await getTrackMetadata();

                        console.log(
                            "[Bridge] Metadata:",
                            metadata
                        );

                        if (onTrackChange) {

                            await onTrackChange(
                                metadata
                            );
                        }

                    } catch (err) {

                        console.error(
                            "[Bridge] Gagal mengambil metadata:",
                            err
                        );
                    }
                }
            );

            console.log(
                "[Bridge] Facade track event berhasil dipasang."
            );

        } catch (err) {

            console.error(
                "[Bridge] Gagal memasang track event:",
                err
            );
        }

    } else {

        console.warn(
            "[Bridge] fb2k facade tidak ditemukan."
        );
    }


    // ---------------------------------------------------------
    // 4. Request lagu yang sedang diputar
    // ---------------------------------------------------------

    if (
        window.fb2k &&
        onTrackChange
    ) {

        try {

            console.log(
                "[Bridge] Mengambil track yang sedang diputar..."
            );

            const metadata =
                await getTrackMetadata();

            console.log(
                "[Bridge] Current track:",
                metadata
            );


            if (
                metadata.title &&
                metadata.artist
            ) {

                console.log(
                    "[Bridge] Meminta lyrics untuk current track..."
                );

                await onTrackChange(
                    metadata
                );

            } else {

                console.log(
                    "[Bridge] Tidak ada track yang sedang diputar."
                );
            }

        } catch (err) {

            console.error(
                "[Bridge] Gagal mengambil current track:",
                err
            );
        }
    }


    // ---------------------------------------------------------
    // 5. Initial playback position
    // ---------------------------------------------------------

    if (host) {

        try {

            const position =
                Number(host.position) || 0;

            console.log(
                "[Bridge] Initial position:",
                position
            );

            if (onTimeUpdate) {

                onTimeUpdate(
                    position
                );
            }

        } catch (err) {

            console.warn(
                "[Bridge] Gagal membaca initial position:",
                err
            );
        }
    }


    // ---------------------------------------------------------
    // 6. Playback position polling
    // ---------------------------------------------------------

    if (
        host &&
        onTimeUpdate
    ) {

        let lastPosition = -1;

        setInterval(() => {

            try {

                const position =
                    Number(host.position) || 0;

                if (
                    position !==
                    lastPosition
                ) {

                    lastPosition =
                        position;

                    onTimeUpdate(
                        position
                    );
                }

            } catch (err) {

                console.warn(
                    "[Bridge] Gagal membaca position:",
                    err
                );
            }

        }, 50);


        console.log(
            "[Bridge] Playback position polling aktif."
        );
    }


    console.log(
        "[Bridge] Inisialisasi selesai."
    );
}


// =============================================================
// Get Track Metadata
// =============================================================

async function getTrackMetadata() {

    const title =
        await fb2k.invoke(
            "playback.getFormattedText",
            {
                text: "%title%"
            }
        );


    const artist =
        await fb2k.invoke(
            "playback.getFormattedText",
            {
                text: "%artist%"
            }
        );


    const album =
        await fb2k.invoke(
            "playback.getFormattedText",
            {
                text: "%album%"
            }
        );


    let duration = 0;


    // ---------------------------------------------------------
    // Ambil duration dari host.length
    // ---------------------------------------------------------

    try {

        const host =
            window
                .chrome
                ?.webview
                ?.hostObjects
                ?.sync
                ?.foo_uie_webview;


        if (host) {

            duration =
                Number(host.length) || 0;
        }

    } catch (err) {

        console.warn(
            "[Bridge] host.length gagal:",
            err
        );
    }


    // ---------------------------------------------------------
    // Fallback duration dari foobar
    // ---------------------------------------------------------

    if (!duration) {

        try {

            const durationText =
                await fb2k.invoke(
                    "playback.getFormattedText",
                    {
                        text:
                            "%length_seconds_fp%"
                    }
                );


            duration =
                Number(durationText) || 0;

        } catch (err) {

            console.warn(
                "[Bridge] %length_seconds_fp% gagal:",
                err
            );
        }
    }


    return {

        title:
            String(title || "").trim(),

        artist:
            String(artist || "").trim(),

        album:
            String(album || "").trim(),

        duration
    };
}


// =============================================================
// Module Export
// =============================================================

if (
    typeof module !== "undefined" &&
    module.exports
) {

    module.exports = {
        initFoobarBridge
    };
}

