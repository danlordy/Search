"use client";

import { useEffect } from "react";

export function DynamicGradientBackground() {
  useEffect(() => {
    const root = document.documentElement;

    const updateAngle = (x: number, width: number) => {
      const safeWidth = Math.max(width, 1);
      const angle = (x / safeWidth) * 360;
      root.style.setProperty("--app-gradient-angle", `${angle.toFixed(2)}deg`);
    };

    const onMouseMove = (event: MouseEvent) => {
      updateAngle(event.clientX, window.innerWidth);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 0) {
        updateAngle(event.touches[0].clientX, window.innerWidth);
      }
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  return null;
}
