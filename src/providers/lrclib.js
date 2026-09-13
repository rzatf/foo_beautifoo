const API_URL = "https://lrclib.net/api/get";

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
            `LRCLIB API error: ${response.status} ${response.statusText}`
        );
    }

    return await response.json();
}

module.exports = {
    getLyrics,
};