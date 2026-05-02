import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "tertiary-fixed": "#e2e2e2",
        "secondary-fixed-dim": "#5fde8f",
        "on-error-container": "#ffdad6",
        "on-background": "#e5e2e1",
        "primary": "#ffb4a7",
        "surface-container-lowest": "#0e0e0e",
        "secondary-container": "#15a65e",
        "on-surface": "#e5e2e1",
        "on-primary": "#670500",
        "tertiary": "#c6c6c7",
        "on-primary-fixed-variant": "#910b00",
        "inverse-surface": "#e5e2e1",
        "error-container": "#93000a",
        "primary-fixed-dim": "#ffb4a7",
        "on-secondary-container": "#003117",
        "on-surface-variant": "#e6bdb6",
        "surface-container": "#20201f",
        "outline-variant": "#5d3f3a",
        "surface-variant": "#353535",
        "surface-tint": "#ffb4a7",
        "primary-container": "#ff553c",
        "secondary-fixed": "#7dfba9",
        "surface-container-high": "#2a2a2a",
        "inverse-primary": "#bd1100",
        "surface": "#131313",
        "tertiary-fixed-dim": "#c6c6c7",
        "on-error": "#690005",
        "on-tertiary": "#2f3131",
        "surface-dim": "#131313",
        "inverse-on-surface": "#313030",
        "primary-fixed": "#ffdad4",
        "on-tertiary-fixed": "#1a1c1c",
        "outline": "#ad8881",
        "on-tertiary-fixed-variant": "#454747",
        "tertiary-container": "#909191",
        "on-primary-container": "#5a0400",
        "on-primary-fixed": "#400200",
        "surface-bright": "#393939",
        "on-secondary": "#00391c",
        "secondary": "#5fde8f",
        "surface-container-low": "#1c1b1b",
        "surface-container-highest": "#353535",
        "error": "#ffb4ab",
        "on-secondary-fixed-variant": "#00522b",
        "on-tertiary-container": "#282a2a",
        "on-secondary-fixed": "#00210e",
        "background": "#131313"
      },
      fontFamily: {
        "headline": ["Inter", "sans-serif"],
        "body": ["Inter", "sans-serif"],
        "label": ["Inter", "sans-serif"],
        "mono": ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"]
      },
      borderRadius: {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
        "full": "0.75rem"
      }
    },
  },
  plugins: [],
};

export default config;
