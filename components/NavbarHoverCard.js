"use client";

import useOverlayInteraction from "./useOverlayInteraction";

export default function NavbarHoverCard({
  as: Root = "span",
  className = "",
  openClassName = "navHoverCardOpen",
  panelClassName = "navQuickFavCard",
  triggerClassName = "",
  children,
  ...props
}) {
  const { overlayOpen, rootRef, interactionProps } = useOverlayInteraction({
    activation: "hover",
    panelClassName,
    triggerClassName,
  });

  return (
    <Root
      {...props}
      {...interactionProps}
      ref={rootRef}
      className={[className, overlayOpen ? openClassName : ""]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Root>
  );
}
