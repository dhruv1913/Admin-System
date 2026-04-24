import { encryptToken } from "./crypto";

// We keep this function so your other files don't crash, 
// but it just returns null because we don't need RSA public keys anymore!
export const fetchPublicKey = async () => {
    return null; 
};

// 👇 THIS IS THE FIX: The new, unified secure wrapper
export const securePayload = async (dataObject) => {
    // 1. Get the shared secret from your frontend .env
    const secret = import.meta.env.VITE_DEPT_SECRET_KEY || import.meta.env.VITE_ENCRYPTION_SECRET;
    
    if (!secret) {
        console.error("🚨 CRITICAL: VITE_DEPT_SECRET_KEY is missing in your frontend .env file!");
    }

    // 2. Encrypt the data using the exact same logic the backend expects
    const encryptedString = encryptToken(JSON.stringify(dataObject), secret);

    // 3. Return ONLY the payload. 
    // We no longer send the 'key' or 'iv' because the backend already knows them!
    return {
        payload: encryptedString
    };
};