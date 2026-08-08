package dev.nox_decima.arcan

import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
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

  // Camera capture (#83): wry's showImageCapturePicker hands the camera app a
  // FileProvider content:// URI via EXTRA_OUTPUT but never grants write access
  // to it. On Android the grant flags apply ONLY to intent.getData() and
  // intent.getClipData() — never to extras — so the camera app hits a
  // SecurityException writing the file, aborts, and returns RESULT_CANCELED.
  // wry then calls onReceiveValue(null): the <input capture> gets no file, its
  // onChange never fires, and the capture vanishes with no error at all
  // (exactly the reported symptom). wry's handler lives in a gitignored,
  // regenerated source file, so it can't be patched in place — but every
  // ActivityResultLauncher.launch() funnels through startActivityForResult,
  // so we repair the intent here on its way out.
  override fun startActivityForResult(intent: Intent, requestCode: Int, options: Bundle?) {
    grantCaptureOutputPermission(intent)
    super.startActivityForResult(intent, requestCode, options)
  }

  private fun grantCaptureOutputPermission(intent: Intent) {
    val action = intent.action
    if (action != MediaStore.ACTION_IMAGE_CAPTURE && action != MediaStore.ACTION_VIDEO_CAPTURE) {
      return
    }
    @Suppress("DEPRECATION")
    val output = intent.getParcelableExtra<Uri>(MediaStore.EXTRA_OUTPUT) ?: return
    if (output.scheme != "content") return

    // 1. Mirror the output URI into clipData so the grant flags actually apply
    //    to it (flags are ignored on plain extras).
    if (intent.clipData == null) {
      intent.clipData = ClipData.newRawUri(MediaStore.EXTRA_OUTPUT, output)
    }
    intent.addFlags(
      Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION,
    )

    // 2. Belt-and-braces: some camera apps ignore clipData grants, so grant the
    //    single temp URI explicitly to every app that can service the intent.
    //    Scope is one app-private capture file, revoked when the task finishes.
    val flags = Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION
    for (info in packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)) {
      grantUriPermission(info.activityInfo.packageName, output, flags)
    }
  }
}
