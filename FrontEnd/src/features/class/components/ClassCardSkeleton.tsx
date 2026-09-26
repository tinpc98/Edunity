export default function ClassCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-0 overflow-hidden flex flex-col h-full animate-pulse">
      {/* Thumbnail skeleton */}
      <div className="h-36 bg-slate-200 w-full" />

      {/* Content skeleton */}
      <div className="p-3.5 flex flex-col flex-1 gap-2.5">
        <div className="flex items-center justify-between">
          <div className="h-4 bg-slate-200 rounded w-24" />
          <div className="h-4 bg-slate-200 rounded w-12" />
        </div>

        <div className="space-y-1.5 py-0.5">
          <div className="h-4 bg-slate-200 rounded w-full" />
          <div className="h-4 bg-slate-200 rounded w-3/4" />
          <div className="h-3 bg-slate-100 rounded w-1/2 pt-1" />
        </div>

        <div className="h-12 bg-slate-100 rounded-lg p-2" />

        <div className="mt-auto pt-2.5 border-t border-slate-100 flex flex-col gap-2.5">
          <div>
            <div className="h-3 bg-slate-100 rounded w-16 mb-1" />
            <div className="h-5 bg-slate-200 rounded w-24" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 bg-slate-200 rounded flex-1" />
            <div className="h-8 bg-slate-200 rounded flex-1" />
          </div>
        </div>
      </div>
    </div>
  );
}
