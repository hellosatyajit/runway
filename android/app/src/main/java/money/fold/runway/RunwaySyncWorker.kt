package money.fold.runway

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class RunwaySyncWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        if (BuildConfig.RUNWAY_API_URL.contains("example.workers.dev") || BuildConfig.RUNWAY_API_TOKEN == "not-configured") {
            RunwayStore.setError(applicationContext, "API not configured")
            RunwayWidgetProvider.updateAll(applicationContext)
            return Result.failure()
        }

        val force = inputData.getBoolean(KEY_FORCE, false)
        val path = if (force) "/api/refresh" else "/api/runway"
        return try {
            val connection = URL(BuildConfig.RUNWAY_API_URL.trimEnd('/') + path).openConnection() as HttpURLConnection
            connection.requestMethod = if (force) "POST" else "GET"
            connection.setRequestProperty("Authorization", "Bearer ${BuildConfig.RUNWAY_API_TOKEN}")
            connection.setRequestProperty("Accept", "application/json")
            connection.connectTimeout = 15_000
            connection.readTimeout = 45_000
            if (connection.responseCode !in 200..299) throw IllegalStateException("HTTP ${connection.responseCode}")
            RunwayStore.save(applicationContext, JSONObject(connection.inputStream.bufferedReader().use { it.readText() }))
            RunwayWidgetProvider.updateAll(applicationContext)
            Result.success()
        } catch (_: Exception) {
            RunwayStore.setError(applicationContext, "Last refresh failed")
            RunwayWidgetProvider.updateAll(applicationContext)
            if (!force && runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }

    companion object { const val KEY_FORCE = "force_refresh" }
}
