import { Activity, FolderOpen, Handshake, Target, Apple, Building2, CalendarCheck, ClipboardCheck, ClipboardList, Dumbbell, HeartPulse, LayoutDashboard, ListChecks, MessageSquare, ScrollText, ShieldAlert, Settings, Shield, TrendingUp, UserPlus, UserRoundCheck, Users, Utensils, UsersRound, type LucideIcon } from 'lucide-react';

/** Icons for the navigation items the server returns in /orgs/:id/context. Unknown keys (future modules) fall back to a generic icon. */
const ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  members: Users,
  invitations: UserPlus,
  tasks: ListChecks,
  messages: MessageSquare,
  'message-reports': ShieldAlert,
  progress: TrendingUp,
  clients: UserRoundCheck,
  plans: ClipboardList,
  exercises: Dumbbell,
  workouts: CalendarCheck,
  checkins: ClipboardCheck,
  'nutrition-plans': Apple,
  nutrition: Utensils,
  checkin: HeartPulse,
  coaching: Handshake,
  assessments: ClipboardCheck,
  resources: FolderOpen,
  'my-coaching': Target,
  groups: UsersRound,
  roles: Shield,
  audit: ScrollText,
  settings: Settings,
};

export const orgNavIcon = (key: string): LucideIcon => ICONS[key] ?? Activity;
export const OrgIcon = Building2;
