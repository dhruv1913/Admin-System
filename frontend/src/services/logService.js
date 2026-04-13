import apiClient from "./apiClient";

export const getSessionLogs = () => apiClient.get("/directory/logs/sessions");
export const getAuditLogs = () => apiClient.get("/directory/logs/audits");