import { createFileRoute } from '@tanstack/react-router'
import { PlaylistDetailPage } from '@/web/features/playlist-detail/playlist-detail-page'

function PlaylistDetailRoute() {
	const { playlistId } = Route.useParams()
	const search = Route.useSearch()
	return (
		<PlaylistDetailPage
			playlistId={playlistId}
			autoPlay={search.play === "1"}
			shuffle={search.shuffle === "1"}
			{...(search.startIndex != null ? { startIndex: search.startIndex } : {})}
		/>
	)
}

export const Route = createFileRoute('/playlist/$playlistId')({
	component: PlaylistDetailRoute,
	validateSearch: (search: Record<string, unknown>) => ({
		play: typeof search['play'] === 'string' ? search['play'] : undefined,
		startIndex: typeof search['startIndex'] === 'number' ? search['startIndex'] : undefined,
		shuffle: typeof search['shuffle'] === 'string' ? search['shuffle'] : undefined,
	}),
})
