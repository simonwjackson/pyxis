package com.simonwjackson.pyxis.kiosk

import androidx.media3.common.Player

object PyxisMediaCommandMapper {
    fun availableCommandIds(state: PyxisPlaybackBridgeState): Set<Int> = buildSet {
        add(Player.COMMAND_GET_CURRENT_MEDIA_ITEM)
        add(Player.COMMAND_GET_TIMELINE)
        add(Player.COMMAND_GET_MEDIA_ITEMS_METADATA)
        add(Player.COMMAND_GET_METADATA)
        if (state.availability == PyxisBridgeAvailability.Controllable) {
            if (PyxisPlaybackCommand.Play in state.availableActions || PyxisPlaybackCommand.Pause in state.availableActions) {
                add(Player.COMMAND_PLAY_PAUSE)
            }
            if (PyxisPlaybackCommand.Next in state.availableActions) {
                add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                add(Player.COMMAND_SEEK_TO_NEXT)
            }
            if (PyxisPlaybackCommand.Previous in state.availableActions) {
                add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                add(Player.COMMAND_SEEK_TO_PREVIOUS)
            }
        }
    }

    fun availablePlayerCommands(state: PyxisPlaybackBridgeState): Player.Commands {
        val builder = Player.Commands.Builder()
        availableCommandIds(state).forEach(builder::add)
        return builder.build()
    }
}
