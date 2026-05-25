package com.simonwjackson.pyxis.kiosk

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class KioskPolicyTest {
    @Test
    fun policyPlanUsesStablePyxisComponents() {
        val plan = KioskPolicyPlan.forPackage("com.simonwjackson.pyxis.kiosk")

        assertEquals("com.simonwjackson.pyxis.kiosk", plan.packageName)
        assertEquals("com.simonwjackson.pyxis.kiosk.MainActivity", plan.homeActivityClassName)
        assertEquals("com.simonwjackson.pyxis.kiosk.PyxisDeviceAdminReceiver", plan.adminReceiverClassName)
    }

    @Test
    fun defaultPolicyIsRestrictiveForMvpKiosk() {
        val plan = KioskPolicyPlan.forPackage("com.simonwjackson.pyxis.kiosk")

        assertFalse(plan.allowHome)
        assertFalse(plan.allowOverview)
        assertFalse(plan.allowGlobalActions)
        assertFalse(plan.allowKeyguard)
    }
}
