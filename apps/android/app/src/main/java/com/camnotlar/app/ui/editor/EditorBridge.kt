package com.camnotlar.app.ui.editor

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

/**
 * Editör, web istemcisiyle birebir aynı HTML'i üretmesi için WebView içinde çalışır
 * (assets/editor). Böylece web ↔ Android arasında zengin metin dönüşümü kayıpsızdır;
 * planın en büyük riski (biçim kaybı) ortadan kalkar. Biçim araç çubuğu yerel Compose'dur.
 */
class EditorBridge(
    private val onChange: (String) -> Unit,
    private val onState: (Set<String>) -> Unit,
) {
    private val main = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun onChange(html: String) {
        main.post { onChange.invoke(html) }
    }

    @JavascriptInterface
    fun onState(json: String) {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return
        val on = o.keys().asSequence().filter { o.optBoolean(it) }.toSet()
        main.post { onState.invoke(on) }
    }
}

class EditorWebView(context: Context) : WebView(context) {
    private var ready = false
    private val queue = mutableListOf<String>()

    @SuppressLint("SetJavaScriptEnabled")
    fun setup(bridge: EditorBridge) {
        setBackgroundColor(Color.TRANSPARENT)
        settings.javaScriptEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.blockNetworkLoads = true
        settings.domStorageEnabled = false
        isVerticalScrollBarEnabled = true
        addJavascriptInterface(bridge, "Android")
        webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = true
            override fun onPageFinished(view: WebView, url: String) {
                ready = true
                queue.forEach { evaluateJavascript(it, null) }
                queue.clear()
            }
        }
        loadUrl("file:///android_asset/editor/editor.html")
    }

    /** Sayfa yüklenmeden gelen çağrılar sıraya alınır. */
    fun js(code: String) {
        if (ready) evaluateJavascript(code, null) else queue += code
    }

    fun load(html: String, editable: Boolean, stamp: String) =
        js("CamEditor.load(${JSONObject.quote(html)}, $editable, ${JSONObject.quote(stamp)})")

    fun theme(vars: Map<String, String>) = js("CamEditor.theme(${JSONObject(vars as Map<*, *>)})")
    fun fmt(cmd: String) = js("CamEditor.fmt(${JSONObject.quote(cmd)})")
    fun flush() = js("CamEditor.flush()")
    fun focusEnd() = js("CamEditor.focusEnd()")
    /** Editördeki güncel HTML'i (bekleyen gecikmeli kayıt beklemeden) okur. */
    fun current(cb: (String) -> Unit) {
        if (!ready) return cb("")
        evaluateJavascript("document.getElementById('ed').innerHTML") { raw ->
            cb(runCatching { org.json.JSONArray("[$raw]").getString(0) }.getOrDefault(""))
        }
    }

    fun setStamp(s: String) = js("CamEditor.setStamp(${JSONObject.quote(s)})")
}
