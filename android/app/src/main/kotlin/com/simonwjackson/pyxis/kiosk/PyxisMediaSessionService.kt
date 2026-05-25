package com.simonwjackson.pyxis.kiosk

import android.app.PendingIntent
import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

class PyxisMediaSessionService : MediaSessionService() {
    private var mediaSession: MediaSession? = null
    private var proxyPlayer: PyxisProxyPlayer? = null
    private var controller: PyxisMediaSessionController? = null

    override fun onCreate() {
        super.onCreate()
        val config = PyxisConfigs.debug
        Log.i("PyxisMediaSession", "service create bridgeEnabled=${config.isAndroidBridgeEnabled} server=${config.serverUrl}")
        val player = PyxisProxyPlayer(mainLooper) { command -> controller?.handleCommand(command) }
        proxyPlayer = player
        controller = PyxisMediaSessionController(
            playbackClient = if (config.isAndroidBridgeEnabled) {
                PyxisPlaybackClient(config.serverUrl, config.androidBridgeToken)
            } else {
                null
            },
            proxyPlayer = player,
        )
        mediaSession = MediaSession.Builder(this, player)
            .setSessionActivity(kioskPendingIntent())
            .build()
        controller?.refreshState()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onDestroy() {
        controller?.close()
        mediaSession?.release()
        mediaSession = null
        proxyPlayer?.release()
        proxyPlayer = null
        controller = null
        super.onDestroy()
    }

    private fun kioskPendingIntent(): PendingIntent {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            replaceExtras(Bundle.EMPTY)
        }
        return PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }
}
