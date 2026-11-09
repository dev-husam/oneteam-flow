'use client';

import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import type { Page } from '@pt/api-client';

/** Cursor-paginated list: pages are fetched on demand and flattened. The key must include every filter. */
export function useCursorList<T>(queryKey: QueryKey, fetchPage: (cursor: string | undefined) => Promise<Page<T>>, enabled = true) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    enabled,
  });
  return {
    ...query,
    items: query.data?.pages.flatMap((p) => p.data) ?? [],
  };
}
