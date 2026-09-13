function normalizeText(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFKC")
        .replace(/\([^)]*\)/g, "")
        .replace(/\[[^\]]*\]/g, "")
        .replace(/[【】「」『』]/g, "")
        .replace(/[“”"‘’]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function getArtistNames(song) {
    return (song.ar || [])
        .map(artist => normalizeText(artist.name))
        .filter(Boolean);
}

function getSongDuration(song) {
    const duration =
        song.dt ??
        song.duration ??
        0;

    return Number(duration) || 0;
}

function isTitleMatch(songTitle, targetTitle) {
    if (!songTitle || !targetTitle) {
        return false;
    }

    const song = normalizeText(songTitle);
    const target = normalizeText(targetTitle);

    // EXACT MATCH
    if (song === target) {
        return true;
    }

    // Partial match
    // Contoh:
    // "The Middle (Radio Edit)" -> "The Middle"
    if (
        song.includes(target) ||
        target.includes(song)
    ) {
        return true;
    }

    return false;
}

function calculateScore(song, title, artist, duration) {
    const targetTitle = normalizeText(title);
    const targetArtist = normalizeText(artist);
    const songTitle = normalizeText(song.name);
    const songArtists = getArtistNames(song);

    let score = 0;

    // TITLE
    if (songTitle === targetTitle) {
        score += 100;
    }
    else if (
        songTitle.includes(targetTitle) ||
        targetTitle.includes(songTitle)
    ) {
        score += 50;
    }

    // ARTIST
    if (songArtists.includes(targetArtist)) {
        score += 50;
    }
    else if (
        songArtists.some(a =>
            a.includes(targetArtist) ||
            targetArtist.includes(a)
        )
    ) {
        score += 25;
    }

    // DURATION
    if (
        typeof duration === "number" &&
        duration > 0
    ) {
        const targetMs =
            duration * 1000;

        const songDurationMs =
            getSongDuration(song);

        if (songDurationMs > 0) {
            const diff =
                Math.abs(
                    songDurationMs -
                    targetMs
                );

            if (diff <= 1000) {
                score += 20;
            }
            else if (diff <= 3000) {
                score += 10;
            }
            else if (diff <= 10000) {
                score += 3;
            }
        }
    }

    return score;
}