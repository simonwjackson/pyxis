package com.simonwjackson.pyxis.kiosk

class PyxisMediaSessionController(
    private val playbackClient: PyxisPlaybackClient?,
    private val proxyPlayer: PyxisProxyPlayer,
) {
    fun refreshState() {
        val state = playbackClient?.getState()?.getOrNull() ?: return
        proxyPlayer.applyBridgeState(state)
    }

    fun handleCommand(command: PyxisPlaybackCommand) {
        val result = playbackClient?.sendCommand(command)?.getOrNull() ?: return
        proxyPlayer.applyBridgeState(result.state)
    }
}
