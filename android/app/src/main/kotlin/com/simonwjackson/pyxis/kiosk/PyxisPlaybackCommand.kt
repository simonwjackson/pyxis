package com.simonwjackson.pyxis.kiosk

enum class PyxisPlaybackCommand(val wireValue: String) {
    Play("play"),
    Pause("pause"),
    Next("next"),
    Previous("previous"),
    ;

    companion object {
        fun fromWire(value: String): PyxisPlaybackCommand? = entries.firstOrNull { it.wireValue == value }
    }
}

enum class PyxisCommandOutcome(val wireValue: String) {
    Applied("applied"),
    Rejected("rejected"),
    Noop("noop"),
    Unavailable("unavailable"),
    StaleState("stale_state"),
    ;

    companion object {
        fun fromWire(value: String): PyxisCommandOutcome? = entries.firstOrNull { it.wireValue == value }
    }
}
