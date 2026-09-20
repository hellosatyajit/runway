package money.fold.runway

import android.content.Context
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class RunwayState(
    val months: Double = 0.0,
    val days: Int = 0,
    val liquidDays: Int = 0,
    val throughDate: String = "—",
    val syncedAt: String = "Never",
    val error: String? = null,
)

object RunwayStore {
    private const val PREFS = "runway_snapshot"

    fun save(context: Context, json: JSONObject) {
        val runway = json.getJSONObject("runway")
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putFloat("months", runway.getDouble("totalMonths").toFloat())
            .putInt("days", runway.getInt("totalDays"))
            .putInt("liquidDays", runway.getInt("liquidDays"))
            .putString("throughDate", runway.getString("throughDate"))
            .putString("syncedAt", json.getString("syncedAt"))
            .remove("error")
            .apply()
    }

    fun setError(context: Context, message: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("error", message).apply()
    }

    fun read(context: Context): RunwayState {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return RunwayState(
            months = prefs.getFloat("months", 0f).toDouble(),
            days = prefs.getInt("days", 0),
            liquidDays = prefs.getInt("liquidDays", 0),
            throughDate = formatDate(prefs.getString("throughDate", null)),
            syncedAt = formatTimestamp(prefs.getString("syncedAt", null)),
            error = prefs.getString("error", null),
        )
    }

    private fun formatDate(value: String?): String = try {
        java.time.LocalDate.parse(value).format(DateTimeFormatter.ofPattern("d MMM yyyy"))
    } catch (_: Exception) { "—" }

    private fun formatTimestamp(value: String?): String = try {
        val time = Instant.parse(value).atZone(ZoneId.systemDefault())
        "Updated " + time.format(DateTimeFormatter.ofPattern("d MMM, h:mm a"))
    } catch (_: Exception) { "Not synced yet" }
}
