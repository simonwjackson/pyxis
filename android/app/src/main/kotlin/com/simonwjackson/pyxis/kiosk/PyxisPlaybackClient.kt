package com.simonwjackson.pyxis.kiosk

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

class PyxisPlaybackClient(
    private val serverUrl: String,
    private val bridgeToken: String,
    private val timeoutMillis: Int = 5_000,
    private val now: () -> Long = { System.currentTimeMillis() },
) {
    fun getState(): Result<PyxisPlaybackBridgeState> = runCatching {
        val body = request(
            path = "android-media-bridge/state",
            method = "GET",
            body = null,
        )
        PyxisBridgeJson.parseState(body, receivedAtMillis = now())
    }

    fun sendCommand(
        command: PyxisPlaybackCommand,
        correlationId: String = UUID.randomUUID().toString(),
        source: String = "android",
    ): Result<PyxisPlaybackCommandResult> = runCatching {
        val body = request(
            path = "android-media-bridge/commands",
            method = "POST",
            body = PyxisBridgeJson.encodeCommand(command, correlationId, source).toString(),
        )
        PyxisBridgeJson.parseCommandResult(body, receivedAtMillis = now())
    }

    private fun request(path: String, method: String, body: String?): String {
        val url = URL(serverUrl.resolvePath(path))
        val connection = url.openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects = false
            connection.requestMethod = method
            connection.connectTimeout = timeoutMillis
            connection.readTimeout = timeoutMillis
            connection.useCaches = false
            connection.setRequestProperty("X-Pyxis-Bridge-Token", bridgeToken)
            connection.setRequestProperty("Accept", "application/json")
            if (body != null) {
                val bytes = body.toByteArray(Charsets.UTF_8)
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Content-Length", bytes.size.toString())
                connection.outputStream.use { it.write(bytes) }
            }
            val status = connection.responseCode
            val responseBody = if (status in 200..299) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
            }
            if (status !in 200..299) throw IOException("bridge HTTP $status: $responseBody")
            return responseBody
        } finally {
            connection.disconnect()
        }
    }

    private fun String.resolvePath(path: String): String = if (endsWith("/")) "$this$path" else "$this/$path"
}
