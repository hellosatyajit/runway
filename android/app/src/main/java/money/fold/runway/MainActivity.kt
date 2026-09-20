package money.fold.runway

import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (28 * resources.displayMetrics.density).toInt()
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(pad, pad * 2, pad, pad)
            setBackgroundColor(getColor(R.color.runway_surface))
        }
        layout.addView(TextView(this).apply { text = "Runway"; textSize = 30f; setTextColor(getColor(R.color.runway_ink)) })
        layout.addView(TextView(this).apply {
            text = "Add the Runway widget from your home screen. It keeps the last successful Fold snapshot available offline."
            textSize = 16f; setTextColor(getColor(R.color.runway_muted)); gravity = Gravity.CENTER
            setPadding(0, pad, 0, pad)
        })
        layout.addView(Button(this).apply {
            text = "Refresh now"
            setOnClickListener {
                RunwayWidgetProvider.enqueue(this@MainActivity, force = true)
                Toast.makeText(this@MainActivity, "Refreshing Fold data…", Toast.LENGTH_SHORT).show()
            }
        })
        setContentView(layout)
    }
}
