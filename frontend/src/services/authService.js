import apiClient from "./apiClient";

export const getCaptcha = () => apiClient.get("/auth/captcha");
export const loginUser = (payload) => apiClient.post("/auth/login", payload);
export const logoutUser = (data) => apiClient.post("/auth/logout", data); // Added logout