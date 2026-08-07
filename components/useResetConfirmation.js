"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const confirmationDuration = 1200;

export default function useResetConfirmation() {
  const [confirmed, setConfirmed] = useState(false);
  const timeoutRef = useRef(null);

  const showConfirmation = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setConfirmed(true);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setConfirmed(false);
    }, confirmationDuration);
  }, []);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  return [confirmed, showConfirmation];
}
