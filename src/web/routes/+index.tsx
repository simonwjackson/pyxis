import { createFileRoute } from '@tanstack/react-router'
import { HomePage } from '@/web/features/home/home-page'

export const Route = createFileRoute('/')({
	component: HomePage,
	validateSearch: (search: Record<string, unknown>) => ({
		pl_sort: typeof search['pl_sort'] === 'string' ? search['pl_sort'] : undefined,
		pl_page: typeof search['pl_page'] === 'string' ? Number(search['pl_page']) : undefined,
		al_sort: typeof search['al_sort'] === 'string' ? search['al_sort'] : undefined,
		al_page: typeof search['al_page'] === 'string' ? Number(search['al_page']) : undefined,
	}),
})
