import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/web/features/settings/settings-page'

export const Route = createFileRoute('/settings/')({
	component: SettingsPage,
})
