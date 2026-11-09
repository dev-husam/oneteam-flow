import { useSyncExternalStore } from 'react';
import type { DesignTheme } from '@pt/domain';

/**
 * What the open organization says about the design: its own design (if any) and whether it lets people choose their own.
 * The organization shell reports it; `ActiveDesign` reads it. Kept apart from the component so the shell stays light.
 */
export interface OrgDesignState {
  design: DesignTheme | null;
  personalAllowed: boolean;
}

let current: OrgDesignState | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Called by the organization shell while an organization is open (and with null when it closes). */
export function reportOrganizationDesign(next: OrgDesignState | null): void {
  current = next;
  listeners.forEach((fn) => fn());
}

export const useOrganizationDesign = (): OrgDesignState | null => useSyncExternalStore(subscribe, () => current, () => null);
