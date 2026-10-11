import { Card } from "./ui";

/**
 * What a console page looks like while its data is still loading. Every route has a loading.tsx that renders one of these, so
 * a click answers at once (and Next can prefetch the page): the layout stays put and only this part is swapped in.
 */

const Bar = ({ w = "w-full", h = "h-3", className = "" }: { w?: string; h?: string; className?: string }) => <div className={`skeleton rounded-md ${w} ${h} ${className}`} />;

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading {label}…</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

function Header({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-6 sm:mb-7">
      <div className="space-y-2.5">
        <Bar w="w-44 sm:w-56" h="h-8" />
        <Bar w="w-72 max-w-full" h="h-3" />
      </div>
      {withAction && <Bar w="hidden w-44 sm:block" h="h-10" className="!rounded-lg" />}
    </div>
  );
}

function Toolbar() {
  return (
    <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_11rem_5rem]">
      <Bar h="h-10" className="col-span-2 !rounded-lg sm:col-span-1" />
      <Bar h="h-10" className="!rounded-lg" />
      <Bar h="h-10" className="!rounded-lg" />
      <Bar h="h-10" className="col-span-2 !rounded-lg sm:col-span-1" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <Frame label="the dashboard">
      <Header withAction />
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Bar key={i} h="h-[76px]" className="!rounded-2xl" />)}</div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Bar key={i} h="h-[132px]" className={`!rounded-2xl ${i === 4 ? "col-span-2 lg:col-span-1" : ""}`} />)}</div>
      <div className="grid gap-4 xl:grid-cols-5">
        <Bar h="h-[420px]" className="!rounded-2xl xl:col-span-3" />
        <Bar h="h-[420px]" className="!rounded-2xl xl:col-span-2" />
      </div>
    </Frame>
  );
}

/** A filter bar and a list of rows: Works, Tags, Audit log, Ingest runs. */
export function ListSkeleton({ label, rows = 8, toolbar = true, tall = false }: { label: string; rows?: number; toolbar?: boolean; tall?: boolean }) {
  return (
    <Frame label={label}>
      <Header />
      {toolbar && <Toolbar />}
      <Card pad={false}>
        <ul className="c-divide">
          {Array.from({ length: rows }, (_, i) => (
            <li key={i} className="flex items-center gap-3.5 p-4">
              <Bar w="w-[46px]" h={tall ? "h-[66px]" : "h-10"} className="shrink-0 !rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2.5">
                <Bar w={i % 3 === 0 ? "w-3/5" : i % 3 === 1 ? "w-2/5" : "w-1/2"} h="h-3.5" />
                <Bar w="w-1/3" h="h-2.5" />
              </div>
              <Bar w="hidden w-24 sm:block" h="h-8" className="!rounded-lg" />
            </li>
          ))}
        </ul>
      </Card>
    </Frame>
  );
}

/** Tabs and a stack of tall cards: the review queue, reports, duplicates. */
export function CardsSkeleton({ label, count = 3, tabs = true }: { label: string; count?: number; tabs?: boolean }) {
  return (
    <Frame label={label}>
      <Header />
      {tabs && <Bar w="w-72 max-w-full" h="h-10" className="mb-5 !rounded-xl" />}
      <div className="space-y-4">
        {Array.from({ length: count }, (_, i) => (
          <Card key={i} pad={false}>
            <div className="flex flex-col gap-4 p-5 lg:flex-row">
              <div className="flex gap-2 lg:w-[352px] lg:shrink-0">
                <Bar w="w-[104px]" h="h-[148px]" className="shrink-0 !rounded-lg" />
                <div className="hidden flex-1 grid-cols-3 gap-2 sm:grid">{Array.from({ length: 5 }, (_, k) => <Bar key={k} h="h-[92px]" className="!rounded-lg" />)}</div>
              </div>
              <div className="flex-1 space-y-3">
                <Bar w="w-48" h="h-3" />
                <Bar w="w-3/4" h="h-5" />
                <Bar w="w-40" h="h-5" />
                <Bar w="w-full" h="h-3" />
                <Bar w="w-5/6" h="h-3" />
              </div>
            </div>
            <div className="flex gap-2 border-t border-line px-5 py-3"><Bar w="w-24" h="h-9" className="!rounded-lg" /><Bar w="w-24" h="h-9" className="!rounded-lg" /></div>
          </Card>
        ))}
      </div>
    </Frame>
  );
}
