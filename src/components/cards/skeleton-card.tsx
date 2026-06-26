"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Skeleton placeholder shown immediately on submit, before the server answers
 * (spec-03 §6). The header already carries the query as subtitle; the body is a
 * shimmering placeholder (the `.shimmer` sweep is defined in globals.css).
 * Replaced by the real card(s) on success, or removed on error.
 */
export function SkeletonCard({ originQuery }: { originQuery: string }) {
  return (
    <Card className="h-full w-full">
      <CardHeader>
        <CardTitle>
          <span className="inline-block h-3 w-32 animate-pulse rounded bg-slate-300/70 align-middle dark:bg-slate-600/60" />
        </CardTitle>
        <CardDescription className="truncate" title={originQuery}>
          {originQuery}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="shimmer h-full w-full rounded-md bg-slate-200/70 dark:bg-slate-700/40" />
      </CardContent>
    </Card>
  );
}
