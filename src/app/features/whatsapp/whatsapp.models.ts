/** WhatsApp Business module: shapes returned by /api/whatsapp/*. Tokens never reach the browser - only a hint. */

export type WaAccountStatus = 'connected' | 'token_invalid' | 'permission_missing' | 'disconnected';
export type WaConnectionMethod = 'embedded_signup' | 'manual' | 'legacy';

export interface WaTokenInfo {
  hint: string | null;
  type: string;
  status: 'active' | 'invalid' | 'revoked' | 'replaced';
  expires_at: string | null;
  never_expires: boolean;
  expiring_soon: boolean;
  data_access_expires_at: string | null;
  last_validated_at: string | null;
  invalid_reason: string | null;
}

export interface WaPhoneNumber {
  id: number;
  account_id: number;
  phone_number_id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  label: string;
  quality_rating: string | null;
  messaging_limit_tier: string | null;
  code_verification_status: string | null;
  name_status: string | null;
  platform_type: string | null;
  meta_status: string | null;
  throughput_level: string | null;
  is_default: boolean;
  enabled: boolean;
  branch_type: 'branch' | 'franchise' | null;
  branch_id: number | null;
  branch_label: string | null;
  branch_inherited: boolean;
  account?: { id: number; name: string; waba_id: string; status: WaAccountStatus };
  last_synced_at: string | null;
}

export interface WaAccount {
  id: number;
  name: string;
  waba_id: string;
  waba_name: string | null;
  meta_business_id: string | null;
  meta_business_name: string | null;
  meta_user_name: string | null;
  currency: string | null;
  timezone_id: string | null;
  connection_method: WaConnectionMethod;
  status: WaAccountStatus;
  webhook_subscribed: boolean;
  restrict_access: boolean;
  welcome?: { enabled: boolean; message: string; custom: boolean };
  branch_type: 'branch' | 'franchise' | null;
  branch_id: number | null;
  branch_label: string | null;
  last_error: string | null;
  last_synced_at: string | null;
  connected_by?: { id: number; name: string } | null;
  created_at: string | null;
  disconnected_at: string | null;
  token: WaTokenInfo | null;
  phone_numbers?: WaPhoneNumber[];
  templates_count?: number;
  can_manage: boolean;
}

export interface WaAccountsMeta {
  embedded_signup: boolean;
  app_configured: boolean;
  webhook_url: string;
  can_connect: boolean;
}

/** Account / number switcher shown on every WhatsApp page. */
export interface WaSwitcherAccount {
  id: number;
  name: string;
  status: WaAccountStatus;
  phone_numbers: { id: number; label: string; display_phone_number: string | null; verified_name: string | null; is_default: boolean; quality_rating: string | null; is_test_number?: boolean; not_sendable_reason?: string | null }[];
}

export interface WaEmbeddedConfig {
  enabled: boolean;
  app_id: string;
  config_id: string;
  solution_id: string | null;
  graph_version: string;
  state: string;
}

/** A WABA found with the token of a connect session (step 1), to be picked in step 2. */
export interface WaDiscoveredWaba {
  id: string;
  name: string | null;
  currency?: string | null;
  business?: { id: string; name: string | null } | null;
  phone_numbers: { id: string; display_phone_number: string | null; verified_name: string | null; quality_rating: string | null; status: string | null; new_from_signup: boolean }[];
  error: string | null;
  connected_account_id: number | null;
  connected_status?: WaAccountStatus | null;
}

export interface WaConnectSession {
  session_id: string;
  method: WaConnectionMethod;
  token: { type: string; expires_at: string | null; never_expires: boolean; hint: string };
  meta_user: { id: string | null; name: string | null };
  wabas: WaDiscoveredWaba[];
  preselected: string[];
}

export interface WaAccountGrant {
  user_id: number;
  name?: string | null;
  email?: string | null;
  can_view: boolean;
  can_send: boolean;
  can_manage: boolean;
}

// ---- templates ----

export type WaTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
export type WaHeaderFormat = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
export type WaButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE' | 'FLOW';
export type WaOtpType = 'COPY_CODE' | 'ONE_TAP' | 'ZERO_TAP';

export interface WaTemplateParameters {
  header: null | { type: 'text' | 'image' | 'video' | 'document'; example?: string | null };
  body: number;
  body_examples?: string[];
  buttons: { index: number; type: 'url' | 'copy_code' | 'otp'; example?: string | null }[];
  otp: boolean;
}

export interface WaTemplate {
  id: number;
  account_id: number;
  account?: { id: number; name: string; status: WaAccountStatus } | null;
  name: string;
  language: string;
  language_label: string;
  category: WaTemplateCategory;
  sub_category: string | null;
  previous_category: string | null;
  status: string;
  quality_score: string | null;
  rejected_reason: string | null;
  meta_template_id: string | null;
  body: string | null;
  components: any[];
  parameters: WaTemplateParameters;
  purpose: string | null;
  is_active: boolean;
  editable: boolean;
  sendable: boolean;
  submitted_at: string | null;
  last_synced_at: string | null;
  created_at: string | null;
  updated_at?: string | null;
}

export interface WaTemplateButtonForm {
  type: WaButtonType;
  text?: string;
  url?: string;
  example?: string;
  phone_number?: string;
  flow_id?: string;
  flow_action?: 'navigate' | 'data_exchange';
  navigate_screen?: string;
}

export interface WaTemplateForm {
  account_id?: number | null;
  name?: string;
  language?: string;
  category: WaTemplateCategory;
  allow_category_change?: boolean;
  message_send_ttl_seconds?: number | null;
  header: { format: WaHeaderFormat; text?: string; example?: string; media_handle?: string };
  body: { text: string; examples: string[] };
  footer: { text: string };
  buttons: WaTemplateButtonForm[];
  auth: {
    otp_type: WaOtpType;
    add_security_recommendation: boolean;
    code_expiration_minutes: number | null;
    button_text: string;
    autofill_text: string;
    supported_apps: { package_name: string; signature_hash: string }[];
    zero_tap_terms_accepted: boolean;
  };
}

export interface WaLanguage { code: string; label: string; }

export interface WaPage<T> { data: T[]; current_page: number; last_page: number; per_page: number; total: number; }

// ---- messages ----

export interface WaMessage {
  id: number;
  client_uid: string | null;
  conversation_id: number;
  account_id: number;
  phone_number_id: number;
  contact_id: number;
  direction: 'inbound' | 'outbound';
  type: string;
  wamid: string | null;
  body: string | null;
  content: any;
  template: { id: number; name: string; language: string } | null;
  context_wamid: string | null;
  button_text: string | null;
  button_payload: string | null;
  media: { mime: string | null; filename: string | null; size: number | null; url: string | null } | null;
  status: string;
  error: { code: string; title: string | null; detail: string | null } | null;
  source: string;
  sent_by?: { id: number; name: string } | null;
  contact?: { id: number; name: string; wa_id: string } | null;
  phone_number?: { id: number; label: string } | null;
  account?: { id: number; name: string } | null;
  timestamp: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  created_at: string | null;
}

export interface WaRecipient {
  source: 'contact' | 'customer' | 'lead';
  id: number;
  name: string;
  phone: string;
  opt_in_status: 'unknown' | 'opted_in' | 'opted_out' | null;
  account_id?: number;
}

export interface WaSendValues {
  header?: { text?: string; media_id?: string; link?: string; filename?: string };
  body?: string[];
  buttons?: Record<number, string>;
  code?: string;
}

// ---- inbox ----

export interface WaConversation {
  id: number;
  account_id: number;
  phone_number_id: number;
  phone_number: { id: number; label: string; display_phone_number: string | null } | null;
  account?: { id: number; name: string } | null;
  contact: { id: number; name: string; wa_id: string; profile_name: string | null; opt_in_status: string; customer_id: number | null; customer_lead_id: number | null; tags: string[] } | null;
  status: 'open' | 'pending' | 'resolved';
  lead_source?: 'facebook_ad' | 'instagram_ad' | 'ad' | null;
  ad?: WaAd | null;
  needs_attention: boolean;
  assigned_user: { id: number; name: string } | null;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: 'inbound' | 'outbound' | null;
  window_open: boolean;
  window_expires_at: string | null;
  created_at: string | null;
}

// ---- template flows ----

export interface WaFlowStep {
  template_id: number;
  values?: { body?: string[]; header?: { text?: string; link?: string }; buttons?: Record<number, string> };
  buttons: { text: string; next_template_id: number | null }[];
}

export interface WaFlow {
  id: number;
  account_id: number;
  account: { id: number; name: string } | null;
  name: string;
  start_template_id: number | null;
  start_template: { id: number; name: string; status: string } | null;
  start_on_new_conversation: boolean;
  is_active: boolean;
  steps: WaFlowStep[];
  template_names?: Record<number, string>;
  templates_count: number;
  links_count: number;
  runs_count: number;
  updated_at: string | null;
}

// ---- Click-to-WhatsApp ads ----

export interface WaAd {
  id: number;
  platform: 'facebook' | 'instagram' | 'unknown';
  source_type: string | null;
  ad_id: string | null;
  source_url: string | null;
  headline: string | null;
  body: string | null;
  media_type: string | null;
  image_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  ad_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  lookup_status: 'pending' | 'found' | 'unavailable' | 'not_ad';
  first_message: string | null;
  referred_at: string | null;
}

export interface WaNote { id: number; note: string; user: { id: number; name: string } | null; mine: boolean; created_at: string | null; }

export interface WaConversationDetails {
  first_message: { body: string; at: string | null } | null;
  messages_count: number;
  media_count: number;
  ads: WaAd[];
  notes: WaNote[];
  assignments: { to: string | null; by: string; at: string | null }[];
}

export interface WaAdLeadsReport {
  period: { from: string; to: string };
  summary: { total: number; facebook: number; instagram: number; other_ads: number; organic: number; ads_total: number; today: number; this_month: number; unread: number; converted: number; in_crm: number };
  by_campaign: { campaign_id: string | null; campaign_name: string; leads: number; facebook: number; instagram: number }[];
  by_ad: { ad_id: string | null; ad_name: string | null; headline: string | null; campaign_name: string | null; thumbnail_url: string | null; leads: number; platform: string }[];
  trend: { day: string; facebook: number; instagram: number; other: number }[];
  leads: { data: { conversation_id: number; name: string; wa_id: string; lead_source: string; ad: WaAd | null; phone_number: string | null; status: string; unread_count: number; assigned_user: string | null; converted: boolean; lead_id: number | null; created_at: string | null; last_message_at: string | null }[]; current_page: number; last_page: number; total: number };
}
