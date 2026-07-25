import Link from "next/link";

import { buttonClass } from "@/components/ui";

export const metadata = { title: "Нет доступа" };

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-5xl font-black text-subtle">403</p>
      <h1 className="mt-3 text-xl font-bold">Недостаточно прав</h1>
      <p className="mt-2 text-sm text-muted">
        Этот раздел доступен организаторам и судьям. Если вам нужен доступ —
        напишите организатору турнира.
      </p>
      <Link href="/" className={buttonClass("secondary", "mt-6")}>
        На главную
      </Link>
    </div>
  );
}
