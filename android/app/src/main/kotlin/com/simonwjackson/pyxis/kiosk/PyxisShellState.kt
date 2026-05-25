package com.simonwjackson.pyxis.kiosk

sealed interface ReachabilityOutcome {
    data object Reachable : ReachabilityOutcome
    data class Unreachable(val reason: ReachabilityFailure) : ReachabilityOutcome
}

enum class ReachabilityFailure {
    NameLookup,
    ConnectionRefused,
    Timeout,
    HttpError,
    WrongHost,
    Other,
}

enum class DefectKind {
    Renderer,
    KioskPolicy,
    Unexpected,
}

sealed interface PyxisShellState {
    val targetUrl: String

    data class Checking(override val targetUrl: String) : PyxisShellState
    data class LoadingWebView(override val targetUrl: String) : PyxisShellState
    data class Ready(override val targetUrl: String) : PyxisShellState
    data class Reconnect(
        override val targetUrl: String,
        val reason: ReachabilityFailure,
        val isRetrying: Boolean,
    ) : PyxisShellState
    data class Defect(
        override val targetUrl: String,
        val kind: DefectKind,
        val detail: String,
    ) : PyxisShellState

    fun afterReachability(outcome: ReachabilityOutcome): PyxisShellState = when (outcome) {
        ReachabilityOutcome.Reachable -> LoadingWebView(targetUrl)
        is ReachabilityOutcome.Unreachable -> Reconnect(
            targetUrl = targetUrl,
            reason = outcome.reason,
            isRetrying = false,
        )
    }

    fun retrying(): PyxisShellState = when (this) {
        is Reconnect -> copy(isRetrying = true)
        else -> Checking(targetUrl)
    }

    companion object {
        fun initial(config: PyxisConfig): PyxisShellState = Checking(config.serverUrl)
    }
}
