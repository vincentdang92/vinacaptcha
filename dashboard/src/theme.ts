import type { ThemeConfig } from "antd";

export const themeTokens: ThemeConfig = {
  token: {
    colorPrimary: "#7367f0", // Vuexy Purple
    colorSuccess: "#28c76f", // Vuexy Green
    colorWarning: "#ff9f43", // Vuexy Orange
    colorError: "#ea5455",   // Vuexy Red
    colorInfo: "#00cfe8",    // Vuexy Cyan
    borderRadius: 6,
    fontFamily: `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
    colorTextBase: "#4b465c",
    colorBgLayout: "#f8f7fa",
  },
  components: {
    Layout: {
      siderBg: "#ffffff", // Vuexy sidebar usually white in light mode
      headerBg: "#ffffff",
      bodyBg: "#f8f7fa", // Vuexy background
    },
    Menu: {
      itemBg: "#ffffff",
      itemSelectedBg: "rgba(115, 103, 240, 0.08)",
      itemSelectedColor: "#7367f0",
      itemHoverBg: "rgba(115, 103, 240, 0.04)",
    },
    Card: {
      borderRadiusLG: 6,
      boxShadowTertiary: "0 2px 6px 0 rgba(75, 70, 92, 0.1)",
    },
    Table: {
      headerBg: "#f8f7fa",
      headerColor: "#4b465c",
      borderRadius: 6,
    },
  },
};
