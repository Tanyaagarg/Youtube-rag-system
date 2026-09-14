/**
 * ClipIQ API Service Layer
 * Handles all communication with the FastAPI backend.
 */

const API_BASE = import.meta.env.VITE_API_URL || "";
const GENERIC_SERVER_ERROR = "We have some server issue. We will get back soon.";

// ─── Types ───────────────────────────────────────────────────

export interface ProcessVideoResponse {
  session_id: string;
  video_id: string;
  title: string;
  channel: string;
  date: string;
  description: string;
  status: string;
  chunk_count: number;
  error_message?: string;
}

export interface ChatResponse {
  response: string;
  intent: string;
  sources: Array<{ timestamp: number; video_id: string }>;
}

export interface SummaryResponse {
  summary: string;
  video_info: {
    video_id: string;
    title: string;
    channel: string;
    date: string;
    description: string;
  };
  starter_questions: string[];
}

export interface CleanupResponse {
  status: string;
  removed_video_ids: string[];
  removed_session_entries: number;
  removed_summary_entries: number;
  removed_starter_entries: number;
  removed_persisted_indexes: number;
  removed_transcript_caches: number;
  session_removed: boolean;
}

// ─── API Functions ───────────────────────────────────────────

async function apiFetch<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      console.error("API request failed", { endpoint, status: res.status, detail: errorData.detail });
      throw new Error(GENERIC_SERVER_ERROR);
    }

    return res.json();
  } catch (error) {
    if (error instanceof Error && error.message === GENERIC_SERVER_ERROR) {
      throw error;
    }
    console.error("Network/API error", { endpoint, error });
    throw new Error(GENERIC_SERVER_ERROR);
  }
}

/**
 * Process a YouTube video — fetch transcript, create embeddings.
 */
export async function processVideo(
  url: string,
  sessionId?: string
): Promise<ProcessVideoResponse> {
  return apiFetch<ProcessVideoResponse>("/api/process", {
    url,
    session_id: sessionId ?? null,
  });
}

/**
 * Chat with a processed video using RAG.
 */
export async function chatWithVideo(
  sessionId: string,
  videoUrl: string,
  message: string
): Promise<ChatResponse> {
  return apiFetch<ChatResponse>("/api/chat", {
    session_id: sessionId,
    video_url: videoUrl,
    message,
  });
}

/**
 * Get a full AI summary of a video.
 */
export async function summarizeVideo(
  sessionId: string,
  videoUrl: string
): Promise<SummaryResponse> {
  return apiFetch<SummaryResponse>("/api/summary", {
    session_id: sessionId,
    video_url: videoUrl,
  });
}

export async function cleanupArtifacts(
  sessionId: string | null,
  videoUrls: string[],
  dropPersisted: boolean = true,
  dropSession: boolean = false
): Promise<CleanupResponse> {
  return apiFetch<CleanupResponse>("/api/cleanup", {
    session_id: sessionId,
    video_urls: videoUrls,
    drop_persisted: dropPersisted,
    drop_session: dropSession,
  });
}

/**
 * Health check.
 */
export async function checkHealth(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/api/health`);
  return res.json();
}
