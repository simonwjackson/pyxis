package com.simonwjackson.pyxis.kiosk

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PyxisMediaMetadataMapperTest {
    @Test
    fun mapsBridgeTrackToDisplayMetadata() {
        val state = PyxisBridgeJson.parseState(playingBridgeJson())
        val item = PyxisMediaMetadataMapper.toMediaItem(state)

        assertEquals("Bridge Track", item?.mediaMetadata?.title.toString())
        assertEquals("Bridge Artist", item?.mediaMetadata?.artist.toString())
        assertEquals("Bridge Album", item?.mediaMetadata?.albumTitle.toString())
    }

    @Test
    fun clearsMetadataWhenNoTrack() {
        val state = PyxisBridgeJson.parseState(stoppedBridgeJson())

        assertNull(PyxisMediaMetadataMapper.toMediaItem(state))
    }

    @Test
    fun ignoresUnsafeArtworkSchemes() {
        val state = PyxisBridgeJson.parseState(playingBridgeJson().replace("\"artworkUrl\":null", "\"artworkUrl\":\"file:///sdcard/secret.jpg\""))
        val item = PyxisMediaMetadataMapper.toMediaItem(state)

        assertNull(item?.mediaMetadata?.artworkUri)
    }
}
