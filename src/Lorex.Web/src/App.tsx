import { createBrowserRouter, Navigate, Route, RouterProvider, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth, RequireGuest } from './auth/routes'
import { HistoryLeaveGuard } from './lib/leaveGuard'
import CanonPage from './pages/CanonPage'
import EntityPage from './pages/EntityPage'
import IdeaPage from './pages/IdeaPage'
import IdeasPage from './pages/IdeasPage'
import LoginPage from './pages/LoginPage'
import LorePage from './pages/LorePage'
import ProfilePage from './pages/ProfilePage'
import { ProfileImageProvider } from './profile/ProfileImageProvider'
import RegisterPage from './pages/RegisterPage'
import StoriesPage from './pages/StoriesPage'
import StoryPage from './pages/StoryPage'
import TimelinePage from './pages/TimelinePage'
import UniverseOverview from './pages/UniverseOverview'
import UniverseSettings from './pages/UniverseSettings'
import UniverseTrash from './pages/UniverseTrash'
import UniverseTypes from './pages/UniverseTypes'
import UniverseWorkspace from './pages/UniverseWorkspace'
import UniversesPage from './pages/UniversesPage'

/** The app's providers and routes, exactly as they are declared - the router below only holds them. */
function Root() {
  return (
    <AuthProvider>
      {/* Inside the session and outside the routes: every screen that draws an avatar reads the
          same one, and it is read once per signed-in account rather than once per header. */}
      <ProfileImageProvider>
        <HistoryLeaveGuard />
        <Routes>
          <Route element={<RequireGuest />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          <Route element={<RequireAuth />}>
            <Route path="/app" element={<UniversesPage />} />
            <Route path="/app/profile" element={<ProfilePage />} />
            <Route path="/app/ideas" element={<IdeasPage />} />
            <Route path="/app/ideas/new" element={<IdeaPage isNew />} />
            <Route path="/app/ideas/:ideaId" element={<IdeaPage />} />
            <Route path="/app/universes/:id" element={<UniverseWorkspace />}>
              <Route index element={<UniverseOverview />} />
              <Route path="lore" element={<LorePage />} />
              <Route path="lore/new" element={<EntityPage />} />
              <Route path="lore/:entityId" element={<EntityPage />} />
              <Route path="timeline" element={<TimelinePage />} />
              <Route path="stories" element={<StoriesPage />} />
              <Route path="stories/:storyId" element={<StoryPage view="scenes" />} />
              <Route path="stories/:storyId/plot" element={<StoryPage view="plot" />} />
              <Route
                path="stories/:storyId/manuscript/:sceneId?"
                element={<StoryPage view="manuscript" />}
              />
              <Route path="ideas" element={<IdeasPage inUniverse />} />
              <Route path="ideas/new" element={<IdeaPage inUniverse isNew />} />
              <Route path="ideas/:ideaId" element={<IdeaPage inUniverse />} />
              <Route path="canon" element={<CanonPage />} />
              <Route path="types" element={<UniverseTypes />} />
              <Route path="trash" element={<UniverseTrash />} />
              <Route path="settings" element={<UniverseSettings />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </ProfileImageProvider>
    </AuthProvider>
  )
}

/**
 * A data router with one catch-all route, and the app's own `<Routes>` inside it unchanged. It is a data router for one
 * reason: only a data router can hold the browser's Back and Forward and put the history back where it was, and unsaved
 * writing needs that (`HistoryLeaveGuard`, ADR 0028). Every route, layout and link resolves as it did under
 * `BrowserRouter`.
 */
const router = createBrowserRouter([{ path: '*', element: <Root /> }])

export default function App() {
  return <RouterProvider router={router} />
}
