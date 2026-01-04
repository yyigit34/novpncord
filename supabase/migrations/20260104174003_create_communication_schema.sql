/*
  # Communication App Schema
  
  1. New Tables
    - `rooms`
      - `id` (uuid, primary key)
      - `name` (text)
      - `description` (text)
      - `created_by` (uuid, references auth.users)
      - `created_at` (timestamptz)
      - `is_active` (boolean)
    
    - `messages`
      - `id` (uuid, primary key)
      - `room_id` (uuid, references rooms)
      - `user_id` (uuid, references auth.users)
      - `content` (text)
      - `created_at` (timestamptz)
    
    - `room_participants`
      - `id` (uuid, primary key)
      - `room_id` (uuid, references rooms)
      - `user_id` (uuid, references auth.users)
      - `joined_at` (timestamptz)
      - `is_online` (boolean)
    
    - `user_profiles`
      - `id` (uuid, primary key, references auth.users)
      - `username` (text, unique)
      - `avatar_url` (text)
      - `created_at` (timestamptz)
  
  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to:
      - View rooms and join them
      - Send and read messages in rooms they're in
      - Manage their own profile
*/

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  avatar_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Create rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true
);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active rooms"
  ON rooms FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Authenticated users can create rooms"
  ON rooms FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Room creators can update their rooms"
  ON rooms FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Create room_participants table
CREATE TABLE IF NOT EXISTS room_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at timestamptz DEFAULT now(),
  is_online boolean DEFAULT true,
  UNIQUE(room_id, user_id)
);

ALTER TABLE room_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view participants in rooms"
  ON room_participants FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can join rooms"
  ON room_participants FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own participation"
  ON room_participants FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave rooms"
  ON room_participants FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages in rooms they're in"
  ON messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM room_participants
      WHERE room_participants.room_id = messages.room_id
      AND room_participants.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can send messages to rooms they're in"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM room_participants
      WHERE room_participants.room_id = messages.room_id
      AND room_participants.user_id = auth.uid()
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS messages_room_id_idx ON messages(room_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at);
CREATE INDEX IF NOT EXISTS room_participants_room_id_idx ON room_participants(room_id);
CREATE INDEX IF NOT EXISTS room_participants_user_id_idx ON room_participants(user_id);