"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };

/** Contains a render error to one dashboard section so the rest of the page still draws. */
export class SectionBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    if (this.state.failed) return <p className="fail">This section failed to draw.</p>;
    return this.props.children;
  }
}
