import apiClient from "./apiClient";

export const getAllUsers = () => apiClient.get("/directory/users/all");
export const getUsers = () => apiClient.get("/directory/users");
// 🚨 REMOVED explicit headers so Axios can auto-generate the boundaries!
export const addUser = (data) => apiClient.post("/directory/add", data);
export const editUser = (data) => apiClient.put("/directory/edit", data);

export const bulkImport = (data) => apiClient.post("/directory/bulk", data);

export const deleteUser = (uid) => apiClient.delete(`/directory/delete/${uid}`);
export const exportUsers = () => apiClient.get("/directory/export", { responseType: 'blob' });
export const getOUs = () => apiClient.get("/directory/ous");
export const getUsersByOU = (ou) => apiClient.get(`/directory/users/${ou}`);