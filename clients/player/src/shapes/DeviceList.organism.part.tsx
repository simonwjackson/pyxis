import { DeviceList } from "./DeviceList.tsx"
import { REVIEW_DEVICES } from "./entity-fixtures.ts"
export const name = "Device list"
// This device, a reachable one and an unreachable one: the three treatments, side by side.
export default function DeviceListPart() {
  return <DeviceList devices={REVIEW_DEVICES} onRetry={() => {}} />
}
