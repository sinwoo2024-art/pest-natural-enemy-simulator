"use client";

import { createContext, useContext } from "react";
import type { HeroBootstrapPayload } from "./hero-bootstrap-client";

export type ServerInitialBootstrap = {
  health: { status?: string } | null;
  summary: unknown;
  options: unknown;
  compare: unknown;
  filtered_options: unknown;
  simulation: unknown;
  errors: Record<string, string>;
  complete: boolean;
};

export type InitialPageData = {
  condition: { crop: string; pest: string; region: string };
  bootstrap: ServerInitialBootstrap | null;
  hero: HeroBootstrapPayload<unknown, unknown> | null;
  generated_at: string;
};

const InitialPageContext = createContext<InitialPageData | null>(null);

export function InitialPageDataProvider({
  value,
  children,
}: {
  value: InitialPageData | null;
  children: React.ReactNode;
}) {
  return <InitialPageContext.Provider value={value}>{children}</InitialPageContext.Provider>;
}

export function useInitialPageData() {
  return useContext(InitialPageContext);
}
