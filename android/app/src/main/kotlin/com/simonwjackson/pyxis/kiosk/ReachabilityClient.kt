package com.simonwjackson.pyxis.kiosk

import java.io.IOException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException

class ReachabilityClient(
    private val timeoutMillis: Int = 3_000,
) {
    fun check(healthUrl: String): ReachabilityOutcome {
        val connection = runCatching { URL(healthUrl).openConnection() as HttpURLConnection }
            .getOrElse { return ReachabilityOutcome.Unreachable(ReachabilityFailure.Other) }

        return try {
            connection.instanceFollowRedirects = false
            connection.requestMethod = "GET"
            connection.connectTimeout = timeoutMillis
            connection.readTimeout = timeoutMillis
            connection.useCaches = false

            val status = connection.responseCode
            if (status != 200) {
                return ReachabilityOutcome.Unreachable(ReachabilityFailure.HttpError)
            }

            val contentType = connection.getHeaderField("Content-Type") ?: ""
            val cacheControl = connection.getHeaderField("Cache-Control") ?: ""
            val body = connection.inputStream.bufferedReader().use { it.readText() }

            if (
                contentType.substringBefore(";") == "application/json" &&
                cacheControl.split(',').any { it.trim().equals("no-store", ignoreCase = true) } &&
                body.contains("\"service\":\"pyxis\"") &&
                body.contains("\"status\":\"ok\"")
            ) {
                ReachabilityOutcome.Reachable
            } else {
                ReachabilityOutcome.Unreachable(ReachabilityFailure.WrongHost)
            }
        } catch (_: UnknownHostException) {
            ReachabilityOutcome.Unreachable(ReachabilityFailure.NameLookup)
        } catch (_: SocketTimeoutException) {
            ReachabilityOutcome.Unreachable(ReachabilityFailure.Timeout)
        } catch (_: IOException) {
            ReachabilityOutcome.Unreachable(ReachabilityFailure.ConnectionRefused)
        } finally {
            connection.disconnect()
        }
    }
}
