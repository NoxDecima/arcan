package dev.nox_decima.arcan

import android.os.Bundle
import android.view.View
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
}
