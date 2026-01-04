import { useState, useEffect, useRef } from 'react';
import { supabase, Room, Message, RoomParticipant } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Send, Users } from 'lucide-react';
import { MediaControls } from './MediaControls';

interface ChatRoomProps {
  room: Room;
}

export function ChatRoom({ room }: ChatRoomProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user, profile } = useAuth();

  useEffect(() => {
    if (!room || !user) return;

    joinRoom();
    loadMessages();
    loadParticipants();

    const messagesChannel = supabase
      .channel(`room_${room.id}_messages`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          loadMessageWithProfile(newMsg.id);
        }
      )
      .subscribe();

    const participantsChannel = supabase
      .channel(`room_${room.id}_participants`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_participants',
          filter: `room_id=eq.${room.id}`,
        },
        () => {
          loadParticipants();
        }
      )
      .subscribe();

    return () => {
      leaveRoom();
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(participantsChannel);
    };
  }, [room.id, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const joinRoom = async () => {
    if (!user) return;

    await supabase
      .from('room_participants')
      .upsert({
        room_id: room.id,
        user_id: user.id,
        is_online: true,
      });
  };

  const leaveRoom = async () => {
    if (!user) return;

    await supabase
      .from('room_participants')
      .update({ is_online: false })
      .eq('room_id', room.id)
      .eq('user_id', user.id);
  };

  const loadMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select(`
        *,
        user_profiles (*)
      `)
      .eq('room_id', room.id)
      .order('created_at', { ascending: true })
      .limit(100);

    if (data) {
      setMessages(data);
    }
  };

  const loadMessageWithProfile = async (messageId: string) => {
    const { data } = await supabase
      .from('messages')
      .select(`
        *,
        user_profiles (*)
      `)
      .eq('id', messageId)
      .single();

    if (data) {
      setMessages((prev) => [...prev, data]);
    }
  };

  const loadParticipants = async () => {
    const { data } = await supabase
      .from('room_participants')
      .select(`
        *,
        user_profiles (*)
      `)
      .eq('room_id', room.id)
      .eq('is_online', true);

    if (data) {
      setParticipants(data);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    await supabase.from('messages').insert({
      room_id: room.id,
      user_id: user.id,
      content: newMessage.trim(),
    });

    setNewMessage('');
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex-1 flex flex-col bg-white">
      <div className="h-16 border-b border-gray-200 flex items-center justify-between px-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">{room.name}</h2>
          {room.description && (
            <p className="text-sm text-gray-600">{room.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <Users className="w-5 h-5" />
          <span className="font-medium">{participants.length}</span>
        </div>
      </div>

      <MediaControls roomId={room.id} participants={participants} />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${
              message.user_id === user?.id ? 'flex-row-reverse' : ''
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0">
              {message.user_profiles?.username?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className={`flex-1 ${message.user_id === user?.id ? 'text-right' : ''}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-gray-800">
                  {message.user_profiles?.username || 'Unknown'}
                </span>
                <span className="text-xs text-gray-500">
                  {formatTime(message.created_at)}
                </span>
              </div>
              <div
                className={`inline-block px-4 py-2 rounded-2xl ${
                  message.user_id === user?.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {message.content}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="p-4 border-t border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
