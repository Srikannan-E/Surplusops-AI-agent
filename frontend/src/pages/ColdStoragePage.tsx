import { ServicePortal } from '../components/ServicePortal'
import { coldStorageConfig } from '../data/portalConfigs'

export function ColdStoragePage() {
  return <ServicePortal config={coldStorageConfig} />
}
