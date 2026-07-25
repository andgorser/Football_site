"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Пока матч идёт, страница сама подтягивает свежие данные с сервера.
 * Обновление ставится на паузу, когда вкладка неактивна — незачем
 * дёргать базу ради страницы, на которую никто не смотрит.
 */
export function LiveRefresher({ intervalMs = 20_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => router.refresh(), intervalMs);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, intervalMs]);

  return null;
}
