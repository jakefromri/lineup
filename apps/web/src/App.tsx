import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Home from '@/pages/Home';
import Join from '@/pages/Join';
import CalendarPage from '@/pages/Calendar';
import AnnouncementsPage from '@/pages/Announcements';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/join/:joinToken" element={<Join />} />
          <Route path="/t/:slug" element={<Navigate to="calendar" replace />} />
          <Route path="/t/:slug/calendar" element={<CalendarPage />} />
          <Route path="/t/:slug/announcements" element={<AnnouncementsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
