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
) {
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
        cleartextHost = "192.168.1.243",
        isTemporaryMvp = true,
    )
}
