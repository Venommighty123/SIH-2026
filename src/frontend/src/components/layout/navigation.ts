import {
  BellRing,
  Cctv,
  LayoutDashboard,
  Network,
  Route as RouteIcon,
  ScanSearch,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';

/** Single source of truth for navigation, reused by the sidebar and the palette. */
export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the command palette to explain what the screen is for. */
  description: string;
  group: 'Operations' | 'Investigation' | 'Administration';
  /** Which live counter, if any, is surfaced as a badge on this item. */
  badge?: 'alerts';
}

export const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'Overview',
    icon: LayoutDashboard,
    description: 'City-wide situational picture, live read stream and open alerts',
    group: 'Operations',
  },
  {
    to: '/feeds',
    label: 'Video Wall',
    icon: Cctv,
    description: 'Multi-camera junction video feeds with live plate detections',
    group: 'Operations',
  },
  {
    to: '/alerts',
    label: 'Alerts',
    icon: BellRing,
    description: 'Triage watchlist hits and camera faults',
    group: 'Operations',
    badge: 'alerts',
  },
  {
    to: '/track',
    label: 'Trajectory Tracking',
    icon: RouteIcon,
    description: "Reconstruct a single plate's route across the city with timestamps",
    group: 'Investigation',
  },
  {
    to: '/search',
    label: 'Read Search',
    icon: ScanSearch,
    description: 'Query the full ANPR read archive by plate, camera or time',
    group: 'Investigation',
  },
  {
    to: '/watchlist',
    label: 'Watchlist',
    icon: ShieldAlert,
    description: 'Manage blacklisted and monitored registrations',
    group: 'Investigation',
  },
  {
    to: '/cameras',
    label: 'Camera Network',
    icon: Network,
    description: 'Node register, health and coverage',
    group: 'Administration',
  },
];

export const NAV_GROUPS = ['Operations', 'Investigation', 'Administration'] as const;
