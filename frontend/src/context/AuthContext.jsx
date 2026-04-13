import React, { createContext, useState, useEffect, useContext } from 'react';
import { decryptToken } from "../utils/crypto";

// 1. Create the Context
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [auth, setAuth] = useState(null);
    const [loading, setLoading] = useState(true);

    const SSO_API_URL = import.meta.env.VITE_SSO_API_URL;
    const SECRET_KEY = import.meta.env.VITE_DEPT_SECRET_KEY;
    const SERVICE_KEY = import.meta.env.VITE_SERVICE_KEY;
    const SSO_PORTAL_URL = `${import.meta.env.VITE_SSO_URL}/?sid=${SERVICE_KEY}`;

    useEffect(() => {
        const verifySession = async () => {
            try {
                const params = new URLSearchParams(window.location.search);
                const urlToken = params.get("token");
                // 🔒 SECURITY UPGRADE: Switched to sessionStorage
                const savedToken = sessionStorage.getItem("secure_token"); 

                let activeToken = urlToken || savedToken;

                if (!activeToken) throw new Error("No token found");

                // Verify with SSO
                const res = await fetch(`${SSO_API_URL}/auth/token/reads`, { 
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${activeToken}`,
                        "X-Service-Key": SERVICE_KEY 
                    },
                    body: JSON.stringify({ token: activeToken }),
                });

                if (!res.ok) throw new Error("Token rejected");

                const data = await res.json();
                let userData = data.payload ? JSON.parse(decryptToken(data.payload, SECRET_KEY)).data : data.user;

                const verifiedAuth = {
                    token: activeToken,
                    role: (userData.role || "USER").toUpperCase(),
                    name: userData.name || "User",
                };

                setAuth(verifiedAuth);
                sessionStorage.setItem("secure_token", activeToken); // 🔒 Save securely

                // Clean token from URL for security
                //if (urlToken) window.history.replaceState({}, document.title, window.location.pathname);

            } catch (err) {
                console.error("Auth Error:", err.message);
                sessionStorage.removeItem("secure_token");
                setAuth(null);
            } finally {
                setLoading(false);
            }
        };

        verifySession();
    }, []);

    const logout = () => {
        sessionStorage.clear();
        setAuth(null);
        window.location.replace(SSO_PORTAL_URL);
    };

    return (
        <AuthContext.Provider value={{ auth, loading, logout, SSO_PORTAL_URL }}>
            {children}
        </AuthContext.Provider>
    );
};

// Custom Hook for easy access anywhere in the app
export const useAuth = () => useContext(AuthContext);