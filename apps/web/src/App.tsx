import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'

import Layout from '@/Layout'
import WorkspacePage from '@/pages/WorkspacePage'
import CommoditiesPage from '@/pages/CommoditiesPage'
import SettingsLayout from '@/pages/settings/SettingsLayout'
import PreferencesPage from '@/pages/settings/PreferencesPage'
import ProfilePage from '@/pages/settings/ProfilePage'
import CloudPage from '@/pages/settings/CloudPage'
import McpPage from '@/pages/settings/McpPage'

/**
 * Client-side routes. The workspace stays at `/`. Account settings live under
 * `/settings`, itself a nested layout whose sub-menu selects a section:
 * Preferences, Profile, Cloud, and MCP are each their own addressable page.
 */
const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <WorkspacePage /> },
      { path: 'commodities', element: <CommoditiesPage /> },
      {
        path: 'settings',
        element: <SettingsLayout />,
        children: [
          { index: true, element: <Navigate to="preferences" replace /> },
          { path: 'preferences', element: <PreferencesPage /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'cloud', element: <CloudPage /> },
          { path: 'mcp', element: <McpPage /> },
        ],
      },
      // Back-compat: the old top-level MCP link now lives under settings.
      { path: 'mcp', element: <Navigate to="/settings/mcp" replace /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
