export function DevNotesBrand() {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/devnotes-icon.svg"
        alt=""
        width={36}
        height={36}
        className="size-9 shrink-0"
      />
      <span className="text-2xl font-bold tracking-tight" aria-label="DevNotes">
        Dev<span className="text-brand">Notes</span>
      </span>
    </div>
  )
}
