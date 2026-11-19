import type { ThemeConfig } from "antd";

export const adminThemeConfig: ThemeConfig = {
  token: {
    colorPrimary: "#0D9488", // Main brand Teal (20-30% punchier)
    colorPrimaryHover: "#0B746C",
    colorPrimaryActive: "#0F766E",
    colorLink: "#0D9488",
    colorLinkHover: "#0B746C",
    colorSuccess: "#15803D", // Green WCAG AA
    colorWarning: "#D97706", // Amber
    colorError: "#DC2626",   // Red
    colorInfo: "#0284C7",    // Cyan/Sky
    colorTextBase: "#163B40", // High contrast dark teal/slate text
    colorTextSecondary: "#64748B", // Slate-500
    colorBgBase: "#FFFFFF",
    colorBgLayout: "#F5FAF9", // Enhanced Page Canvas
    colorBorder: "#D6E5E2",   // Enhanced Teal-tinted Border
    borderRadius: 12,
    fontFamily: "'Be Vietnam Pro', 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
  },
  components: {
    Button: {
      borderRadius: 10,
      controlHeight: 38,
      colorPrimary: "#0D9488",
      colorPrimaryHover: "#0B746C",
      colorPrimaryActive: "#0F766E",
      defaultBorderColor: "#D6E5E2",
      defaultColor: "#163B40",
    },
    Table: {
      headerBg: "#F0F8F6",
      headerColor: "#163B40",
      headerBorderRadius: 10,
      rowHoverBg: "#E5F5F1",
      borderColor: "#D6E5E2",
    },
    Card: {
      borderRadiusLG: 16,
      colorBorderSecondary: "#D6E5E2",
    },
    Modal: {
      borderRadiusLG: 20,
      headerBg: "transparent",
    },
    Menu: {
      itemSelectedBg: "#CCFBF1",
      itemSelectedColor: "#0F766E",
      itemHoverBg: "#E5F5F1",
      itemBorderRadius: 8,
    },
    Tabs: {
      colorPrimary: "#0D9488",
      itemSelectedColor: "#0F766E",
      itemHoverColor: "#0B746C",
    },
    Tag: {
      borderRadiusSM: 6,
    },
    Input: {
      borderRadius: 10,
      activeBorderColor: "#0D9488",
      hoverBorderColor: "#14B8A6",
    },
    Select: {
      borderRadius: 10,
      colorPrimary: "#0D9488",
    },
  },
};
