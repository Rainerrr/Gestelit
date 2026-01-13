# Real-Time & Streaming

> Real-time updates, Server-Sent Events (SSE), and Supabase subscriptions
> Last updated: January 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [SSE Streams](#2-sse-streams)
3. [Heartbeat System](#3-heartbeat-system)
4. [Supabase Realtime](#4-supabase-realtime)
5. [BroadcastChannel](#5-broadcastchannel)
6. [Implementation Patterns](#6-implementation-patterns)

---

## 1. Overview

The system uses multiple real-time mechanisms:

| Mechanism | Use Case | Direction |
|-----------|----------|-----------|
| SSE Streams | Admin dashboard updates | Server → Client |
| Heartbeat | Session keep-alive | Client → Server |
| Supabase Realtime | Database subscriptions | Server → Client |
| BroadcastChannel | Multi-tab coordination | Client ↔ Client |

---

## 2. SSE Streams

### Active Sessions Stream

**Endpoint:** `GET /api/admin/dashboard/active-sessions/stream`

```typescript
// Client connection
const eventSource = new EventSource(
  '/api/admin/dashboard/active-sessions/stream'
);

// Event handlers
eventSource.addEventListener('initial', (e) => {
  const data = JSON.parse(e.data);
  // data.sessions - Initial session list
});

eventSource.addEventListener('update', (e) => {
  const data = JSON.parse(e.data);
  // data.session - Updated session
});

eventSource.addEventListener('insert', (e) => {
  const data = JSON.parse(e.data);
  // data.session - New session
});

eventSource.addEventListener('delete', (e) => {
  const data = JSON.parse(e.data);
  // data.sessionId - Removed session ID
});

eventSource.addEventListener('heartbeat', () => {
  // Keep-alive ping
});

// Cleanup
eventSource.close();
```

### Session Detail Stream

**Endpoint:** `GET /api/admin/dashboard/session/[id]/stream`

```typescript
const eventSource = new EventSource(
  `/api/admin/dashboard/session/${sessionId}/stream`
);

eventSource.addEventListener('initial', (e) => {
  const data = JSON.parse(e.data);
  // data.session - Session details
  // data.statusEvents - Status history
});

eventSource.addEventListener('session_update', (e) => {
  const data = JSON.parse(e.data);
  // data.session - Updated session
});

eventSource.addEventListener('status_event', (e) => {
  const data = JSON.parse(e.data);
  // data.statusEvent - New status event
});
```

### Reports Stream

**Endpoint:** `GET /api/admin/reports/stream?type=malfunction`

```typescript
const eventSource = new EventSource(
  '/api/admin/reports/stream?type=malfunction'
);

eventSource.addEventListener('initial', (e) => {
  const data = JSON.parse(e.data);
  // data.reports - Initial reports
});

eventSource.addEventListener('insert', (e) => {
  const data = JSON.parse(e.data);
  // data.report - New report
});

eventSource.addEventListener('update', (e) => {
  const data = JSON.parse(e.data);
  // data.report - Updated report
});
```

### Pipeline Stream (Worker)

**Endpoint:** `GET /api/sessions/pipeline/stream?jobId=X&workerId=Y`

```typescript
const eventSource = new EventSource(
  `/api/sessions/pipeline/stream?jobId=${jobId}&workerId=${workerId}`
);

eventSource.addEventListener('initial', (e) => {
  const data = JSON.parse(e.data);
  // data.jobItems - Job items
  // data.stationOptions - Available stations
});

eventSource.addEventListener('update', (e) => {
  const data = JSON.parse(e.data);
  // data.stationOptions - Updated occupancy/WIP
});
```

### Server Implementation Pattern

```typescript
// app/api/example/stream/route.ts
export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial data
      const initialData = await fetchInitialData();
      controller.enqueue(
        encoder.encode(`event: initial\ndata: ${JSON.stringify(initialData)}\n\n`)
      );

      // Subscribe to changes
      const subscription = supabase
        .channel('my-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' },
          (payload) => {
            controller.enqueue(
              encoder.encode(`event: update\ndata: ${JSON.stringify(payload)}\n\n`)
            );
          }
        )
        .subscribe();

      // Heartbeat every 25 seconds
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`event: heartbeat\ndata: {}\n\n`));
      }, 25000);

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        subscription.unsubscribe();
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

---

## 3. Heartbeat System

### Client Implementation

**File:** `hooks/useSessionHeartbeat.ts`

```typescript
const HEARTBEAT_INTERVAL_MS = 15_000; // 15 seconds

export function useSessionHeartbeat(sessionId: string, instanceId: string) {
  useEffect(() => {
    const sendHeartbeat = async () => {
      await fetch('/api/sessions/heartbeat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Worker-Code': getWorkerCode(),
        },
        body: JSON.stringify({ sessionId, instanceId }),
      });
    };

    // Send immediately
    sendHeartbeat();

    // Then every 15 seconds
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    // Also on page unload
    const handleUnload = () => {
      navigator.sendBeacon(
        '/api/sessions/heartbeat',
        JSON.stringify({ sessionId, instanceId })
      );
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [sessionId, instanceId]);
}
```

### Server Implementation

```typescript
// lib/data/sessions.ts
export async function recordSessionHeartbeatWithInstance(
  supabase: SupabaseClient,
  sessionId: string,
  instanceId: string
) {
  const { data, error } = await supabase
    .from('sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('active_instance_id', instanceId)
    .eq('status', 'active')
    .select()
    .single();

  if (error || !data) {
    throw new Error('INSTANCE_MISMATCH');
  }

  return data;
}
```

### Idle Detection

**File:** `hooks/useIdleSessionCleanup.ts`

```typescript
const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export function useIdleSessionCleanup() {
  // Admin hook - triggers cleanup every 10 seconds
  useEffect(() => {
    const cleanup = async () => {
      await fetch('/api/cron/close-idle-sessions', { method: 'POST' });
    };

    const interval = setInterval(cleanup, 10000);
    return () => clearInterval(interval);
  }, []);
}
```

---

## 4. Supabase Realtime

### Subscription Hooks

**File:** `lib/hooks/useRealtimeSession.ts`

```typescript
export function useRealtimeSession(sessionId: string) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();

    const channel = supabase
      .channel(`session:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          setSession(payload.new as Session);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [sessionId]);

  return session;
}
```

**File:** `lib/hooks/useRealtimeReports.ts`

```typescript
export function useRealtimeReports(type: ReportType) {
  const [reports, setReports] = useState<Report[]>([]);

  useEffect(() => {
    const supabase = createBrowserClient();

    const channel = supabase
      .channel(`reports:${type}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reports',
          filter: `type=eq.${type}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setReports(prev => [payload.new as Report, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setReports(prev =>
              prev.map(r => r.id === payload.new.id ? payload.new as Report : r)
            );
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [type]);

  return reports;
}
```

### Status Mirroring Benefits

The `sessions.current_status_id` column mirrors the latest status event:

```typescript
// Subscribe to sessions table ONLY
// No need to join status_events for dashboard

supabase
  .channel('active-sessions')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'sessions',
    filter: "status=eq.active"
  }, handleChange)
  .subscribe();
```

---

## 5. BroadcastChannel

### Multi-Tab Coordination

**File:** `hooks/useSessionBroadcast.ts`

```typescript
export function useSessionBroadcast(
  sessionId: string | null,
  instanceId: string
) {
  useEffect(() => {
    if (!sessionId) return;

    const channel = new BroadcastChannel('worker-session');

    // Announce session claim
    channel.postMessage({
      type: 'claim',
      sessionId,
      instanceId,
      timestamp: Date.now(),
    });

    // Listen for claims from other tabs
    channel.onmessage = (event) => {
      const { type, sessionId: claimedSessionId, instanceId: claimerId } = event.data;

      if (type === 'claim' && claimedSessionId === sessionId && claimerId !== instanceId) {
        // Another tab claimed our session
        // Redirect to session-transferred page
        window.location.href = '/session-transferred';
      }
    };

    return () => {
      channel.close();
    };
  }, [sessionId, instanceId]);
}
```

### Session Transfer Page

**Route:** `/session-transferred`

```tsx
export default function SessionTransferredPage() {
  return (
    <div className="text-center">
      <h1>Session Transferred</h1>
      <p>Your session was claimed by another browser tab.</p>
      <Button onClick={() => router.push('/login')}>
        Return to Login
      </Button>
    </div>
  );
}
```

---

## 6. Implementation Patterns

### SSE with React Hook

```typescript
export function useSSEStream<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource(url);

    eventSource.addEventListener('initial', (e) => {
      setData(JSON.parse(e.data));
      setConnected(true);
    });

    eventSource.addEventListener('update', (e) => {
      setData(prev => ({ ...prev, ...JSON.parse(e.data) }));
    });

    eventSource.onerror = () => {
      setError(new Error('Connection lost'));
      setConnected(false);
    };

    return () => eventSource.close();
  }, [url]);

  return { data, error, connected };
}
```

### Polling Fallback

```typescript
export function usePollingFallback<T>(
  url: string,
  interval: number = 5000,
  enabled: boolean = true
) {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const poll = async () => {
      try {
        const response = await fetch(url);
        const data = await response.json();
        setData(data);
      } catch (error) {
        console.error('Polling error:', error);
      }
    };

    poll(); // Initial fetch
    const id = setInterval(poll, interval);

    return () => clearInterval(id);
  }, [url, interval, enabled]);

  return data;
}
```

### Reconnection Logic

```typescript
export function useReconnectingSSE<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  useEffect(() => {
    let eventSource: EventSource;

    const connect = () => {
      eventSource = new EventSource(url);

      eventSource.addEventListener('initial', (e) => {
        setData(JSON.parse(e.data));
        reconnectAttempts.current = 0; // Reset on success
      });

      eventSource.onerror = () => {
        eventSource.close();

        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          const delay = Math.pow(2, reconnectAttempts.current) * 1000;
          setTimeout(connect, delay);
        }
      };
    };

    connect();

    return () => eventSource?.close();
  }, [url]);

  return data;
}
```

---

## Event Types Summary

### Admin Dashboard Events
| Event | Payload | Purpose |
|-------|---------|---------|
| `initial` | `{ sessions: Session[] }` | Initial load |
| `update` | `{ session: Session }` | Session changed |
| `insert` | `{ session: Session }` | New session |
| `delete` | `{ sessionId: string }` | Session ended |
| `heartbeat` | `{}` | Keep-alive |

### Session Detail Events
| Event | Payload | Purpose |
|-------|---------|---------|
| `initial` | `{ session, statusEvents }` | Initial load |
| `session_update` | `{ session }` | Session changed |
| `status_event` | `{ statusEvent }` | New status |
| `heartbeat` | `{}` | Keep-alive |

### Report Events
| Event | Payload | Purpose |
|-------|---------|---------|
| `initial` | `{ reports: Report[] }` | Initial load |
| `insert` | `{ report: Report }` | New report |
| `update` | `{ report: Report }` | Report updated |
| `heartbeat` | `{}` | Keep-alive |

---

## Key Files

| File | Purpose |
|------|---------|
| `hooks/useSessionHeartbeat.ts` | 15s heartbeat |
| `hooks/useSessionBroadcast.ts` | Multi-tab coordination |
| `hooks/useIdleSessionCleanup.ts` | Admin idle cleanup |
| `lib/hooks/useRealtimeSession.ts` | Supabase subscription |
| `lib/hooks/useRealtimeReports.ts` | Report subscription |
| `lib/hooks/useLiveDuration.ts` | Timer display |
| `app/api/admin/dashboard/active-sessions/stream/route.ts` | Sessions SSE |
| `app/api/admin/dashboard/session/[id]/stream/route.ts` | Session detail SSE |
| `app/api/admin/reports/stream/route.ts` | Reports SSE |
| `app/api/sessions/pipeline/stream/route.ts` | Pipeline SSE |
