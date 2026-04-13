import CryptoJS from "crypto-js";
import JSEncrypt from "jsencrypt";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL;

let cachedPublicKey = null;
let isFetching = false;
let fetchPromise = null;

export const fetchPublicKey = async () => {
    if (cachedPublicKey) return cachedPublicKey;
    if (isFetching && fetchPromise) return fetchPromise;
    
    isFetching = true;
    fetchPromise = (async () => {
        try {
            const response = await axios.get(`${API_URL}/api/auth/public-key`, {
                timeout: 5000, 
                withCredentials: true
            });

            let keyData = response.data;

            // 1. EXTRACT FROM JSON
            if (keyData && typeof keyData === 'object') {
                keyData = keyData.publicKey || keyData.key || keyData.data;
            }

            // 2. DECODE BASE64 (WITH CLEANUP)
            if (keyData && typeof keyData === 'string' && !keyData.includes("-----BEGIN")) {
                try {
                    // STRIP OUT all quotes, spaces, and newlines before decoding
                    const cleanBase64 = keyData.replace(/["'\s]+/g, '');
                    keyData = atob(cleanBase64); 
                } catch (e) {
                    console.error("🚨 atob() failed! The key is still not valid Base64:", e);
                    throw new Error("Public key decoding failed.");
                }
            }

            cachedPublicKey = keyData;
            isFetching = false;
            return cachedPublicKey;
        } catch (error) {
            isFetching = false;
            cachedPublicKey = null; // IMPORTANT: Clear cache on failure so it can retry
            throw new Error(`Could not fetch or parse public key: ${error.message}`);
        }
    })();
    
    return fetchPromise;
};

// 👇 THIS IS THE FUNCTION YOUR APP WAS LOOKING FOR AND COULDN'T FIND
export const securePayload = async (dataObject) => {
    const publicKey = await fetchPublicKey();
    
    const aesKey = CryptoJS.lib.WordArray.random(32);
    const aesIv = CryptoJS.lib.WordArray.random(16);

    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(dataObject), aesKey, {
        iv: aesIv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });

    const payload = encrypted.toString();
    const ivHex = aesIv.toString(CryptoJS.enc.Hex);
    const aesKeyHex = aesKey.toString(CryptoJS.enc.Hex);

    const encryptor = new JSEncrypt();
    encryptor.setPublicKey(publicKey);
    const lockedKey = encryptor.encrypt(aesKeyHex);

    // SAFETY CHECK: Prevent silent failures if the key is bad!
    if (!lockedKey) {
        console.error("❌ CRITICAL: JSEncrypt failed. The Public Key format is wrong:", publicKey);
        throw new Error("Encryption failed: Invalid Public Key format.");
    }

    return {
        payload: payload,
        key: lockedKey,
        iv: ivHex
    };
};