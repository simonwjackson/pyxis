package com.simonwjackson.pyxis.kiosk

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class KioskPolicyTest {
    @Test
    fun successfulDeviceOwnerPolicyCanStartLockTask() {
        val result = KioskPolicyApplyResult(
            isDeviceOwner = true,
            failures = emptyList(),
        )

        assertFalse(result.hasCriticalSetupFailures)
        assertTrue(result.shouldStartLockTask)
    }

    @Test
    fun nonDeviceOwnerPolicyDoesNotStartLockTask() {
        val result = KioskPolicyApplyResult(
            isDeviceOwner = false,
            failures = emptyList(),
        )

        assertFalse(result.hasCriticalSetupFailures)
        assertFalse(result.shouldStartLockTask)
    }

    @Test
    fun criticalSetupFailurePreventsLockTaskStart() {
        val result = KioskPolicyApplyResult(
            isDeviceOwner = true,
            failures = listOf(
                KioskPolicyFailure(KioskPolicyStep.LockTaskPackages, "boom"),
            ),
        )

        assertTrue(result.hasCriticalSetupFailures)
        assertFalse(result.shouldStartLockTask)
    }

    @Test
    fun lockTaskStartFailureIsRecordedButNotASetupFailure() {
        val result = KioskPolicyApplyResult(
            isDeviceOwner = true,
            failures = listOf(
                KioskPolicyFailure(KioskPolicyStep.StartLockTask, "boom"),
            ),
        )

        assertFalse(result.hasCriticalSetupFailures)
        assertTrue(result.shouldStartLockTask)
    }
}
