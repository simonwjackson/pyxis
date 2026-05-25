package com.simonwjackson.pyxis.kiosk

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build


data class KioskPolicyPlan(
    val packageName: String,
    val homeActivityClassName: String,
    val adminReceiverClassName: String,
    val allowHome: Boolean = false,
    val allowOverview: Boolean = false,
    val allowGlobalActions: Boolean = false,
    val allowKeyguard: Boolean = false,
) {
    companion object {
        fun forPackage(packageName: String): KioskPolicyPlan = KioskPolicyPlan(
            packageName = packageName,
            homeActivityClassName = "$packageName.MainActivity",
            adminReceiverClassName = "$packageName.PyxisDeviceAdminReceiver",
        )
    }
}

class KioskPolicy(private val activity: Activity) {
    private val devicePolicyManager =
        activity.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    private val adminComponent = ComponentName(activity, PyxisDeviceAdminReceiver::class.java)

    fun applyIfDeviceOwner() {
        if (!devicePolicyManager.isDeviceOwnerApp(activity.packageName)) return

        runCatching { setPersistentHome() }
        runCatching { devicePolicyManager.setLockTaskPackages(adminComponent, arrayOf(activity.packageName)) }
        runCatching {
            devicePolicyManager.setLockTaskFeatures(
                adminComponent,
                DevicePolicyManager.LOCK_TASK_FEATURE_NONE,
            )
        }
        runCatching { devicePolicyManager.setStatusBarDisabled(adminComponent, true) }
        runCatching { devicePolicyManager.setKeyguardDisabled(adminComponent, true) }
        runCatching { startLockTaskIfPermitted() }
    }

    fun releaseDebugKiosk() {
        runCatching { activity.stopLockTask() }
        if (!devicePolicyManager.isDeviceOwnerApp(activity.packageName)) return
        runCatching { devicePolicyManager.setStatusBarDisabled(adminComponent, false) }
        runCatching { devicePolicyManager.setKeyguardDisabled(adminComponent, false) }
        runCatching { devicePolicyManager.clearPackagePersistentPreferredActivities(adminComponent, activity.packageName) }
        runCatching { devicePolicyManager.clearDeviceOwnerApp(activity.packageName) }
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
