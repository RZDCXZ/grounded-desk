# Theme

## Part 1 — Compact Token Summary

- Framework styling: Tailwind CSS v4 via `@import "tailwindcss"` and inline theme mapping.
- Fonts: Noto Sans SC / PingFang SC / Microsoft YaHei for Chinese UI; Inter fallback; JetBrains Mono / SFMono-Regular for status, counts, time, and technical metadata.
- Backgrounds: paper `#F7F7F3`, card/surface `#FFFFFF`.
- Brand: forest-950 `#10291E`, forest-800 `#1A3C2B`, forest-100 `#DDE9E1`.
- Ink: ink-900 `#202421`, ink-600 `#626A64`, ink-400 `#909790`.
- Hairlines: line `rgba(32, 36, 33, 0.14)`, line-strong `rgba(32, 36, 33, 0.26)`.
- Semantic: success `#2F7A4C` / `#E6F3EA`; processing `#B7791F` / `#FFF3D6`; warning `#C2613B` / `#FCEBE3`; danger `#B6413C` / `#FBE7E5`; info `#326A8C` / `#E6F0F6`.
- Radius: controls 8px; cards 12px; pills 999px. Avoid radius above 16px.
- Shadow: only overlays and floating chat use `0 8px 24px rgba(16, 41, 30, 0.08)`.
- Spacing: 4px base; common values 4, 8, 12, 16, 20, 24, 32, 40, 48px.
- Desktop baseline: 1440px; admin sidebar 232px; main content max width 1200px.
- Breakpoints: Tailwind defaults; UI commonly adapts at `sm` (640px), `lg` (1024px), and `xl` (1280px). Embed launcher uses an explicit 480px mobile breakpoint.
- Motion: 220ms ease-out for iframe panel opacity/scale; 180–200ms page entrance; respect `prefers-reduced-motion`.

## Part 2 — Raw Sources

### `src/app/globals.css`

```css
@import "tailwindcss";
@import "tw-animate-css";

:root {
  --paper: #f7f7f3;
  --surface: #ffffff;
  --forest-950: #10291e;
  --forest-800: #1a3c2b;
  --forest-100: #dde9e1;
  --ink-900: #202421;
  --ink-600: #626a64;
  --ink-400: #909790;
  --line: rgba(32, 36, 33, 0.14);
  --line-strong: rgba(32, 36, 33, 0.26);
  --success: #2f7a4c;
  --success-light: #e6f3ea;
  --processing: #b7791f;
  --processing-light: #fff3d6;
  --warning: #c2613b;
  --warning-light: #fcebe3;
  --danger: #b6413c;
  --danger-light: #fbe7e5;
  --info: #326a8c;
  --info-light: #e6f0f6;
  --background: var(--paper);
  --foreground: var(--ink-900);
  --card: var(--surface);
  --card-foreground: var(--ink-900);
  --popover: var(--surface);
  --popover-foreground: var(--ink-900);
  --primary: var(--forest-800);
  --primary-foreground: var(--surface);
  --secondary: var(--surface);
  --secondary-foreground: var(--ink-900);
  --muted: var(--paper);
  --muted-foreground: var(--ink-600);
  --accent: var(--forest-100);
  --accent-foreground: var(--forest-950);
  --destructive: var(--danger);
  --border: var(--line);
  --input: var(--line-strong);
  --ring: var(--forest-800);
  --radius-control: 8px;
  --radius-card: 12px;
  --radius-badge: 999px;
}

* {
  box-sizing: border-box;
}

html {
  background: var(--paper);
}

body {
  margin: 0;
  color: var(--ink-900);
  background: var(--paper);
  font-family:
    "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Inter, sans-serif;
  font-size: 14px;
  line-height: 1.5715;
  -webkit-font-smoothing: antialiased;
}

button,
input,
textarea {
  font: inherit;
}

button,
a {
  -webkit-tap-highlight-color: transparent;
}

:focus-visible {
  outline: 2px solid var(--forest-800);
  outline-offset: 2px;
}

.mono {
  font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: no-preference) {
  .page-enter {
    animation: page-enter 180ms ease-out both;
  }
}

@keyframes page-enter {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@theme inline {
  --font-sans:
    "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Inter, sans-serif;
  --font-mono: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
  --color-paper: var(--paper);
  --color-surface: var(--surface);
  --color-forest-950: var(--forest-950);
  --color-forest-800: var(--forest-800);
  --color-forest-100: var(--forest-100);
  --color-ink-900: var(--ink-900);
  --color-ink-600: var(--ink-600);
  --color-ink-400: var(--ink-400);
  --color-line: var(--line);
  --color-line-strong: var(--line-strong);
  --color-success: var(--success);
  --color-success-light: var(--success-light);
  --color-processing: var(--processing);
  --color-processing-light: var(--processing-light);
  --color-warning: var(--warning);
  --color-warning-light: var(--warning-light);
  --color-danger: var(--danger);
  --color-danger-light: var(--danger-light);
  --color-info: var(--info);
  --color-info-light: var(--info-light);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --color-foreground: var(--foreground);
  --color-background: var(--background);
  --radius-sm: var(--radius-control);
  --radius-md: var(--radius-control);
  --radius-lg: var(--radius-control);
  --radius-xl: var(--radius-card);
  --radius-2xl: var(--radius-card);
  --radius-3xl: var(--radius-card);
  --radius-4xl: var(--radius-badge);
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
  }

  button:not(:disabled),
  [role="button"]:not([aria-disabled="true"]) {
    cursor: pointer;
  }
}
```

### `postcss.config.mjs`

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

### `components.json`

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "radix-nova",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "rtl": false,
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "menuColor": "default",
  "menuAccent": "subtle",
  "registries": {}
}
```
