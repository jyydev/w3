"use client";

import { useEffect, useRef, useState } from "react";

function isInsideDirectPanel(root, target, panelClassName) {
  return Array.from(root?.children || []).some(
    (child) =>
      child.classList?.contains(panelClassName) && child.contains(target),
  );
}

export default function useOverlayInteraction({
  activation = "hover",
  open,
  forceOpen = false,
  onOpenChange,
  disabled = false,
  panelClassName,
  triggerClassName = "",
  onClick,
}) {
  const rootRef = useRef(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const suppressTouchClickUntilRef = useRef(0);
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = open !== undefined;
  const overlayOpen =
    !disabled && ((controlled ? !!open : internalOpen) || !!forceOpen);
  onOpenChangeRef.current = onOpenChange;

  function changeOpen(nextOpen) {
    const finalOpen = disabled ? false : nextOpen;
    if (!controlled) setInternalOpen(finalOpen);
    onOpenChangeRef.current?.(finalOpen);
  }

  function isPanelTarget(target) {
    return isInsideDirectPanel(rootRef.current, target, panelClassName);
  }

  function isTriggerTarget(target) {
    if (isPanelTarget(target)) return false;
    if (!triggerClassName) return true;
    const trigger = target?.closest?.(`.${triggerClassName}`);
    return !!trigger && rootRef.current?.contains(trigger);
  }

  useEffect(() => {
    if (!overlayOpen) return;

    function closeOnOutsidePointer(e) {
      if (rootRef.current?.contains(e.target)) return;
      if (!controlled) setInternalOpen(false);
      onOpenChangeRef.current?.(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [controlled, overlayOpen]);

  useEffect(() => {
    if (disabled) setInternalOpen(false);
  }, [disabled]);

  return {
    overlayOpen,
    rootRef,
    interactionProps: {
      onBlur(e) {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          changeOpen(false);
        }
      },
      onClick(e) {
        onClick?.(e);
        if (
          activation == "click" &&
          !e.defaultPrevented &&
          isTriggerTarget(e.target)
        ) {
          changeOpen(!overlayOpen);
        }
      },
      onClickCapture(e) {
        if (
          !disabled &&
          activation == "hover" &&
          Date.now() < suppressTouchClickUntilRef.current &&
          !e.defaultPrevented &&
          isTriggerTarget(e.target)
        ) {
          suppressTouchClickUntilRef.current = 0;
          e.preventDefault();
          e.stopPropagation();
        }
      },
      onFocus(e) {
        if (activation == "hover") changeOpen(true);
      },
      onMouseEnter() {
        if (activation == "hover") changeOpen(true);
      },
      onMouseLeave() {
        changeOpen(false);
      },
      onPointerDown(e) {
        if (
          !disabled &&
          activation == "hover" &&
          e.pointerType != "mouse" &&
          !overlayOpen &&
          !e.defaultPrevented &&
          isTriggerTarget(e.target)
        ) {
          suppressTouchClickUntilRef.current = Date.now() + 750;
          changeOpen(true);
        }
      },
    },
  };
}
