import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, Phone, PhoneOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, RoomParticipant } from '../lib/supabase';

interface MediaControlsProps {
  roomId: string;
  participants: RoomParticipant[];
}

interface PeerConnection {
  userId: string;
  connection: RTCPeerConnection;
  stream?: MediaStream;
}

export function MediaControls({ roomId, participants }: MediaControlsProps) {
  const [isInCall, setIsInCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [peerConnections, setPeerConnections] = useState<PeerConnection[]>([]);

  const { user } = useAuth();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideosRef = useRef<{ [key: string]: HTMLVideoElement | null }>({});
  const signalingChannel = useRef<any>(null);

  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  useEffect(() => {
    if (!user || !roomId) return;

    signalingChannel.current = supabase.channel(`webrtc_${roomId}`)
      .on('broadcast', { event: 'offer' }, async ({ payload }) => {
        if (payload.to === user.id) {
          await handleOffer(payload);
        }
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (payload.to === user.id) {
          await handleAnswer(payload);
        }
      })
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload.to === user.id) {
          await handleIceCandidate(payload);
        }
      })
      .subscribe();

    return () => {
      if (signalingChannel.current) {
        supabase.removeChannel(signalingChannel.current);
      }
    };
  }, [roomId, user]);

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      setLocalStream(stream);
      setIsInCall(true);
      setIsMuted(false);

      participants.forEach((participant) => {
        if (participant.user_id !== user?.id) {
          createPeerConnection(participant.user_id, stream, true);
        }
      });
    } catch (error) {
      console.error('Error starting call:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const endCall = () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }

    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
      setScreenStream(null);
    }

    peerConnections.forEach((pc) => {
      pc.connection.close();
    });

    setPeerConnections([]);
    setIsInCall(false);
    setIsMuted(false);
    setIsVideoOn(false);
    setIsScreenSharing(false);
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = async () => {
    if (!isVideoOn) {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });

        const videoTrack = videoStream.getVideoTracks()[0];

        if (localStream) {
          localStream.addTrack(videoTrack);
        } else {
          setLocalStream(videoStream);
        }

        peerConnections.forEach((pc) => {
          pc.connection.addTrack(videoTrack, localStream || videoStream);
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream || videoStream;
        }

        setIsVideoOn(true);
      } catch (error) {
        console.error('Error starting video:', error);
        alert('Could not access camera. Please check permissions.');
      }
    } else {
      if (localStream) {
        const videoTracks = localStream.getVideoTracks();
        videoTracks.forEach((track) => {
          track.stop();
          localStream.removeTrack(track);
        });
      }
      setIsVideoOn(false);
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        setScreenStream(stream);

        const videoTrack = stream.getVideoTracks()[0];

        peerConnections.forEach((pc) => {
          const sender = pc.connection
            .getSenders()
            .find((s) => s.track?.kind === 'video');

          if (sender) {
            sender.replaceTrack(videoTrack);
          } else {
            pc.connection.addTrack(videoTrack, stream);
          }
        });

        stream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
          setScreenStream(null);
        };

        setIsScreenSharing(true);
      } catch (error) {
        console.error('Error sharing screen:', error);
      }
    } else {
      if (screenStream) {
        screenStream.getTracks().forEach((track) => track.stop());
        setScreenStream(null);
      }

      if (localStream && isVideoOn) {
        const videoTrack = localStream.getVideoTracks()[0];
        peerConnections.forEach((pc) => {
          const sender = pc.connection
            .getSenders()
            .find((s) => s.track?.kind === 'video');

          if (sender && videoTrack) {
            sender.replaceTrack(videoTrack);
          }
        });
      }

      setIsScreenSharing(false);
    }
  };

  const createPeerConnection = async (
    userId: string,
    stream: MediaStream,
    initiator: boolean
  ) => {
    const pc = new RTCPeerConnection(iceServers);

    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signalingChannel.current?.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: {
            to: userId,
            from: user?.id,
            candidate: event.candidate,
          },
        });
      }
    };

    pc.ontrack = (event) => {
      const remoteVideo = remoteVideosRef.current[userId];
      if (remoteVideo && event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
      }

      setPeerConnections((prev) => {
        const existing = prev.find((p) => p.userId === userId);
        if (existing) {
          existing.stream = event.streams[0];
          return [...prev];
        }
        return [...prev, { userId, connection: pc, stream: event.streams[0] }];
      });
    };

    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      signalingChannel.current?.send({
        type: 'broadcast',
        event: 'offer',
        payload: {
          to: userId,
          from: user?.id,
          offer,
        },
      });
    }

    setPeerConnections((prev) => {
      const existing = prev.find((p) => p.userId === userId);
      if (existing) return prev;
      return [...prev, { userId, connection: pc }];
    });
  };

  const handleOffer = async (payload: any) => {
    if (!localStream) return;

    const pc = new RTCPeerConnection(iceServers);

    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signalingChannel.current?.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: {
            to: payload.from,
            from: user?.id,
            candidate: event.candidate,
          },
        });
      }
    };

    pc.ontrack = (event) => {
      const remoteVideo = remoteVideosRef.current[payload.from];
      if (remoteVideo && event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    signalingChannel.current?.send({
      type: 'broadcast',
      event: 'answer',
      payload: {
        to: payload.from,
        from: user?.id,
        answer,
      },
    });

    setPeerConnections((prev) => [...prev, { userId: payload.from, connection: pc }]);
  };

  const handleAnswer = async (payload: any) => {
    const peerConnection = peerConnections.find((pc) => pc.userId === payload.from);
    if (peerConnection) {
      await peerConnection.connection.setRemoteDescription(
        new RTCSessionDescription(payload.answer)
      );
    }
  };

  const handleIceCandidate = async (payload: any) => {
    const peerConnection = peerConnections.find((pc) => pc.userId === payload.from);
    if (peerConnection && payload.candidate) {
      await peerConnection.connection.addIceCandidate(
        new RTCIceCandidate(payload.candidate)
      );
    }
  };

  return (
    <div className="bg-slate-50 border-b border-gray-200">
      <div className="p-4">
        <div className="flex items-center justify-center gap-3">
          {!isInCall ? (
            <button
              onClick={startCall}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition font-medium"
            >
              <Phone className="w-5 h-5" />
              Join Call
            </button>
          ) : (
            <>
              <button
                onClick={toggleMute}
                className={`p-3 rounded-xl transition ${
                  isMuted
                    ? 'bg-red-600 text-white'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <button
                onClick={toggleVideo}
                className={`p-3 rounded-xl transition ${
                  isVideoOn
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>

              <button
                onClick={toggleScreenShare}
                className={`p-3 rounded-xl transition ${
                  isScreenSharing
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                {isScreenSharing ? (
                  <Monitor className="w-5 h-5" />
                ) : (
                  <MonitorOff className="w-5 h-5" />
                )}
              </button>

              <button
                onClick={endCall}
                className="p-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {(isVideoOn || isScreenSharing || peerConnections.some((pc) => pc.stream)) && (
        <div className="p-4 bg-slate-100 border-t border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {(isVideoOn || isScreenSharing) && (
              <div className="relative bg-slate-900 rounded-xl overflow-hidden aspect-video">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-white text-sm">
                  You {isScreenSharing && '(Screen)'}
                </div>
              </div>
            )}

            {participants
              .filter((p) => p.user_id !== user?.id)
              .map((participant) => (
                <div
                  key={participant.user_id}
                  className="relative bg-slate-900 rounded-xl overflow-hidden aspect-video"
                >
                  <video
                    ref={(el) => {
                      remoteVideosRef.current[participant.user_id] = el;
                    }}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-white text-sm">
                    {participant.user_profiles?.username || 'User'}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
