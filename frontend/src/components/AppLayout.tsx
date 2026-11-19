import type { ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getHealth } from '../lib/api'
import '../App.css'

const personaItems = [
  { value: '/chef', label: 'Chef' },
  { value: '/recipient', label: 'Recipient' },
  { value: '/driver', label: 'Driver' },
  { value: '/organiser', label: 'Organiser' },
  { value: '/audit', label: 'Hotel manager' },
]

const navGroups = [
  {
    label: 'Rescue flow',
    links: [
      { to: '/chef', label: 'Chef intake', icon: '01' },
      { to: '/command', label: 'Agent command centre', icon: '02' },
      { to: '/recipient', label: 'Recipient portal', icon: '03' },
      { to: '/driver', label: 'Driver and handover', icon: '04' },
      { to: '/organiser', label: 'Organiser alert', icon: '05' },
    ],
  },
  {
    label: 'Evidence',
    links: [
      { to: '/compost', label: 'Compost booking', icon: '06' },
      { to: '/audit', label: 'Audit and dashboard', icon: '07' },
      { to: '/requests', label: 'Partner requests log', icon: '08' },
    ],
  },
  {
    label: 'Mock adapters',
    links: [
      { to: '/services/uae-food-bank', label: 'Food Bank adapter', icon: 'A1' },
      { to: '/services/collecteroo', label: 'Collecteroo adapter', icon: 'A2' },
      { to: '/services/reloop', label: 'Reloop adapter', icon: 'A3' },
      { to: '/services/registered-charity', label: 'Registered charity', icon: 'A4' },
    ],
  },
]

export function AppLayout({ children }: { children: ReactNode }) {
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const navigate = useNavigate()
  const location = useLocation()
  const activePersona = personaItems.find((item) => location.pathname.startsWith(item.value))?.value ?? '/chef'

  useEffect(() => {
    let active = true
    const check = () => {
      getHealth()
        .then(() => active && setApiStatus('online'))
        .catch(() => active && setApiStatus('offline'))
    }
    check()
    const timer = window.setInterval(check, 15000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <span>
            SurplusOps
            <small>Dubai Rescue Network</small>
          </span>
        </div>
        <div className="topbar-right">
          <span className="connection">
            {apiStatus === 'checking' ? 'Checking API' : apiStatus === 'online' ? 'Simulation API online' : 'API offline'}
          </span>
          <label className="persona-switcher">
            <span>Viewing as</span>
            <select
              aria-label="Switch demo persona"
              onChange={(event) => navigate(event.target.value)}
              value={activePersona}
            >
              {personaItems.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <span className="demo-label">Demo environment</span>
        </div>
      </header>
      <div className="layout">
        <aside className="sidebar">
          <nav aria-label="Main navigation">
            {navGroups.map((group) => (
              <div className="nav-group" key={group.label}>
                <div className="nav-label">{group.label}</div>
                {group.links.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                  >
                    <span className="nav-icon">{item.icon}</span>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-note">
            <strong>Simulation only</strong>
            These portals do not contact government services, charities, couriers, or waste providers.
          </div>
        </aside>
        <main className="main">{children}</main>
      </div>
    </div>
  )
}
