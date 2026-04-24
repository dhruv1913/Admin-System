import CryptoJS from "crypto-js";

// This creates the exact same 16-byte zeroed IV as Node.js Buffer.alloc(16, 0)
const IV = CryptoJS.enc.Hex.parse("00000000000000000000000000000000");

function getKeyFromSecret(secret) {
    if (!secret) throw new Error("Secret key is missing!");
    // Matches backend: crypto.createHash("sha256").update(secret).digest()
    return CryptoJS.SHA256(String(secret));
}

export const encryptToken = (text, secret) => {
    const key = getKeyFromSecret(secret);
    const encrypted = CryptoJS.AES.encrypt(String(text), key, {
        iv: IV,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });
    // Returns the standard Base64 string exactly like the backend
    return encrypted.toString(); 
};

export const decryptToken = (encryptedBase64, secret) => {
    if (!encryptedBase64) return null;
    const key = getKeyFromSecret(secret);
    const decrypted = CryptoJS.AES.decrypt(String(encryptedBase64), key, {
        iv: IV,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
};