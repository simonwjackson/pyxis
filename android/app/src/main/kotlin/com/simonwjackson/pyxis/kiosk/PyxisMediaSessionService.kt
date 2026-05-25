package com.simonwjackson.pyxis.kiosk

import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

class PyxisMediaSessionService : MediaSessionService() {
    private var mediaSession: MediaSession? = null

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onDestroy() {
        mediaSession?.release()
        mediaSession = null
        super.onDestroy()
    }
}
