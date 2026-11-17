import { ServicePortal } from '../components/ServicePortal'
import { reloopConfig } from '../data/portalConfigs'

export function ReloopPage() {
  return <ServicePortal config={reloopConfig} />
}
