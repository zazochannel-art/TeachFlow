// Same Supabase project as the web app, so both apps read and write the same data.
// The publishable key is designed to be public: Row Level Security protects the data.
// Override with EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (e.g. in mobile/.env.local).
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://yhszoxcjkkmelvixmxgz.supabase.co";
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_XegoFvdJN2xGQ5fmVNZ8Ew_tP_ZpHSI";

/** The web app, used for flows that live on the web (password reset, student invites, online classroom). */
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || "https://teach-flow-nine.vercel.app";
