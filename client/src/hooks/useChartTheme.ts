import { useTheme } from "../contexts/ThemeContext";

/**
 * Retorna valores de tema para gráficos Recharts e elementos com inline styles.
 * Usa as mesmas variáveis OKLCH do design system mas adaptadas para JS.
 */
export function useChartTheme() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Expose isDark for conditional rendering in components
  const dark = isDark;

  return {
    isDark,
    // Tooltip glass
    tooltipStyle: {
      background: isDark
        ? "oklch(0.155 0.012 260 / 0.97)"
        : "oklch(1.0 0 0 / 0.97)",
      border: isDark
        ? "1px solid oklch(0.28 0.015 260 / 0.6)"
        : "1px solid oklch(0.88 0.006 260 / 0.8)",
      borderRadius: "10px",
      backdropFilter: "blur(12px)",
      boxShadow: isDark
        ? "0 8px 32px oklch(0 0 0 / 0.4), 0 1px 0 oklch(1 0 0 / 0.05) inset"
        : "0 4px 20px oklch(0 0 0 / 0.10), 0 1px 0 oklch(1 0 0 / 0.8) inset",
      fontSize: "12px",
      color: isDark ? "oklch(0.92 0.006 80)" : "oklch(0.18 0.010 260)",
    },
    // Card/panel backgrounds
    cardBg: isDark
      ? "linear-gradient(135deg, oklch(0.14 0.012 260 / 0.9) 0%, oklch(0.11 0.01 260 / 0.8) 100%)"
      : "linear-gradient(135deg, oklch(1.0 0 0 / 0.95) 0%, oklch(0.975 0.003 80 / 0.9) 100%)",
    cardBgSolid: isDark
      ? "oklch(0.14 0.012 260 / 0.95)"
      : "oklch(1.0 0 0 / 0.95)",
    cardBgMuted: isDark
      ? "oklch(0.155 0.012 260 / 0.8)"
      : "oklch(0.96 0.004 80 / 0.8)",
    cardBgSubtle: isDark
      ? "oklch(0.155 0.012 260 / 0.6)"
      : "oklch(0.96 0.004 80 / 0.6)",
    cardBgDeep: isDark
      ? "oklch(0.11 0.01 260 / 0.6)"
      : "oklch(0.97 0.003 80 / 0.6)",
    cardBgHover: isDark
      ? "oklch(0.18 0.012 260 / 0.6)"
      : "oklch(0.93 0.005 80 / 0.6)",
    // Borders
    border: isDark
      ? "1px solid oklch(0.22 0.014 260 / 0.5)"
      : "1px solid oklch(0.88 0.006 260 / 0.7)",
    borderSubtle: isDark
      ? "1px solid oklch(0.22 0.014 260 / 0.4)"
      : "1px solid oklch(0.90 0.005 260 / 0.6)",
    // Text
    textMuted: isDark ? "oklch(0.45 0.01 260)" : "oklch(0.55 0.012 260)",
    textForeground: isDark ? "oklch(0.92 0.006 80)" : "oklch(0.18 0.010 260)",
    // Skeleton/loading
    skeletonBg: isDark
      ? "oklch(0.18 0.012 260 / 0.5)"
      : "oklch(0.92 0.004 80 / 0.5)",
    // Recharts cursor
    cursorFill: isDark
      ? "oklch(0.76 0.145 72 / 0.08)"
      : "oklch(0.62 0.155 68 / 0.08)",
    // Grid stroke
    gridStroke: isDark
      ? "oklch(0.22 0.014 260 / 0.4)"
      : "oklch(0.88 0.006 260 / 0.6)",
    // Axis tick color
    axisColor: isDark ? "oklch(0.42 0.01 260)" : "oklch(0.55 0.012 260)",
    // Reference line
    refLineStroke: isDark
      ? "oklch(0.76 0.145 72 / 0.5)"
      : "oklch(0.62 0.155 68 / 0.6)",
  };
}
