import { createContext, useRef, useState } from "react";

export type UndoCallback = () => Promise<void>;
export type DoCallback = () => Promise<UndoCallback>;

// Move an entry only after its device operation has been acknowledged.
export function useUndoRedo() {
  const undoStack = useRef<{ forward: DoCallback; reverse: UndoCallback }[]>(
    [],
  );
  const redoStack = useRef<DoCallback[]>([]);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{
    cause: unknown;
    message: string;
    retry: () => void;
  }>();

  async function run(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailure(undefined);
    try {
      await operation();
    } catch (error) {
      setFailure({
        cause: error,
        message: error instanceof Error ? error.message : String(error),
        retry: () => void run(operation),
      });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function doIt(forward: DoCallback) {
    return run(async () => {
      const reverse = await forward();
      undoStack.current.push({ forward, reverse });
      redoStack.current = [];
    });
  }

  const undo = () =>
    run(async () => {
      const entry = undoStack.current[undoStack.current.length - 1];
      if (!entry) return;
      await entry.reverse();
      undoStack.current.pop();
      redoStack.current.push(entry.forward);
    });

  const redo = () =>
    run(async () => {
      const forward = redoStack.current[redoStack.current.length - 1];
      if (!forward) return;
      const reverse = await forward();
      redoStack.current.pop();
      undoStack.current.push({ forward, reverse });
    });

  return {
    doIt,
    undo,
    redo,
    run,
    busy,
    failure,
    canUndo: !busy && !!undoStack.current.length,
    canRedo: !busy && !!redoStack.current.length,
  };
}

export const UndoRedoContext = createContext<
  ((dc: DoCallback) => Promise<void>) | null
>(null);
