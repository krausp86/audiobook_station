import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Zwei Projekte, weil Haupt- und Renderer-Prozess unterschiedliche Laufzeiten
 * brauchen: Main-Code läuft gegen Node, Renderer-Komponenten gegen ein DOM.
 *
 * Vorher gab es nur ein Projekt mit `include: ['src/**\/*.test.ts']` — ohne `.tsx`.
 * Damit wurden die vorhandenen Komponententests stillschweigend übersprungen; sie
 * tauchten in keiner Zusammenfassung auf, weder als bestanden noch als ausgelassen
 * (DEV-02 in tasks/known-issues.md).
 *
 * Gestartet wird die Suite über `scripts/run-tests.mjs` unter Electrons Node —
 * siehe DEV-01. Das gilt für beide Projekte.
 */
const sharedAlias = {
  '@shared': resolve(__dirname, 'src/shared'),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: sharedAlias },
        test: {
          name: 'main',
          environment: 'node',
          include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        resolve: { alias: sharedAlias },
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.ts', 'src/renderer/**/*.test.tsx'],
          setupFiles: [resolve(__dirname, 'src/renderer/test-setup.ts')],
        },
      },
    ],
  },
});
