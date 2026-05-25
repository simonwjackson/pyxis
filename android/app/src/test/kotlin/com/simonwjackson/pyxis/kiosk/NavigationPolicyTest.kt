package com.simonwjackson.pyxis.kiosk

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NavigationPolicyTest {
    private val policy = NavigationPolicy(PyxisConfigs.debug)

    @Test
    fun allowsConfiguredPyxisOrigin() {
        assertTrue(policy.isAllowedMainFrameUrl("http://192.168.1.243:8765/"))
        assertTrue(policy.isAllowedMainFrameUrl("http://192.168.1.243:8765/albums/abc"))
    }

    @Test
    fun rejectsWrongHostPortAndScheme() {
        assertFalse(policy.isAllowedMainFrameUrl("http://192.168.1.244:8765/"))
        assertFalse(policy.isAllowedMainFrameUrl("http://192.168.1.243:5678/"))
        assertFalse(policy.isAllowedMainFrameUrl("https://192.168.1.243:8765/"))
    }

    @Test
    fun rejectsExternalAndDangerousSchemes() {
        assertFalse(policy.isAllowedMainFrameUrl("intent://scan/#Intent;scheme=zxing;end"))
        assertFalse(policy.isAllowedMainFrameUrl("market://details?id=com.example"))
        assertFalse(policy.isAllowedMainFrameUrl("tel:5551212"))
        assertFalse(policy.isAllowedMainFrameUrl("mailto:test@example.com"))
        assertFalse(policy.isAllowedMainFrameUrl("file:///sdcard/index.html"))
        assertFalse(policy.isAllowedMainFrameUrl("content://com.example/file"))
    }

    @Test
    fun rejectsLookalikeUserInfoUrls() {
        assertFalse(policy.isAllowedMainFrameUrl("http://192.168.1.243:8765@evil.example/"))
    }
}
