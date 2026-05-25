package com.simonwjackson.pyxis.kiosk

import android.graphics.Bitmap
import android.net.http.SslError
import android.webkit.SslErrorHandler
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient

class KioskWebViewClient(
    private val navigationPolicy: NavigationPolicy,
    private val targetUrl: String,
    private val onReady: () -> Unit,
    private val onMainFrameFailure: (ReachabilityFailure) -> Unit,
    private val onRendererDefect: (String) -> Unit,
) : WebViewClient() {
    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        if (!request.isForMainFrame) return false
        return !navigationPolicy.isAllowedMainFrameUrl(request.url.toString())
    }

    override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
        if (!navigationPolicy.isAllowedMainFrameUrl(url)) {
            view.stopLoading()
            onMainFrameFailure(ReachabilityFailure.WrongHost)
        }
    }

    override fun onPageFinished(view: WebView, url: String) {
        if (navigationPolicy.isAllowedMainFrameUrl(url)) {
            onReady()
        }
    }

    override fun onReceivedError(
        view: WebView,
        request: WebResourceRequest,
        error: WebResourceError,
    ) {
        if (request.isForMainFrame) {
            onMainFrameFailure(ReachabilityFailure.Other)
        }
    }

    override fun onReceivedHttpError(
        view: WebView,
        request: WebResourceRequest,
        errorResponse: WebResourceResponse,
    ) {
        if (request.isForMainFrame) {
            onMainFrameFailure(ReachabilityFailure.HttpError)
        }
    }

    override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
        handler.cancel()
        onMainFrameFailure(ReachabilityFailure.Other)
    }

    override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
        onRendererDefect("WebView renderer exited while loading $targetUrl")
        return true
    }
}
