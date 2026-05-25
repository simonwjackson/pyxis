package com.simonwjackson.pyxis.kiosk

import android.app.Activity
import android.os.Bundle
import android.view.Window
import android.view.WindowManager

class MainActivity : Activity() {
    private val config: PyxisConfig = PyxisConfigs.debug
    private var shellState: PyxisShellState = PyxisShellState.initial(config)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        renderShellState(shellState)
    }

    private fun renderShellState(state: PyxisShellState) {
        setContentView(
            ReconnectScreen(this) {
                shellState = shellState.retrying()
                renderShellState(shellState)
            }.render(state),
        )
    }
}
