import React, { useEffect } from 'react';
import { useAuth } from '../src/context/AuthContext';

const ProtectedRoute = ({ children, allowedRoles }) => {
    const { auth, loading, SSO_PORTAL_URL } = useAuth();

    useEffect(() => {
        // Only kick if loading has completely finished and auth is definitively null
        if (!loading && !auth) {
            window.location.replace(SSO_PORTAL_URL || "http://localhost:3000");
        }
    }, [auth, loading, SSO_PORTAL_URL]);

    if (loading) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
                <h2>Verifying Session... Please Wait.</h2>
            </div>
        );
    }

    if (!auth) {
        return null; // Don't render anything while redirecting
    }

    // Optional Role Check
    if (allowedRoles && !allowedRoles.includes(auth.role)) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
                <h2 style={{ color: "red" }}>Unauthorized Access</h2>
            </div>
        );
    }

    return children;
};

export default ProtectedRoute;