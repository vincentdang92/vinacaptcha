/**
 * Cấu hình tập trung biến môi trường cho Admin Dashboard
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
  window.location.port !== "" &&
  window.location.port !== "80" &&
  window.location.port !== "443"
    ? "http://localhost:3068/admin/v1"
    : "/admin/v1");


