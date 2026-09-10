import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ToastProvider } from '@/components/ui/Toast';
import { Skeleton } from '@/components/ui/primitives';
import { LiveFeedProvider } from '@/providers/LiveFeedProvider';

/**
 * Route-level code splitting.
 */
const OverviewPage = lazy(() =>
  import('@/pages/OverviewPage').then((module) => ({ default: module.OverviewPage })),
);
const LiveFeedsPage = lazy(() =>
  import('@/pages/LiveFeedsPage').then((module) => ({ default: module.LiveFeedsPage })),
);
const TrajectoryPage = lazy(() =>
  import('@/pages/TrajectoryPage').then((module) => ({ default: module.TrajectoryPage })),
);
const SearchPage = lazy(() =>
  import('@/pages/SearchPage').then((module) => ({ default: module.SearchPage })),
);
const AlertsPage = lazy(() =>
  import('@/pages/AlertsPage').then((module) => ({ default: module.AlertsPage })),
);
const WatchlistPage = lazy(() =>
  import('@/pages/WatchlistPage').then((module) => ({ default: module.WatchlistPage })),
);
const CamerasPage = lazy(() =>
  import('@/pages/CamerasPage').then((module) => ({ default: module.CamerasPage })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/** Placeholder that matches the page shells, so navigation does not flash. */
function RouteFallback() {
  return (
    <div className="flex h-full flex-col gap-3 p-3 xl:p-4">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[86px]" />
        ))}
      </div>
      <Skeleton className="min-h-0 flex-1" />
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <LiveFeedProvider>
            <Routes>
              <Route element={<AppShell />}>
                <Route
                  index
                  element={
                    <Suspense fallback={<RouteFallback />}>
                      <OverviewPage />
                    </Suspense>
                  }
                />
                <Route
                  path="feeds"
                  element={
                    <Suspense fallback={<RouteFallback />}>
                      <LiveFeedsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="track"
                  element={
                    <Suspense fallback={<RouteFallback />}>
                      <TrajectoryPage />
                    </Suspense>
                  }
                />
                <Route
                  path="search"
                  element={
                    <Suspense fallback={<RouteFallback />}>
                      <SearchPage />
                    </Suspense>
                  }
                />
                <Route
                  path="alerts"
                  element={
                    <Suspense fallback={<RouteFallback />}>
                      <AlertsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="watchlist"
                  element={
                    <Suspense fallback={<RouteFallback />}>
                      <WatchlistPage />
                    </Suspense>
                  }
                />
                <Route
                  path="cameras"
                  element={
                    <Suspense fallback={<RouteFallback />}>
                      <CamerasPage />
                    </Suspense>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </LiveFeedProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
