package com.simonwjackson.pyxis.kiosk

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

class PyxisShellStateTest {
    private val config = PyxisConfigs.debug

    @Test
    fun initialStateStartsInCheckingWithConfiguredTarget() {
        val state = PyxisShellState.initial(config)

        assertIs<PyxisShellState.Checking>(state)
        assertEquals("http://192.168.1.243:8765/", state.targetUrl)
    }

    @Test
    fun successfulReachabilityMovesToLoadingWebView() {
        val state = PyxisShellState.initial(config).afterReachability(
            ReachabilityOutcome.Reachable,
        )

        assertIs<PyxisShellState.LoadingWebView>(state)
        assertEquals(config.serverUrl, state.targetUrl)
    }

    @Test
    fun failedReachabilityMovesToReconnectWithTargetContext() {
        val state = PyxisShellState.initial(config).afterReachability(
            ReachabilityOutcome.Unreachable(ReachabilityFailure.ConnectionRefused),
        )

        assertIs<PyxisShellState.Reconnect>(state)
        assertEquals(config.serverUrl, state.targetUrl)
        assertEquals(ReachabilityFailure.ConnectionRefused, state.reason)
        assertFalse(state.isRetrying)
    }

    @Test
    fun retryFromReconnectShowsRetryInProgress() {
        val reconnect = PyxisShellState.Reconnect(
            targetUrl = config.serverUrl,
            reason = ReachabilityFailure.Timeout,
            isRetrying = false,
        )

        val retrying = reconnect.retrying()

        assertIs<PyxisShellState.Reconnect>(retrying)
        assertTrue(retrying.isRetrying)
        assertEquals(ReachabilityFailure.Timeout, retrying.reason)
    }

    @Test
    fun policyDefectsDoNotBecomeReconnectFailures() {
        val defect = PyxisShellState.Defect(
            targetUrl = config.serverUrl,
            kind = DefectKind.KioskPolicy,
            detail = "Device Owner not active",
        )

        assertEquals(DefectKind.KioskPolicy, defect.kind)
        assertEquals(config.serverUrl, defect.targetUrl)
    }
}
