"use client";

// eslint-disable-next-line no-restricted-imports -- the one place next/link is used: every link of the app goes through here
import NextLink from "next/link";
// The router's context, as next/link reads it: null outside the App Router (a component rendered by a unit test), where
// useRouter would throw.
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { useContext, type ComponentProps, type MouseEvent } from "react";

type LinkProps = Omit<ComponentProps<typeof NextLink>, "prefetch" | "href"> & { href: string };

/**
 * A link of the app, without Next's automatic prefetching (chantier « cpu », 11/11): next/link prefetches every link in
 * view, again after every Server Action (a matchday played refreshes the router), and each prefetch is a server
 * invocation, three to four times the requests a player makes. This one prefetches its page only when a pointer hovers
 * it (router.prefetch, deduplicated by the router's cache), never on a touch screen: the navigation itself stays as it
 * was, its page fetched on the click.
 */
export default function Link({ href, onMouseEnter, ...props }: LinkProps) {
  const router = useContext(AppRouterContext);
  return (
    <NextLink
      href={href}
      prefetch={false}
      onMouseEnter={(event: MouseEvent<HTMLAnchorElement>) => {
        onMouseEnter?.(event);
        router?.prefetch(href);
      }}
      {...props}
    />
  );
}
