import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
fun localConfig(name: String, fallback: String) =
    providers.gradleProperty(name).orNull ?: localProperties.getProperty(name, fallback)
val runwayApiUrl = localConfig("RUNWAY_API_URL", "https://example.workers.dev")
val runwayApiToken = localConfig("RUNWAY_API_TOKEN", "not-configured")

android {
    namespace = "money.fold.runway"
    compileSdk = 35

    defaultConfig {
        applicationId = "money.fold.runway"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "RUNWAY_API_URL", "\"$runwayApiUrl\"")
        buildConfigField("String", "RUNWAY_API_TOKEN", "\"$runwayApiToken\"")
    }

    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    testImplementation("junit:junit:4.13.2")
}
