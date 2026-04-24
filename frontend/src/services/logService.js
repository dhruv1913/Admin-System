import apiClient from "./apiClient";
import axios from "axios";

// 1. Admin Audit Logs come from the LOCAL Dashboard Backend (Port 3001)
export const getAuditLogs = () => apiClient.get("/directory/logs/audits");

// 2. Session Logs come directly from our new SSO API route (Port 5000)
export const getSessionLogs = async () => {
    const SSO_API_URL = import.meta.env.VITE_SSO_API_URL ;
    const token = sessionStorage.getItem("token");

    // 🚨 THE FIX: Point to the new /admin/sessions endpoint
    return axios.get(`${SSO_API_URL}/admin/sessions`, { 
        headers: {
            "Authorization": `Bearer ${token}`
        },
        credentials: "include"
    });
};