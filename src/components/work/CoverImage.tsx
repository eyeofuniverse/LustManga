"use client";

import { useEffect, useRef, useState } from "react";
import { cdn, thumbUrl } from "@/lib/cdn";

/**
 * A cover that never causes layout shift (the parent sets the aspect ratio), fades in once decoded, and falls
 * back to the full-size cover if the small one is missing. Handles the case where the image finished loading
 * before React hydrated (onLoad would never fire).
 */
export function CoverImage({
  coverKey,
  alt = "",
  priority = false,
  small = true,
  className = "",
}: {
  coverKey: string | null;
  alt?: string;
  priority?: boolean;
  small?: boolean;
  className?: string;
}) {
  const full = cdn(coverKey);
  const [src, setSrc] = useState((small ? thumbUrl(coverKey) : full) ?? undefined);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = ref.current;
    if (!img || !img.complete) return;
    if (img.naturalWidth > 0) setLoaded(true);
    else if (full && src !== full) setSrc(full); // errored before hydration
  }, [full, src]);

  if (!coverKey) return <div className="absolute inset-0 grid place-items-center bg-surface-2 text-xs text-muted">No cover</div>;

  return (
    <>
      <div data-done={loaded} className="skeleton absolute inset-0 transition-opacity duration-500 data-[done=true]:opacity-0" aria-hidden="true" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => full && src !== full && setSrc(full)}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"} ${className}`}
      />
    </>
  );
}
