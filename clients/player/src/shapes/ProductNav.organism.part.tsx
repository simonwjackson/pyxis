import { ProductNav } from "./ProductNav.tsx"
export const name = "Product nav"
// Discovery carries a waiting count, which is the only variable thing in this component and
// therefore the thing the specimen has to show.
export default function ProductNavPart() {
  return <ProductNav current="stacks" accountName="Default" waiting={3} onOpenAccount={() => {}} />
}
