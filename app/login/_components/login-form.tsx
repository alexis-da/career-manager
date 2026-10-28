"use client";

import { LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { loginAction, type LoginState } from "../actions";

const INITIAL: LoginState = { error: null };

export function LoginForm({ next }: { next: string | null }) {
  const t = useTranslations("login");
  const [state, action, pending] = useActionState(loginAction, INITIAL);

  return (
    <form action={action} className="space-y-4">
      {next !== null && <input type="hidden" name="next" value={next} />}
      <div className="space-y-1.5">
        <label htmlFor="login-password" className="eyebrow">
          {t("password")}
        </label>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          aria-invalid={state.error !== null || undefined}
          aria-describedby={state.error === null ? undefined : "login-error"}
          data-testid="login-password"
        />
        {state.error !== null && (
          <p id="login-error" role="alert" className="text-sm text-loss">
            {state.error}
          </p>
        )}
      </div>
      <Button
        type="submit"
        className="h-9 w-full font-heading text-base font-semibold"
        disabled={pending}
        data-testid="login-submit"
      >
        <LockIcon data-icon="inline-start" />
        {pending ? t("checking") : t("enter")}
      </Button>
    </form>
  );
}
