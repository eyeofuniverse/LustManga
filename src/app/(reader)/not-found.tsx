import Link from "next/link";

export default function ReaderNotFound() {
  return (
    <div data-theme="dark" className="grid min-h-dvh place-items-center bg-black px-6 text-center text-white">
      <div className="max-w-sm space-y-4">
        <p className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text font-display text-6xl font-extrabold text-transparent">404</p>
        <h1 className="font-display text-xl font-bold">Nothing to read here</h1>
        <p className="text-sm text-white/60">This work or chapter does not exist, or it was removed.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/browse" className="btn-primary">
            Browse everything
          </Link>
          <Link href="/" className="btn-soft !bg-white/10 !text-white">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
