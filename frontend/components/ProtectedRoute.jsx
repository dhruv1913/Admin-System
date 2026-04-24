import React, { useEffect, useState, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../src/context/AuthContext'; // Adjust path if needed

const ProtectedRoute = ({ children, allowedRoles }) => {
    // 1. Pull global auth state from Context
    const { auth, loading: authLoading, SSO_PORTAL_URL } = useAuth();
    
    // 2. Local state for the specific Service Access Check
    const [serviceLoading, setServiceLoading] = useState(true);
    const [authenticated, setAuthenticated] = useState(false);
    const fetchedsRef = useRef(false);

    // Load API URL and Service Key from your ENV
    const BASE_URL = import.meta.env.VITE_SSO_API_URL;
    const serviceKey = import.meta.env.VITE_SERVICE_KEY;

    // --- EFFECT 1: Global SSO Auth Check ---
    useEffect(() => {
        // Only kick if AuthContext completely finished and auth is definitively null
        if (!authLoading && !auth) {
            window.location.replace(SSO_PORTAL_URL || "http://localhost:3000");
        }
    }, [auth, authLoading, SSO_PORTAL_URL]);

    // --- EFFECT 2: Specific Service Access Check ---
    useEffect(() => {
        // Wait for the AuthContext to finish loading first before hitting the service endpoint
        if (authLoading || !auth) return;

        const checkServiceAccess = async () => {
            console.log('sanjay - Checking service access...');
            try {
                const res = await fetch(
                    `${BASE_URL}/service/${serviceKey}/data`,
                    {
                        method: "GET",
                        credentials: "include", // 🔥 sso_token cookie sent automatically
                    }
                );

                if (!res.ok) {
                    setAuthenticated(false);
                    return;
                }

                const data = await res.json();

                if (data?.status === "success" && data?.tokenValid === true) {
                    setAuthenticated(true);
                } else {
                    setAuthenticated(false);
                }
            } catch (err) {
                console.error("SSO service check failed", err);
                setAuthenticated(false);
            } finally {
                setServiceLoading(false);
            }
        };

        if (fetchedsRef.current) return;
        fetchedsRef.current = true;
        
        checkServiceAccess();
    }, [auth, authLoading, BASE_URL, serviceKey]);


    // --- RENDER LOGIC ---

    // 1. Loading State: Wait for BOTH global auth and service check to finish
    if (authLoading || serviceLoading) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", flexDirection: "column", fontFamily: "sans-serif" }}>
                <h2 style={{ marginBottom: "10px" }}>Checking your access...</h2>
                <p style={{ color: "#555" }}>We are confirming your session before opening this page.</p>
            </div>
        );
    }

    // 2. Global Auth Fail: Render nothing while useEffect 1 redirects to SSO
    if (!auth) {
        return null; 
    }

    // 3. Service Access Fail: Redirect to local login boundary if service token is invalid
    if (!authenticated) {
        return <Navigate to="/login" replace />;
    }

    // 4. Role Authorization Fail: Block access if their role isn't in the allowedRoles array
    if (allowedRoles && !allowedRoles.includes(auth.role)) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
                <h2 style={{ color: "red" }}>Unauthorized Access</h2>
            </div>
        );
    }

    // 5. SUCCESS: Render the protected page!
    return children;
};

export default ProtectedRoute;