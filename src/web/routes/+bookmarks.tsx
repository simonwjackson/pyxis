import { createFileRoute } from '@tanstack/react-router'
import { BookmarksPage } from '@/web/features/bookmarks/bookmarks-page'

export const Route = createFileRoute('/bookmarks')({
	component: BookmarksPage,
})
