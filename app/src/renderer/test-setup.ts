/**
 * Setup für Renderer-Tests (Projekt „renderer" in `vitest.config.ts`).
 *
 * Ergänzt `expect` um die DOM-Matcher von Testing Library — `toBeInTheDocument()`,
 * `toHaveClass()` und Verwandte. Die vorhandenen Komponententests benutzen sie
 * bereits; ohne diesen Import wären sie nicht definiert.
 *
 * Bewusst nur für das Renderer-Projekt: Im Main-Projekt gibt es kein DOM.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Gerendertes DOM nach jedem Test abräumen.
 *
 * Testing Library hängt sich dafür normalerweise selbst in `afterEach` — aber nur,
 * wenn `globals: true` gesetzt ist. Das ist hier nicht der Fall (Tests importieren
 * `describe`/`it`/`expect` explizit), also muss es von Hand passieren. Ohne das
 * sammelt sich das DOM über die Tests hinweg an, und Abfragen wie
 * `getByRole('button', …)` finden plötzlich mehrere Treffer.
 */
afterEach(() => {
  cleanup();
});
