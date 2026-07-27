package dev.nox_decima.arcan

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Edge-to-edge is enforced on targetSdk 35+, and the Android System
    // WebView does not surface safe-area insets to CSS (unlike iOS), so web
    // content would render beneath the status bar and gesture nav bar.
    // Pad the content view by the system-bar + cutout insets instead.
    // Insets are deliberately NOT consumed so IME (keyboard) handling is
    // unaffected.
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
      )
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      insets
    }
  }

  // #79: returning from a native picker Activity (file/gallery/camera) can
  // leave the WebView surface un-repainted until the next touch, so a freshly
  // added attachment tray stays invisible ("doesn't show until a second
  // attachment is added"). A JS requestAnimationFrame nudge can't fix it — rAF
  // isn't serviced while the surface is stalled. Force redraws at the Android
  // view layer: invalidate the WebView repeatedly for ~2s after resume, so it
  // re-composites once the picker's JS continuation (pick -> ingest -> setState)
  // has updated the DOM. Cheap (a handful of invalidates), only on resume.
  override fun onResume() {
    super.onResume()
    val webView = findWebView(findViewById(android.R.id.content)) ?: return
    val handler = Handler(Looper.getMainLooper())
    var frames = 0
    handler.post(object : Runnable {
      override fun run() {
        webView.invalidate()
        frames += 1
        if (frames < 60) handler.postDelayed(this, 33L)
      }
    })
  }

  private fun findWebView(view: View?): WebView? {
    if (view is WebView) return view
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) {
        val found = findWebView(view.getChildAt(i))
        if (found != null) return found
      }
    }
    return null
  }
}
