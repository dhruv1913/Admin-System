import axios from "axios";

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL + "/api",
  withCredentials: true
});

apiClient.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem("token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error("🚨 401 UNAUTHORIZED:", error.response?.config?.url);
      
      // 🚨 ANTI-LOOP MECHANISM: Prevent infinite redirects!
      const lastKick = sessionStorage.getItem("lastKick");
      const now = Date.now();
      if (lastKick && now - parseInt(lastKick) < 3000) {
          console.error("🛑 Infinite loop detected! Halting redirect so you can debug.");
          return Promise.reject(error);
      }
      sessionStorage.setItem("lastKick", now.toString());

      sessionStorage.clear();
      localStorage.clear();
      
      const savedConfig = localStorage.getItem("appConfig");
      let portalUrl = import.meta.env.VITE_SSO_URL; 
      let serviceKey = "account"; 
      
      if (savedConfig) {
          try {
              const configData = JSON.parse(savedConfig);
              portalUrl = configData.portalUrl || portalUrl;
              serviceKey = configData.serviceKey || serviceKey;
          } catch(e) {}
      }

      window.location.href = `${portalUrl}/?sid=${serviceKey}`;
    }
    return Promise.reject(error);
  }
);

export default apiClient;