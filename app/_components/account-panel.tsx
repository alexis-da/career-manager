import Image from "next/image";
import { LogOutIcon } from "lucide-react";
import type { CurrentUser } from "@/src/auth/current-user";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";
import { signInWithGoogleAction, signOutAction } from "../actions";

/** Google's "G", in its colours: the mark its sign-in buttons carry. */
function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-4">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/**
 * The player's account, on the pages outside a save (inside a .brand scope): « Continuer avec Google » when not
 * signed in, an anonymous player included; the account's name, picture and « Se déconnecter » otherwise.
 */
export function AccountPanel({ user, className }: { user: CurrentUser | null; className?: string }) {
  if (user === null || user.kind !== "REGISTERED") {
    return (
      <form action={signInWithGoogleAction} lang="fr" className={className}>
        <Button type="submit" variant="outline" className="h-9 gap-2 font-semibold">
          <GoogleMark />
          Continuer avec Google
        </Button>
      </form>
    );
  }
  const label = user.name ?? user.email ?? "Compte Google";
  return (
    <div lang="fr" className={cn("flex items-center gap-3", className)}>
      {user.image !== null && (
        // Google's picture as it is: no image optimisation for a remote host.
        <Image src={user.image} alt="" width={32} height={32} unoptimized referrerPolicy="no-referrer" className="size-8 rounded-full" />
      )}
      <span className="text-sm font-semibold" data-testid="account-name">
        {label}
      </span>
      <form action={signOutAction}>
        <Button type="submit" variant="ghost" size="sm" className="gap-1.5">
          <LogOutIcon data-icon="inline-start" />
          Se déconnecter
        </Button>
      </form>
    </div>
  );
}
