import { useQuery } from "@tanstack/react-query";

import { fetchStudiesIndex } from "../api/studies";

export const recentStudiesQueryOptions = {
  ordering: "-updated_at",
  pageSize: 5,
} as const;

export function useRecentStudies() {
  return useQuery({
    queryKey: ["studies-index", "recent", recentStudiesQueryOptions],
    queryFn: () => fetchStudiesIndex(recentStudiesQueryOptions),
    retry: false,
  });
}
