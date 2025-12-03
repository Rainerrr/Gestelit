"use client";

import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type {
  Job,
  Station,
  Worker,
  StatusEventState,
  WorkerResumeSession,
} from "@/lib/types";

type WorkerSessionState = {
  worker?: Worker;
  station?: Station;
  job?: Job;
  sessionId?: string;
  sessionStartedAt?: string | null;
  currentStatus?: StatusEventState;
  totals: {
    good: number;
    scrap: number;
  };
  checklist: {
    startCompleted: boolean;
    endCompleted: boolean;
  };
  pendingRecovery: WorkerResumeSession | null;
};

type WorkerSessionAction =
  | { type: "setWorker"; payload?: Worker }
  | { type: "setStation"; payload?: Station }
  | { type: "setJob"; payload?: Job }
  | { type: "setSessionId"; payload?: string }
  | { type: "setSessionStart"; payload?: string | null }
  | { type: "setStatus"; payload?: StatusEventState }
  | { type: "setTotals"; payload: Partial<WorkerSessionState["totals"]> }
  | { type: "completeChecklist"; payload: "start" | "end" }
  | { type: "setPendingRecovery"; payload?: WorkerResumeSession | null }
  | { type: "hydrateFromSnapshot"; payload: WorkerResumeSession }
  | { type: "reset" };

const WorkerSessionContext = createContext<
  | (WorkerSessionState & {
      setWorker: (worker?: Worker) => void;
      setStation: (station?: Station) => void;
      setJob: (job?: Job) => void;
      setSessionId: (sessionId?: string) => void;
      setSessionStartedAt: (startedAt?: string | null) => void;
      setCurrentStatus: (status?: StatusEventState) => void;
      updateTotals: (totals: Partial<WorkerSessionState["totals"]>) => void;
      completeChecklist: (kind: "start" | "end") => void;
      setPendingRecovery: (payload?: WorkerResumeSession | null) => void;
      hydrateFromSnapshot: (payload: WorkerResumeSession) => void;
      reset: () => void;
    })
  | undefined
>(undefined);

const initialState: WorkerSessionState = {
  totals: {
    good: 0,
    scrap: 0,
  },
  sessionStartedAt: undefined,
  checklist: {
    startCompleted: false,
    endCompleted: false,
  },
  pendingRecovery: null,
};

function reducer(
  state: WorkerSessionState,
  action: WorkerSessionAction,
): WorkerSessionState {
  switch (action.type) {
    case "setWorker":
      return { ...state, worker: action.payload };
    case "setStation":
      return { ...state, station: action.payload };
    case "setJob":
      return { ...state, job: action.payload };
    case "setSessionId":
      return { ...state, sessionId: action.payload };
    case "setSessionStart":
      return { ...state, sessionStartedAt: action.payload };
    case "setStatus":
      return { ...state, currentStatus: action.payload };
    case "setTotals":
      return {
        ...state,
        totals: { ...state.totals, ...action.payload },
      };
    case "completeChecklist":
      return {
        ...state,
        checklist:
          action.payload === "start"
            ? { ...state.checklist, startCompleted: true }
            : { ...state.checklist, endCompleted: true },
      };
    case "setPendingRecovery":
      return {
        ...state,
        pendingRecovery: action.payload ?? null,
      };
    case "hydrateFromSnapshot": {
      const { session, station, job } = action.payload;
      return {
        ...state,
        station: station ?? state.station,
        job: job ?? state.job,
        sessionId: session.id,
        sessionStartedAt: session.started_at,
        currentStatus: session.current_status ?? state.currentStatus,
        totals: {
          good: session.total_good ?? 0,
          scrap: session.total_scrap ?? 0,
        },
        checklist: {
          ...state.checklist,
          startCompleted: true,
        },
        pendingRecovery: null,
      };
    }
    case "reset":
      return initialState;
    default:
      return state;
  }
}

export function WorkerSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const value = useMemo(
    () => ({
      ...state,
      setWorker: (worker?: Worker) =>
        dispatch({ type: "setWorker", payload: worker }),
      setStation: (station?: Station) =>
        dispatch({ type: "setStation", payload: station }),
      setJob: (job?: Job) => dispatch({ type: "setJob", payload: job }),
      setSessionId: (sessionId?: string) =>
        dispatch({ type: "setSessionId", payload: sessionId }),
      setSessionStartedAt: (startedAt?: string | null) =>
        dispatch({ type: "setSessionStart", payload: startedAt }),
      setCurrentStatus: (status?: StatusEventState) =>
        dispatch({ type: "setStatus", payload: status }),
      updateTotals: (totals: Partial<WorkerSessionState["totals"]>) =>
        dispatch({ type: "setTotals", payload: totals }),
      completeChecklist: (kind: "start" | "end") =>
        dispatch({ type: "completeChecklist", payload: kind }),
      setPendingRecovery: (payload?: WorkerResumeSession | null) =>
        dispatch({ type: "setPendingRecovery", payload }),
      hydrateFromSnapshot: (payload: WorkerResumeSession) =>
        dispatch({ type: "hydrateFromSnapshot", payload }),
      reset: () => dispatch({ type: "reset" }),
    }),
    [state],
  );

  return (
    <WorkerSessionContext.Provider value={value}>
      {children}
    </WorkerSessionContext.Provider>
  );
}

export function useWorkerSession() {
  const context = useContext(WorkerSessionContext);
  if (!context) {
    throw new Error(
      "useWorkerSession must be used within a WorkerSessionProvider",
    );
  }
  return context;
}

