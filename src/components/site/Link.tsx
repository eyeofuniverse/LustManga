"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { forwardRef, useRef, type ComponentProps } from "react";

/**
 * next/link prefetches every link that scrolls into view. A page of works has a hundred of them, so one view cost a hundred
 * requests to the server (150 measured on the home page, 128 on /browse), each a function run, against one for the page.
 * This prefetches nothing by itself and only the link a mouse rests on, which is the one about to be clicked. A link that
 * should be prefetched in the usual way can still say prefetch={true}.
 */
const HOVER_MS = 120;
const Link = forwardRef<HTMLAnchorElement, ComponentProps<typeof NextLink>>(function Link({ prefetch = false, onMouseEnter, onMouseLeave, href, ...rest }, ref) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const done = useRef(false);
  const internal = typeof href === "string" && href.startsWith("/");
  return (
    <NextLink
      ref={ref}
      href={href}
      prefetch={prefetch}
      onMouseEnter={(e) => {
        onMouseEnter?.(e);
        if (prefetch !== false || !internal || done.current) return;
        timer.current = setTimeout(() => {
          done.current = true;
          router.prefetch(href as string);
        }, HOVER_MS);
      }}
      onMouseLeave={(e) => {
        onMouseLeave?.(e);
        clearTimeout(timer.current);
      }}
      {...rest}
    />
  );
});

export default Link;
