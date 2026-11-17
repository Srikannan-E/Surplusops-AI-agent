import { createContext } from 'react'
import type { DemoJob, JobCommandType } from '../types'

export type JobSyncValue = {
  job: DemoJob | null
  loading: boolean
  error: string
  reconnecting: boolean
  pending: boolean
  command: (type: JobCommandType, actor: string, payload?: Record<string, unknown>) => Promise<void>
  refresh: () => Promise<void>
}

export const JobSyncContext = createContext<JobSyncValue | null>(null)
