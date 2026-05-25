/**
 * @module @app/api/rpc
 * Authoritative Effect RPC contract group for the Pyxis application API.
 *
 * Every RPC tag follows the `entity.concept.action` naming pattern enforced
 * by the cutover inventory (`server/rpc/cutoverInventory.test.ts`). Schemas
 * and tags live in the contracts layer so server handlers (U4/U5) and web
 * atoms (U6) can both import them without crossing the server/browser
 * boundary.
 */

import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import {
	SourceAlbumIdInputSchema,
	SourceAlbumSchema,
	SourceAlbumTrackListSchema,
	SourceAlbumWithTracksSchema,
} from "./contracts/album.js";
import {
	ArtistIdInputSchema,
	ArtistSchema,
	ArtistSearchInputSchema,
	ArtistSearchResponseSchema,
} from "./contracts/artist.js";
import {
	AuthStatusSchema,
	ChangeSettingsInputSchema,
	SetExplicitFilterInputSchema,
	SettingsSchema,
	UsageInfoSchema,
} from "./contracts/auth.js";
import {
	OkResponseSchema,
	PublicErrorSchema,
	SuccessResponseSchema,
} from "./contracts/common.js";
import {
	AddBookmarkInputSchema,
	BookmarksResponseSchema,
	HotAlbumsInputSchema,
	LibraryAlbumIdInputSchema,
	LibraryAlbumListSchema,
	LibraryAlbumSchema,
	LibraryAlbumStateListSchema,
	LibraryAlbumTrackListSchema,
	LibraryAlbumTracksInputSchema,
	ListLibraryAlbumsInputSchema,
	PandoraBookmarkSchema,
	RemoveBookmarkInputSchema,
	RemoveLibraryAlbumInputSchema,
	ResolveAlbumStatesInputSchema,
	SaveAlbumInputSchema,
	SaveAlbumResultSchema,
	SetAlbumPlacementInputSchema,
	UpdateAlbumInputSchema,
	UpdateLibraryTrackInputSchema,
} from "./contracts/library.js";
import {
	ListenLogInputSchema,
	ListenLogResponseSchema,
} from "./contracts/listenLog.js";
import { ClientLogInputSchema } from "./contracts/log.js";
import {
	JumpToIndexInputSchema,
	PlayerStateSchema,
	PlayInputSchema,
	ReportAudioErrorInputSchema,
	ReportDurationInputSchema,
	ReportProgressInputSchema,
	SeekInputSchema,
	TrackEndedInputSchema,
	VolumeInputSchema,
} from "./contracts/player.js";
import {
	CreatePlaylistRadioInputSchema,
	CreatePlaylistRadioResultSchema,
	PlaylistListSchema,
	PlaylistTrackListSchema,
	PlaylistTracksInputSchema,
} from "./contracts/playlist.js";
import {
	QueueAddInputSchema,
	QueueIndexInputSchema,
	QueueStateSchema,
} from "./contracts/queue.js";
import {
	AddRadioSeedInputSchema,
	CreateStationInputSchema,
	DeleteStationInputSchema,
	GenreCategoryListSchema,
	GetRadioTracksInputSchema,
	QuickMixInputSchema,
	RadioIdInputSchema,
	RadioTrackListSchema,
	RemoveRadioSeedInputSchema,
	RenameStationInputSchema,
	StationDetailSchema,
	StationSummaryListSchema,
} from "./contracts/radio.js";
import {
	PandoraSearchInputSchema,
	PandoraSearchResponseSchema,
	SearchInputSchema,
	SearchResponseSchema,
} from "./contracts/search.js";
import {
	RemoveTrackFeedbackInputSchema,
	TrackExplainResponseSchema,
	TrackFeedbackInputSchema,
	TrackFeedbackResultSchema,
	TrackIdRequestSchema,
	TrackMetadataSchema,
	TrackSleepInputSchema,
	TrackStreamUrlInputSchema,
	TrackStreamUrlResponseSchema,
} from "./contracts/track.js";

// --- Auth -----------------------------------------------------------------

const authStatusGet = Rpc.make("auth.status.get", {
	success: AuthStatusSchema,
	error: PublicErrorSchema,
});
const authSettingsGet = Rpc.make("auth.settings.get", {
	success: SettingsSchema,
	error: PublicErrorSchema,
});
const authUsageGet = Rpc.make("auth.usage.get", {
	success: UsageInfoSchema,
	error: PublicErrorSchema,
});
const authSettingsChange = Rpc.make("auth.settings.change", {
	payload: ChangeSettingsInputSchema,
	success: SuccessResponseSchema,
	error: PublicErrorSchema,
});
const authExplicitFilterSet = Rpc.make("auth.explicitFilter.set", {
	payload: SetExplicitFilterInputSchema,
	success: SuccessResponseSchema,
	error: PublicErrorSchema,
});

// --- Track ----------------------------------------------------------------

const trackMetadataGet = Rpc.make("track.metadata.get", {
	payload: TrackIdRequestSchema,
	success: TrackMetadataSchema,
	error: PublicErrorSchema,
});
const trackStreamUrlGet = Rpc.make("track.streamUrl.get", {
	payload: TrackStreamUrlInputSchema,
	success: TrackStreamUrlResponseSchema,
	error: PublicErrorSchema,
});
const trackFeedbackAdd = Rpc.make("track.feedback.add", {
	payload: TrackFeedbackInputSchema,
	success: TrackFeedbackResultSchema,
	error: PublicErrorSchema,
});
const trackFeedbackRemove = Rpc.make("track.feedback.remove", {
	payload: RemoveTrackFeedbackInputSchema,
	success: SuccessResponseSchema,
	error: PublicErrorSchema,
});
const trackSleepSet = Rpc.make("track.sleep.set", {
	payload: TrackSleepInputSchema,
	success: SuccessResponseSchema,
	error: PublicErrorSchema,
});
const trackExplanationGet = Rpc.make("track.explanation.get", {
	payload: TrackIdRequestSchema,
	success: TrackExplainResponseSchema,
	error: PublicErrorSchema,
});

// --- Album ----------------------------------------------------------------

const albumGet = Rpc.make("album.get", {
	payload: SourceAlbumIdInputSchema,
	success: SourceAlbumSchema,
	error: PublicErrorSchema,
});
const albumTracksList = Rpc.make("album.tracks.list", {
	payload: SourceAlbumIdInputSchema,
	success: SourceAlbumTrackListSchema,
	error: PublicErrorSchema,
});
const albumWithTracksGet = Rpc.make("album.withTracks.get", {
	payload: SourceAlbumIdInputSchema,
	success: SourceAlbumWithTracksSchema,
	error: PublicErrorSchema,
});

// --- Artist ---------------------------------------------------------------

const artistGet = Rpc.make("artist.get", {
	payload: ArtistIdInputSchema,
	success: ArtistSchema,
	error: PublicErrorSchema,
});
const artistSearch = Rpc.make("artist.search", {
	payload: ArtistSearchInputSchema,
	success: ArtistSearchResponseSchema,
	error: PublicErrorSchema,
});

// --- Radio ----------------------------------------------------------------

const radioStationsList = Rpc.make("radio.stations.list", {
	success: StationSummaryListSchema,
	error: PublicErrorSchema,
});
const radioStationGet = Rpc.make("radio.station.get", {
	payload: RadioIdInputSchema,
	success: StationDetailSchema,
	error: PublicErrorSchema,
});
const radioStationTracksGet = Rpc.make("radio.stationTracks.get", {
	payload: GetRadioTracksInputSchema,
	success: RadioTrackListSchema,
	error: PublicErrorSchema,
});
const radioStationCreate = Rpc.make("radio.station.create", {
	payload: CreateStationInputSchema,
	success: Schema.Unknown,
	error: PublicErrorSchema,
});
const radioStationDelete = Rpc.make("radio.station.delete", {
	payload: DeleteStationInputSchema,
	success: SuccessResponseSchema,
	error: PublicErrorSchema,
});
const radioStationRename = Rpc.make("radio.station.rename", {
	payload: RenameStationInputSchema,
	success: Schema.Unknown,
	error: PublicErrorSchema,
});
const radioGenresList = Rpc.make("radio.genres.list", {
	success: GenreCategoryListSchema,
	error: PublicErrorSchema,
});
const radioQuickMixSet = Rpc.make("radio.quickMix.set", {
	payload: QuickMixInputSchema,
	success: SuccessResponseSchema,
	error: PublicErrorSchema,
});
const radioSeedAdd = Rpc.make("radio.seed.add", {
	payload: AddRadioSeedInputSchema,
	success: Schema.Unknown,
	error: PublicErrorSchema,
});
const radioSeedRemove = Rpc.make("radio.seed.remove", {
	payload: RemoveRadioSeedInputSchema,
	success: SuccessResponseSchema,
	error: PublicErrorSchema,
});

// --- Playlist -------------------------------------------------------------

const playlistList = Rpc.make("playlist.list", {
	success: PlaylistListSchema,
	error: PublicErrorSchema,
});
const playlistTracksList = Rpc.make("playlist.tracks.list", {
	payload: PlaylistTracksInputSchema,
	success: PlaylistTrackListSchema,
	error: PublicErrorSchema,
});
const playlistRadioCreate = Rpc.make("playlist.radio.create", {
	payload: CreatePlaylistRadioInputSchema,
	success: CreatePlaylistRadioResultSchema,
	error: PublicErrorSchema,
});

// --- Library --------------------------------------------------------------

const libraryAlbumsList = Rpc.make("library.albums.list", {
	payload: ListLibraryAlbumsInputSchema,
	success: LibraryAlbumListSchema,
	error: PublicErrorSchema,
});
const libraryAlbumGet = Rpc.make("library.album.get", {
	payload: LibraryAlbumIdInputSchema,
	success: Schema.Union([LibraryAlbumSchema, Schema.Null]),
	error: PublicErrorSchema,
});
const libraryHotAlbumsList = Rpc.make("library.hotAlbums.list", {
	payload: HotAlbumsInputSchema,
	success: LibraryAlbumListSchema,
	error: PublicErrorSchema,
});
const libraryAlbumStatesResolve = Rpc.make("library.albumStates.resolve", {
	payload: ResolveAlbumStatesInputSchema,
	success: LibraryAlbumStateListSchema,
	error: PublicErrorSchema,
});
const libraryAlbumTracksList = Rpc.make("library.albumTracks.list", {
	payload: LibraryAlbumTracksInputSchema,
	success: LibraryAlbumTrackListSchema,
	error: PublicErrorSchema,
});
const libraryAlbumSave = Rpc.make("library.album.save", {
	payload: SaveAlbumInputSchema,
	success: SaveAlbumResultSchema,
	error: PublicErrorSchema,
});
const libraryAlbumPlacementSet = Rpc.make("library.albumPlacement.set", {
	payload: SetAlbumPlacementInputSchema,
	success: LibraryAlbumSchema,
	error: PublicErrorSchema,
});
const libraryAlbumRemove = Rpc.make("library.album.remove", {
	payload: RemoveLibraryAlbumInputSchema,
	success: SuccessResponseSchema,
	error: PublicErrorSchema,
});
const libraryAlbumUpdate = Rpc.make("library.album.update", {
	payload: UpdateAlbumInputSchema,
	success: SuccessResponseSchema,
	error: PublicErrorSchema,
});
const libraryTrackUpdate = Rpc.make("library.track.update", {
	payload: UpdateLibraryTrackInputSchema,
	success: SuccessResponseSchema,
	error: PublicErrorSchema,
});
const libraryBookmarksList = Rpc.make("library.bookmarks.list", {
	success: BookmarksResponseSchema,
	error: PublicErrorSchema,
});
const libraryBookmarkAdd = Rpc.make("library.bookmark.add", {
	payload: AddBookmarkInputSchema,
	success: PandoraBookmarkSchema,
	error: PublicErrorSchema,
});
const libraryBookmarkRemove = Rpc.make("library.bookmark.remove", {
	payload: RemoveBookmarkInputSchema,
	success: SuccessResponseSchema,
	error: PublicErrorSchema,
});

// --- Search ---------------------------------------------------------------

const searchPandora = Rpc.make("search.pandora", {
	payload: PandoraSearchInputSchema,
	success: PandoraSearchResponseSchema,
	error: PublicErrorSchema,
});
const searchUnified = Rpc.make("search.unified", {
	payload: SearchInputSchema,
	success: SearchResponseSchema,
	error: PublicErrorSchema,
});

// --- Player ---------------------------------------------------------------

const playerStateGet = Rpc.make("player.state.get", {
	success: PlayerStateSchema,
	error: PublicErrorSchema,
});
const playerPlay = Rpc.make("player.play", {
	payload: PlayInputSchema,
	success: PlayerStateSchema,
	error: PublicErrorSchema,
});
const playerPause = Rpc.make("player.pause", {
	success: PlayerStateSchema,
	error: PublicErrorSchema,
});
const playerResume = Rpc.make("player.resume", {
	success: PlayerStateSchema,
	error: PublicErrorSchema,
});
const playerStop = Rpc.make("player.stop", {
	success: PlayerStateSchema,
	error: PublicErrorSchema,
});
const playerSkip = Rpc.make("player.skip", {
	success: PlayerStateSchema,
	error: PublicErrorSchema,
});
const playerPrevious = Rpc.make("player.previous", {
	success: PlayerStateSchema,
	error: PublicErrorSchema,
});
const playerJumpTo = Rpc.make("player.jumpTo", {
	payload: JumpToIndexInputSchema,
	success: PlayerStateSchema,
	error: PublicErrorSchema,
});
const playerSeek = Rpc.make("player.seek", {
	payload: SeekInputSchema,
	success: PlayerStateSchema,
	error: PublicErrorSchema,
});
const playerVolumeSet = Rpc.make("player.volume.set", {
	payload: VolumeInputSchema,
	success: PlayerStateSchema,
	error: PublicErrorSchema,
});
const playerProgressReport = Rpc.make("player.progress.report", {
	payload: ReportProgressInputSchema,
	success: OkResponseSchema,
	error: PublicErrorSchema,
});
const playerDurationReport = Rpc.make("player.duration.report", {
	payload: ReportDurationInputSchema,
	success: OkResponseSchema,
	error: PublicErrorSchema,
});
const playerAudioErrorReport = Rpc.make("player.audioError.report", {
	payload: ReportAudioErrorInputSchema,
	success: OkResponseSchema,
	error: PublicErrorSchema,
});
const playerTrackEnded = Rpc.make("player.trackEnded", {
	payload: TrackEndedInputSchema,
	success: PlayerStateSchema,
	error: PublicErrorSchema,
});
const playerStateStream = Rpc.make("player.state.stream", {
	success: PlayerStateSchema,
	error: PublicErrorSchema,
	stream: true,
});

// --- Queue ----------------------------------------------------------------

const queueStateGet = Rpc.make("queue.state.get", {
	success: QueueStateSchema,
	error: PublicErrorSchema,
});
const queueTracksAdd = Rpc.make("queue.tracks.add", {
	payload: QueueAddInputSchema,
	success: QueueStateSchema,
	error: PublicErrorSchema,
});
const queueTrackRemove = Rpc.make("queue.track.remove", {
	payload: QueueIndexInputSchema,
	success: QueueStateSchema,
	error: PublicErrorSchema,
});
const queueClear = Rpc.make("queue.clear", {
	success: QueueStateSchema,
	error: PublicErrorSchema,
});
const queueJump = Rpc.make("queue.jump", {
	payload: QueueIndexInputSchema,
	success: QueueStateSchema,
	error: PublicErrorSchema,
});
const queueShuffle = Rpc.make("queue.shuffle", {
	success: QueueStateSchema,
	error: PublicErrorSchema,
});
const queueStateStream = Rpc.make("queue.state.stream", {
	success: QueueStateSchema,
	error: PublicErrorSchema,
	stream: true,
});

// --- Log / Listen Log -----------------------------------------------------

const logClientWrite = Rpc.make("log.client.write", {
	payload: ClientLogInputSchema,
	success: OkResponseSchema,
	error: PublicErrorSchema,
});
const listenLogEntriesList = Rpc.make("listenLog.entries.list", {
	payload: ListenLogInputSchema,
	success: ListenLogResponseSchema,
	error: PublicErrorSchema,
});

/**
 * Full Effect RPC group for the application API. Server handlers
 * (`server/rpc/handlers/**`) and web atoms (`src/web/shared/api/rpcClient.ts`)
 * both import this single group so the wire contract stays single-sourced.
 */
export const PyxisRpc = RpcGroup.make(
	authStatusGet,
	authSettingsGet,
	authUsageGet,
	authSettingsChange,
	authExplicitFilterSet,
	trackMetadataGet,
	trackStreamUrlGet,
	trackFeedbackAdd,
	trackFeedbackRemove,
	trackSleepSet,
	trackExplanationGet,
	albumGet,
	albumTracksList,
	albumWithTracksGet,
	artistGet,
	artistSearch,
	radioStationsList,
	radioStationGet,
	radioStationTracksGet,
	radioStationCreate,
	radioStationDelete,
	radioStationRename,
	radioGenresList,
	radioQuickMixSet,
	radioSeedAdd,
	radioSeedRemove,
	playlistList,
	playlistTracksList,
	playlistRadioCreate,
	libraryAlbumsList,
	libraryAlbumGet,
	libraryHotAlbumsList,
	libraryAlbumStatesResolve,
	libraryAlbumTracksList,
	libraryAlbumSave,
	libraryAlbumPlacementSet,
	libraryAlbumRemove,
	libraryAlbumUpdate,
	libraryTrackUpdate,
	libraryBookmarksList,
	libraryBookmarkAdd,
	libraryBookmarkRemove,
	searchPandora,
	searchUnified,
	playerStateGet,
	playerPlay,
	playerPause,
	playerResume,
	playerStop,
	playerSkip,
	playerPrevious,
	playerJumpTo,
	playerSeek,
	playerVolumeSet,
	playerProgressReport,
	playerDurationReport,
	playerAudioErrorReport,
	playerTrackEnded,
	playerStateStream,
	queueStateGet,
	queueTracksAdd,
	queueTrackRemove,
	queueClear,
	queueJump,
	queueShuffle,
	queueStateStream,
	logClientWrite,
	listenLogEntriesList,
);

export type PyxisRpcGroup = typeof PyxisRpc;
