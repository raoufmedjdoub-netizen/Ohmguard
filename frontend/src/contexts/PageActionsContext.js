import React, { createContext, useContext, useState, useCallback } from 'react';

const PageActionsContext = createContext({ actions: null, setActions: () => {} });

export function PageActionsProvider({ children }) {
  const [actions, setActionsState] = useState(null);
  const setActions = useCallback((node) => setActionsState(node), []);
  return (
    <PageActionsContext.Provider value={{ actions, setActions }}>
      {children}
    </PageActionsContext.Provider>
  );
}

/** Pages call this to inject action buttons into SubNavbar */
export function usePageActions(actionsNode) {
  const { setActions } = useContext(PageActionsContext);
  React.useEffect(() => {
    setActions(actionsNode);
    return () => setActions(null);
  }, [actionsNode, setActions]);
}

/** SubNavbar reads actions from here */
export function usePageActionsValue() {
  return useContext(PageActionsContext).actions;
}
