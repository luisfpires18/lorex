import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth, RequireGuest } from './auth/routes'
import CanonPage from './pages/CanonPage'
import EntityPage from './pages/EntityPage'
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {/* Inside the session and outside the routes: every screen that draws an avatar reads the
            same one, and it is read once per signed-in account rather than once per header. */}
        <ProfileImageProvider>
          <Routes>
            <Route element={<RequireGuest />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>

            <Route element={<RequireAuth />}>
              <Route path="/app" element={<UniversesPage />} />
              <Route path="/app/profile" element={<ProfilePage />} />
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
    </BrowserRouter>
  )
}
