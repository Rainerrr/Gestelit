"use client";

import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { Job, Station, Worker, StatusEventState } from "@/lib/types";

type WorkerSessionState = {
  worker?: Worker;
  station?: Station;
  job?: Job;
  sessionId?: string;
  currentStatus?: StatusEventState;
  totals: {
    good: number;
    scrap: number;
  };
  checklist: {
    startCompleted: boolean;
    endCompleted: boolean;
  };
};

type WorkerSessionAction =
  | { type: "setWorker"; payload?: Worker }
  | { type: "setStation"; payload?: Station }
  | { type: "setJob"; payload?: Job }
  | { type: "setSessionId"; payload?: string }
  | { type: "setStatus"; payload?: StatusEventState }
  | { type: "setTotals"; payload: Partial<WorkerSessionState["totals"]> }
  | { type: "completeChecklist"; payload: "start" | "end" }
  | { type: "reset" };

const WorkerSessionContext = createContext<
  | (WorkerSessionState & {
      setWorker: (worker?: Worker) => void;
      setStation: (station?: Station) => void;
      setJob: (job?: Job) => void;
      setSessionId: (sessionId?: string) => void;
      setCurrentStatus: (status?: StatusEventState) => void;
      updateTotals: (totals: Partial<WorkerSessionState["totals"]>) => void;
      completeChecklist: (kind: "start" | "end") => void;
      reset: () => void;
    })
  | undefined
>(undefined);

const initialState: WorkerSessionState = {
  totals: {
    good: 0,
    scrap: 0,
  },
  checklist: {
    startCompleted: false,
    endCompleted: false,
  },
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
      setCurrentStatus: (status?: StatusEventState) =>
        dispatch({ type: "setStatus", payload: status }),
      updateTotals: (totals: Partial<WorkerSessionState["totals"]>) =>
        dispatch({ type: "setTotals", payload: totals }),
      completeChecklist: (kind: "start" | "end") =>
        dispatch({ type: "completeChecklist", payload: kind }),
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

