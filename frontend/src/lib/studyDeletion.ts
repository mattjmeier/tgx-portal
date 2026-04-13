import type { QueryClient } from "@tanstack/react-query";

import type { PaginatedResponse } from "../api/projects";
import type { Study } from "../api/studies";

export function onboardingDraftStorageKey(studyId: number) {
  return `tgx:onboarding:v2:study:${studyId}`;
}

function removeStudyFromPaginatedResponse(
  data: PaginatedResponse<Study> | undefined,
  deletedStudyId: number,
): PaginatedResponse<Study> | undefined {
  if (!data) {
    return data;
  }

  const nextResults = data.results.filter((study) => study.id !== deletedStudyId);
  if (nextResults.length === data.results.length) {
    return data;
  }

  return {
    ...data,
    count: Math.max(0, data.count - (data.results.length - nextResults.length)),
    results: nextResults,
  };
}

export function clearDeletedStudyClientState(queryClient: QueryClient, deletedStudyId: number) {
  localStorage.removeItem(onboardingDraftStorageKey(deletedStudyId));

  queryClient.removeQueries({ queryKey: ["study", deletedStudyId], exact: true });
  queryClient.removeQueries({ queryKey: ["study-onboarding-state", deletedStudyId], exact: true });
  queryClient.setQueriesData<PaginatedResponse<Study> | undefined>(
    {
      predicate: (query) => {
        const rootKey = query.queryKey[0];
        return rootKey === "studies" || rootKey === "studies-index";
      },
    },
    (data) => removeStudyFromPaginatedResponse(data, deletedStudyId),
  );
}
