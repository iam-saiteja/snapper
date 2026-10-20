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
        final String name;
        final String category;
        final boolean payment;

        App(String pkg, String name, String category, boolean payment) {
            this.pkg = pkg;
            this.name = name;
            this.category = category;
            this.payment = payment;
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

    private AppCatalog() {}

    static synchronized Map<String, App> apps(Context c) {
        long now = System.currentTimeMillis();
        if (cache != null && now - cachedAt < CACHE_MS) return cache;
        PackageManager pm = c.getPackageManager();
        Set<String> upi = new HashSet<>();
        for (ResolveInfo ri : pm.queryIntentActivities(new Intent(Intent.ACTION_VIEW, Uri.parse("upi://pay?pa=test@upi")), 0)) {
            upi.add(ri.activityInfo.packageName);
        }
        Map<String, App> out = new HashMap<>();
        Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        for (ResolveInfo ri : pm.queryIntentActivities(launcher, 0)) {
            ApplicationInfo ai = ri.activityInfo.applicationInfo;
            String pkg = ai.packageName;
            if (pkg.equals(c.getPackageName()) || out.containsKey(pkg)) continue;
            boolean payment = upi.contains(pkg) || KNOWN_PAYMENTS.contains(pkg);
            out.put(pkg, new App(pkg, ri.loadLabel(pm).toString(), categoryOf(ai), payment));
        }
        cache = out;
        cachedAt = now;
        return out;
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
        if (contains(except, pkg)) return false;
        App app = apps(c).get(pkg);
        if (app == null) return false;
        for (int i = 0; i < categories.length(); i++) {
            String cat = categories.optString(i);
            if ("payments".equals(cat) ? app.payment : cat.equals(app.category)) return true;
        }
        return false;
    }

    static String label(Context c, String pkg) {
        App app = apps(c).get(pkg);
        return app != null ? app.name : pkg;
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

    static List<App> all(Context c) {
        return new ArrayList<>(apps(c).values());
    }
}
