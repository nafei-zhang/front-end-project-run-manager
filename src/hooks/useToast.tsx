import React, { createContext, useContext, useState, ReactNode } from 'react'
import Toast, { ToastMessage } from '../components/Toast'

interface ToastContextType {
  showToast: (type: 'success' | 'error' | 'info', title: string, message?: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

interface ToastProviderProps {
  children: ReactNode
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const showToast = (type: 'success' | 'error' | 'info', title: string, message?: string, duration?: number) => {
    const id = Date.now().toString()
    const newToast: ToastMessage = {
      id,
      type,
      title,
      message,
      duration
    }
    
    setToasts(prev => [...prev, newToast])
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.map(toast => (
        <Toast key={toast.id} message={toast} onClose={removeToast} />
      ))}
    </ToastContext.Provider>
  )
}