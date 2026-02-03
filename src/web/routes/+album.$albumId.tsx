import { createFileRoute } from '@tanstack/react-router'
import { AlbumDetailPage } from '@/web/features/album-detail/album-detail-page'

function AlbumDetailRoute() {
	const { albumId } = Route.useParams()
	return <AlbumDetailPage albumId={albumId} />
}

export const Route = createFileRoute('/album/$albumId')({
	component: AlbumDetailRoute,
})
