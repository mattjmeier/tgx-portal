import { Navigate, Route, Routes } from "react-router-dom";

import { RequireAuth } from "./auth/RequireAuth";
import { RequireRole } from "./auth/RequireRole";
import { AppLayout } from "./components/AppLayout";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { LoginPage } from "./pages/LoginPage";
import { ProjectCreatePage } from "./pages/ProjectCreatePage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ProjectWorkspacePage } from "./pages/ProjectWorkspacePage";
import { ReferenceLibraryPage } from "./pages/ReferenceLibraryPage";
import { StudyCreatePage } from "./pages/StudyCreatePage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate replace to="/projects" />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/new" element={<ProjectCreatePage />} />
          <Route path="/library" element={<ReferenceLibraryPage />} />
          <Route path="/projects/:projectId" element={<ProjectWorkspacePage />} />
          <Route path="/projects/:projectId/studies/new" element={<StudyCreatePage />} />
          <Route element={<RequireRole allowedRoles={["admin"]} />}>
            <Route path="/admin/users" element={<AdminUsersPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
