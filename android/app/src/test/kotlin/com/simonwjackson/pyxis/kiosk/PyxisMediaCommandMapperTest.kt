package com.simonwjackson.pyxis.kiosk

import androidx.media3.common.Player
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PyxisMediaCommandMapperTest {
    @Test
    fun playingStateExposesPlayPauseAndSkipCommands() {
        val state = PyxisBridgeJson.parseState(playingBridgeJson())
        val commands = PyxisMediaCommandMapper.availableCommandIds(state)

        assertTrue(commands.contains(Player.COMMAND_PLAY_PAUSE))
        assertTrue(commands.contains(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM))
    }

    @Test
    fun degradedStateDoesNotExposeTransportCommands() {
        val state = PyxisBridgeJson.parseState(degradedBridgeJson())
        val commands = PyxisMediaCommandMapper.availableCommandIds(state)

        assertFalse(commands.contains(Player.COMMAND_PLAY_PAUSE))
        assertFalse(commands.contains(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM))
    }
}
