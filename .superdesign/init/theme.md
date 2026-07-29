# SeaPilot theme

## Compact token summary

- Font: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Canvas: `#f3f6f9` / `#f4f6f9`.
- Text: primary `#182132`, heading `#111827`, secondary `#536276`, muted `#667085`.
- Brand/navy: `#0c3f78`, primary action `#0c5598`, focus/interactive `#0c66b7`.
- Surfaces: white `#ffffff`, pale blue/gray `#fbfcfe`.
- Borders: `#d8e0ea`, `#c7d2df`, `#e3e9f0`.
- Success: `#1d7a48`, text `#115333`, background `#ecf9f2`.
- Danger: `#bd2d2d`, text `#7a1616`, background `#fff1f1`.
- Radius: 6px controls, 8px cards/panels; avoid pill shapes except compact status chips.
- Shadows: restrained; main elevated panels use `0 18px 45px rgba(24, 33, 50, 0.12)`.
- Layout: 286px sidebar / 82px collapsed; content is dense, operational, and desktop-first.
- Breakpoints present in source include 1500, 1240, 1100, 900, 780, 760, 720, 680, 600px.
- Motion: short 180ms transitions; respect `prefers-reduced-motion`.
- No Tailwind configuration. All styling is in `src/styles/index.css`.

## Canonical CSS source

- Full stylesheet: `src/styles/index.css` (14,499 lines).
- Root/global tokens: lines 1-260.
- App shell: lines 239-785.
- Projects module: lines 2532-3330 and 3646-4100.
- Shared project/planning controls: lines 4243-4335.
- Planning ribbon reference: lines 14099-14310.

## Root source

```css
:root {
  color: #182132;
  background: #f3f6f9;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

button,
input,
select {
  font: inherit;
}

a {
  color: inherit;
}

button {
  cursor: pointer;
}

button:disabled {
  cursor: wait;
  opacity: 0.72;
}
```

## Build styling configuration

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    maxWorkers: 4,
    pool: 'threads',
    setupFiles: './src/test/setup.ts',
    testTimeout: 20_000,
  },
});
```
