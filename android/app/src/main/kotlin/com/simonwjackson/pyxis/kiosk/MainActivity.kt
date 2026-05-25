package com.simonwjackson.pyxis.kiosk

import android.app.Activity
import android.os.Bundle
import android.view.Gravity
import android.view.Window
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val config = PyxisConfigs.debug
        val text = TextView(this).apply {
            this.text = "Pyxis\nSony NW-A306 debug shell\n${config.serverUrl}"
            setTextColor(0xFFF7F0FF.toInt())
            textSize = 22f
            gravity = Gravity.CENTER
        }

        setContentView(
            FrameLayout(this).apply {
                setBackgroundColor(0xFF141014.toInt())
                addView(
                    text,
                    FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT,
                    ),
                )
            },
        )
    }
}
