/** A round badge with the first letter of the name, in a colour taken from the name (so it is the same everywhere). No uploads. */
const HUES = [340, 12, 28, 160, 190, 215, 255, 285, 310];
export function hueOf(handle: string): number {
  let h = 0;
  for (const c of handle) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length]!;
}

export function Avatar({ name, handle, size = 40 }: { name: string; handle: string; size?: number }) {
  const hue = hueOf(handle);
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 select-none place-items-center rounded-full font-display font-extrabold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: `linear-gradient(135deg, hsl(${hue} 70% 52%), hsl(${(hue + 40) % 360} 70% 42%))` }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
