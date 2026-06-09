import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export function renderPortal(node: ReactNode, container?: Element | DocumentFragment | null): ReactNode {
  const target = container ?? (typeof document !== "undefined" ? document.body : null);
  return target ? createPortal(node, target) : node;
}
