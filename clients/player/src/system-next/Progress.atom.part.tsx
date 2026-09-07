import { Progress } from "./Progress.tsx"
export const name = "Progress"

export default function ProgressPart() {
  return <Progress label="Download progress" percentage={37} />
}
