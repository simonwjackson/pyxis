import { createFileRoute } from '@tanstack/react-router'
import { StationsPage } from '@/web/features/stations/stations-page'

export const Route = createFileRoute('/stations')({
	component: StationsPage,
})
