const crypto = require("crypto");


// ============================================================
// CONSTANTS
// ============================================================

const EAPI_KEY = Buffer.from("e82ckenh8dichen8", "utf8");
const CACHE_KEY = Buffer.from(")(13daqP@ssw0rd~", "utf8");

const DEVICEID_XOR_KEY = "3go8&$8*3*3h0k(2)2";

const SEPARATOR = "-36cd479b6b5-";


// ============================================================
// PKCS#7
// ============================================================

function pkcs7Pad(data, blockSize = 16) {
    const padLen = blockSize - (data.length % blockSize);

    const padding = Buffer.alloc(padLen, padLen);

    return Buffer.concat([
        data,
        padding
    ]);
}


function pkcs7Unpad(data) {
    if (!Buffer.isBuffer(data) || data.length === 0) {
        throw new Error("Invalid PKCS#7 data");
    }

    const padLen = data[data.length - 1];

    if (padLen < 1 || padLen > 16) {
        throw new Error("Invalid padding encountered.");
    }

    // Optional but safer validation.
    for (let i = data.length - padLen; i < data.length; i++) {
        if (data[i] !== padLen) {
            throw new Error("Invalid padding encountered.");
        }
    }

    return data.subarray(0, data.length - padLen);
}


// ============================================================
// AES-ECB
// LDDC:
// AESModeOfOperationECB(key)
// 16-byte blocks
// PKCS#7 padding
// ============================================================

function aesEncrypt(data, key) {
    if (!Buffer.isBuffer(data)) {
        data = Buffer.from(String(data), "utf8");
    }

    const padded = pkcs7Pad(data, 16);

    const cipher = crypto.createCipheriv(
        "aes-128-ecb",
        key,
        null
    );

    cipher.setAutoPadding(false);

    return Buffer.concat([
        cipher.update(padded),
        cipher.final()
    ]);
}


function aesDecrypt(cipherBuffer, key) {
    if (!Buffer.isBuffer(cipherBuffer)) {
        cipherBuffer = Buffer.from(cipherBuffer);
    }

    const decipher = crypto.createDecipheriv(
        "aes-128-ecb",
        key,
        null
    );

    decipher.setAutoPadding(false);

    const decrypted = Buffer.concat([
        decipher.update(cipherBuffer),
        decipher.final()
    ]);

    return pkcs7Unpad(decrypted);
}


// ============================================================
// EAPI PARAMS ENCRYPT
//
// LDDC:
//
// params_bytes = json.dumps(
//     params,
//     separators=(',', ':')
// ).encode()
//
// sign_src =
//     b'nobody'
//     + path
//     + b'use'
//     + params_bytes
//     + b'md5forencrypt'
//
// sign = md5(sign_src)
//
// aes_src =
//     path
//     + b'-36cd479b6b5-'
//     + params_bytes
//     + b'-36cd479b6b5-'
//     + sign
//
// AES ECB
//
// return:
// params=HEX
// ============================================================

function eapiParamsEncrypt(path, params) {
    // Python path is bytes.
    const pathBuffer = Buffer.isBuffer(path)
        ? path
        : Buffer.from(String(path), "utf8");

    // Python json.dumps(... separators=(',', ':'))
    const paramsJson = JSON.stringify(params);

    const paramsBytes = Buffer.from(paramsJson, "utf8");

    // nobody + path + use + params + md5forencrypt
    const signSource = Buffer.concat([
        Buffer.from("nobody", "utf8"),
        pathBuffer,
        Buffer.from("use", "utf8"),
        paramsBytes,
        Buffer.from("md5forencrypt", "utf8")
    ]);

    const sign = crypto
        .createHash("md5")
        .update(signSource)
        .digest("hex");

    const aesSource = Buffer.concat([
        pathBuffer,
        Buffer.from(SEPARATOR, "utf8"),
        paramsBytes,
        Buffer.from(SEPARATOR, "utf8"),
        Buffer.from(sign, "utf8")
    ]);

    const encryptedData = aesEncrypt(
        aesSource,
        EAPI_KEY
    );

    return `params=${encryptedData
        .toString("hex")
        .toUpperCase()}`;
}


// ============================================================
// EAPI PARAMS DECRYPT
// ============================================================

function eapiParamsDecrypt(encryptedText) {
    const encryptedBytes = Buffer.from(
        encryptedText,
        "hex"
    );

    const decryptedData = aesDecrypt(
        encryptedBytes,
        EAPI_KEY
    );

    const decryptedText = decryptedData.toString("utf8");

    const parts = decryptedText.split(SEPARATOR);

    if (parts.length < 2) {
        throw new Error(
            "Invalid EAPI encrypted payload"
        );
    }

    const path = Buffer.from(parts[0], "utf8");

    const params = JSON.parse(parts[1]);

    // Same signing operation as LDDC.
    const paramsBytes = Buffer.from(
        JSON.stringify(params),
        "utf8"
    );

    const signSource = Buffer.concat([
        Buffer.from("nobody", "utf8"),
        path,
        Buffer.from("use", "utf8"),
        paramsBytes,
        Buffer.from("md5forencrypt", "utf8")
    ]);

    // LDDC calculates this but does not actually compare it.
    crypto
        .createHash("md5")
        .update(signSource)
        .digest("hex");

    return params;
}


// ============================================================
// EAPI RESPONSE DECRYPT
//
// LDDC:
//
// def eapi_response_decrypt(cipher_buffer):
//     return aes_decrypt(
//         cipher_buffer,
//         b'e82ckenh8dichen8'
//     )
// ============================================================

function eapiResponseDecrypt(cipherBuffer) {
    if (!Buffer.isBuffer(cipherBuffer)) {
        cipherBuffer = Buffer.from(cipherBuffer);
    }

    return aesDecrypt(
        cipherBuffer,
        EAPI_KEY
    );
}


// ============================================================
// CACHE KEY
//
// LDDC:
//
// b64encode(
//     aes_encrypt(
//         data,
//         b")(13daqP@ssw0rd~"
//     )
// )
// ============================================================

function getCacheKey(data) {
    const input = Buffer.isBuffer(data)
        ? data
        : Buffer.from(String(data), "utf8");

    return aesEncrypt(
        input,
        CACHE_KEY
    ).toString("base64");
}


// ============================================================
// CACHE KEY DECRYPT
// ============================================================

function cacheKeyDecrypt(data) {
    const encrypted = Buffer.from(
        String(data),
        "base64"
    );

    return aesDecrypt(
        encrypted,
        CACHE_KEY
    ).toString("utf8");
}


// ============================================================
// ANONYMOUS USERNAME
//
// LDDC:
//
// xored_chars = []
//
// for i, ch in enumerate(device_id):
//     xored_char = chr(
//         ord(ch)
//         ^ ord(DEVICEID_XOR_KEY[i % key_length])
//     )
//
// xored_string = ''.join(xored_chars)
//
// md5_digest = md5(
//     xored_string.encode('utf-8')
// ).digest()
//
// combined_str =
//     f"{device_id} {base64(md5_digest)}"
//
// return base64(combined_str)
// ============================================================

function getAnonymousUsername(deviceId) {
    deviceId = String(deviceId);

    let xoredString = "";

    for (let i = 0; i < deviceId.length; i++) {
        const deviceChar = deviceId.charCodeAt(i);
        const keyChar = DEVICEID_XOR_KEY.charCodeAt(
            i % DEVICEID_XOR_KEY.length
        );

        xoredString += String.fromCharCode(
            deviceChar ^ keyChar
        );
    }

    const md5Digest = crypto
        .createHash("md5")
        .update(
            Buffer.from(xoredString, "utf8")
        )
        .digest();

    const md5Base64 = md5Digest.toString("base64");

    const combined = `${deviceId} ${md5Base64}`;

    return Buffer
        .from(combined, "utf8")
        .toString("base64");
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    aesEncrypt,
    aesDecrypt,

    eapiParamsEncrypt,
    eapiParamsDecrypt,

    eapiResponseDecrypt,

    getCacheKey,
    cacheKeyDecrypt,

    getAnonymousUsername,

    EAPI_KEY,
    CACHE_KEY,
    DEVICEID_XOR_KEY
};