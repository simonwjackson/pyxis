package com.simonwjackson.pyxis.kiosk

import android.content.Context
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class ReconnectScreen(
    private val context: Context,
    private val onRetry: () -> Unit,
) {
    fun render(state: PyxisShellState): View {
        val title = TextView(context).apply {
            text = titleFor(state)
            textSize = 28f
            setTextColor(0xFFF7F0FF.toInt())
            gravity = Gravity.CENTER
        }

        val detail = TextView(context).apply {
            text = detailFor(state)
            textSize = 15f
            setTextColor(0xFFCBB7D8.toInt())
            gravity = Gravity.CENTER
        }

        val retry = Button(context).apply {
            text = if (state is PyxisShellState.Reconnect && state.isRetrying) {
                "Retrying…"
            } else {
                "Retry"
            }
            isEnabled = state is PyxisShellState.Reconnect && !state.isRetrying
            setOnClickListener { onRetry() }
        }

        return LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(0xFF141014.toInt())
            setPadding(32, 32, 32, 32)
            addView(title)
            addView(detail)
            if (state is PyxisShellState.Reconnect) {
                addView(retry)
            }
        }
    }

    private fun titleFor(state: PyxisShellState): String = when (state) {
        is PyxisShellState.Checking -> "Checking Pyxis"
        is PyxisShellState.LoadingWebView -> "Loading Pyxis"
        is PyxisShellState.Ready -> "Pyxis"
        is PyxisShellState.Reconnect -> "Pyxis is unavailable"
        is PyxisShellState.Defect -> "Pyxis needs attention"
    }

    private fun detailFor(state: PyxisShellState): String = when (state) {
        is PyxisShellState.Checking -> "Trying ${state.targetUrl}"
        is PyxisShellState.LoadingWebView -> "Opening ${state.targetUrl}"
        is PyxisShellState.Ready -> state.targetUrl
        is PyxisShellState.Reconnect -> "Target: ${state.targetUrl}\nReason: ${state.reason}\nTemporary Sony debug APK"
        is PyxisShellState.Defect -> "Target: ${state.targetUrl}\n${state.detail}"
    }
}
