import React, { createContext, useState, useEffect, useContext } from 'react';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext); 

export const AuthProvider = ({ children }) => {
    const [auth, setAuth] = useState(null);
    const [loading, setLoading] = useState(true);
    const [fatalError, setFatalError] = useState(null); // 🚨 THE CIRCUIT BREAKER

    const SSO_API_URL = import.meta.env.VITE_SSO_API_URL;
    const SERVICE_KEY = import.meta.env.VITE_SERVICE_KEY;
    const SSO_PORTAL_URL = `${import.meta.env.VITE_SSO_URL}/?sid=${SERVICE_KEY}`;

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
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${activeToken}`,
                        "X-Service-Key": SERVICE_KEY 
                    }
                });

                if (!res.ok) throw new Error(`Backend rejected token with status ${res.status}`);

                const rawResponse = await res.json();
                
                // Ensure data actually exists
                if (!rawResponse.data) {
                    throw new Error("Backend response did not contain user 'data'.");
                }

                let userData = rawResponse.data;

                if (isMounted) {
                    setAuth({
                        token: activeToken,
                        role: (userData.role || "USER").toUpperCase(),
                        name: userData.name || "User",
                        uid: userData.uid || userData.userId
                    });
                    sessionStorage.setItem("token", activeToken); 
                    setLoading(false);
                }

                // Safely clean the URL so the browser doesn't re-trigger
                if (urlToken) {
                    window.history.replaceState(null, "", window.location.pathname);
                }

            } catch (err) {
                console.error("🚨 Auth Loop Killed by Error:", err);
                if (isMounted) {
                    sessionStorage.removeItem("token");
                    setAuth(null);
                    setLoading(false);
                    setFatalError(err.message); // 🚨 Freeze the screen and show the error!
                }
            }
        };

        verifySession();

        return () => { isMounted = false; };
    }, []);

    const handleLogout = async () => {
        try {
            await fetch(`${SSO_API_URL}/auth/logout`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${sessionStorage.getItem("token")}`,
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

            window.history.replaceState({}, document.title, "/");
            window.location.replace(SSO_PORTAL_URL || "http://localhost:3000");
        }
    };

    // 🚨 IF REACT PANICS, WE CATCH IT HERE INSTEAD OF LOOPING
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