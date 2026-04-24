import { encryptToken } from "./crypto";

export const fetchPublicKey = async () => {
    return null;
};


export const securePayload = async (dataObject) => {
    // 1. Get the shared secret from your frontend .env
    const secret = import.meta.env.VITE_DEPT_SECRET_KEY || import.meta.env.VITE_ENCRYPTION_SECRET;

    if (!secret) {
        console.error("🚨 CRITICAL: VITE_DEPT_SECRET_KEY is missing in your frontend .env file!");
    }

    // 2. Encrypt the data using the exact same logic the backend expects
    const encryptedString = encryptToken(JSON.stringify(dataObject), secret);

    return {
        payload: encryptedString
    };
};