package com.simonwjackson.pyxis.kiosk

import java.net.URI

enum class DeviceProfile {
    SonyNwA306,
}

data class PyxisConfig(
    val deviceProfile: DeviceProfile,
    val serverUrl: String,
    val cleartextHost: String,
    val isTemporaryMvp: Boolean,
    val androidBridgeToken: String,
) {
    val healthUrl: String = "${serverUrl}healthz"
    val androidBridgeStateUrl: String = "${serverUrl}android-media-bridge/state"
    val androidBridgeEventsUrl: String = "${serverUrl}android-media-bridge/events"
    val androidBridgeCommandsUrl: String = "${serverUrl}android-media-bridge/commands"
    val androidBridgeLogsUrl: String = "${serverUrl}android-media-bridge/logs"
    val isAndroidBridgeEnabled: Boolean = androidBridgeToken.isNotBlank()

    init {
        val uri = URI(serverUrl)
        require(uri.scheme == "http") { "Sony MVP uses explicit local-LAN HTTP only" }
        require(uri.host == cleartextHost) { "cleartextHost must match serverUrl host" }
        require(serverUrl.endsWith("/")) { "serverUrl must include a trailing slash" }
    }
}

object PyxisConfigs {
    val debug = PyxisConfig(
        deviceProfile = DeviceProfile.SonyNwA306,
        serverUrl = BuildConfig.PYXIS_SERVER_URL,
        cleartextHost = URI(BuildConfig.PYXIS_SERVER_URL).host,
        isTemporaryMvp = true,
        androidBridgeToken = BuildConfig.PYXIS_ANDROID_BRIDGE_TOKEN,
    )
}
