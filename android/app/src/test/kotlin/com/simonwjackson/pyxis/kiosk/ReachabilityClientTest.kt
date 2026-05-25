package com.simonwjackson.pyxis.kiosk

import java.net.ServerSocket
import kotlin.concurrent.thread
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class ReachabilityClientTest {
    @Test
    fun acceptsOnlyExpectedPyxisHealthMarker() {
        withServer(200, "application/json", "{\"service\":\"pyxis\",\"status\":\"ok\"}") { url ->
            val result = ReachabilityClient(timeoutMillis = 1_000).check("$url/healthz")

            assertEquals(ReachabilityOutcome.Reachable, result)
        }
    }

    @Test
    fun rejectsNonPyxisJson() {
        withServer(200, "application/json", "{\"service\":\"not-pyxis\",\"status\":\"ok\"}") { url ->
            val result = ReachabilityClient(timeoutMillis = 1_000).check("$url/healthz")

            assertEquals(ReachabilityOutcome.Unreachable(ReachabilityFailure.WrongHost), result)
        }
    }

    @Test
    fun mapsHttpErrorsToHttpErrorFailure() {
        withServer(503, "application/json", "{}") { url ->
            val result = ReachabilityClient(timeoutMillis = 1_000).check("$url/healthz")

            assertEquals(ReachabilityOutcome.Unreachable(ReachabilityFailure.HttpError), result)
        }
    }

    @Test
    fun mapsConnectionRefused() {
        val result = ReachabilityClient(timeoutMillis = 200).check("http://127.0.0.1:9/healthz")

        assertIs<ReachabilityOutcome.Unreachable>(result)
    }

    private fun withServer(
        status: Int,
        contentType: String,
        body: String,
        block: (String) -> Unit,
    ) {
        val server = ServerSocket(0)
        val port = server.localPort
        val worker = thread(start = true) {
            server.use { socket ->
                val client = socket.accept()
                client.use {
                    it.getInputStream().bufferedReader().readLine()
                    val bytes = body.toByteArray()
                    val response = buildString {
                        append("HTTP/1.1 $status Test\r\n")
                        append("Content-Type: $contentType\r\n")
                        append("Cache-Control: no-store\r\n")
                        append("Content-Length: ${bytes.size}\r\n")
                        append("Connection: close\r\n")
                        append("\r\n")
                    }.toByteArray() + bytes
                    it.getOutputStream().write(response)
                }
            }
        }
        try {
            block("http://127.0.0.1:$port")
        } finally {
            server.close()
            worker.join(500)
        }
    }
}
