import type { AuthProvider } from "@refinedev/core";
import { API_BASE_URL } from "./config";

const API_URL = API_BASE_URL;

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: {
            name: "Login Error",
            message: errorData.message || "Email hoặc mật khẩu không chính xác",
          },
        };
      }

      const data = await response.json();
      localStorage.setItem("vinacaptcha_token", data.access_token);
      localStorage.setItem("vinacaptcha_user", JSON.stringify(data.account));

      return {
        success: true,
        redirectTo: "/sites",
      };
    } catch (err: any) {
      return {
        success: false,
        error: {
          name: "Network Error",
          message: err.message || "Không thể kết nối đến máy chủ",
        },
      };
    }
  },

  logout: async () => {
    localStorage.removeItem("vinacaptcha_token");
    localStorage.removeItem("vinacaptcha_user");
    return {
      success: true,
      redirectTo: "/login",
    };
  },

  check: async () => {
    const token = localStorage.getItem("vinacaptcha_token");
    if (token) {
      return {
        authenticated: true,
      };
    }

    return {
      authenticated: false,
      redirectTo: "/login",
    };
  },

  getPermissions: async () => null,

  getIdentity: async () => {
    const userStr = localStorage.getItem("vinacaptcha_user");
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch {
        return null;
      }
    }
    return null;
  },

  onError: async (error) => {
    const status = error?.statusCode || error?.status;
    if (status === 401 || status === 403) {
      localStorage.removeItem("vinacaptcha_token");
      localStorage.removeItem("vinacaptcha_user");
      return {
        logout: true,
        redirectTo: "/login",
      };
    }
    return { error };
  },
};
