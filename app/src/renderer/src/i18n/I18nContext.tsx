import { createContext, useContext, type ReactNode } from 'react';
import de from './de.json';

type Dict = Record<string, string>;
const dict: Dict = de;

function translate(key: string): string {
  return dict[key] ?? key; // fallback: key visible, never empty
}

const I18nContext = createContext<(key: string) => string>(translate);

export function I18nProvider({ children }: { children: ReactNode }): React.JSX.Element {
  return <I18nContext.Provider value={translate}>{children}</I18nContext.Provider>;
}

export function useT(): (key: string) => string {
  return useContext(I18nContext);
}
