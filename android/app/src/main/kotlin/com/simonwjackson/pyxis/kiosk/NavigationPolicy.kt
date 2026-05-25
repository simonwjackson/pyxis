package com.simonwjackson.pyxis.kiosk

import java.net.URI

class NavigationPolicy(config: PyxisConfig) {
    private val allowedOrigin = URI(config.serverUrl)

    fun isAllowedMainFrameUrl(candidate: String): Boolean {
        val uri = runCatching { URI(candidate) }.getOrNull() ?: return false
        if (uri.userInfo != null) return false
        return uri.scheme == allowedOrigin.scheme &&
            uri.host == allowedOrigin.host &&
            effectivePort(uri) == effectivePort(allowedOrigin)
    }

    private fun effectivePort(uri: URI): Int = when {
        uri.port != -1 -> uri.port
        uri.scheme == "http" -> 80
        uri.scheme == "https" -> 443
        else -> -1
    }
}
