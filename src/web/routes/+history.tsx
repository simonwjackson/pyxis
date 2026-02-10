import { createFileRoute } from '@tanstack/react-router'
import { HistoryPage } from '@/web/features/history/history-page'

export const Route = createFileRoute('/history')({
	component: HistoryPage,
})
