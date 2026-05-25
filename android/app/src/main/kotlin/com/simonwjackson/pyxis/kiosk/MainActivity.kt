package com.simonwjackson.pyxis.kiosk

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.Window
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout

class MainActivity : Activity() {
    private val config: PyxisConfig = PyxisConfigs.debug
    private val mainHandler = Handler(Looper.getMainLooper())
    private val reachabilityClient = ReachabilityClient()
    private val navigationPolicy = NavigationPolicy(config)
    private val kioskPolicy by lazy { KioskPolicy(this) }
    private var shellState: PyxisShellState = PyxisShellState.initial(config)
    private var webView: WebView? = null
    private var isActivityDestroyed = false
    private var reachabilityGeneration = 0
    private var webViewGeneration = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        startMediaSessionService()
        applyKioskPolicy()
        if (shellState is PyxisShellState.Defect) {
            renderShellState(shellState)
        } else {
            renderShellState(shellState)
            checkReachability()
        }
    }

    override fun onResume() {
        super.onResume()
        applyKioskPolicy()
    }

    override fun onDestroy() {
        isActivityDestroyed = true
        reachabilityGeneration += 1
        webViewGeneration += 1
        mainHandler.removeCallbacksAndMessages(null)
        disposeWebView()
        super.onDestroy()
    }

    private fun startMediaSessionService() {
        runCatching { startService(Intent(this, PyxisMediaSessionService::class.java)) }
    }

    private fun applyKioskPolicy() {
        val result = kioskPolicy.applyIfDeviceOwner()
        if (result.hasCriticalSetupFailures) {
            shellState = PyxisShellState.Defect(
                targetUrl = config.serverUrl,
                kind = DefectKind.KioskPolicy,
                detail = result.failures.joinToString("; ") { "${it.step}: ${it.message}" },
            )
            renderShellState(shellState)
        }
    }

    private fun checkReachability() {
        val generation = ++reachabilityGeneration
        shellState = PyxisShellState.Checking(config.serverUrl)
        renderShellState(shellState)
        Thread {
            val outcome = reachabilityClient.check(config.healthUrl)
            mainHandler.post {
                if (!isCurrentReachability(generation)) return@post
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
        val generation = ++webViewGeneration
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
                    if (isCurrentWebLoad(generation)) {
                        shellState = PyxisShellState.Ready(targetUrl)
                    }
                },
                onMainFrameFailure = { reason ->
                    if (isCurrentWebLoad(generation)) {
                        shellState = PyxisShellState.Reconnect(
                            targetUrl = targetUrl,
                            reason = reason,
                            isRetrying = false,
                        )
                        renderShellState(shellState)
                    }
                },
                onRendererDefect = { detail ->
                    if (isCurrentWebLoad(generation)) {
                        shellState = PyxisShellState.Defect(
                            targetUrl = targetUrl,
                            kind = DefectKind.Renderer,
                            detail = detail,
                        )
                        renderShellState(shellState)
                    }
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
        disposeWebView()
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

    private fun isCurrentReachability(generation: Int): Boolean =
        !isActivityDestroyed && generation == reachabilityGeneration

    private fun isCurrentWebLoad(generation: Int): Boolean =
        !isActivityDestroyed && generation == webViewGeneration

    private fun disposeWebView() {
        webView?.apply {
            stopLoading()
            webChromeClient = null
            webViewClient = WebViewClient()
            loadUrl("about:blank")
            removeAllViews()
            destroy()
        }
        webView = null
    }
}
