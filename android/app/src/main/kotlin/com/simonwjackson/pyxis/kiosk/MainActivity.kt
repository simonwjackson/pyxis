package com.simonwjackson.pyxis.kiosk

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.Window
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.FrameLayout

class MainActivity : Activity() {
    private val config: PyxisConfig = PyxisConfigs.debug
    private val mainHandler = Handler(Looper.getMainLooper())
    private val reachabilityClient = ReachabilityClient()
    private val navigationPolicy = NavigationPolicy(config)
    private val kioskPolicy by lazy { KioskPolicy(this) }
    private var shellState: PyxisShellState = PyxisShellState.initial(config)
    private var webView: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        kioskPolicy.applyIfDeviceOwner()
        renderShellState(shellState)
        checkReachability()
    }

    override fun onResume() {
        super.onResume()
        kioskPolicy.applyIfDeviceOwner()
    }

    override fun onDestroy() {
        webView?.destroy()
        webView = null
        super.onDestroy()
    }

    private fun checkReachability() {
        shellState = PyxisShellState.Checking(config.serverUrl)
        renderShellState(shellState)
        Thread {
            val outcome = reachabilityClient.check(config.healthUrl)
            mainHandler.post {
                shellState = shellState.afterReachability(outcome)
                when (val state = shellState) {
                    is PyxisShellState.LoadingWebView -> loadWebView(state.targetUrl)
                    else -> renderShellState(state)
                }
            }
        }.start()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun loadWebView(targetUrl: String) {
        val created = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(0xFF141014.toInt())
            isLongClickable = false
            setOnLongClickListener { true }
            webChromeClient = WebChromeClient()
            webViewClient = KioskWebViewClient(
                navigationPolicy = navigationPolicy,
                targetUrl = targetUrl,
                onReady = {
                    shellState = PyxisShellState.Ready(targetUrl)
                },
                onMainFrameFailure = { reason ->
                    shellState = PyxisShellState.Reconnect(
                        targetUrl = targetUrl,
                        reason = reason,
                        isRetrying = false,
                    )
                    renderShellState(shellState)
                },
                onRendererDefect = { detail ->
                    shellState = PyxisShellState.Defect(
                        targetUrl = targetUrl,
                        kind = DefectKind.Renderer,
                        detail = detail,
                    )
                    renderShellState(shellState)
                },
            )
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.mediaPlaybackRequiresUserGesture = false
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.setGeolocationEnabled(false)
        }
        webView?.destroy()
        webView = created
        setContentView(created)
        created.loadUrl(targetUrl)
    }

    private fun renderShellState(state: PyxisShellState) {
        webView?.visibility = View.GONE
        setContentView(
            ReconnectScreen(this) {
                shellState = shellState.retrying()
                renderShellState(shellState)
                checkReachability()
            }.render(state),
        )
    }
}
