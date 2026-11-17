import { useContext } from 'react'
import { JobSyncContext } from './JobSyncContext'

export function useJobSync() {
  const value = useContext(JobSyncContext)
  if (!value) throw new Error('useJobSync must be used inside JobSyncProvider.')
  return value
}
