package money.fold.runway

import org.junit.Assert.assertEquals
import org.junit.Test

class RunwayWidgetProviderTest {
    @Test fun formatsCompactRunway() {
        assertEquals("18d", RunwayWidgetProvider.formatRunway(18))
        assertEquals("10m 9d", RunwayWidgetProvider.formatRunway(309))
        assertEquals("2y 7m 17d", RunwayWidgetProvider.formatRunway(957))
        assertEquals("0d", RunwayWidgetProvider.formatRunway(0))
    }
}
