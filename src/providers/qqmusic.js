// src/providers/qqmusic.js
const axios = require('axios');

async function getLyrics({ title, artist }) {
    try {
        const query = `${artist} ${title}`;
        const searchUrl = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=1&w=${encodeURIComponent(query)}&format=json`;
        
        const searchRes = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        const songList = searchRes.data?.data?.song?.list;
        if (!songList || songList.length === 0) return null;

        const songmid = songList[0].songmid;

        // Fetch lyric
        const lyricUrl = `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${songmid}&format=json`;
        const lyricRes = await axios.get(lyricUrl, {
            headers: { 
                'Referer': 'https://y.qq.com/',
                'User-Agent': 'Mozilla/5.0' 
            }
        });

        let rawLyric = lyricRes.data?.lyric;
        if (!rawLyric) return null;

        // QQ Music mengirim Base64, kita decode ke String UTF-8
        try {
            rawLyric = Buffer.from(rawLyric, 'base64').toString('utf-8');
        } catch (e) {
            // kalau bukan base64, biarkan tetap string
        }

        return {
            rawLyric: rawLyric,
            source: 'qqmusic'
        };
    } catch (err) {
        console.error("QQ Music Provider Error:", err.message);
        return null;
    }
}

module.exports = { getLyrics };