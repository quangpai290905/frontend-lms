// src/services/http.jsx
import axios from "axios";
import { store, logout } from "@/redux/store";

// Base URL từ biến môi trường
const BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://lms-mankai.onrender.com";

const http = axios.create({
  baseURL: BASE_URL,
  withCredentials: false, 
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  timeout: 15000,
});

// ✅ 1. REQUEST INTERCEPTOR: Gắn Access Token vào Header
http.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ 2. RESPONSE INTERCEPTOR: Xử lý Refresh Token tự động
http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error?.response?.status;

    // Nếu lỗi không phải 401 hoặc request đã retry rồi -> trả lỗi luôn
    if (status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Các URL Auth công khai thì không cần refresh (tránh loop)
    if (
      originalRequest.url.includes("/auth/login") ||
      originalRequest.url.includes("/auth/register")
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true; // Đánh dấu đã retry để tránh lặp vô hạn

    try {
      // 🟢 Lấy Refresh Token từ LocalStorage
      const refreshToken = localStorage.getItem("refresh_token");

      if (!refreshToken) {
        throw new Error("No refresh token available");
      }

      console.log("🔄 Đang thử Refresh Token...");

      // 🟢 Gọi API refresh (Dùng instance axios mới để tránh dính interceptor của instance http)
      // Backend của bạn yêu cầu Bearer Token trong Header
      const res = await axios.post(
        `${BASE_URL}/auth/refresh`,
        {}, // Body rỗng
        {
          headers: {
            Authorization: `Bearer ${refreshToken}`, // Gửi RT dạng Bearer
          },
        }
      );

      const newAccessToken = res.data.access_token || res.data.data?.access_token;

      if (newAccessToken) {
        console.log("✅ Refresh thành công!");
        
        // 1. Lưu token mới
        localStorage.setItem("access_token", newAccessToken);

        // 2. Cập nhật header cho request đang bị lỗi
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

        // 3. Thực hiện lại request cũ
        return http(originalRequest);
      } else {
        throw new Error("API không trả về access_token mới");
      }

    } catch (refreshErr) {
      console.warn("⚠️ Refresh thất bại hoặc hết hạn -> Logout bắt buộc.");
      
      // Xóa sạch dữ liệu
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user");

      // Dispatch logout Redux
      try {
        store.dispatch(logout());
      } catch (e) {
        console.error("Redux dispatch error:", e);
      }

      // Chuyển hướng về login
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }

      return Promise.reject(refreshErr);
    }
  }
);

export default http;