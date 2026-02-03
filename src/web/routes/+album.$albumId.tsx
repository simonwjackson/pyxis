import { createFileRoute } from '@tanstack/react-router'
import { AlbumDetailPage } from '@/web/features/album-detail/album-detail-page'

function AlbumDetailRoute() {
	const { albumId } = Route.useParams()
	const search = Route.useSearch()
	return (
		<AlbumDetailPage
			albumId={albumId}
			autoPlay={search.play === "1"}
			shuffle={search.shuffle === "1"}
			{...(search.startIndex != null ? { startIndex: search.startIndex } : {})}
		/>
	)
}

export const Route = createFileRoute('/album/$albumId')({
	component: AlbumDetailRoute,
	validateSearch: (search: Record<string, unknown>) => ({
		play: typeof search['play'] === 'string' ? search['play'] : undefined,
		startIndex: typeof search['startIndex'] === 'number' ? search['startIndex'] : undefined,
		shuffle: typeof search['shuffle'] === 'string' ? search['shuffle'] : undefined,
	}),
})
