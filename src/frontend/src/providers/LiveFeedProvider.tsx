import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, queryKeys } from '@/api';
import { useToast } from '@/components/ui/Toast';
import { useAppStore } from '@/store/useAppStore';
import { formatPlate } from '@/mock/vehicles';
import type { Alert, CameraStatus, Detection } from '@/types';

/**
 * Single realtime subscription for the whole application.
 *
 * Every screen that needs live reads consumes this context rather than opening
 * its own socket. Two consequences that matter: the alert toast fires exactly
 * once per event no matter how many components are mounted, and pausing the feed
 * is a genuine global pause rather than a per-component illusion.
 */

/** Rolling buffer size. Enough to fill the longest on-screen list twice over. */
const BUFFER_SIZE = 240;

interface LiveFeedValue {
  /** Newest first. */
  detections: Detection[];
  alerts: Alert[];
  /** Reads observed since mount, including those dropped from the buffer. */
  totalObserved: number;
  /** Rolling reads-per-minute measured over the last 60 s of wall clock. */
  ratePerMinute: number;
  connected: boolean;
  /** Live status overrides, applied on top of the fetched camera list. */
  cameraStatus: Record<string, CameraStatus>;
}

const LiveFeedContext = createContext<LiveFeedValue | null>(null);

export function LiveFeedProvider({ children }: { children: ReactNode }) {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [cameraStatus, setCameraStatus] = useState<Record<string, CameraStatus>>({});
  const [totalObserved, setTotalObserved] = useState(0);
  const [ratePerMinute, setRatePerMinute] = useState(0);
  const [connected, setConnected] = useState(false);

  const livePaused = useAppStore((state) => state.livePaused);
  const muteAlertToasts = useAppStore((state) => state.muteAlertToasts);

  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Read pause/mute through refs: the subscription must not be torn down and
  // rebuilt every time a toggle flips, or events would be lost mid-stream.
  const pausedRef = useRef(livePaused);
  const mutedRef = useRef(muteAlertToasts);
  pausedRef.current = livePaused;
  mutedRef.current = muteAlertToasts;

  const arrivalTimes = useRef<number[]>([]);
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setConnected(true);

    const unsubscribe = api.subscribe((event) => {
      if (event.kind === 'detection') {
        const detection = event.payload;

        // Throughput is measured even while the display is paused, otherwise the
        // rate figure would lie about what the network is doing.
        arrivalTimes.current.push(Date.now());
        setTotalObserved((count) => count + 1);

        if (!pausedRef.current) {
          setDetections((current) => [detection, ...current].slice(0, BUFFER_SIZE));
        }

        // Coalesce cache invalidation; one refetch per second is plenty and
        // avoids thrashing on a busy stream.
        if (!invalidateTimer.current) {
          invalidateTimer.current = setTimeout(() => {
            invalidateTimer.current = null;
            queryClient.invalidateQueries({ queryKey: queryKeys.kpis });
            queryClient.invalidateQueries({ queryKey: queryKeys.heatPoints });
          }, 1500);
        }
        return;
      }

      if (event.kind === 'alert') {
        const alert = event.payload;
        setAlerts((current) => [alert, ...current].slice(0, 60));
        queryClient.invalidateQueries({ queryKey: ['alerts'] });

        if (!mutedRef.current) {
          toast.push({
            tone: alert.severity === 'critical' ? 'critical' : 'warning',
            title: alert.title,
            detail: alert.detail,
            action: alert.plate
              ? {
                  label: `Track ${formatPlate(alert.plate)}`,
                  onClick: () => navigate(`/track?plate=${alert.plate}`),
                }
              : undefined,
          });
        }
        return;
      }

      setCameraStatus((current) => ({ ...current, [event.payload.cameraId]: event.payload.status }));
      queryClient.invalidateQueries({ queryKey: queryKeys.cameras });
    });

    return () => {
      unsubscribe();
      setConnected(false);
      if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
    };
  }, [navigate, queryClient, toast]);

  // Recompute the rolling rate once a second from the arrival log.
  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - 60_000;
      arrivalTimes.current = arrivalTimes.current.filter((t) => t >= cutoff);
      setRatePerMinute(arrivalTimes.current.length);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const value = useMemo<LiveFeedValue>(
    () => ({ detections, alerts, totalObserved, ratePerMinute, connected, cameraStatus }),
    [detections, alerts, totalObserved, ratePerMinute, connected, cameraStatus],
  );

  return <LiveFeedContext.Provider value={value}>{children}</LiveFeedContext.Provider>;
}

export function useLiveFeed(): LiveFeedValue {
  const context = useContext(LiveFeedContext);
  if (!context) throw new Error('useLiveFeed must be used inside <LiveFeedProvider>');
  return context;
}
