package com.simonwjackson.pyxis.kiosk

import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

class PyxisProxyPlayerState(
    initial: PyxisMediaSessionProjection = PyxisMediaSessionProjection.stoppedWithoutTrack(),
) {
    var current: PyxisMediaSessionProjection = initial
        private set

    fun apply(projection: PyxisMediaSessionProjection) {
        current = projection
    }
}

class PyxisProxyPlayer(
    looper: Looper,
    private val commandHandler: (PyxisPlaybackCommand) -> Unit,
) : SimpleBasePlayer(looper) {
    private var bridgeState: PyxisPlaybackBridgeState? = null

    fun applyBridgeState(state: PyxisPlaybackBridgeState) {
        bridgeState = state
        invalidateState()
    }

    override fun getState(): State {
        val state = bridgeState ?: return State.Builder()
            .setAvailableCommands(Player.Commands.EMPTY)
            .setPlaybackState(Player.STATE_IDLE)
            .setPlayWhenReady(false, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
            .build()

        val item = PyxisMediaMetadataMapper.toMediaItem(state)
        val builder = State.Builder()
            .setAvailableCommands(PyxisMediaCommandMapper.availablePlayerCommands(state))
            .setPlaybackState(if (item == null) Player.STATE_IDLE else Player.STATE_READY)
            .setPlayWhenReady(state.status == PyxisBridgeStatus.Playing, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
            .setContentPositionMs((state.progressSeconds * 1_000).toLong())

        if (item != null) {
            val durationUs = state.currentTrack?.durationSeconds?.let { (it * 1_000_000).toLong() } ?: C.TIME_UNSET
            builder.setPlaylist(
                listOf(
                    MediaItemData.Builder(item.mediaId)
                        .setMediaItem(item)
                        .setMediaMetadata(item.mediaMetadata)
                        .setDurationUs(durationUs)
                        .build(),
                ),
            )
        }
        return builder.build()
    }

    override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
        commandHandler(if (playWhenReady) PyxisPlaybackCommand.Play else PyxisPlaybackCommand.Pause)
        return Futures.immediateVoidFuture()
    }

    override fun handleSeek(mediaItemIndex: Int, positionMs: Long, seekCommand: Int): ListenableFuture<*> {
        when (seekCommand) {
            Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM -> commandHandler(PyxisPlaybackCommand.Next)
            Player.COMMAND_SEEK_TO_PREVIOUS, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> commandHandler(PyxisPlaybackCommand.Previous)
        }
        return Futures.immediateVoidFuture()
    }
}
