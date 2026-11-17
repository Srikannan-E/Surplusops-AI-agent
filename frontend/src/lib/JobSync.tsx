import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getActiveJob, getJob, getJobStreamUrl, sendJobCommand } from './api'
import type { DemoJob, JobCommandType } from '../types'
import { JobSyncContext } from './JobSyncContext'

export function JobSyncProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<DemoJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reconnecting, setReconnecting] = useState(false)
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const jobRef = useRef<DemoJob | null>(null)

  const updateJob = useCallback((value: DemoJob) => {
    jobRef.current = value
    setJob(value)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const currentJob = jobRef.current
      const current = currentJob ? await getJob(currentJob.batch_id) : await getActiveJob()
      updateJob(current)
      setError('')
      setLoading(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the demo job.')
      setReconnecting(true)
      setLoading(false)
    }
  }, [updateJob])

  useEffect(() => {
    let active = true
    let pollTimer = 0
    const load = async () => {
      try {
        const current = await getActiveJob()
        if (!active) return
        updateJob(current)
        setError('')
        setLoading(false)
        setReconnecting(false)
      } catch (cause) {
        if (!active) return
        setError(cause instanceof Error ? cause.message : 'Could not load the demo job.')
        setLoading(false)
        setReconnecting(true)
        pollTimer = window.setTimeout(load, 1500)
      }
    }
    void load()
    return () => {
      active = false
      window.clearTimeout(pollTimer)
    }
  }, [updateJob])

  const batchId = job?.batch_id
  useEffect(() => {
    if (!batchId) return
    let active = true
    const source = new EventSource(getJobStreamUrl(batchId))
    const receive = (message: MessageEvent<string>) => {
      try {
        const data = JSON.parse(message.data) as { snapshot: DemoJob }
        if (active && data.snapshot) {
          updateJob(data.snapshot)
          setError('')
          setReconnecting(false)
        }
      } catch {
        setError('Received an unreadable job update; reconnecting.')
        setReconnecting(true)
      }
    }
    source.onopen = () => setReconnecting(false)
    source.onmessage = receive
    source.onerror = () => setReconnecting(true)
    const pollTimer = window.setInterval(() => {
      getJob(batchId)
        .then((current) => {
          if (active) {
            updateJob(current)
            setError('')
            setReconnecting(source.readyState !== EventSource.OPEN)
          }
        })
        .catch((cause: unknown) => {
          if (active) {
            setError(cause instanceof Error ? cause.message : 'Job sync is unavailable.')
            setReconnecting(true)
          }
        })
    }, 1500)
    return () => {
      active = false
      source.close()
      window.clearInterval(pollTimer)
    }
  }, [batchId, updateJob])

  const command = useCallback(async (type: JobCommandType, actor: string, payload: Record<string, unknown> = {}) => {
    const currentJob = jobRef.current
    if (!currentJob || pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    try {
      const updated = await sendJobCommand(currentJob.batch_id, type, actor, payload)
      updateJob(updated)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The command was rejected.')
      throw cause
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }, [updateJob])

  const value = useMemo(
    () => ({ job, loading, error, reconnecting, pending, command, refresh }),
    [job, loading, error, reconnecting, pending, command, refresh],
  )
  return <JobSyncContext.Provider value={value}>{children}</JobSyncContext.Provider>
}
