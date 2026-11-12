export type BannerType = 'home' | 'promotional' | 'announcement' | 'campaign';
export type LiveState = 'active' | 'inactive' | 'scheduled' | 'expired';

export interface Banner {
  id: number;
  title: string;
  description: string | null;
  image_url: string | null;
  redirect_url: string | null;
  banner_type: BannerType;
  display_order: number;
  start_date: string | null;
  end_date: string | null;
  open_link_in: 'external' | 'in_app';
  status: boolean;
  live_state: LiveState;
  clicks: number;
  impressions: number;
  ctr: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface Pagination { current_page: number; last_page: number; per_page: number; total: number; from?: number | null; to?: number | null; }

export interface BannerSummary { total: number; active_now: number; inactive: number; }

export interface BannerQuery {
  search?: string;
  status?: string;
  banner_type?: string;
  date_from?: string;
  date_to?: string;
  sort?: string;
  page?: number;
  per_page?: number;
}

export const BANNER_TYPES: { value: BannerType; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'promotional', label: 'Promotional' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'campaign', label: 'Campaign' },
];

export const BANNER_SORTS = [
  { value: 'display_order', label: 'Display order' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title', label: 'Title A-Z' },
];

export const STATE_LABEL: Record<LiveState, string> = { active: 'Live', inactive: 'Inactive', scheduled: 'Scheduled', expired: 'Expired' };
export const STATE_TONE: Record<LiveState, string> = { active: 'green', inactive: 'gray', scheduled: 'blue', expired: 'orange' };

export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
export const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
