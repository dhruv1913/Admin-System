import React, { createContext, useState, useEffect, useContext } from 'react';
import { decryptToken } from '../utils/crypto';
import axios from 'axios'; 
import apiClient from '../services/apiClient'; 

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [auth, setAuth] = useState(null);
    const [loading, setLoading] = useState(true);
    const [fatalError, setFatalError] = useState(null); 

    const SSO_API_URL = import.meta.env.VITE_SSO_API_URL;
    const SERVICE_KEY = import.meta.env.VITE_SERVICE_KEY;
    const SSO_PORTAL_URL = `${import.meta.env.VITE_SSO_URL}/?sid=${SERVICE_KEY}`;

    const VITE_DEPT_SECRET_KEY = import.meta.env.VITE_DEPT_SECRET_KEY;

    useEffect(() => {
        let isMounted = true;

        const verifySession = async () => {
            try {
                apiClient.defaults.withCredentials = true; 
                axios.defaults.withCredentials = true; 

                try {
                    const csrfRes = await axios.get(`${import.meta.env.VITE_API_URL}/api/csrf-token`);
                    
                    //  Attach the token to the apiClient so adminService.js can use it!
                    apiClient.defaults.headers.common['X-CSRF-Token'] = csrfRes.data.csrfToken;
                    
                    // (Optional) Keep this just in case you use global axios anywhere else
                    axios.defaults.headers.common['X-CSRF-Token'] = csrfRes.data.csrfToken; 
                } catch (csrfErr) {
                    console.error("🔥 Failed to fetch CSRF Token:", csrfErr);
                }
                
                const params = new URLSearchParams(window.location.search);
                const urlToken = params.get("token");
                const savedToken = sessionStorage.getItem("token");

                let activeToken = urlToken || savedToken;

                if (!activeToken || activeToken === "undefined" || activeToken === "null" || activeToken.trim() === "") {
                    if (isMounted) setLoading(false);
                    return;
                }

               const res = await fetch(`${SSO_API_URL}/auth/token/reads`, {
                    method: 'POST',
                    credentials: 'include', // Tells the browser to send cookies!
                    headers: { 
                        "Content-Type": "application/json",
                        "X-Service-Key": SERVICE_KEY,
                        "Authorization": `Bearer ${activeToken}` 
                    },
                    body: JSON.stringify({ token: activeToken })
                });

                if (!res.ok) {
                    throw new Error(`SSO Server rejected session: ${res.status}`);
                }

                const rawResponse = await res.json();

                if (rawResponse.payload) {
                    const decryptedStr = decryptToken(rawResponse.payload, VITE_DEPT_SECRET_KEY);
                    const parsed = JSON.parse(decryptedStr);
                    
                    // 🚨 THE FIX: The parsed object IS the data! Let's safely fall back.
                    let userData = parsed.data || parsed; 
                    

                    if (isMounted) {
                        setAuth({
                            token: activeToken,
                            role: userData.role,
                            name: userData.name || userData.username || "User",
                            uid: userData.userId || userData.uid
                        });
                        sessionStorage.setItem("token", activeToken);
                        setLoading(false);
                    }
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
            // 🚨 THE FIX: Use fetch for logout to bypass the global CSRF CORS block
            await fetch(`${SSO_API_URL}/auth/logout`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${sessionStorage.getItem("token")}`,
                    "X-Service-Key": SERVICE_KEY
                },
                body: JSON.stringify({
                    token: sessionStorage.getItem("token"),
                    serviceKey: SERVICE_KEY
                })
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
            window.location.replace(SSO_PORTAL_URL);
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