package com.simonwjackson.pyxis.kiosk

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PyxisPlaybackFreshnessTest {
    @Test
    fun acceptsNewerRevision() {
        val freshness = PyxisPlaybackFreshness(feedSilenceMillis = 15_000)
        val old = PyxisBridgeJson.parseState(playingBridgeJson())
        val newer = old.copy(stateRevision = old.stateRevision + 1)

        assertTrue(freshness.shouldAccept(previous = old, candidate = newer))
    }

    @Test
    fun rejectsOlderRevision() {
        val freshness = PyxisPlaybackFreshness(feedSilenceMillis = 15_000)
        val current = PyxisBridgeJson.parseState(playingBridgeJson()).copy(stateRevision = 5)
        val older = current.copy(stateRevision = 4)

        assertFalse(freshness.shouldAccept(previous = current, candidate = older))
    }

    @Test
    fun marksSilentFeedStale() {
        val freshness = PyxisPlaybackFreshness(feedSilenceMillis = 15_000)
        val state = PyxisBridgeJson.parseState(playingBridgeJson()).copy(receivedAtMillis = 1_000)

        assertTrue(freshness.isStale(state, nowMillis = 16_001))
        assertFalse(freshness.isStale(state, nowMillis = 15_000))
    }
}
