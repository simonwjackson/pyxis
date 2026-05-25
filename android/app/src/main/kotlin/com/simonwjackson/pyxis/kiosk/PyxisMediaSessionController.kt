package com.simonwjackson.pyxis.kiosk

import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

private const val MEDIA_SESSION_TAG = "PyxisMediaSession"

class PyxisMediaSessionController(
    private val playbackClient: PyxisPlaybackClient?,
    private val proxyPlayer: PyxisProxyPlayer,
    private val mainHandler: Handler = Handler(Looper.getMainLooper()),
    private val executor: ExecutorService = Executors.newSingleThreadExecutor(),
) {
    fun refreshState() {
        val client = playbackClient ?: run {
            Log.w(MEDIA_SESSION_TAG, "refresh skipped: bridge client disabled")
            return
        }
        executor.execute {
            val result = client.getState()
            val state = result.getOrElse {
                Log.w(MEDIA_SESSION_TAG, "refresh failed: ${it.message}")
                return@execute
            }
            Log.i(MEDIA_SESSION_TAG, "refresh state status=${state.status} availability=${state.availability} actions=${state.availableActions}")
            applyState(state)
        }
    }

    fun handleCommand(command: PyxisPlaybackCommand) {
        val client = playbackClient ?: run {
            Log.w(MEDIA_SESSION_TAG, "command skipped: bridge client disabled command=$command")
            return
        }
        executor.execute {
            val result = client.sendCommand(command).getOrElse {
                Log.w(MEDIA_SESSION_TAG, "command failed command=$command: ${it.message}")
                return@execute
            }
            Log.i(MEDIA_SESSION_TAG, "command result command=$command outcome=${result.outcome}")
            applyState(result.state)
        }
    }

    fun close() {
        executor.shutdownNow()
    }

    private fun applyState(state: PyxisPlaybackBridgeState) {
        mainHandler.post { proxyPlayer.applyBridgeState(state) }
    }
}
