import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { decryptToken } from "../utils/crypto";

// 1. Create the Context
const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext); 

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
                
                // Grab token from sessionStorage
                const savedToken = sessionStorage.getItem("token"); 

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
                sessionStorage.setItem("token", activeToken); 

                // Clean token from URL for security
                if (urlToken) window.history.replaceState({}, document.title, window.location.pathname);

            } catch (err) {
                console.error("Auth Error:", err.message);
                sessionStorage.removeItem("token");
                setAuth(null);
            } finally {
                setLoading(false);
            }
        };

        verifySession();
    }, []);

    const handleLogout = async () => {
        try {
            // 🚨 THE FIX: You must log out of the central SSO server to destroy the cookie!
            // Note: credentials: "include" is REQUIRED to send and destroy the cross-origin cookie!
            await fetch(`${SSO_API_URL}/auth/logout`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${sessionStorage.getItem("token")}`
                },
                credentials: "include" 
            });
        } catch (err) {
            console.error("SSO logout failed, forcing local logout:", err);
        } finally {
            // 2. Destroy all local memory
            sessionStorage.clear();
            localStorage.clear(); 
            setAuth(null);
            
            // 3. Redirect back to the SSO portal
            window.location.href = SSO_PORTAL_URL || "/login";
        }
    };

    return (
        <AuthContext.Provider value={{ auth, loading, handleLogout, SSO_PORTAL_URL }}>
            {children}
        </AuthContext.Provider>
    );
};