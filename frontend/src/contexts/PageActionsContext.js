import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

const PageActionsContext = createContext(null);

export function PageActionsProvider({ children }) {
  const actionsRef = useRef(null);
  const listenersRef = useRef(new Set());

  const setActions = useCallback((node) => {
    actionsRef.current = node;
    // Notify only SubNavbar, not the entire tree
    listenersRef.current.forEach(fn => fn());
  }, []);

  const subscribe = useCallback((fn) => {
    listenersRef.current.add(fn);
    return () => listenersRef.current.delete(fn);
  }, []);

  const getActions = useCallback(() => actionsRef.current, []);

  return (
    <PageActionsContext.Provider value={{ setActions, subscribe, getActions }}>
      {children}
    </PageActionsContext.Provider>
  );
}

/** Pages call this to inject action buttons into SubNavbar */
export function usePageActions(actionsNode) {
  const { setActions } = useContext(PageActionsContext);
  const prevRef = useRef(null);

  // Use layout-time update to avoid flicker
  if (prevRef.current !== actionsNode) {
    prevRef.current = actionsNode;
    setActions(actionsNode);
  }

  useEffect(() => {
    return () => setActions(null);
  }, [setActions]);
}

/** SubNavbar reads actions — only this component re-renders on changes */
export function usePageActionsValue() {
  const { subscribe, getActions } = useContext(PageActionsContext);
  const [, tick] = useState(0);

  useEffect(() => {
    return subscribe(() => tick(c => c + 1));
  }, [subscribe]);

  return getActions();
}
