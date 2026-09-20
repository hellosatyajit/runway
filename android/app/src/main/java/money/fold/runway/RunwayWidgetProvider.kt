package money.fold.runway

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.widget.RemoteViews
import androidx.core.content.res.ResourcesCompat
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

class RunwayWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        updateAll(context)
        enqueue(context, force = false)
        schedule(context)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) {
            RunwayStore.setError(context, "Refreshing…")
            updateAll(context)
            enqueue(context, force = true)
        }
    }

    override fun onEnabled(context: Context) = schedule(context)
    override fun onDisabled(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK)
    }

    companion object {
        private const val ACTION_REFRESH = "money.fold.runway.REFRESH"
        private const val PERIODIC_WORK = "runway-periodic-sync"

        fun updateAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val component = ComponentName(context, RunwayWidgetProvider::class.java)
            manager.getAppWidgetIds(component).forEach { id ->
                val state = RunwayStore.read(context)
                val views = RemoteViews(context.packageName, R.layout.runway_widget)
                views.setTextViewText(R.id.runway_value, formatRunway(state.days))
                views.setImageViewBitmap(R.id.liquid_runway_image, renderLiquidRunway(context, state.liquidDays))
                views.setContentDescription(R.id.liquid_runway_image, "${state.liquidDays} days of liquid runway")
                val open = PendingIntent.getActivity(context, id, Intent(context, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                views.setOnClickPendingIntent(R.id.widget_body, open)
                manager.updateAppWidget(id, views)
            }
        }

        fun enqueue(context: Context, force: Boolean) {
            val request = OneTimeWorkRequestBuilder<RunwaySyncWorker>()
                .setInputData(Data.Builder().putBoolean(RunwaySyncWorker.KEY_FORCE, force).build())
                .setConstraints(networkConstraints())
                .build()
            WorkManager.getInstance(context).enqueue(request)
        }

        private fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<RunwaySyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(networkConstraints()).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC_WORK, ExistingPeriodicWorkPolicy.KEEP, request)
        }

        private fun networkConstraints() = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        internal fun formatRunway(totalDays: Int): String {
            val years = totalDays / 365
            val months = totalDays % 365 / 30
            val days = totalDays % 365 % 30
            return listOf(years to "y", months to "m", days to "d")
                .filter { it.first > 0 }
                .joinToString(" ") { "${it.first}${it.second}" }
                .ifEmpty { "0d" }
        }

        private fun renderLiquidRunway(context: Context, days: Int): Bitmap {
            val density = context.resources.displayMetrics.density
            val scaledDensity = context.resources.displayMetrics.scaledDensity
            val width = (86 * density).toInt()
            val height = (48 * density).toInt()
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val typeface = ResourcesCompat.getFont(context, R.font.nothing_ndot57) ?: Typeface.DEFAULT_BOLD
            val value = String.format("%02d", days)
            val unit = "days"
            val valuePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = context.getColor(R.color.runway_ink)
                textSize = 38 * scaledDensity
                this.typeface = typeface
            }
            val unitPaint = Paint(valuePaint).apply { textSize = 19 * scaledDensity }
            val gap = 4 * density
            val measuredWidth = valuePaint.measureText(value) + gap + unitPaint.measureText(unit)
            if (measuredWidth > width) {
                val scale = width / measuredWidth
                valuePaint.textSize *= scale
                unitPaint.textSize *= scale
            }
            val baseline = height - maxOf(valuePaint.fontMetrics.descent, unitPaint.fontMetrics.descent)
            canvas.drawText(value, 0f, baseline, valuePaint)
            canvas.drawText(unit, valuePaint.measureText(value) + gap, baseline, unitPaint)
            return bitmap
        }
    }
}
