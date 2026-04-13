    import apiClient from "./apiClient";

export const getDepartments = () => apiClient.get("/directory/ous-stats");

// Accepts the encrypted { payload, key, iv } object
export const createDepartment = (data) => apiClient.post("/directory/add-ou", data);

// Axios DELETE requires body data to be explicitly passed inside a 'data' property
export const deleteDepartment = (data) => apiClient.delete("/directory/delete-ou", { data });