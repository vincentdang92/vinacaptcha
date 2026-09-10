import type { TagProps } from "antd";

/**
 * Hàm mapping màu status tag dùng chung toàn hệ thống
 * Theo quy định UI_GUIDELINES.md mục 5
 */
export const getStatusTagProps = (status: string): TagProps => {
  switch (status) {
    case "active":
      return { color: "success" };
    case "suspended":
      return { color: "error" };
    case "pass":
      return { color: "success" };
    case "fail":
      return { color: "error" };
    case "expired":
      return { color: "warning" };
    case "none":
      return { color: "default" };
    case "slider":
      return { color: "processing" };
    case "pow":
      return { color: "warning" };
    default:
      return { color: "default" };
  }
};
