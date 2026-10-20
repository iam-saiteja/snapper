package com.saiteja.snapper;

import android.accessibilityservice.AccessibilityService;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The blocker. For every foreground app:
 *  - during sleep windows, everything except calls/alarms/allowed sites is closed,
 *  - blocked apps (Instagram, YouTube, category matches, ...) are closed unless unlocked with points,
 *  - penalty apps (PhonePe, CRED, payment category, ...) are closed while points are negative,
 *  - Shorts/Reels are closed even when the app is unlocked (unless rules allow it),
 *  - Snapper's own Settings pages and its uninstall dialog are closed, so it can't be switched off easily.
 * Runs on every accessibility event and on a periodic pass, so rules that start (sleep) or end (unlocks)
 * while an app is open without interaction still apply.
 */
public class BlockerService extends AccessibilityService {

    static final String SETTINGS = "com.android.settings";

    private static final Set<String> SELF_PROTECTED = new HashSet<>(
        Arrays.asList(
            SETTINGS,
            "com.google.android.packageinstaller",
            "com.android.packageinstaller",
            "com.samsung.android.packageinstaller",
            "com.miui.securitycenter"
        )
    );

    private static final long COOLDOWN_MS = 1500;
    private static final long RECHECK_MS = 15_000;
    private static final long SYNC_MS = 5 * 60_000;

    private final Map<String, Long> lastAction = new HashMap<>();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final java.util.concurrent.ExecutorService io = java.util.concurrent.Executors.newSingleThreadExecutor();
    private long lastSettingsScan = 0;
    private String lastSettingsClass = "";
    // Last verdict from a visible Chrome address bar; null = not verified since Chrome's window changed.
    private Boolean chromeVerdict = null;

    private final Runnable recheck = new Runnable() {
        @Override
        public void run() {
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root != null && root.getPackageName() != null) evaluate(root.getPackageName().toString(), null);
            handler.postDelayed(this, RECHECK_MS);
        }
    };

    // The service is always running, unlike WorkManager, so it keeps points/penalty locks fresh.
    private final Runnable sync = new Runnable() {
        @Override
        public void run() {
            io.execute(() -> SyncWorker.syncNow(getApplicationContext()));
            handler.postDelayed(this, SYNC_MS);
        }
    };

    // New installs must be categorised right away, not after the catalog cache expires.
    private final BroadcastReceiver packagesChanged = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            AppCatalog.invalidate();
        }
    };

    @Override
    protected void onServiceConnected() {
        SyncWorker.schedule(this);
        SyncWorker.clearNag(this);
        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_PACKAGE_ADDED);
        f.addAction(Intent.ACTION_PACKAGE_REMOVED);
        f.addAction(Intent.ACTION_PACKAGE_REPLACED);
        f.addDataScheme("package");
        registerReceiver(packagesChanged, f);
        handler.postDelayed(recheck, RECHECK_MS);
        handler.post(sync);
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        io.shutdownNow();
        try {
            unregisterReceiver(packagesChanged);
        } catch (IllegalArgumentException ignored) {}
        super.onDestroy();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
        evaluate(event.getPackageName().toString(), event);
    }

    /** @param event null for the periodic pass */
    private void evaluate(String pkg, AccessibilityEvent event) {
        if (pkg.equals(getPackageName())) return;
        boolean windowChanged = event == null || event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED;
        if (SleepMode.CHROME.equals(pkg) && event != null && windowChanged) chromeVerdict = null;

        // DNS lock: until the user sets Private DNS, allow only essentials and setting the DNS itself.
        if (DnsLock.enforcing(this) && dnsBlocks(pkg)) {
            block("dns:" + pkg, AppCatalog.label(this, pkg), BlockActivity.REASON_DNS, 0);
            return;
        }

        long sleepUntil = SleepMode.activeUntil(this);
        if (sleepUntil > 0 && sleepBlocks(pkg)) {
            block("sleep:" + pkg, AppCatalog.label(this, pkg), BlockActivity.REASON_SLEEP, sleepUntil);
            return;
        }

        if (SELF_PROTECTED.contains(pkg)) {
            if (event != null && windowChanged && event.getClassName() != null) {
                lastSettingsClass = event.getClassName().toString();
            }
            protectSelf(pkg);
            return;
        }

        JSONObject state = StateStore.state(this);
        JSONArray except = state.optJSONArray("exceptApps");
        JSONObject blocked = StateStore.find(this, "blocked", pkg);
        JSONObject penalty = StateStore.find(this, "penaltyLocked", pkg);
        boolean unlocked = StateStore.isUnlocked(this, pkg);

        if (!unlocked && (penalty != null ||
                AppCatalog.inCategories(this, pkg, state.optJSONArray("penaltyLockedCategories"), except))) {
            String name = penalty != null ? penalty.optString("name", pkg) : AppCatalog.label(this, pkg);
            block("penalty:" + pkg, name, BlockActivity.REASON_PENALTY, 0);
            return;
        }
        if (!unlocked && (blocked != null ||
                AppCatalog.inCategories(this, pkg, state.optJSONArray("blockCategories"), except))) {
            String name = blocked != null ? blocked.optString("name", pkg) : AppCatalog.label(this, pkg);
            block("app:" + pkg, name, BlockActivity.REASON_LOCKED, 0);
            return;
        }

        // The user's own blocks from the Apps tab. 'soft' always blocks (removable in the app);
        // 'until_tasks' blocks only while today still has pending tasks.
        JSONObject appBlock = findAppBlock(state, pkg);
        if (appBlock != null) {
            boolean untilTasks = "until_tasks".equals(appBlock.optString("mode"));
            if (!untilTasks || state.optInt("pendingTasksToday", 0) > 0) {
                String reason = untilTasks ? BlockActivity.REASON_UNTIL_TASKS : BlockActivity.REASON_SOFT;
                block("mine:" + pkg, appBlock.optString("name", pkg), reason, 0);
                return;
            }
        }

        if (!ShortsDetectors.hasDetector(pkg)) return;
        if (blocked != null && unlocked && blocked.optBoolean("allowShortsWhenUnlocked", false)) return;
        boolean relevant = windowChanged ||
            (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED &&
                (event.getContentChangeTypes() & AccessibilityEvent.CONTENT_CHANGE_TYPE_SUBTREE) != 0);
        if (!relevant) return;

        for (AccessibilityNodeInfo root : focusedRoots()) {
            if (ShortsDetectors.isShortForm(pkg, root)) {
                if (cooldownPassed("shorts:" + pkg)) performGlobalAction(GLOBAL_ACTION_BACK);
                return;
            }
        }
    }

    private void protectSelf(String pkg) {
        if (StateStore.isUnlocked(this, SETTINGS)) return;
        String grace = StateStore.activeGrace(this);
        // Setup screens: only the "activate device admin" screen, or anything briefly for alarm/usage permission.
        if ("deviceAdmin".equals(grace) && lastSettingsClass.contains("DeviceAdminAdd")) return;
        if ("exactAlarms".equals(grace) || "usageAccess".equals(grace)) return;

        long now = SystemClock.uptimeMillis();
        if (now - lastSettingsScan < 300) return;
        lastSettingsScan = now;

        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;
        List<AccessibilityNodeInfo> hits = root.findAccessibilityNodeInfosByText(getString(R.string.app_name));
        if (hits == null || hits.isEmpty()) return;
        if (!cooldownPassed("self:" + pkg)) return;
        performGlobalAction(GLOBAL_ACTION_BACK);
        block("self", "Snapper settings", BlockActivity.REASON_SELF, 0);
    }

    private JSONObject findAppBlock(JSONObject state, String pkg) {
        JSONArray arr = state.optJSONArray("appBlocks");
        if (arr == null) return null;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o != null && pkg.equals(o.optString("package"))) return o;
        }
        return null;
    }

    private List<AccessibilityNodeInfo> focusedRoots() {
        java.util.ArrayList<AccessibilityNodeInfo> roots = new java.util.ArrayList<>();
        for (AccessibilityWindowInfo w : getWindows()) {
            if (w.isFocused() && w.isActive() && w.getRoot() != null) roots.add(w.getRoot());
        }
        if (roots.isEmpty() && getRootInActiveWindow() != null) roots.add(getRootInActiveWindow());
        return roots;
    }

    /** DNS lock: allow essentials and the Settings app (so the user can set Private DNS), block everything else. */
    private boolean dnsBlocks(String pkg) {
        return !SleepMode.isEssential(this, pkg) && !SELF_PROTECTED.contains(pkg);
    }

    /** During sleep: everything is blocked except calls/alarms/keyboard/home, allowApps, and Chrome on allowed sites. */
    private boolean sleepBlocks(String pkg) {
        if (SleepMode.isAllowed(this, pkg)) return false;
        if (SELF_PROTECTED.contains(pkg)) return !StateStore.isUnlocked(this, SETTINGS);
        if (SleepMode.CHROME.equals(pkg)) return !chromeOnAllowedSite();
        return true;
    }

    /**
     * Fails closed: Chrome is allowed only after its address bar has been seen showing an allowed site, and only
     * until Chrome's window changes (new tab, tab switcher, new page activity). A hidden toolbar keeps the last
     * verified verdict instead of allowing by default.
     */
    private boolean chromeOnAllowedSite() {
        JSONArray sites = SleepMode.allowedWebsites(this);
        if (sites.length() == 0) return false;
        if ("chromeSite".equals(StateStore.activeGrace(this))) return true; // just opened from the block screen
        AccessibilityNodeInfo root = getRootInActiveWindow();
        List<AccessibilityNodeInfo> bars = root == null ? null
            : root.findAccessibilityNodeInfosByViewId(SleepMode.CHROME + ":id/url_bar");
        if (bars == null || bars.isEmpty()) return Boolean.TRUE.equals(chromeVerdict);
        AccessibilityNodeInfo bar = bars.get(0);
        if (bar.isFocused()) return true; // typing an address; checked again once it loads
        CharSequence text = bar.getText();
        String shown = text == null ? "" : text.toString().toLowerCase();
        boolean ok = false;
        for (int i = 0; i < sites.length() && !ok; i++) ok = shown.contains(SleepMode.host(sites.optString(i)));
        chromeVerdict = ok;
        return ok;
    }

    private void block(String key, String name, String reason, long until) {
        if (!cooldownPassed(key)) return;
        performGlobalAction(GLOBAL_ACTION_HOME);
        Intent i = new Intent(this, BlockActivity.class)
            .putExtra(BlockActivity.EXTRA_NAME, name)
            .putExtra(BlockActivity.EXTRA_REASON, reason)
            .putExtra(BlockActivity.EXTRA_UNTIL, until)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(i);
    }

    private boolean cooldownPassed(String key) {
        long now = SystemClock.uptimeMillis();
        Long last = lastAction.get(key);
        if (last != null && now - last < COOLDOWN_MS) return false;
        lastAction.put(key, now);
        return true;
    }

    @Override
    public void onInterrupt() {}
}
