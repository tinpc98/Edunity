import type { ThemeConfig } from "antd";

/**
 * Public Theme Config - Edunity Mint/Teal Brand Design System
 * Synchronized with Admin Mint/Teal visual tokens:
 * Primary: #0D9488 (Teal 600)
 * Primary Dark: #0F766E (Teal 700)
 * Primary Hover: #0B746C
 * Secondary: #14B8A6 (Teal 500)
 * Mint Soft: #CCFBF1
 * Background: #F5FAF9
 * Text Base: #163B40
 * Border: #D6E5E2
 */
export const publicThemeConfig: ThemeConfig = {
  token: {
    colorPrimary: "#0D9488",
    colorPrimaryHover: "#0B746C",
    colorPrimaryActive: "#0F766E",
    colorLink: "#0D9488",
    colorLinkHover: "#0B746C",
    colorSuccess: "#15803D",
    colorWarning: "#D97706",
    colorError: "#DC2626",
    colorInfo: "#0284C7",
    colorTextBase: "#163B40",
    colorTextSecondary: "#64748B",
    colorBgBase: "#FFFFFF",
    colorBgLayout: "#F5FAF9",
    colorBorder: "#D6E5E2",
    borderRadius: 12,
    fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
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
    Pagination: {
      colorPrimary: "#0D9488",
      itemActiveBg: "#CCFBF1",
    },
    Progress: {
      defaultColor: "#0D9488",
    },
  },
};
