"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Alert, buttonClass } from "@/components/ui";
import type { FormState } from "@/server/admin-actions";

/**
 * Обёртка над формой с серверным действием: сама показывает ошибку или
 * сообщение об успехе и блокирует кнопку на время отправки.
 */
export function ActionForm({
  action,
  children,
  submitLabel = "Сохранить",
  variant = "primary",
  className,
  resetOnSuccess = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  submitLabel?: string;
  variant?: "primary" | "secondary" | "outline";
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const [formKey, setFormKey] = useState(0);
  const handledState = useRef(state);

  // После успешной отправки очищаем поля, чтобы случайно не отправить то же
  // самое дважды. Сравниваем именно ссылку на состояние: одинаковый текст
  // сообщения может прийти дважды подряд, и это тоже должно сбросить форму.
  useEffect(() => {
    if (!resetOnSuccess) return;
    if (state === handledState.current) return;
    handledState.current = state;
    if (state.message && !state.error) setFormKey((key) => key + 1);
  }, [state, resetOnSuccess]);

  return (
    <form key={formKey} action={formAction} className={className}>
      {children}
      {state.error ? (
        <div className="mt-3">
          <Alert tone="error">{state.error}</Alert>
        </div>
      ) : null}
      {state.message && !state.error ? (
        <div className="mt-3">
          <Alert tone="success">{state.message}</Alert>
        </div>
      ) : null}
      <button type="submit" disabled={pending} className={buttonClass(variant, "mt-3")}>
        {pending ? "Сохраняем…" : submitLabel}
      </button>
    </form>
  );
}

/**
 * Кнопка для действий без формы (удалить, отключить и т.п.).
 * Спрашивает подтверждение, если задан confirmText.
 */
export function ActionButton({
  action,
  label,
  confirmText,
  variant = "secondary",
  className,
}: {
  action: () => Promise<FormState>;
  label: string;
  confirmText?: string;
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          setError(null);
          startTransition(async () => {
            const result = await action();
            if (result.error) setError(result.error);
            else router.refresh();
          });
        }}
        className={buttonClass(variant, className)}
      >
        {pending ? "…" : label}
      </button>
      {error ? <span className="text-xs text-loss">{error}</span> : null}
    </span>
  );
}
