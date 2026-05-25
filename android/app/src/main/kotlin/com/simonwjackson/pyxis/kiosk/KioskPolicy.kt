package com.simonwjackson.pyxis.kiosk

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log


enum class KioskPolicyStep(val criticalBeforeLockTask: Boolean) {
    PersistentHome(true),
    LockTaskPackages(true),
    LockTaskFeatures(true),
    StatusBarDisabled(true),
    KeyguardDisabled(true),
    StartLockTask(false),
}

data class KioskPolicyFailure(
    val step: KioskPolicyStep,
    val message: String,
)

data class KioskPolicyApplyResult(
    val isDeviceOwner: Boolean,
    val failures: List<KioskPolicyFailure>,
) {
    val hasCriticalSetupFailures: Boolean = failures.any { it.step.criticalBeforeLockTask }
    val shouldStartLockTask: Boolean = isDeviceOwner && !hasCriticalSetupFailures
}

class KioskPolicy(private val activity: Activity) {
    private val devicePolicyManager =
        activity.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    private val adminComponent = ComponentName(activity, PyxisDeviceAdminReceiver::class.java)

    fun applyIfDeviceOwner(): KioskPolicyApplyResult {
        if (!devicePolicyManager.isDeviceOwnerApp(activity.packageName)) {
            return KioskPolicyApplyResult(isDeviceOwner = false, failures = emptyList())
        }

        val failures = mutableListOf<KioskPolicyFailure>()
        recordPolicyStep(KioskPolicyStep.PersistentHome, failures) { setPersistentHome() }
        recordPolicyStep(KioskPolicyStep.LockTaskPackages, failures) {
            devicePolicyManager.setLockTaskPackages(adminComponent, arrayOf(activity.packageName))
        }
        recordPolicyStep(KioskPolicyStep.LockTaskFeatures, failures) {
            devicePolicyManager.setLockTaskFeatures(
                adminComponent,
                DevicePolicyManager.LOCK_TASK_FEATURE_NONE,
            )
        }
        recordPolicyStep(KioskPolicyStep.StatusBarDisabled, failures) {
            devicePolicyManager.setStatusBarDisabled(adminComponent, true)
        }
        recordPolicyStep(KioskPolicyStep.KeyguardDisabled, failures) {
            devicePolicyManager.setKeyguardDisabled(adminComponent, true)
        }

        val resultBeforeLockTask = KioskPolicyApplyResult(
            isDeviceOwner = true,
            failures = failures.toList(),
        )
        if (resultBeforeLockTask.shouldStartLockTask) {
            recordPolicyStep(KioskPolicyStep.StartLockTask, failures) { startLockTaskIfPermitted() }
        }

        return KioskPolicyApplyResult(isDeviceOwner = true, failures = failures.toList())
    }

    fun releaseDebugKiosk() {
        runCatching { activity.stopLockTask() }
        if (!devicePolicyManager.isDeviceOwnerApp(activity.packageName)) return
        runCatching { devicePolicyManager.setStatusBarDisabled(adminComponent, false) }
        runCatching { devicePolicyManager.setKeyguardDisabled(adminComponent, false) }
        runCatching { devicePolicyManager.clearPackagePersistentPreferredActivities(adminComponent, activity.packageName) }
        runCatching { devicePolicyManager.clearDeviceOwnerApp(activity.packageName) }
    }

    private fun recordPolicyStep(
        step: KioskPolicyStep,
        failures: MutableList<KioskPolicyFailure>,
        block: () -> Unit,
    ) {
        runCatching(block).onFailure { error ->
            val message = error.message ?: error::class.java.simpleName
            Log.e("PyxisKioskPolicy", "Device Owner policy step failed: $step", error)
            failures += KioskPolicyFailure(step, message)
        }
    }

    private fun setPersistentHome() {
        val homeFilter = IntentFilter(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            addCategory(Intent.CATEGORY_DEFAULT)
        }
        devicePolicyManager.addPersistentPreferredActivity(
            adminComponent,
            homeFilter,
            ComponentName(activity, MainActivity::class.java),
        )
    }

    private fun startLockTaskIfPermitted() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
            devicePolicyManager.isLockTaskPermitted(activity.packageName)
        ) {
            activity.startLockTask()
        }
    }
}
