import type { ReactNode } from "react";

export function renderPortal(node: ReactNode, _container?: Element | DocumentFragment | null): ReactNode {
  return node;
}
