import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

/**
 * Fonte do tema:
 * - "system"  → segue prefers-color-scheme do SO (padrão quando não há override)
 * - "manual"  → usuário escolheu explicitamente via botão; salvo em localStorage
 */
type ThemeSource = "system" | "manual";

interface ThemeContextType {
  theme: Theme;
  themeSource: ThemeSource;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

/** Retorna a preferência atual do sistema operacional. */
function getSystemTheme(): Theme {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "dark";
}

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  switchable = false,
}: ThemeProviderProps) {
  const [themeSource, setThemeSource] = useState<ThemeSource>(() => {
    if (!switchable) return "system";
    const stored = localStorage.getItem("themeSource");
    return (stored as ThemeSource) || "system";
  });

  const [theme, setTheme] = useState<Theme>(() => {
    if (!switchable) return defaultTheme;
    const storedSource = localStorage.getItem("themeSource") as ThemeSource | null;
    if (storedSource === "manual") {
      const storedTheme = localStorage.getItem("theme") as Theme | null;
      if (storedTheme === "light" || storedTheme === "dark") return storedTheme;
    }
    // Sem override manual → usa preferência do sistema
    return getSystemTheme();
  });

  // Aplica a classe "dark" no <html> sempre que o tema mudar
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  // Persiste a fonte e o valor quando o usuário altera manualmente
  useEffect(() => {
    if (!switchable) return;
    localStorage.setItem("themeSource", themeSource);
    if (themeSource === "manual") {
      localStorage.setItem("theme", theme);
    }
  }, [theme, themeSource, switchable]);

  // Escuta mudanças na preferência do sistema operacional
  useEffect(() => {
    if (!switchable) return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      // Só atualiza automaticamente se o usuário não tiver feito override manual
      setThemeSource(prev => {
        if (prev === "system") {
          setTheme(e.matches ? "dark" : "light");
        }
        return prev;
      });
    };

    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, [switchable]);

  const toggleTheme = switchable
    ? () => {
        setThemeSource("manual");
        setTheme(prev => (prev === "light" ? "dark" : "light"));
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, themeSource, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
