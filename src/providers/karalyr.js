const API_URL = "https://www.karalyr.com/api/get";

async function getLyrics({ artist, title, album, duration }) {
    const params = new URLSearchParams({
        artist_name: artist,
        track_name: title,
    });

    if (album) {
        params.set("album_name", album);
    }

    if (duration != null) {
        params.set("duration", Math.round(duration));
    }

    const url = `${API_URL}?${params.toString()}`;

    const response = await fetch(url);

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error(
            `Karalyr API error: ${response.status} ${response.statusText}`
        );
    }

    const data = await response.json();

    // =========================================================
    // VERIFIKASI TITLE & ARTIST DARI RESPONS.
    //
    // Karalyr kadang mengembalikan lirik lagu lain. Ambil
    // metadata dari payload bila tersedia, lalu verifikasi.
    // =========================================================

    const payload = data?.karalyr?.payload;

    const responseTitle =
        payload?.track?.title ||
        payload?.track?.name ||
        payload?.song?.title ||
        payload?.metadata?.title ||
        data?.track?.title ||
        data?.trackName ||
        null;

    const responseArtist =
        payload?.track?.artist ||
        payload?.track?.artists ||
        payload?.song?.artist ||
        payload?.metadata?.artist ||
        data?.track?.artist ||
        data?.artistName ||
        null;

    const responseDuration =
        Number(
            payload?.track?.duration ||
            data?.duration ||
            duration
        ) || 0;

    if (responseTitle || responseArtist) {
        const { verifyMetadata } = require("../utils/matcher");

        const check = verifyMetadata(
            {
                title: responseTitle || title,
                artist: responseArtist || artist,
                duration: responseDuration
            },
            {
                title,
                artist,
                duration
            }
        );

        if (!check.ok) {
            console.warn(
                `[Karalyr] Ditolak: respons tidak cocok ` +
                `(${check.reason}) -> ` +
                `${responseArtist || "?"} - ${responseTitle || "?"}`
            );

            return null;
        }
    }

    // Sertakan metadata untuk verifikasi ulang di lyricsEngine.
    return {
        ...data,
        song: {
            title: responseTitle || title || "",
            artist: responseArtist
                ? (Array.isArray(responseArtist)
                    ? responseArtist
                    : [responseArtist])
                : (artist ? [artist] : []),
            album,
            duration: responseDuration
        }
    };
}

module.exports = {
    getLyrics,
};