/*
 * Copyright 2025 Atick Faisal
 * Modifications copyright 2026 The Snapper Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.saiteja.snapper;

import android.view.accessibility.AccessibilityNodeInfo;
import java.util.ArrayDeque;

/**
 * Detects YouTube Shorts / Instagram Reels from view ids.
 *
 * Adapted from Shorts-Blocker by Atick Faisal: https://github.com/atick-faisal/Shorts-Blocker
 * Changes from the original: ported from Kotlin to Java; Instagram also requires a clips viewer before treating
 * "no feed tab" as Reels (so DMs aren't blocked) and scans up to 200 nodes.
 * These ids change when the apps update; adjust here when detection breaks.
 */
final class ShortsDetectors {

    static final String YOUTUBE = "com.google.android.youtube";
    static final String INSTAGRAM = "com.instagram.android";

    private ShortsDetectors() {}

    static boolean isShortForm(String pkg, AccessibilityNodeInfo root) {
        if (YOUTUBE.equals(pkg)) return youtubeShorts(root);
        if (INSTAGRAM.equals(pkg)) return instagramReels(root);
        return false;
    }

    static boolean hasDetector(String pkg) {
        return YOUTUBE.equals(pkg) || INSTAGRAM.equals(pkg);
    }

    private static boolean youtubeShorts(AccessibilityNodeInfo root) {
        ArrayDeque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        queue.add(root);
        int scanned = 0;
        while (!queue.isEmpty() && scanned < 150) {
            AccessibilityNodeInfo n = queue.removeFirst();
            scanned++;
            String id = n.getViewIdResourceName();
            if (id != null && id.toLowerCase().contains("reel_progress_bar")) return true;
            addChildren(n, queue);
        }
        return false;
    }

    private static boolean instagramReels(AccessibilityNodeInfo root) {
        ArrayDeque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        queue.add(root);
        int scanned = 0;
        boolean feedTab = false;
        boolean clipsViewer = false;
        while (!queue.isEmpty() && scanned < 200) {
            AccessibilityNodeInfo n = queue.removeFirst();
            scanned++;
            String id = n.getViewIdResourceName();
            if (id != null) {
                if (id.contains("clips_tab") && n.isSelected()) return true;
                if (id.contains("feed_tab")) feedTab = true;
                if (id.contains("clips_viewer") || id.contains("clips_video")) clipsViewer = true;
            }
            addChildren(n, queue);
        }
        // Fullscreen reel opened from feed/explore/profile/DM: bottom tab bar hidden + clips viewer present.
        return !feedTab && clipsViewer;
    }

    private static void addChildren(AccessibilityNodeInfo n, ArrayDeque<AccessibilityNodeInfo> queue) {
        for (int i = 0; i < n.getChildCount(); i++) {
            AccessibilityNodeInfo child = n.getChild(i);
            if (child != null) queue.add(child);
        }
    }
}
