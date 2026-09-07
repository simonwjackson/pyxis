import { Notice } from "./Notice.tsx"
export const name = "Notice"

export default function NoticePart() {
  return <Notice message="This album was not moved. Your library is unchanged." tone="failure" />
}
