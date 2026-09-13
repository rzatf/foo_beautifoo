// src/providers/kugou.js
const axios = require('axios');

async function getLyrics({ title, artist }) {
    try {
        const keyword = `${artist} ${title}`;
        
        // 1. Search ID Song & Hash di Kugou
        const searchUrl = `http://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${encodeURIComponent(keyword)}&page=1&pagesize=1`;
        const searchRes = await axios.get(searchUrl);
        const song = searchRes.data?.data?.info?.[0];

        if (!song) return null;

        const hash = song.hash;

        // 2. Search Access Key Lirik Karaoke
        const accessUrl = `http://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=${encodeURIComponent(keyword)}&duration=${song.duration * 1000}&hash=${hash}`;
        const accessRes = await axios.get(accessUrl);
        const candidate = accessRes.data?.candidates?.[0];

        if (!candidate) return null;

        // 3. Fetch Lirik Karaoke Format KRC/LRC
        const fmtUrl = `http://krcs.kugou.com/download?ver=1&client=pc&id=${candidate.id}&accesskey=${candidate.accesskey}&fmt=lrc&charset=utf8`;
        const lyricRes = await axios.get(fmtUrl);

        if (lyricRes.data && lyricRes.data.content) {
            // Content di-encode Base64
            const decoded = Buffer.from(lyricRes.data.content, 'base64').toString('utf-8');
            return {
                rawLyric: decoded,
                source: 'kugou'
            };
        }

        return null;
    } catch (err) {
        console.error("Kugou Provider Error:", err.message);
        return null;
    }
}

module.exports = { getLyrics };