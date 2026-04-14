import axios from "axios";

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL + "/api",
  // 🚨 REMOVED hardcoded Content-Type so Axios can auto-detect FormData boundaries!
  withCredentials: true
});

// 🔐 Request Interceptor: Attach Token automatically
apiClient.interceptors.request.use(
  (config) => {
    // 🚨 FIX: Match exactly what AuthContext saves!
    const token = sessionStorage.getItem("token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 🚨 Response Interceptor: Global Logout on 401
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("🚨 KICKED OUT BY:", error.response?.config?.url);
    console.error("🚨 ERROR STATUS:", error.response?.status);

    if (error.response?.status === 401) {
      sessionStorage.clear();
      localStorage.clear();
      
      const savedConfig = localStorage.getItem("appConfig");
      let portalUrl = import.meta.env.VITE_SSO_URL; 
      let serviceKey = "account"; 
      
      if (savedConfig) {
          const configData = JSON.parse(savedConfig);
          portalUrl = configData.portalUrl || portalUrl;
          serviceKey = configData.serviceKey || serviceKey;
      }

      window.location.href = `${portalUrl}/?sid=${serviceKey}`;
    }
    return Promise.reject(error);
  }
);

export default apiClient;