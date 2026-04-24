import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { RequireAuth } from "./auth/RequireAuth";
import { RequireRole } from "./auth/RequireRole";
import { AppLayout } from "./components/AppLayout";
import {
  collaborationCreatePath,
  collaborationRegistryPath,
  globalStudyCreateRoute,
  legacyProjectPathToCollaborationPath,
  studiesIndexPath,
} from "./lib/routes";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { ProjectCreatePage } from "./pages/ProjectCreatePage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ProjectWorkspacePage } from "./pages/ProjectWorkspacePage";
import { ReferenceLibraryPage } from "./pages/ReferenceLibraryPage";
import { StudiesPage } from "./pages/StudiesPage";
import { StudyOnboardingPage } from "./pages/StudyOnboardingPage";
import { StudyCreatePage } from "./pages/StudyCreatePage";
import { StudyWorkspacePage } from "./pages/StudyWorkspacePage";

function LegacyProjectRedirect() {
  const location = useLocation();

  return (
    <Navigate
      replace
      to={{
        pathname: legacyProjectPathToCollaborationPath(location.pathname),
        search: location.search,
        hash: location.hash,
      }}
    />
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<LandingPage />} />
          <Route path={collaborationRegistryPath} element={<ProjectsPage />} />
          <Route path={collaborationCreatePath} element={<ProjectCreatePage />} />
          <Route path={studiesIndexPath} element={<StudiesPage />} />
          <Route path="/library" element={<ReferenceLibraryPage />} />
          <Route path="/studies/:studyId/onboarding" element={<StudyOnboardingPage />} />
          <Route path="/studies/:studyId" element={<StudyWorkspacePage />} />
          <Route path={`${collaborationRegistryPath}/:projectId`} element={<ProjectWorkspacePage />} />
          <Route path={`${collaborationRegistryPath}/:projectId/studies/new`} element={<StudyCreatePage />} />
          <Route path={globalStudyCreateRoute} element={<StudyCreatePage />} />
          <Route path="/projects/*" element={<LegacyProjectRedirect />} />
          <Route element={<RequireRole allowedRoles={["admin"]} />}>
            <Route path="/admin/users" element={<AdminUsersPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
