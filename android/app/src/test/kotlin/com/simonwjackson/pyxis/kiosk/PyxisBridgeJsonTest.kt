package com.simonwjackson.pyxis.kiosk

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull

class PyxisBridgeJsonTest {
    @Test
    fun parsesPlayingBridgeState() {
        val state = PyxisBridgeJson.parseState(playingBridgeJson())

        assertEquals(PyxisBridgeStatus.Playing, state.status)
        assertEquals(PyxisBridgeAvailability.Controllable, state.availability)
        assertEquals("Bridge Track", state.currentTrack?.title)
        assertEquals(setOf(PyxisPlaybackCommand.Pause, PyxisPlaybackCommand.Next), state.availableActions)
    }

    @Test
    fun parsesDegradedStateWithoutActions() {
        val state = PyxisBridgeJson.parseState(degradedBridgeJson())

        assertEquals(PyxisBridgeAvailability.AudioUnknown, state.availability)
        assertEquals("Bridge Track", state.currentTrack?.title)
        assertFalse(state.isControllable)
    }

    @Test
    fun parsesStoppedWithoutTrack() {
        val state = PyxisBridgeJson.parseState(stoppedBridgeJson())

        assertEquals(PyxisBridgeStatus.Stopped, state.status)
        assertNull(state.currentTrack)
        assertEquals(emptySet(), state.availableActions)
    }

    @Test
    fun encodesCommandWithoutPuttingTokenInBody() {
        val json = PyxisBridgeJson.encodeCommand(PyxisPlaybackCommand.Pause, "corr-1", "test")

        assertEquals("pause", json.getString("action"))
        assertEquals("corr-1", json.getString("correlationId"))
        assertFalse(json.toString().contains("token", ignoreCase = true))
    }
}

fun playingBridgeJson(): String = """
{
  "status": "playing",
  "availability": "controllable",
  "currentTrack": {"id":"ytmusic:track-1","title":"Bridge Track","artist":"Bridge Artist","album":"Bridge Album","duration":120,"artworkUrl":null},
  "progress": 5,
  "duration": 120,
  "stateRevision": 2,
  "stateUpdatedAt": 1000,
  "publishedAt": 1001,
  "audioObservedAt": 1001,
  "availableActions": ["pause", "next"]
}
""".trimIndent()

fun degradedBridgeJson(): String = playingBridgeJson().replace("\"controllable\"", "\"audio_unknown\"").replace("[\"pause\", \"next\"]", "[]")

fun stoppedBridgeJson(): String = """
{
  "status": "stopped",
  "availability": "controllable",
  "currentTrack": null,
  "progress": 0,
  "duration": 0,
  "stateRevision": 3,
  "stateUpdatedAt": 1000,
  "publishedAt": 1001,
  "audioObservedAt": null,
  "availableActions": []
}
""".trimIndent()
