import axios from "axios";

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL + "/api",
  headers: { "Content-Type": "application/json" },
  withCredentials: true
});

// 🔐 Request Interceptor: Attach Token automatically
apiClient.interceptors.request.use(
  (config) => {
    // 🚨 FIXED: Now grabs the token from localStorage (where App.jsx saves it)
    const savedAuth = localStorage.getItem("auth");
    if (savedAuth) {
      const authData = JSON.parse(savedAuth);
      if (authData.token) {
        config.headers.Authorization = `Bearer ${authData.token}`;
      }
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
      localStorage.clear();
      
      // 🚨 Pull dynamic config from memory instead of .env
      const savedConfig = localStorage.getItem("appConfig");
      let portalUrl = import.meta.env.VITE_SSO_URL; // Fallback
      let serviceKey = "account"; // Fallback
      
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