import { createFileRoute } from '@tanstack/react-router'
import { NowPlayingPage } from '@/web/features/now-playing/now-playing-page'

function NowPlayingRoute() {
	const search = Route.useSearch()
	return <NowPlayingPage search={search} />
}

export const Route = createFileRoute('/now-playing')({
	component: NowPlayingRoute,
	validateSearch: (search: Record<string, unknown>) => ({
		station: typeof search['station'] === 'string' ? search['station'] : undefined,
		playlist: typeof search['playlist'] === 'string' ? search['playlist'] : undefined,
		album: typeof search['album'] === 'string' ? search['album'] : undefined,
		startIndex: typeof search['startIndex'] === 'number' ? search['startIndex'] : undefined,
		shuffle: typeof search['shuffle'] === 'string' ? search['shuffle'] : undefined,
	}),
})
