import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { getRecords, submitPortalRequest } from '../lib/api'
import type { PortalConfig, PortalField, PortalRecord } from '../types'
import { StatusPill } from './StatusPill'

type PortalFormValues = Record<string, string | number | boolean | string[]>

function initialValues(fields: PortalField[]) {
  return Object.fromEntries(
    fields.map((field) => [field.name, field.defaultValue ?? (field.type === 'checkbox' ? false : '')]),
  ) as PortalFormValues
}

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function ServicePortal({ config }: { config: PortalConfig }) {
  const [values, setValues] = useState(() => initialValues(config.fields))
  const [records, setRecords] = useState<PortalRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const refreshRecords = useCallback(async () => {
    try {
      setRecords(await getRecords(config.id))
      setError('')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load portal records.')
    } finally {
      setLoading(false)
    }
  }, [config.id])

  useEffect(() => {
    let active = true
    getRecords(config.id)
      .then((loadedRecords) => {
        if (active) {
          setRecords(loadedRecords)
          setError('')
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : 'Could not load portal records.')
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [config.id])

  function update(name: string, value: string | number | boolean) {
    setValues((current) => ({ ...current, [name]: value }))
  }

  function renderField(field: PortalField) {
    if (field.type === 'checkbox') {
      return (
        <label className="checkbox-field">
          <input
            checked={Boolean(values[field.name])}
            name={field.name}
            onChange={(event) => update(field.name, event.target.checked)}
            type="checkbox"
          />
          {field.label}
        </label>
      )
    }

    if (field.type === 'select') {
      return (
        <select
          required={field.required}
          value={String(values[field.name])}
          onChange={(event) => update(field.name, event.target.value)}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      )
    }

    if (field.type === 'textarea') {
      return (
        <textarea
          required={field.required}
          value={String(values[field.name])}
          onChange={(event) => update(field.name, event.target.value)}
        />
      )
    }

    return (
      <input
        max={field.type === 'number' ? 5000 : undefined}
        min={field.min}
        required={field.required}
        step={field.step}
        type={field.type}
        value={String(values[field.name])}
        onChange={(event) => update(
          field.name,
          field.type === 'number' ? Number(event.target.value) : event.target.value,
        )}
      />
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setSuccess('')
    const payload = { ...values }
    if (typeof payload.allergens_from_menu === 'string') {
      payload.allergens_from_menu = payload.allergens_from_menu
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    }
    try {
      const record = await submitPortalRequest(config.id, payload)
      setSuccess(`Simulation record ${record.id} was created with status ${record.status}.`)
      await refreshRecords()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not submit this simulation request.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{config.eyebrow}</div>
          <h1>{config.name}</h1>
          <p className="subtitle">{config.description}</p>
        </div>
        <StatusPill tone="simulated">SIMULATED SERVICE</StatusPill>
      </div>

      <div className="service-banner">
        <strong>Simulation boundary:</strong> {config.notice}
      </div>

      <div className="grid two" style={{ marginTop: 16, alignItems: 'start' }}>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>{config.category}</h2>
              <p className="panel-description">Use the form to exercise this adapter independently.</p>
            </div>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              {config.fields.map((field) => (
                <div className={`field${field.full || field.type === 'checkbox' ? ' full' : ''}`} key={field.name}>
                  {field.type === 'checkbox' ? renderField(field) : (
                    <>
                      <label>{field.label}</label>
                      {renderField(field)}
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="button-row">
              <button className="button" disabled={submitting} type="submit">
                {submitting ? 'Submitting...' : config.submitLabel}
              </button>
            </div>
          </form>
          {success && <div className="result-banner" role="status">{success}</div>}
          {error && <div className="result-banner error" role="alert">{error}</div>}
          <p className="footer-note">Submitted values are stored locally in the project SQLite database for demo history.</p>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Simulation history</h2>
              <p className="panel-description">Recent locally recorded requests to this mock portal.</p>
            </div>
            <StatusPill tone="neutral">{`${records.length} RECORDS`}</StatusPill>
          </div>
          {loading ? <div className="empty-state">Loading simulation records...</div> : records.length === 0 ? (
            <div className="empty-state">No requests yet. Submit the form to create the first simulated record.</div>
          ) : (
            <div className="record-list">
              {records.map((record) => (
                <article className="record-item" key={record.id}>
                  <span className="trace-dot" />
                  <div className="record-copy">
                    <strong>{record.status.replaceAll('_', ' ')}</strong>
                    <span>{record.id} · {formatTime(record.created_at)}</span>
                    <span>{Object.entries(record.payload).slice(0, 3).map(([key, value]) => `${key.replaceAll('_', ' ')}: ${String(value)}`).join(' · ')}</span>
                  </div>
                  <StatusPill tone="simulated">SIMULATED</StatusPill>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
