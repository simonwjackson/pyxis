package com.simonwjackson.pyxis.kiosk

import java.net.ServerSocket
import kotlin.concurrent.thread
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class PyxisPlaybackClientTest {
    @Test
    fun readsAuthorizedStateSnapshot() {
        withBridgeServer { request ->
            assertEquals("secret", request.headers["x-pyxis-bridge-token"])
            TestHttpResponse(200, playingBridgeJson())
        }.useServer { baseUrl ->
            val client = PyxisPlaybackClient(baseUrl, bridgeToken = "secret", timeoutMillis = 1_000, now = { 2_000 })

            val result = client.getState()

            assertEquals(PyxisBridgeStatus.Playing, result.getOrThrow().status)
            assertEquals(2_000, result.getOrThrow().receivedAtMillis)
        }
    }

    @Test
    fun sendsTokenHeaderButNotTokenBodyForCommands() {
        withBridgeServer { request ->
            assertEquals("secret", request.headers["x-pyxis-bridge-token"])
            assertFalse(request.body.contains("secret"))
            TestHttpResponse(200, """
                {"outcome":"applied","correlationId":"corr-1","state":${playingBridgeJson()}}
            """.trimIndent())
        }.useServer { baseUrl ->
            val client = PyxisPlaybackClient(baseUrl, bridgeToken = "secret", timeoutMillis = 1_000, now = { 2_000 })

            val result = client.sendCommand(PyxisPlaybackCommand.Pause, correlationId = "corr-1", source = "test")

            assertEquals(PyxisCommandOutcome.Applied, result.getOrThrow().outcome)
        }
    }

    @Test
    fun mapsHttpFailureToFailureResult() {
        withBridgeServer { TestHttpResponse(401, "{\"error\":\"unauthorized\"}") }.useServer { baseUrl ->
            val client = PyxisPlaybackClient(baseUrl, bridgeToken = "bad", timeoutMillis = 1_000, now = { 2_000 })

            val result = client.getState()

            assertEquals(true, result.isFailure)
        }
    }

    private fun BridgeServer.useServer(block: (String) -> Unit) {
        try {
            block(url)
        } finally {
            close()
        }
    }
}

data class TestHttpRequest(
    val path: String,
    val headers: Map<String, String>,
    val body: String,
)

data class TestHttpResponse(
    val status: Int,
    val body: String,
)

class BridgeServer(
    private val server: ServerSocket,
    private val worker: Thread,
) {
    val url: String = "http://127.0.0.1:${server.localPort}/"
    fun close() {
        server.close()
        worker.join(500)
    }
}

fun withBridgeServer(handler: (TestHttpRequest) -> TestHttpResponse): BridgeServer {
    val server = ServerSocket(0)
    val worker = thread(start = true) {
        server.use { socket ->
            val client = socket.accept()
            client.use {
                val reader = it.getInputStream().bufferedReader()
                val requestLine = reader.readLine()
                val headers = mutableMapOf<String, String>()
                var line = reader.readLine()
                while (line != null && line.isNotEmpty()) {
                    val index = line.indexOf(':')
                    if (index > 0) headers[line.substring(0, index).lowercase()] = line.substring(index + 1).trim()
                    line = reader.readLine()
                }
                val length = headers["content-length"]?.toIntOrNull() ?: 0
                val chars = CharArray(length)
                if (length > 0) reader.read(chars)
                val response = handler(TestHttpRequest(requestLine.substringAfter(' ').substringBefore(' '), headers, String(chars)))
                val bytes = response.body.toByteArray()
                val raw = buildString {
                    append("HTTP/1.1 ${response.status} Test\r\n")
                    append("Content-Type: application/json\r\n")
                    append("Cache-Control: no-store\r\n")
                    append("Content-Length: ${bytes.size}\r\n")
                    append("Connection: close\r\n")
                    append("\r\n")
                }.toByteArray() + bytes
                it.getOutputStream().write(raw)
            }
        }
    }
    return BridgeServer(server, worker)
}
