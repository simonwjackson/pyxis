import { createFileRoute } from '@tanstack/react-router'
import { GenresPage } from '@/web/features/genres/genres-page'

export const Route = createFileRoute('/genres')({
	component: GenresPage,
})
