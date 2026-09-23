// src/decryptor/krc.js
const zlib = require("zlib");

// Header KRC (krc18 / krc1)
const KRC18_HEADER = Buffer.from([0x6b, 0x72, 0x63, 0x31, 0x38]); // "krc18"
const KRC1_HEADER  = Buffer.from([0x6b, 0x72, 0x63, 0x31]);       // "krc1"

// XOR Key Kugou
const XOR_KEY = Buffer.from([
    0x40, 0x47, 0x43, 0x46, 0x32, 0x20, 0x20, 0x7d,
    0x67, 0x22, 0x4e, 0x3d, 0x4e, 0x20, 0x20, 0x78
]);

function decryptKRC(encryptedData) {
    if (!encryptedData) return null;

    let buffer;
    if (typeof encryptedData === "string") {
        buffer = Buffer.from(encryptedData, "base64");
    } else if (Buffer.isBuffer(encryptedData)) {
        buffer = encryptedData;
    } else {
        return null;
    }

    if (buffer.length <= 5) return null;

    // 1. Potong Magic Header
    let payload = buffer;
    if (buffer.subarray(0, 5).equals(KRC18_HEADER)) {
        payload = buffer.subarray(5);
    } else if (buffer.subarray(0, 4).equals(KRC1_HEADER)) {
        payload = buffer.subarray(4);
    }

    // 2. Dekripsi XOR
    const decryptedXor = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) {
        decryptedXor[i] = payload[i] ^ XOR_KEY[i % XOR_KEY.length];
    }

    // 3. Decompress Zlib
    try {
        return zlib.inflateSync(decryptedXor).toString("utf8");
    } catch {
        try {
            return zlib.inflateRawSync(decryptedXor).toString("utf8");
        } catch {
            return null;
        }
    }
}

module.exports = {
    decryptKRC,
    krcDecrypt: decryptKRC,
    krcDecode: decryptKRC,
    decrypt: decryptKRC
};