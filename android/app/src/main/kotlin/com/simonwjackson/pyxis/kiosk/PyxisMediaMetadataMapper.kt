package com.simonwjackson.pyxis.kiosk

import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata

object PyxisMediaMetadataMapper {
    fun toMediaItem(state: PyxisPlaybackBridgeState): MediaItem? {
        val track = state.currentTrack ?: return null
        val metadata = MediaMetadata.Builder()
            .setTitle(track.title)
            .setArtist(track.artist)
            .setAlbumTitle(track.album)
            .setArtworkUri(track.artworkUrl?.takeIf(::isSafeArtworkUrl)?.let(Uri::parse))
            .build()
        return MediaItem.Builder()
            .setMediaId(track.id)
            .setMediaMetadata(metadata)
            .build()
    }

    private fun isSafeArtworkUrl(value: String): Boolean = value.startsWith("http://") || value.startsWith("https://")
}
