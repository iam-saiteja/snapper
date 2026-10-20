package com.saiteja.snapper;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
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
 *  - blocked apps (Instagram, YouTube, ...) are closed unless unlocked with points,
 *  - penalty apps (PhonePe, CRED, ...) are closed while points are negative,
 *  - Shorts/Reels are closed even when the app is unlocked (unless rules allow it),
 *  - Snapper's own Settings pages and its uninstall dialog are closed, so it can't be switched off easily.
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
    private final Map<String, Long> lastAction = new HashMap<>();
    private long lastSettingsScan = 0;
    private String lastSettingsClass = "";

    @Override
    protected void onServiceConnected() {
        SyncWorker.schedule(this);
        SyncWorker.clearNag(this);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
        String pkg = event.getPackageName().toString();
        if (pkg.equals(getPackageName())) return;

        long sleepUntil = SleepMode.activeUntil(this);
        if (sleepUntil > 0 && sleepBlocks(pkg)) {
            block("sleep:" + pkg, AppCatalog.label(this, pkg), BlockActivity.REASON_SLEEP, sleepUntil);
            return;
        }

        if (SELF_PROTECTED.contains(pkg)) {
            if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && event.getClassName() != null) {
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

        if (!ShortsDetectors.hasDetector(pkg)) return;
        if (blocked != null && unlocked && blocked.optBoolean("allowShortsWhenUnlocked", false)) return;
        boolean relevant =
            event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ||
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
        // Setup screens: only the "activate device admin" screen, or anything briefly for alarm permission.
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

    private List<AccessibilityNodeInfo> focusedRoots() {
        java.util.ArrayList<AccessibilityNodeInfo> roots = new java.util.ArrayList<>();
        for (AccessibilityWindowInfo w : getWindows()) {
            if (w.isFocused() && w.isActive() && w.getRoot() != null) roots.add(w.getRoot());
        }
        if (roots.isEmpty() && getRootInActiveWindow() != null) roots.add(getRootInActiveWindow());
        return roots;
    }

    /** During sleep: everything is blocked except calls/alarms/keyboard/home, allowApps, and Chrome on allowed sites. */
    private boolean sleepBlocks(String pkg) {
        if (SleepMode.isAllowed(this, pkg)) return false;
        if (SELF_PROTECTED.contains(pkg)) return !StateStore.isUnlocked(this, SETTINGS);
        if (SleepMode.CHROME.equals(pkg)) return !chromeOnAllowedSite();
        return true;
    }

    private boolean chromeOnAllowedSite() {
        JSONArray sites = SleepMode.allowedWebsites(this);
        if (sites.length() == 0) return false;
        if ("chromeSite".equals(StateStore.activeGrace(this))) return true; // just opened from the block screen
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return true;
        List<AccessibilityNodeInfo> bars = root.findAccessibilityNodeInfosByViewId(SleepMode.CHROME + ":id/url_bar");
        // Toolbar hidden (scrolled, fullscreen call): keep allowing; every navigation shows it again.
        if (bars == null || bars.isEmpty()) return true;
        AccessibilityNodeInfo bar = bars.get(0);
        if (bar.isFocused()) return true; // typing an address
        CharSequence text = bar.getText();
        if (text == null) return false;
        String shown = text.toString().toLowerCase();
        for (int i = 0; i < sites.length(); i++) {
            if (shown.contains(SleepMode.host(sites.optString(i)))) return true;
        }
        return false;
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
