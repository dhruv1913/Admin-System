import React from 'react';
import { useAuth } from '../src/context/AuthContext';

const ProtectedRoute = ({ children }) => {
    const { auth, loading, SSO_PORTAL_URL } = useAuth();

    // 1. FREEZE: Do nothing while AuthContext is verifying the token
    if (loading) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
                <h2>Verifying Session... Please Wait.</h2>
            </div>
        );
    }

    // 2. KICK: Only redirect if loading is completely finished AND auth is null
    if (!auth) {
        window.location.replace(SSO_PORTAL_URL || "http://localhost:3000");
        return null; // Return null while the browser redirects
    }

    // 3. ALLOW: Render the dashboard
    return children;
};

export default ProtectedRoute;