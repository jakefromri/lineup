import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Login from '@/pages/Login';
import AcceptInvite from '@/pages/AcceptInvite';
import TeamList from '@/pages/superadmin/TeamList';
import CalendarPage from '@/pages/manager/Calendar';
import Announcements from '@/pages/manager/Announcements';
import Roster from '@/pages/manager/Roster';
import Team from '@/pages/manager/Team';
import { useAuth } from '@/hooks/useAuth';
import { Nav } from '@/components/Nav';
import type { JwtRole } from '@lineup/types';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function ProtectedLayout({ requiredRole }: { requiredRole: JwtRole }) {
  const { session, claims, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Loading…</p>
      </div>
    );
  }

  if (!session || claims?.role !== requiredRole) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <Outlet />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/accept-invite/:token" element={<AcceptInvite />} />

          <Route path="/admin" element={<ProtectedLayout requiredRole="superadmin" />}>
            <Route path="teams" element={<TeamList />} />
          </Route>

          <Route path="/manager" element={<ProtectedLayout requiredRole="manager" />}>
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="announcements" element={<Announcements />} />
            <Route path="roster" element={<Roster />} />
            <Route path="team" element={<Team />} />
          </Route>

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
