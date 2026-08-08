import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "appkit-button": DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & { balance?: "show" | "hide" },
        HTMLElement
      >;
      "appkit-network-button": DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
    }
  }
}

export {};
