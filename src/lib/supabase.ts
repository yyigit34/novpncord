import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface UserProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
}

export interface Room {
  id: string;
  name: string;
  description: string;
  created_by: string | null;
  created_at: string;
  is_active: boolean;
}

export interface Message {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user_profiles?: UserProfile;
}

export interface RoomParticipant {
  id: string;
  room_id: string;
  user_id: string;
  joined_at: string;
  is_online: boolean;
  user_profiles?: UserProfile;
}
