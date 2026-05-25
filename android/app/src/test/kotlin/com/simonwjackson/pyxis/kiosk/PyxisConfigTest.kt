package com.simonwjackson.pyxis.kiosk

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class PyxisConfigTest {
    @Test
    fun debugConfigTargetsSonyAndZaoLanIp() {
        val config = PyxisConfigs.debug

        assertEquals(DeviceProfile.SonyNwA306, config.deviceProfile)
        assertEquals("http://192.168.1.243:8765/", config.serverUrl)
        assertEquals("192.168.1.243", config.cleartextHost)
        assertTrue(config.isTemporaryMvp)
        assertEquals("http://192.168.1.243:8765/android-media-bridge/state", config.androidBridgeStateUrl)
    }

    @Test
    fun rejectsNonHttpServerUrls() {
        assertFailsWith<IllegalArgumentException> {
            PyxisConfig(
                deviceProfile = DeviceProfile.SonyNwA306,
                serverUrl = "https://192.168.1.243:8765/",
                cleartextHost = "192.168.1.243",
                isTemporaryMvp = true,
                androidBridgeToken = "",
            )
        }
    }

    @Test
    fun rejectsConfigWhenCleartextHostDoesNotMatchServerHost() {
        assertFailsWith<IllegalArgumentException> {
            PyxisConfig(
                deviceProfile = DeviceProfile.SonyNwA306,
                serverUrl = "http://192.168.1.243:8765/",
                cleartextHost = "192.168.1.244",
                isTemporaryMvp = true,
                androidBridgeToken = "",
            )
        }
    }
}
