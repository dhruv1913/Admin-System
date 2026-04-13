import React from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom"; // 🚨 Add useLocation here
import Login from './pages/login';
// Auth Provider & Guards
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "../components/ProtectedRoute";

// Pages
import Admin from "./pages/admin";
import Departments from "./pages/Departments";
import Logs from "./pages/logs";
import TopNav from "../components/TopNav";

const LoginWrapper = () => {
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSuccessfulLogin = (userData, token, role, allowedOUs, canWrite, name) => {
        // Save the auth data to your context/storage
        login(userData, token);
        // Instantly push the user into the dashboard!
        navigate("/dashboard", { replace: true });
    };

    return <Login onLogin={handleSuccessfulLogin} />;
};

export default function App() {
  return (
    <AuthProvider>
        <div className="bg-gray-50 min-h-screen">
            <Routes>
                {/* Send root and /login to our new Wrapper */}
                <Route path="/" element={<LoginWrapper />} />
                <Route path="/login" element={<LoginWrapper />} />
                
                <Route path="/dashboard" element={
                    <ProtectedRoute>
                        <div className="p-6">
                            <TopNav title="Dashboard" subtitle="Overview" />
                            <Admin /> 
                        </div>
                    </ProtectedRoute>
                } />

                <Route path="/departments" element={
                    <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
                        <div className="p-6">
                            <TopNav title="Manage Departments" />
                            <Departments />
                        </div>
                    </ProtectedRoute>
                } />

                <Route path="/logs" element={
                    <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                        <div className="p-6">
                            <TopNav title="System Logs" subtitle="Audit Trail" />
                            <Logs />
                        </div>
                    </ProtectedRoute>
                } />
                
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </div>
    </AuthProvider>
  );
}