import { Skeleton } from "@/components/ui/skeleton"

// Shown while a dashboard page reads its data, so a click on the sidebar
// answers at once instead of the old page hanging there.
export default function DashboardLoading() {
  return (
    <div className="min-h-0 flex-1 overflow-hidden" aria-busy="true">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </div>
  )
}
