import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { JobSyncProvider } from './lib/JobSync'
import { ConsolePage } from './pages/ConsolePage'
import { ComposterPortalPage, DriverPortalPage, RecipientPortalPage } from './pages/Portals'

function App() {
  return (
    <BrowserRouter>
      <JobSyncProvider>
        <Routes>
          <Route path="/" element={<ConsolePage />} />
          <Route path="/portal/recipient" element={<RecipientPortalPage />} />
          <Route path="/portal/driver" element={<DriverPortalPage />} />
          <Route path="/portal/composter" element={<ComposterPortalPage />} />
        </Routes>
      </JobSyncProvider>
    </BrowserRouter>
  )
}

export default App
