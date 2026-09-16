import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate, Route, RouterProvider, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth, RequireGuest } from './auth/routes'
import { HistoryLeaveGuard } from './lib/leaveGuard'
import { ProfileImageProvider } from './profile/ProfileImageProvider'
import UniverseOverview from './pages/UniverseOverview'
import UniverseWorkspace from './pages/UniverseWorkspace'

/*
 * Screens are fetched when they are first opened, not when Lorex is.
 *
 * Everything below this comment is a leaf: a screen the author reaches by going somewhere. The
 * shell they go there from - the providers, the guards, the workspace chrome and its overview -
 * is imported directly above, because making the chrome a chunk of its own would only mean
 * fetching the frame before the frame can say which screen to fetch next. That is the waterfall
 * this split exists to avoid, not to create.
 *
 * `EntityPage` is why this is worth doing: it carries the rich-text editor, which is the largest
 * dependency Lorex has and is needed on exactly one screen.
 */
const CanonPage = lazy(() => import('./pages/CanonPage'))
const EntityPage = lazy(() => import('./pages/EntityPage'))
const FamilyTreePage = lazy(() => import('./pages/FamilyTreePage'))
const IdeaPage = lazy(() => import('./pages/IdeaPage'))
const IdeasPage = lazy(() => import('./pages/IdeasPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const LorePage = lazy(() => import('./pages/LorePage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const StoriesPage = lazy(() => import('./pages/StoriesPage'))
const StoryPage = lazy(() => import('./pages/StoryPage'))
const TimelinePage = lazy(() => import('./pages/TimelinePage'))
const UniverseSettings = lazy(() => import('./pages/UniverseSettings'))
const UniverseTrash = lazy(() => import('./pages/UniverseTrash'))
const UniverseTypes = lazy(() => import('./pages/UniverseTypes'))
const UniversesPage = lazy(() => import('./pages/UniversesPage'))
const WorldRulePage = lazy(() => import('./pages/WorldRulePage'))
const WorldRulesPage = lazy(() => import('./pages/WorldRulesPage'))

/**
 * Held while a whole screen's code is fetched. The same plate the session probe holds behind
 * (`SessionPending`): the paper the app is about to draw on, so nothing flashes and nothing moves.
 */
function ScreenPending() {
  return <div className="session-pending" role="status" aria-label="Loading this screen" />
}

/** The same hold inside a universe, where the rail, the sidebar and the search stay put around it. */
function SectionPending() {
  return (
    <p className="notice" role="status">
      Opening&hellip;
    </p>
  )
}

/**
 * A screen behind its own boundary, keyed by which screen it is.
 *
 * The key is what makes leaving honest. Without one, React reconciles the outgoing screen against
 * the incoming one, and while the incoming code is still being fetched it holds the outgoing screen
 * on the page - past the moment the address changed, and past the moment an author answered "yes,
 * leave" to an editor's unsaved-changes question. An editor that is still mounted is still guarding,
 * so the browser would ask a second time about a departure already agreed to (`useLeaveGuard`).
 * A changed key unmounts the screen being left in the same commit, exactly as a direct import did.
 *
 * Screens that are one component over several addresses share one key, so they keep their state as
 * they always have: an entry across entries, a story across its scenes, plot and manuscript.
 */
function screen(key: string, hold: ReactNode, page: ReactNode) {
  return (
    <Suspense key={key} fallback={hold}>
      {page}
    </Suspense>
  )
}

const asScreen = (key: string, page: ReactNode) => screen(key, <ScreenPending />, page)
const asSection = (key: string, page: ReactNode) => screen(key, <SectionPending />, page)

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
            <Route path="/login" element={asScreen('login', <LoginPage />)} />
            <Route path="/register" element={asScreen('register', <RegisterPage />)} />
          </Route>

          <Route element={<RequireAuth />}>
            <Route path="/app" element={asScreen('universes', <UniversesPage />)} />
            <Route path="/app/profile" element={asScreen('profile', <ProfilePage />)} />
            <Route path="/app/ideas" element={asScreen('ideas', <IdeasPage />)} />
            <Route path="/app/ideas/new" element={asScreen('idea', <IdeaPage isNew />)} />
            <Route path="/app/ideas/:ideaId" element={asScreen('idea', <IdeaPage />)} />
            <Route path="/app/universes/:id" element={<UniverseWorkspace />}>
              <Route index element={<UniverseOverview />} />
              <Route path="lore" element={asSection('lore', <LorePage />)} />
              <Route path="lore/new" element={asSection('entry', <EntityPage />)} />
              <Route path="lore/:entityId" element={asSection('entry', <EntityPage />)} />
              <Route path="family-tree" element={asSection('family-tree', <FamilyTreePage />)} />
              <Route
                path="family-tree/:entityId"
                element={asSection('family-tree', <FamilyTreePage />)}
              />
              <Route path="timeline" element={asSection('timeline', <TimelinePage />)} />
              <Route path="world-rules" element={asSection('world-rules', <WorldRulesPage />)} />
              <Route path="world-rules/new" element={asSection('rule', <WorldRulePage isNew />)} />
              <Route path="world-rules/:ruleId" element={asSection('rule', <WorldRulePage />)} />
              <Route path="stories" element={asSection('stories', <StoriesPage />)} />
              <Route
                path="stories/:storyId"
                element={asSection('story', <StoryPage view="scenes" />)}
              />
              <Route
                path="stories/:storyId/plot"
                element={asSection('story', <StoryPage view="plot" />)}
              />
              <Route
                path="stories/:storyId/manuscript/:sceneId?"
                element={asSection('story', <StoryPage view="manuscript" />)}
              />
              <Route path="ideas" element={asSection('ideas', <IdeasPage inUniverse />)} />
              <Route path="ideas/new" element={asSection('idea', <IdeaPage inUniverse isNew />)} />
              <Route path="ideas/:ideaId" element={asSection('idea', <IdeaPage inUniverse />)} />
              <Route path="canon" element={asSection('canon', <CanonPage />)} />
              <Route path="types" element={asSection('types', <UniverseTypes />)} />
              <Route path="trash" element={asSection('trash', <UniverseTrash />)} />
              <Route path="settings" element={asSection('settings', <UniverseSettings />)} />
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
