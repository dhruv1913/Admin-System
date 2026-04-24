import React from "react";
import { Routes, Route, Navigate } from "react-router-dom"; 
// Auth Provider & Guards
import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "../components/ProtectedRoute";

// Pages
import Admin from "./pages/admin";
import Departments from "./pages/Departments";
import Logs from "./pages/logs";
import DashboardLayout from "../components/DashboardLayout";

// 🚨 THE FIX: A Smart Login Redirector
// If the user hits /login but is already authenticated, send them to the dashboard.
// If they aren't authenticated, send them to the SSO Portal.
const LoginRedirector = () => {
    const { auth, loading, SSO_PORTAL_URL } = useAuth();

    if (loading) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
                <h2>Routing...</h2>
            </div>
        );
    }

    if (auth) {
        return <Navigate to="/dashboard" replace />;
    }

    window.location.replace(SSO_PORTAL_URL || "http://localhost:3000");
    return null;
};

export default function App() {
  return (
    <AuthProvider>
        <div className="bg-gray-50 min-h-screen">
            <Routes>
                {/* 🚨 THE FIX: Point root and login to the smart redirector */}
                <Route path="/" element={<LoginRedirector />} />
                <Route path="/login" element={<LoginRedirector />} />
                
                <Route path="/dashboard" element={
                    <ProtectedRoute>
                        <DashboardLayout title="Dashboard" subtitle="Overview">
                            <Admin /> 
                        </DashboardLayout>
                    </ProtectedRoute>
                } />

                <Route path="/departments" element={
                    <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
                        <DashboardLayout title="Manage Departments" subtitle="Organization Structure">
                            <Departments />
                        </DashboardLayout>
                    </ProtectedRoute>
                } />

                <Route path="/logs" element={
                    <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                        <DashboardLayout title="System Logs" subtitle="Audit Trail">
                            <Logs />
                        </DashboardLayout>
                    </ProtectedRoute>
                } />
                
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </div>
    </AuthProvider>
  );
}