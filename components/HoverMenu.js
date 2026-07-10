"use client";

import useOverlayInteraction from "./useOverlayInteraction";

export default function HoverMenu({
  as: Root = "div",
  open,
  onOpenChange,
  disabled = false,
  className = "",
  children,
  ...props
}) {
  const { overlayOpen, rootRef, interactionProps } = useOverlayInteraction({
    open,
    onOpenChange,
    disabled,
    panelClassName: "navigationMenuPanel",
    triggerClassName: "navigationMenuTrigger",
  });

  return (
    <Root
      {...props}
      {...interactionProps}
      ref={rootRef}
      className={[
        "navigationMenu",
        overlayOpen ? "navMenuOpen" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Root>
  );
}
