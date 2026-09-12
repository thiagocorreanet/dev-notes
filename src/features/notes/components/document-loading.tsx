import { Skeleton } from '@/components/ui/skeleton'

export function DocumentLoading() {
  return (
    <div
      role="status"
      aria-label="Abrindo documento"
      className="space-y-8 px-4 py-8 sm:px-6 lg:px-8"
    >
      <span className="sr-only">Abrindo documento…</span>
      <div aria-hidden="true" className="space-y-8">
        <Skeleton className="h-10 w-3/5" />
        <Skeleton className="h-3 w-40" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <Skeleton className="h-7 w-2/5" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  )
}
