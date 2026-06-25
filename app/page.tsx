"use client";

import { ProtofaceClient } from "protoface-client";
import { useRef, useState } from "react";
import type { StopListening } from "protoface-client";

const avatar = {
  openai_model: process.env.NEXT_PUBLIC_OPENAI_REALTIME_MODEL || "gpt-realtime-2",
  protoface_avatarid: process.env.NEXT_PUBLIC_PROTOFACE_AVATAR_ID || "av_stock_001"
};

type SessionState = "idle" | "starting" | "connected" | "disconnecting" | "disconnected" | "error";
type RealtimeMode = "idle" | "listening" | "speaking";

interface ProtofaceConnectionResponse {
  sessionToken: string;
  livekitUrl: string;
  roomName: string;
  participantToken: string;
  sessionId?: string;
  avatarId?: string;
  avatarIdentity?: string;
  expiresAt?: string;
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const protofaceRef = useRef<ProtofaceClient | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioCleanupRef = useRef<StopListening | null>(null);
  const cleanupPromiseRef = useRef<Promise<void> | null>(null);

  const [state, setState] = useState<SessionState>("idle");
  const [mode, setMode] = useState<RealtimeMode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([]);

  const isRunning = state === "starting" || state === "connected" || state === "disconnecting";
  const canDisconnect = state === "starting" || state === "connected";

  async function start() {
    if (isRunning) {
      return;
    }

    setState("starting");
    setMode("idle");
    setError(null);
    setEvents([]);

    try {
      const connection = await createProtofaceConnection({
        avatarId: avatar.protoface_avatarid,
        maxSessionLength: 600,
        maxIdleTime: 180,
        metadata: {
          provider: "openai",
          model: avatar.openai_model
        }
      });

      const protoface = new ProtofaceClient({
        avatarId: connection.avatarId ?? avatar.protoface_avatarid,
        livekitUrl: connection.livekitUrl,
        roomName: connection.roomName,
        participantToken: connection.participantToken,
        workerToken: "server-created",
        workerIdentity: connection.avatarIdentity,
        videoElement: videoRef.current,
        audioElement: audioRef.current,
        apiClient: createBrowserSessionApi(connection)
      });

      protoface.on("start", () => pushEvent("Protoface started."));
      protoface.on("error", ({ error: protofaceError }) => {
        setError(protofaceError.message);
        pushEvent(`Protoface error: ${protofaceError.message}`);
        void endSession("error");
      });
      protoface.on("speaking", () => pushEvent("Protoface is speaking."));
      protoface.on("silent", () => pushEvent("Protoface is ready."));

      await protoface.start();
      protofaceRef.current = protoface;

      const peer = new RTCPeerConnection();
      peerRef.current = peer;

      peer.onconnectionstatechange = () => {
        const label = formatStatusLabel(peer.connectionState);
        pushEvent(`OpenAI connection ${label}.`);
        if (peer.connectionState === "connected") {
          setState("connected");
          setMode("listening");
        }
        if (peer.connectionState === "failed" || peer.connectionState === "closed" || peer.connectionState === "disconnected") {
          void endSession(peer.connectionState === "failed" ? "error" : "disconnected");
        }
      };

      peer.ontrack = async (event) => {
        const [track] = event.streams[0]?.getAudioTracks() ?? [event.track];
        if (!track || audioCleanupRef.current) {
          return;
        }

        audioCleanupRef.current = await protoface.listenToMediaStreamTrack(track);
        pushEvent("OpenAI audio connected to Protoface.");
      };

      const dataChannel = peer.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;
      dataChannel.addEventListener("open", () => pushEvent("OpenAI events connected."));
      dataChannel.addEventListener("message", (event) => handleRealtimeEvent(event.data));
      dataChannel.addEventListener("close", () => {
        pushEvent("OpenAI events disconnected.");
        void endSession("disconnected");
      });
      dataChannel.addEventListener("error", () => {
        pushEvent("OpenAI events error.");
        void endSession("error");
      });

      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = localStream;
      localStream.getAudioTracks().forEach((track) => peer.addTrack(track, localStream));

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const answerSdp = await createOpenAIRealtimeCall(offer.sdp ?? "");
      await peer.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (startError) {
      const message = normalizeError(startError);
      setError(message);
      pushEvent(`Start failed: ${message}`);
      await endSession("error");
      setState("error");
    }
  }

  async function stop() {
    await endSession("disconnected");
    pushEvent("Session stopped.");
  }

  async function endSession(nextState: "disconnected" | "error") {
    if (cleanupPromiseRef.current) {
      await cleanupPromiseRef.current;
      return;
    }

    setState("disconnecting");
    cleanupPromiseRef.current = cleanupSession();
    await cleanupPromiseRef.current;
    cleanupPromiseRef.current = null;
    setState(nextState);
  }

  async function cleanupSession() {
    setMode("idle");
    audioCleanupRef.current?.();
    audioCleanupRef.current = null;
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    await protofaceRef.current?.stop();
    protofaceRef.current = null;
  }

  function handleRealtimeEvent(payload: string) {
    try {
      const event = JSON.parse(payload) as { type?: string; error?: { message?: string } };
      if (!event.type) {
        return;
      }

      if (event.type === "input_audio_buffer.speech_started") {
        setMode("listening");
      }
      if (event.type === "output_audio_buffer.started" || event.type === "response.audio.delta") {
        setMode("speaking");
      }
      if (event.type === "output_audio_buffer.stopped" || event.type === "response.audio.done") {
        setMode("listening");
        if (protofaceRef.current?.status === "started") {
          void protofaceRef.current.clearBuffer();
        }
      }
      if (event.type === "error") {
        const message = event.error?.message ?? "OpenAI Realtime error.";
        setError(message);
        pushEvent(`OpenAI error: ${message}`);
        void endSession("error");
      }
    } catch {
      return;
    }
  }

  function pushEvent(message: string) {
    setEvents((current) => [message, ...current].slice(0, 8));
  }

  return (
    <main className="page">
      <header className="topbar">
        <a className="brand" href="https://protoface.com" target="_blank" rel="noreferrer">
          <span>Protoface</span>
        </a>

        <nav className="navLinks" aria-label="Starter links">
          <a href="https://docs.protoface.com/guides/avatars" target="_blank" rel="noreferrer">
            Docs
          </a>
          <a href="https://developers.openai.com/api/docs/guides/realtime-webrtc" target="_blank" rel="noreferrer">
            OpenAI
          </a>
          <a href="https://app.protoface.com" target="_blank" rel="noreferrer">
            Login
          </a>
        </nav>
      </header>

      <div className="shell">
        <section className="stage" aria-label="Protoface avatar stage">
          {state !== "connected" ? (
            <div className="stagePreview">
              <p className="eyebrow">Protoface preview</p>
              <h2>Your avatar will appear here once the conversation starts.</h2>
              <p>Start a session to test OpenAI Realtime with a realtime Protoface avatar.</p>
            </div>
          ) : null}
          <video ref={videoRef} className="avatarVideo" autoPlay playsInline />
          <audio ref={audioRef} autoPlay />
        </section>

        <aside className="controls">
          <section className="intro">
            <h1>Realtime avatars for AI.</h1>
            <p>
              Add a realtime Protoface avatar to OpenAI Realtime. Start a session to try the full conversation flow.
            </p>
          </section>

          <section className="status">
            <div className="buttonRow">
              <button className="button" type="button" onClick={start} disabled={isRunning}>
                {state === "starting" ? "Starting" : "Start conversation"}
              </button>
              <button className="button secondary" type="button" onClick={stop} disabled={!canDisconnect}>
                End conversation
              </button>
            </div>

            <div className="statusList">
              <div className="statusItem">
                <strong>Session</strong>
                <span className="pill">{formatStatusLabel(state)}</span>
              </div>
              <div className="statusItem">
                <strong>OpenAI</strong>
                <span className="pill">{peerRef.current ? formatStatusLabel(peerRef.current.connectionState) : "Not started"}</span>
              </div>
              <div className="statusItem">
                <strong>Mode</strong>
                <span className="pill">{formatStatusLabel(mode)}</span>
              </div>
              <div className="statusItem">
                <strong>Protoface avatar</strong>
                <span className="pill">{avatar.protoface_avatarid}</span>
              </div>
              <div className="statusItem">
                <strong>OpenAI model</strong>
                <span className="pill">{avatar.openai_model}</span>
              </div>
            </div>

            {error ? <p className="error">{error}</p> : null}
          </section>

          <section className="log">
            <h2>Events</h2>
            <ul className="logList">
              {events.length > 0 ? (
                events.map((event, index) => <li key={`${event}-${index}`}>{event}</li>)
              ) : (
                <li>Ready when you are.</li>
              )}
            </ul>
          </section>

          <section className="quickStart">
            <h2>Quick start</h2>
            <ol>
              <li>Add keys to `.env`.</li>
              <li>Choose the OpenAI Realtime model.</li>
              <li>Set the avatar ID you want to preview.</li>
            </ol>
          </section>
        </aside>
      </div>
    </main>
  );
}

async function createOpenAIRealtimeCall(offerSdp: string) {
  const response = await fetch("/api/openai/realtime-call", {
    method: "POST",
    headers: { "content-type": "application/sdp" },
    body: offerSdp
  });

  const answerSdp = await response.text();
  if (!response.ok) {
    throw new Error(answerSdp || "Failed to start OpenAI Realtime.");
  }

  return answerSdp;
}

async function createProtofaceConnection(body: {
  avatarId: string;
  maxSessionLength?: number;
  maxIdleTime?: number;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<ProtofaceConnectionResponse> {
  const response = await fetch("/api/protoface/session-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const payload = (await response.json()) as Partial<ProtofaceConnectionResponse> & {
    error?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error || payload.message || "Failed to create Protoface session.");
  }

  for (const key of ["livekitUrl", "roomName", "participantToken"] as const) {
    if (!payload[key]) {
      throw new Error(`Protoface session response is missing ${key}.`);
    }
  }

  return payload as ProtofaceConnectionResponse;
}

function createBrowserSessionApi(connection: ProtofaceConnectionResponse) {
  return {
    async createLiveKitSession() {
      return {
        id: connection.sessionId ?? connection.sessionToken,
        status: "running" as const,
        avatar_id: connection.avatarId ?? avatar.protoface_avatarid,
        transport: {
          type: "livekit" as const,
          url: connection.livekitUrl,
          room_name: connection.roomName,
          audio_source: "data_stream" as const,
          worker_identity: connection.avatarIdentity
        },
        quality: "standard",
        max_duration_seconds: 600,
        idle_timeout_seconds: 180,
        metadata: {},
        created_at: new Date().toISOString()
      };
    },
    async endSession(sessionId: string) {
      await fetch("/api/protoface/session-token", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId })
      });
    }
  };
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Something went wrong.";
}

function formatStatusLabel(value: string | null | undefined) {
  if (!value) {
    return "Not started";
  }

  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
