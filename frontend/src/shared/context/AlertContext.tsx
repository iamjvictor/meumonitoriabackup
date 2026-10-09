'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { AlertModal, AlertOptions } from '../components/AlertModal';

interface AlertContextType {
  showAlert: (options: AlertOptions | string) => void;
  hideAlert: () => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [alertState, setAlertState] = useState<(AlertOptions & { isOpen: boolean }) | null>(null);

  const showAlert = (options: AlertOptions | string) => {
    if (typeof options === 'string') {
      setAlertState({
        isOpen: true,
        message: options,
        type: 'info',
      });
    } else {
      setAlertState({
        isOpen: true,
        ...options,
      });
    }
  };

  const hideAlert = () => {
    setAlertState(null);
  };

  return (
    <AlertContext.Provider value={{ showAlert, hideAlert }}>
      {children}
      {alertState && (
        <AlertModal
          isOpen={alertState.isOpen}
          onClose={hideAlert}
          title={alertState.title}
          message={alertState.message}
          type={alertState.type}
          confirmLabel={alertState.confirmLabel}
          showSupport={alertState.showSupport ?? true}
          supportLink={alertState.supportLink}
          onConfirm={alertState.onConfirm}
        />
      )}
    </AlertContext.Provider>
  );
};

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
};
