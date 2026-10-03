import { Socket } from 'socket.io-client';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export class CandidateWebRTCPublisher {
  private socket: Socket;
  private assessmentId: string;
  private sessionId: string;
  private candidateId: string;
  private mediaStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map(); // facultySocketId -> RTCPeerConnection

  constructor(socket: Socket, assessmentId: string, sessionId: string, candidateId: string) {
    this.socket = socket;
    this.assessmentId = assessmentId;
    this.sessionId = sessionId;
    this.candidateId = candidateId;
  }

  public start(stream: MediaStream) {
    this.mediaStream = stream;

    // Register Socket signaling handlers
    this.socket.emit('webrtc_join_room', {
      assessmentId: this.assessmentId,
      sessionId: this.sessionId,
      candidateId: this.candidateId,
      role: 'CANDIDATE',
    });

    this.socket.on('webrtc_faculty_joined', async ({ facultySocketId }: { facultySocketId: string }) => {
      console.log('[WebRTC Candidate] Faculty connected:', facultySocketId);
      await this.createPeerForFaculty(facultySocketId);
    });

    this.socket.on('webrtc_request_stream', async ({ fromSocketId }: { fromSocketId?: string }) => {
      console.log('[WebRTC Candidate] Stream requested by proctor/faculty:', fromSocketId);
      if (fromSocketId) {
        await this.createPeerForFaculty(fromSocketId);
      }
    });

    this.socket.on('webrtc_answer', async ({ fromSocketId, answer }: { fromSocketId: string; answer: RTCSessionDescriptionInit }) => {
      const pc = this.peerConnections.get(fromSocketId);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (e) {
          console.warn('[WebRTC Candidate] setRemoteDescription error:', e);
        }
      }
    });

    this.socket.on('webrtc_ice_candidate', async ({ fromSocketId, candidate }: { fromSocketId: string; candidate: RTCIceCandidateInit }) => {
      const pc = this.peerConnections.get(fromSocketId);
      if (pc && candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }
    });

    this.socket.on('webrtc_faculty_left', ({ facultySocketId }: { facultySocketId: string }) => {
      const pc = this.peerConnections.get(facultySocketId);
      if (pc) {
        pc.close();
        this.peerConnections.delete(facultySocketId);
      }
    });
  }

  private async createPeerForFaculty(facultySocketId: string) {
    if (!this.mediaStream) return;

    if (this.peerConnections.has(facultySocketId)) {
      try {
        this.peerConnections.get(facultySocketId)?.close();
      } catch {}
      this.peerConnections.delete(facultySocketId);
    }

    try {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      this.peerConnections.set(facultySocketId, pc);

      // Add candidate video tracks to WebRTC peer connection
      this.mediaStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.mediaStream!);
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.emit('webrtc_ice_candidate', {
            targetSocketId: facultySocketId,
            candidate: event.candidate,
            sessionId: this.sessionId,
          });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.socket.emit('webrtc_offer', {
        targetSocketId: facultySocketId,
        offer: pc.localDescription,
        sessionId: this.sessionId,
        assessmentId: this.assessmentId,
      });
    } catch (err) {
      console.warn('[WebRTC Candidate] createPeerForFaculty error:', err);
    }
  }

  public updateStream(newStream: MediaStream) {
    this.mediaStream = newStream;
    const newTrack = newStream.getVideoTracks()[0];
    if (!newTrack) return;

    this.peerConnections.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(newTrack).catch((err) => console.warn('Track replace error:', err));
      } else {
        pc.addTrack(newTrack, newStream);
      }
    });
  }

  public stop() {
    this.peerConnections.forEach((pc) => {
      try {
        pc.close();
      } catch {}
    });
    this.peerConnections.clear();

    this.socket.emit('webrtc_leave_room', {
      assessmentId: this.assessmentId,
      sessionId: this.sessionId,
      role: 'CANDIDATE',
    });

    this.socket.off('webrtc_faculty_joined');
    this.socket.off('webrtc_request_stream');
    this.socket.off('webrtc_answer');
    this.socket.off('webrtc_ice_candidate');
    this.socket.off('webrtc_faculty_left');
  }
}

export class FacultyWebRTCSubscriber {
  private socket: Socket;
  private assessmentId: string;
  private sessionId: string;
  private videoElement: HTMLVideoElement | null = null;
  private pc: RTCPeerConnection | null = null;
  private onConnectionStateChange?: (state: string) => void;
  private retryInterval?: any;

  constructor(
    socket: Socket,
    assessmentId: string,
    sessionId: string,
    onConnectionStateChange?: (state: string) => void
  ) {
    this.socket = socket;
    this.assessmentId = assessmentId;
    this.sessionId = sessionId;
    this.onConnectionStateChange = onConnectionStateChange;
  }

  public start(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;

    if (this.onConnectionStateChange) {
      this.onConnectionStateChange('CONNECTING');
    }

    this.socket.emit('webrtc_join_room', {
      assessmentId: this.assessmentId,
      sessionId: this.sessionId,
      role: 'FACULTY',
    });

    // Request stream from any candidate currently in the room
    this.socket.emit('webrtc_request_stream', {
      assessmentId: this.assessmentId,
      sessionId: this.sessionId,
    });

    // Keep requesting stream until connected
    if (this.retryInterval) clearInterval(this.retryInterval);
    this.retryInterval = setInterval(() => {
      if (!this.pc || this.pc.iceConnectionState === 'disconnected' || this.pc.iceConnectionState === 'failed' || this.pc.iceConnectionState === 'new') {
        this.socket.emit('webrtc_request_stream', {
          assessmentId: this.assessmentId,
          sessionId: this.sessionId,
        });
      }
    }, 2500);

    this.socket.on('webrtc_candidate_joined', ({ candidateSocketId }: { candidateSocketId: string }) => {
      console.log('[WebRTC Faculty] Candidate joined:', candidateSocketId);
      this.socket.emit('webrtc_request_stream', {
        assessmentId: this.assessmentId,
        sessionId: this.sessionId,
      });
    });

    this.socket.on('webrtc_offer', async ({ fromSocketId, offer }: { fromSocketId: string; offer: RTCSessionDescriptionInit }) => {
      console.log('[WebRTC Faculty] Received offer from candidate socket:', fromSocketId);
      await this.handleOffer(fromSocketId, offer);
    });

    this.socket.on('webrtc_ice_candidate', async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      if (this.pc && candidate) {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }
    });

    this.socket.on('webrtc_candidate_left', () => {
      console.log('[WebRTC Faculty] Candidate disconnected or submitted test');
      if (this.videoElement) {
        this.videoElement.srcObject = null;
      }
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange('DISCONNECTED');
      }
    });
  }

  private async handleOffer(candidateSocketId: string, offer: RTCSessionDescriptionInit) {
    if (this.pc) {
      this.pc.close();
    }

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.ontrack = (event) => {
      console.log('[WebRTC Faculty] Received live track:', event.track.kind);
      if (this.videoElement && event.streams[0]) {
        this.videoElement.srcObject = event.streams[0];
        this.videoElement.play().catch(() => {});
      }
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange('CONNECTED');
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (this.pc && this.onConnectionStateChange) {
        this.onConnectionStateChange(this.pc.iceConnectionState.toUpperCase());
      }
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('webrtc_ice_candidate', {
          targetSocketId: candidateSocketId,
          candidate: event.candidate,
          sessionId: this.sessionId,
        });
      }
    };

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    this.socket.emit('webrtc_answer', {
      targetSocketId: candidateSocketId,
      answer: this.pc.localDescription,
      sessionId: this.sessionId,
    });
  }

  public stop() {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }

    this.socket.emit('webrtc_leave_room', {
      assessmentId: this.assessmentId,
      sessionId: this.sessionId,
      role: 'FACULTY',
    });

    this.socket.off('webrtc_offer');
    this.socket.off('webrtc_ice_candidate');
    this.socket.off('webrtc_candidate_left');
  }

  public reconnect() {
    if (this.videoElement) {
      const vid = this.videoElement;
      this.stop();
      setTimeout(() => {
        this.start(vid);
      }, 300);
    }
  }
}
