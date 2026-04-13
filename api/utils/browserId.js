// src/utils/browserId.js

export function getBrowserId() {
  // Try to get from localStorage
  let browserId = localStorage.getItem("browser_id");

  // If not found, generate new one
  if (!browserId) {
    browserId = crypto.randomUUID(); // ✅ modern native UUID
    localStorage.setItem("browser_id", browserId);
  }

  return browserId;
}
