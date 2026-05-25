package com.simonwjackson.pyxis.kiosk

import org.json.JSONObject

object PyxisBridgeJson {
    fun parseState(json: String, receivedAtMillis: Long = System.currentTimeMillis()): PyxisPlaybackBridgeState =
        parseState(JSONObject(json), receivedAtMillis)

    fun parseState(json: JSONObject, receivedAtMillis: Long = System.currentTimeMillis()): PyxisPlaybackBridgeState {
        val trackJson = json.optJSONObject("currentTrack")
        val actionsJson = json.getJSONArray("availableActions")
        val actions = buildSet {
            for (index in 0 until actionsJson.length()) {
                PyxisPlaybackCommand.fromWire(actionsJson.getString(index))?.let(::add)
            }
        }
        return PyxisPlaybackBridgeState(
            status = requireNotNull(PyxisBridgeStatus.fromWire(json.getString("status"))) { "unknown status" },
            availability = requireNotNull(PyxisBridgeAvailability.fromWire(json.getString("availability"))) { "unknown availability" },
            currentTrack = trackJson?.let(::parseTrack),
            progressSeconds = json.getDouble("progress"),
            durationSeconds = json.getDouble("duration"),
            stateRevision = json.getLong("stateRevision"),
            stateUpdatedAt = json.getLong("stateUpdatedAt"),
            publishedAt = json.getLong("publishedAt"),
            audioObservedAt = if (json.isNull("audioObservedAt")) null else json.getLong("audioObservedAt"),
            availableActions = actions,
            receivedAtMillis = receivedAtMillis,
        )
    }

    fun parseCommandResult(json: String, receivedAtMillis: Long = System.currentTimeMillis()): PyxisPlaybackCommandResult {
        val obj = JSONObject(json)
        return PyxisPlaybackCommandResult(
            outcome = requireNotNull(PyxisCommandOutcome.fromWire(obj.getString("outcome"))) { "unknown outcome" },
            state = parseState(obj.getJSONObject("state"), receivedAtMillis),
            correlationId = obj.getString("correlationId"),
        )
    }

    fun encodeCommand(command: PyxisPlaybackCommand, correlationId: String, source: String): JSONObject = JSONObject()
        .put("action", command.wireValue)
        .put("correlationId", correlationId)
        .put("source", source)

    private fun parseTrack(json: JSONObject): PyxisBridgeTrack = PyxisBridgeTrack(
        id = json.getString("id"),
        title = json.getString("title"),
        artist = json.getString("artist"),
        album = json.getString("album"),
        durationSeconds = if (json.isNull("duration")) null else json.getDouble("duration"),
        artworkUrl = if (json.isNull("artworkUrl")) null else json.getString("artworkUrl"),
    )
}
