// =============================================================
// Beaufoo Node Server
// =============================================================

let beaufooServerStarting = null;

async function ensureBeaufooServer() {

    // ---------------------------------------------------------
    // 1. Cek apakah server sudah berjalan
    // ---------------------------------------------------------
    try {

        const response = await fetch(
            "http://127.0.0.1:3000/",
            {
                method: "GET"
            }
        );

        if (response.ok) {

            console.log(
                "[Bridge] Beaufoo server sudah berjalan."
            );

            return true;
        }

    } catch (err) {

        console.log(
            "[Bridge] Beaufoo server belum berjalan."
        );
    }


    // ---------------------------------------------------------
    // 2. Kalau sedang proses start, jangan start lagi
    // ---------------------------------------------------------
    if (beaufooServerStarting) {

        console.log(
            "[Bridge] Menunggu proses start server..."
        );

        return await beaufooServerStarting;
    }


    // ---------------------------------------------------------
    // 3. Jalankan Node.js
    // ---------------------------------------------------------
    beaufooServerStarting = (async () => {

        try {

            console.log(
                "[Bridge] Menjalankan Beaufoo server..."
            );

            const result = await fb2k.invoke(
                "shell.execute",
                {
                    filePath:
                        "D:\\Application\\NodeJs\\node.exe",

                    parameters:
                        "C:\\xampp\\htdocs\\beaufoo\\server.js",

                    directoryPath:
                        "C:\\xampp\\htdocs\\beaufoo",

                    operation:
                        "open",

                    showMode:
                        0
                }
            );

            console.log(
                "[Bridge] shell.execute selesai:",
                result
            );


            // -------------------------------------------------
            // 4. Tunggu server sampai benar-benar hidup
            // -------------------------------------------------
            console.log(
                "[Bridge] Menunggu Beaufoo server..."
            );

            for (let i = 0; i < 30; i++) {

                try {

                    const response = await fetch(
                        "http://127.0.0.1:3000/",
                        {
                            method: "GET"
                        }
                    );

                    if (response.ok) {

                        console.log(
                            "[Bridge] Beaufoo server berhasil dijalankan."
                        );

                        return true;
                    }

                } catch (err) {
                    // Server belum siap
                }

                await new Promise(resolve =>
                    setTimeout(resolve, 200)
                );
            }


            // -------------------------------------------------
            // 5. Server gagal start
            // -------------------------------------------------
            console.error(
                "[Bridge] Beaufoo server tidak merespons."
            );

            return false;

        } catch (err) {

            console.error(
                "[Bridge] Gagal menjalankan Beaufoo server:",
                err
            );

            return false;

        } finally {

            beaufooServerStarting = null;
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
        "[Bridge] Inisialisasi bridge foobar2000... HALOOOO TEEESSS"
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
        window.chrome?.webview?.hostObjects?.sync
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
    //
    // Penting:
    // Saat WebView refresh, trackChanged belum tentu terpanggil.
    // Jadi kita ambil metadata lagu sekarang secara langsung.
    // ---------------------------------------------------------
    if (window.fb2k && onTrackChange) {

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
    if (host && onTimeUpdate) {

        let lastPosition = -1;

        setInterval(() => {

            try {

                const position =
                    Number(host.position) || 0;

                if (position !== lastPosition) {

                    lastPosition = position;

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
            window.chrome?.webview?.hostObjects?.sync
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
                        text: "%length_seconds_fp%"
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