/*
  Registration for the installable app shell. The worker itself is `public/sw.js`, and its
  header states what it does and does not cache.

  Registration is production-only on purpose. In development Vite serves unhashed modules
  and rewrites them on every edit, so a cache-first worker would be actively harmful, and
  the end-to-end suite runs against the dev server. `sw.js` is still served in development,
  which lets a test register it deliberately and assert what it refuses to cache.
*/
export function registerServiceWorker() {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // An install that fails costs nothing: the app is server-backed and needs no worker
      // to run. Only the install prompt is lost, so there is nothing to report.
    })
  })
}
