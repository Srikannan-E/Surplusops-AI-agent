import { ServicePortal } from '../components/ServicePortal'
import { foodBankConfig } from '../data/portalConfigs'

export function FoodBankPage() {
  return <ServicePortal config={foodBankConfig} />
}
