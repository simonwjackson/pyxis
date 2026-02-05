import { createFileRoute } from '@tanstack/react-router'
import { HomePage } from '@/web/features/home/home-page'

export const Route = createFileRoute('/')({
	component: HomePage,
	validateSearch: (search: Record<string, unknown>) => {
		const parsePage = (value: unknown): number | undefined => {
			if (typeof value === "number") {
				return Number.isFinite(value) ? value : undefined;
			}
			if (typeof value === "string") {
				const parsed = Number.parseInt(value, 10);
				return Number.isFinite(parsed) ? parsed : undefined;
			}
			return undefined;
		};

		return {
			pl_sort: typeof search['pl_sort'] === 'string' ? search['pl_sort'] : undefined,
			pl_page: parsePage(search['pl_page']),
			al_sort: typeof search['al_sort'] === 'string' ? search['al_sort'] : undefined,
			al_page: parsePage(search['al_page']),
		};
	},
})
