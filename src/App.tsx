import { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import { RoomList } from './components/RoomList';
import { ChatRoom } from './components/ChatRoom';
import { Room } from './lib/supabase';

function App() {
  const { user, loading } = useAuth();
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <div className="h-screen flex overflow-hidden">
      <RoomList selectedRoom={selectedRoom} onSelectRoom={setSelectedRoom} />
      {selectedRoom ? (
        <ChatRoom room={selectedRoom} />
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              Welcome to your communication app
            </h2>
            <p className="text-gray-600">Select or create a room to start chatting</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
