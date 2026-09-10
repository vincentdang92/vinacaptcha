import React, { type PropsWithChildren, createContext, useEffect, useState } from "react";
import { ConfigProvider, theme } from "antd";
import { themeTokens } from "../../theme";

type ColorModeContextType = {
  mode: string;
  setMode: (mode: string) => void;
};

export const ColorModeContext = createContext<ColorModeContextType>({} as ColorModeContextType);

export const ColorModeContextProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const colorModeFromLocalStorage = localStorage.getItem("colorMode");
  const isSystemPreferenceDark = window?.matchMedia("(prefers-color-scheme: dark)").matches;

  const systemPreference = isSystemPreferenceDark ? "dark" : "light";
  const [mode, setMode] = useState(colorModeFromLocalStorage || systemPreference);

  useEffect(() => {
    window.localStorage.setItem("colorMode", mode);
    // Add class to body for global CSS overrides if needed
    if (mode === "dark") {
      document.body.classList.add("dark-mode");
      document.body.classList.remove("light-mode");
    } else {
      document.body.classList.add("light-mode");
      document.body.classList.remove("dark-mode");
    }
  }, [mode]);

  const setColorMode = () => {
    if (mode === "light") {
      setMode("dark");
    } else {
      setMode("light");
    }
  };

  const { darkAlgorithm, defaultAlgorithm } = theme;

  const darkThemeComponents = {
    ...themeTokens.components,
    Layout: {
      siderBg: "#2f3349",
      headerBg: "#2f3349",
      bodyBg: "#25293c",
    },
    Menu: {
      itemBg: "#2f3349",
      itemSelectedBg: "rgba(115, 103, 240, 0.16)",
      itemSelectedColor: "#7367f0",
      itemHoverBg: "rgba(255, 255, 255, 0.04)",
      itemColor: "rgba(228, 230, 244, 0.87)",
    },
    Card: {
      ...themeTokens.components?.Card,
      colorBgContainer: "#2f3349",
    },
    Table: {
      ...themeTokens.components?.Table,
      headerBg: "#25293c",
      headerColor: "rgba(228, 230, 244, 0.87)",
    },
  };

  const mergedTheme = {
    ...themeTokens,
    algorithm: mode === "light" ? defaultAlgorithm : darkAlgorithm,
    token: {
      ...themeTokens.token,
      colorBgLayout: mode === "light" ? "#f8f7fa" : "#25293c",
      colorTextBase: mode === "light" ? "#4b465c" : "rgba(228, 230, 244, 0.87)",
      colorBgContainer: mode === "light" ? "#ffffff" : "#2f3349",
      colorBgElevated: mode === "light" ? "#ffffff" : "#2f3349",
    },
    components: mode === "light" ? themeTokens.components : darkThemeComponents,
  };

  return (
    <ColorModeContext.Provider
      value={{
        setMode: setColorMode,
        mode,
      }}
    >
      <ConfigProvider theme={mergedTheme}>
        {children}
      </ConfigProvider>
    </ColorModeContext.Provider>
  );
};
