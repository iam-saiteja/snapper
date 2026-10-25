package com.saiteja.snapper;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SnapperPlugin.class);
        super.onCreate(savedInstanceState);
        handleShare(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleShare(intent);
    }

    // "Share → Snapper" from Instagram, YouTube, browsers, etc., and "Answer the question" on a ringing reminder.
    private void handleShare(Intent intent) {
        if (intent == null) return;
        String ackId = intent.getStringExtra(ReminderService.EXTRA_ACK_ID);
        if (ackId != null) {
            intent.removeExtra(ReminderService.EXTRA_ACK_ID); // don't reopen the question on rotation/recreate
            SnapperPlugin.onAckRequested(ackId);
            return;
        }
        if (!Intent.ACTION_SEND.equals(intent.getAction())) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text != null) SnapperPlugin.onShared(text);
    }
}
