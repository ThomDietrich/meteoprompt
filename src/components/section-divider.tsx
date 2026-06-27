/**
 * A labeled horizontal section divider (spec-05 §7). Separates the page's
 * dynamic / pinned / fixed regions.
 */
export function SectionDivider({ label }: { label: string }) {
  return (
    <div className="my-8 flex items-center gap-3" role="separator">
      <span className="h-px flex-1 bg-brand-blue/20" />
      <span className="rounded-full bg-brand-blue/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-blue dark:text-sky-300">
        {label}
      </span>
      <span className="h-px flex-1 bg-brand-blue/20" />
    </div>
  );
}
