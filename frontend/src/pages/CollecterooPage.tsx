import { ServicePortal } from '../components/ServicePortal'
import { collecterooConfig } from '../data/portalConfigs'

export function CollecterooPage() {
  return <ServicePortal config={collecterooConfig} />
}
