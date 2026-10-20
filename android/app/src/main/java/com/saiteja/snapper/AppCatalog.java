package com.saiteja.snapper;

import android.app.AppOpsManager;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Process;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import org.json.JSONArray;

/** Installed apps with their category, for category-based blocking and the Apps screen. */
final class AppCatalog {

    static final class App {
        final String pkg;
        final String category;
        final boolean payment;
        // Shown on the Apps screen (has a launcher icon, or was installed by the user).
        final boolean visible;
        private final ApplicationInfo info;
        private String name;

        App(ApplicationInfo info, String category, boolean payment, boolean visible) {
            this.pkg = info.packageName;
            this.info = info;
            this.category = category;
            this.payment = payment;
            this.visible = visible;
        }

        /** Loaded on demand: reading every app's label is slow and categories don't need it. */
        String name(PackageManager pm) {
            if (name == null) name = info.loadLabel(pm).toString();
            return name;
        }
    }

    // Many apps don't declare a category; these are social media regardless.
    private static final Set<String> KNOWN_SOCIAL = new HashSet<>(Arrays.asList(
        "com.instagram.android", "com.instagram.barcelona", "com.instagram.lite",
        "com.facebook.katana", "com.facebook.lite", "com.snapchat.android",
        "com.twitter.android", "com.reddit.frontpage", "com.zhiliaoapp.musically",
        "in.mohalla.sharechat", "in.mohalla.video", "com.eterno.shortvideos",
        "com.pinterest", "com.linkedin.android", "com.tumblr", "com.bereal.ft"
    ));

    private static final Set<String> KNOWN_PAYMENTS = new HashSet<>(Arrays.asList(
        "com.phonepe.app", "com.dreamplug.androidapp", "com.google.android.apps.nbu.paisa.user",
        "net.one97.paytm", "in.org.npci.upiapp", "com.mobikwik_new", "in.amazon.mShop.android.shopping",
        "com.freecharge.android", "money.super.payments", "com.myairtelapp"
    ));

    private static final long CACHE_MS = 10 * 60_000;
    private static Map<String, App> cache;
    private static long cachedAt;
    private static long lastMissRebuild;

    private AppCatalog() {}

    /**
     * Every installed app (not only ones with a launcher icon, so apps reachable through links or other
     * exported screens are categorised too).
     */
    static synchronized Map<String, App> apps(Context c) {
        long now = System.currentTimeMillis();
        if (cache != null && now - cachedAt < CACHE_MS) return cache;
        PackageManager pm = c.getPackageManager();
        Set<String> upi = new HashSet<>();
        for (ResolveInfo ri : pm.queryIntentActivities(new Intent(Intent.ACTION_VIEW, Uri.parse("upi://pay?pa=test@upi")), 0)) {
            upi.add(ri.activityInfo.packageName);
        }
        Set<String> launchable = new HashSet<>();
        for (ResolveInfo ri : pm.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)) {
            launchable.add(ri.activityInfo.packageName);
        }
        Map<String, App> out = new HashMap<>();
        for (ApplicationInfo ai : pm.getInstalledApplications(0)) {
            String pkg = ai.packageName;
            if (pkg.equals(c.getPackageName())) continue;
            boolean system = (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0 && (ai.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) == 0;
            boolean payment = upi.contains(pkg) || KNOWN_PAYMENTS.contains(pkg);
            out.put(pkg, new App(ai, categoryOf(ai), payment, launchable.contains(pkg) || !system));
        }
        cache = out;
        cachedAt = now;
        lastMissRebuild = now;
        return out;
    }

    /** Lookup that rebuilds once (at most every 5 s) when a package is unknown, e.g. just installed. */
    private static App find(Context c, String pkg) {
        App app = apps(c).get(pkg);
        if (app != null) return app;
        synchronized (AppCatalog.class) {
            if (System.currentTimeMillis() - lastMissRebuild < 5_000) return null;
            cache = null;
        }
        return apps(c).get(pkg);
    }

    static void invalidate() {
        synchronized (AppCatalog.class) {
            cache = null;
        }
    }

    private static String categoryOf(ApplicationInfo ai) {
        if (KNOWN_SOCIAL.contains(ai.packageName)) return "social";
        if (Build.VERSION.SDK_INT < 26) return "other";
        switch (ai.category) {
            case ApplicationInfo.CATEGORY_SOCIAL: return "social";
            case ApplicationInfo.CATEGORY_VIDEO: return "video";
            case ApplicationInfo.CATEGORY_GAME: return "games";
            case ApplicationInfo.CATEGORY_AUDIO: return "audio";
            case ApplicationInfo.CATEGORY_IMAGE: return "image";
            case ApplicationInfo.CATEGORY_NEWS: return "news";
            case ApplicationInfo.CATEGORY_MAPS: return "maps";
            case ApplicationInfo.CATEGORY_PRODUCTIVITY: return "productivity";
            default: return "other";
        }
    }

    /** True if the installed app falls in any of the given categories ("payments" = can open UPI links). */
    static boolean inCategories(Context c, String pkg, JSONArray categories, JSONArray except) {
        if (categories == null || categories.length() == 0) return false;
        // Category rules never take out calls, alarms, keyboards or the home screen.
        if (contains(except, pkg) || SleepMode.isEssential(c, pkg)) return false;
        App app = find(c, pkg);
        if (app == null) return false;
        for (int i = 0; i < categories.length(); i++) {
            String cat = categories.optString(i);
            if ("payments".equals(cat) ? app.payment : cat.equals(app.category)) return true;
        }
        return false;
    }

    /** Android 7 apps don't declare categories; only the built-in social list and UPI detection work there. */
    static boolean categoriesSupported() {
        return Build.VERSION.SDK_INT >= 26;
    }

    static String label(Context c, String pkg) {
        App app = apps(c).get(pkg);
        return app != null ? app.name(c.getPackageManager()) : pkg;
    }

    static boolean contains(JSONArray arr, String value) {
        if (arr == null) return false;
        for (int i = 0; i < arr.length(); i++) if (value.equals(arr.optString(i))) return true;
        return false;
    }

    // ---- screen time (same source as Digital Wellbeing) ----

    static boolean hasUsageAccess(Context c) {
        AppOpsManager ops = (AppOpsManager) c.getSystemService(Context.APP_OPS_SERVICE);
        int mode = Build.VERSION.SDK_INT >= 29
            ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName())
            : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    /** Foreground time per package since midnight (India time). Empty without usage access. */
    static Map<String, Long> usageToday(Context c) {
        Map<String, Long> out = new HashMap<>();
        if (!hasUsageAccess(c)) return out;
        Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Kolkata"));
        cal.set(Calendar.HOUR_OF_DAY, 0);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        UsageStatsManager usm = (UsageStatsManager) c.getSystemService(Context.USAGE_STATS_SERVICE);
        Map<String, UsageStats> stats = usm.queryAndAggregateUsageStats(cal.getTimeInMillis(), System.currentTimeMillis());
        for (Map.Entry<String, UsageStats> e : stats.entrySet()) {
            long ms = e.getValue().getTotalTimeInForeground();
            if (ms > 0) out.put(e.getKey(), ms);
        }
        return out;
    }

    /** Apps for the Apps screen: launchable or user-installed (hides background system packages). */
    static List<App> visible(Context c) {
        List<App> out = new ArrayList<>();
        for (App a : apps(c).values()) if (a.visible) out.add(a);
        return out;
    }
}
