import { useState, useEffect } from 'react';
import { supabase, Room } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Hash, LogOut } from 'lucide-react';

interface RoomListProps {
  selectedRoom: Room | null;
  onSelectRoom: (room: Room) => void;
}

export function RoomList({ selectedRoom, onSelectRoom }: RoomListProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const { profile, signOut } = useAuth();

  useEffect(() => {
    loadRooms();

    const channel = supabase
      .channel('rooms_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        loadRooms();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadRooms = async () => {
    const { data } = await supabase
      .from('rooms')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (data) {
      setRooms(data);
    }
  };

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    const { data, error } = await supabase
      .from('rooms')
      .insert({
        name: newRoomName,
        description: newRoomDesc,
        created_by: profile?.id,
      })
      .select()
      .single();

    if (data && !error) {
      setNewRoomName('');
      setNewRoomDesc('');
      setShowCreateModal(false);
      onSelectRoom(data);
    }
  };

  return (
    <div className="w-64 bg-slate-800 flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-white text-lg">Rooms</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="p-2 hover:bg-slate-700 rounded-lg transition text-white"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <div className="bg-slate-900 rounded-lg p-3">
          <p className="text-white font-medium text-sm">{profile?.username}</p>
          <p className="text-slate-400 text-xs mt-1">Online</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {rooms.map((room) => (
          <button
            key={room.id}
            onClick={() => onSelectRoom(room)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition ${
              selectedRoom?.id === room.id
                ? 'bg-slate-700 text-white'
                : 'text-slate-300 hover:bg-slate-700/50'
            }`}
          >
            <Hash className="w-5 h-5" />
            <span className="font-medium truncate">{room.name}</span>
          </button>
        ))}
      </div>

      <div className="p-4 border-t border-slate-700">
        <button
          onClick={() => signOut()}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-700 transition"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Create New Room</h3>
            <form onSubmit={createRoom}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Room Name</label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Description</label>
                <input
                  type="text"
                  value={newRoomDesc}
                  onChange={(e) => setNewRoomDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
