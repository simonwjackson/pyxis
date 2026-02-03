import { createFileRoute } from '@tanstack/react-router'
import { SearchPage } from '@/web/features/search/search-page'

export const Route = createFileRoute('/search/')({
	component: SearchPage,
})
