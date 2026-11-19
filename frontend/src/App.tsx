import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { JobSyncProvider } from './lib/JobSync'
import { ConsolePage } from './pages/ConsolePage'
import { CharityPortalPage, ComposterPortalPage, FoodBankPortalPage } from './pages/Portals'

function App() {
  return (
    <BrowserRouter>
      <JobSyncProvider>
        <Routes>
          <Route path="/" element={<ConsolePage />} />
          <Route path="/portal/food-bank" element={<FoodBankPortalPage />} />
          <Route path="/portal/charity" element={<CharityPortalPage />} />
          <Route path="/portal/compost" element={<ComposterPortalPage />} />
          <Route path="/portal/recipient" element={<Navigate to="/portal/food-bank" replace />} />
          <Route path="/portal/driver" element={<Navigate to="/portal/food-bank?tab=collection" replace />} />
          <Route path="/portal/composter" element={<Navigate to="/portal/compost" replace />} />
        </Routes>
      </JobSyncProvider>
    </BrowserRouter>
  )
}

export default App
