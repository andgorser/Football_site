"use client";

import { useActionState } from "react";

import { Alert, Field, buttonClass, inputClass } from "@/components/ui";
import { loginAction, type LoginState } from "@/server/auth-actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <Field label="Email">
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          placeholder="referee1@msu.football"
          className={inputClass}
        />
      </Field>

      <Field label="Пароль">
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </Field>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <button type="submit" disabled={pending} className={buttonClass("primary", "w-full")}>
        {pending ? "Проверяем…" : "Войти"}
      </button>
    </form>
  );
}
