plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.krino.media"
    compileSdk = 35

    defaultConfig {
        // createTrashRequest, IS_TRASHED et loadThumbnail exigent Android 11.
        minSdk = 30
        consumerProguardFiles("proguard-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    // `IntentSenderRequest`/`ActivityResult`, pour la boîte système de
    // createTrashRequest/createDeleteRequest. Non exposée par
    // `project(":tauri-android")` : ses dépendances sont en `implementation`,
    // donc invisibles hors de son propre module.
    implementation("androidx.activity:activity-ktx:1.9.3")
    // Fournie par l'application hôte générée par Tauri.
    implementation(project(":tauri-android"))
}
