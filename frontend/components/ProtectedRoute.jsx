import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../src/context/AuthContext';

export default function ProtectedRoute({ children, allowedRoles = [] }) {
    const { auth, loading, SSO_PORTAL_URL } = useAuth();

    if (loading) return <div className="flex h-screen items-center justify-center font-bold text-blue-600 text-xl">Verifying Secure Session...</div>;

    if (!auth) {
        window.location.replace(SSO_PORTAL_URL);
        return null;
    }

    // Optional: Add Role-Based Access Control (RBAC)
    if (allowedRoles.length > 0 && !allowedRoles.includes(auth.role)) {
        return <Navigate to="/dashboard" replace />; // Redirect if they don't have permission
    }

    return children;
}