/**
 * @module AlbumDetailPage
 * Composition root for library-backed and source-backed album detail flows.
 */

import { LibraryAlbumDetailRoot } from "./library-album-detail-root";
import { SourceAlbumDetailRoot } from "./source-album-detail-root";
import type { AlbumDetailPageProps } from "./types";

export function AlbumDetailPage(props: AlbumDetailPageProps) {
	return props.albumId.includes(":") ? (
		<SourceAlbumDetailRoot {...props} />
	) : (
		<LibraryAlbumDetailRoot {...props} />
	);
}
