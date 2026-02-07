import React from 'react'

export const useUnauthorizedHandler = (onUnauthorized: () => void) => {
  React.useEffect(() => {
    const handler = () => onUnauthorized()
    window.addEventListener('doccmp:unauthorized', handler)
    return () => window.removeEventListener('doccmp:unauthorized', handler)
  }, [onUnauthorized])
}

