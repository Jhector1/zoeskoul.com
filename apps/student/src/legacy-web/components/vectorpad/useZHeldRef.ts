"use client";

import { useEffect, useRef, useState } from "react";

export function useZHeldRef() {
  const zHeldRef = useRef(false);
  const [zKeyUI, setZKeyUI] = useState(false);

  useEffect(() => {
    const isZ = (e: KeyboardEvent) =>
      e.code === "KeyZ" || e.key === "z" || e.key === "Z";

    const down = (e: KeyboardEvent) => {
      if (!isZ(e)) return;
      zHeldRef.current = true;
      setZKeyUI(true);
    };

    const up = (e: KeyboardEvent) => {
      if (!isZ(e)) return;
      zHeldRef.current = false;
      setZKeyUI(false);
    };

    const blur = () => {
      zHeldRef.current = false;
      setZKeyUI(false);
    };

    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    document.addEventListener("keydown", down, true);
    document.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);

    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      document.removeEventListener("keydown", down, true);
      document.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
    };
  }, []);

  return { zHeldRef, zKeyUI };
}
