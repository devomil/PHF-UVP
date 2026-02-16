import { createContext, useContext, ReactNode } from "react";

type ThemeContextType = {
  theme: string;
};

const ThemeContext = createContext<ThemeContextType>({ theme: "light" });

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeContext.Provider value={{ theme: "light" }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
