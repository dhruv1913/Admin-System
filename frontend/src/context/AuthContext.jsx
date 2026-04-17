import React, { createContext, useState, useEffect, useContext } from 'react';
import { decryptToken } from '../utils/crypto';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext); 

export const AuthProvider = ({ children }) => {
    const [auth, setAuth] = useState(null);
    const [loading, setLoading] = useState(true);
    const [fatalError, setFatalError] = useState(null); 

    // Ensure NO hardcoded values exist here
    const SSO_API_URL = import.meta.env.VITE_SSO_API_URL;
    const SERVICE_KEY = import.meta.env.VITE_SERVICE_KEY;
    const SSO_PORTAL_URL = `${import.meta.env.VITE_SSO_URL}/?sid=${SERVICE_KEY}`;
    const VITE_DEPT_SECRET_KEY = import.meta.env.VITE_DEPT_SECRET_KEY;

    useEffect(() => {
        let isMounted = true; 

        const verifySession = async () => {
            try {
                const params = new URLSearchParams(window.location.search);
                const urlToken = params.get("token");
                const savedToken = sessionStorage.getItem("token"); 

                let activeToken = urlToken || savedToken;

                if (!activeToken || activeToken === "undefined" || activeToken === "null" || activeToken.trim() === "") {
                    if (isMounted) setLoading(false);
                    return; 
                }

                const res = await fetch(`${SSO_API_URL}/auth/token/reads`, {
                    method: "POST",
                    credentials: "include", 
                    headers: {
                        "Content-Type": "application/json",
                        "X-Service-Key": SERVICE_KEY,
                    },
                });

                if (!res.ok) throw new Error(`Backend rejected token with status ${res.status}`);

                const rawResponse = await res.json();
                console.log("Profile data:", rawResponse);

                let pureJwt = savedToken; // Fallback
                let userData = rawResponse.data;

                if (rawResponse.payload) {
                    // Decrypt the payload using the ENV key
                    const decryptedStr = decryptToken(rawResponse.payload, VITE_DEPT_SECRET_KEY);
                    const parsed = JSON.parse(decryptedStr); 
                    
                    console.log("User data:", parsed.data);
                    
                    userData = parsed.data;
                    pureJwt = parsed.jwt; 
                }

                if (!userData) {
                    throw new Error("Backend response did not contain user 'data'.");
                }

                if (isMounted) {
                    setAuth({
                        token: pureJwt || activeToken,
                        role: (userData.role || "USER").toUpperCase(),
                        name: userData.name || "User",
                        uid: userData.uid || userData.userId
                    });
                    
              
                    sessionStorage.setItem("token", pureJwt || activeToken); 
                    setLoading(false);
                }

    

            } catch (err) {
                console.error("🚨 Auth Loop Killed by Error:", err);
                if (isMounted) {
                    sessionStorage.removeItem("token");
                    setAuth(null);
                    setLoading(false);
                    
                    
                    if (!err.message.includes("401")) {
                        setFatalError(err.message); 
                    }
                }
            }
        };

        // Stop double execution loop
        if (!auth) {
            verifySession();
        }

        return () => { isMounted = false; };
    }, [auth]);

    const handleLogout = async () => {
        try {
            await fetch(`${SSO_API_URL}/auth/logout`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Service-Key": SERVICE_KEY 
                },
                body: JSON.stringify({
                    token: sessionStorage.getItem("token"),
                    serviceKey: SERVICE_KEY
                }),
                credentials: "include" 
            });
        } catch (err) {
            console.error("SSO logout failed:", err);
        } finally {
            sessionStorage.clear();
            localStorage.clear(); 
            setAuth(null);
            
            document.cookie.split(";").forEach((c) => {
                document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
            });

            // Erase the token from the URL upon logout so it can't be copied
            window.history.replaceState({}, document.title, "/");
            window.location.replace(SSO_PORTAL_URL || "http://localhost:3000");
        }
    };

    // 🚨 THE CIRCUIT BREAKER
    if (fatalError) {
        return (
            <div style={{ backgroundColor: "#fee2e2", color: "#991b1b", padding: "3rem", height: "100vh", fontFamily: "sans-serif" }}>
                <h1 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "1rem" }}>🚨 SSO Loop Prevented!</h1>
                <p>React tried to kick you back to the login page because of a hidden error. Here is the exact problem:</p>
                <pre style={{ backgroundColor: "#fecaca", padding: "1rem", marginTop: "1rem", borderRadius: "8px", fontWeight: "bold" }}>
                    {fatalError}
                </pre>
                <p style={{ marginTop: "1rem" }}>Open your Browser Console (F12) for more details.</p>
            </div>
        );
    }

    return (
        <AuthContext.Provider value={{ auth, loading, handleLogout, SSO_PORTAL_URL }}>
            {children}
        </AuthContext.Provider>
    );
};