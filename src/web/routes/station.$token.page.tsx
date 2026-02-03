import { createFileRoute } from '@tanstack/react-router'
import { StationDetailPage } from '@/web/features/station-detail/station-detail-page'

function StationDetailRoute() {
	const { token } = Route.useParams()
	return <StationDetailPage token={token} />
}

export const Route = createFileRoute('/station/$token/')({
	component: StationDetailRoute,
})
