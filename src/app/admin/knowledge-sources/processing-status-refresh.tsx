"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function ProcessingStatusRefresh() {
  const router = useRouter();

  useEffect(() => {
    const interval = window.setInterval(() => {
      router.refresh();
    }, 750);

    return () => window.clearInterval(interval);
  }, [router]);

  return null;
}
