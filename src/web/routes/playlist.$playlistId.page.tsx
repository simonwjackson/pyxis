import { createFileRoute } from '@tanstack/react-router'
import { PlaylistDetailPage } from '@/web/features/playlist-detail/playlist-detail-page'

function PlaylistDetailRoute() {
	const { playlistId } = Route.useParams()
	return <PlaylistDetailPage playlistId={playlistId} />
}

export const Route = createFileRoute('/playlist/$playlistId/')({
	component: PlaylistDetailRoute,
})
