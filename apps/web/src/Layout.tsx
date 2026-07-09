import { Outlet } from 'react-router-dom'

import { Sidebar } from '@/components/Sidebar'
import { WorkspaceProvider } from '@/workspace/WorkspaceContext'

/**
 * App shell: the persistent sidebar (with the account section) plus the routed
 * page in the main pane. The workspace state provider wraps both so the sidebar
 * model list and the workspace page share one source of truth across routes.
 */
export default function Layout() {
  return (
    <WorkspaceProvider>
      <div className="flex h-screen bg-background text-foreground">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </WorkspaceProvider>
  )
}
