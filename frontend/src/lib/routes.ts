export const collaborationRegistryPath = "/collaborations";
export const collaborationCreatePath = "/collaborations/new";
export const globalStudyCreateRoute = "/studies/new";

export function collaborationPath(projectId: number | string): string {
  return `${collaborationRegistryPath}/${projectId}`;
}

export function collaborationStudyCreatePath(projectId: number | string): string {
  return `${collaborationPath(projectId)}/studies/new`;
}

export function globalStudyCreatePath(projectId?: number | null): string {
  if (!projectId) {
    return globalStudyCreateRoute;
  }

  return `${globalStudyCreateRoute}?collaboration=${projectId}`;
}

export function legacyProjectPathToCollaborationPath(pathname: string): string {
  return pathname.replace(/^\/projects(?=\/|$)/, collaborationRegistryPath);
}
