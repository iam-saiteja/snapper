package com.saiteja.snapper;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Full-screen "blocked" page shown instead of the blocked app. */
public class BlockActivity extends Activity {

    static final String EXTRA_NAME = "name";
    static final String EXTRA_REASON = "reason";
    static final String EXTRA_UNTIL = "until";
    static final String REASON_LOCKED = "locked";
    static final String REASON_PENALTY = "penalty";
    static final String REASON_SELF = "self";
    static final String REASON_SLEEP = "sleep";
    static final String REASON_DNS = "dns";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String name = getIntent().getStringExtra(EXTRA_NAME);
        String reason = getIntent().getStringExtra(EXTRA_REASON);

        String message;
        if (REASON_DNS.equals(reason)) {
            message = "Content filter is on.\nSet Private DNS to " + DnsLock.requiredHost(this)
                + " to use your phone.\nSettings > Network > Private DNS > Private DNS provider hostname.";
        } else if (REASON_SLEEP.equals(reason)) {
            long until = getIntent().getLongExtra(EXTRA_UNTIL, 0);
            String time = until > 0 ? istTime(until) : "morning";
            message = "Sleep time until " + time + ".\nOnly calls, alarms and your allowed sites work now.";
        } else if (REASON_PENALTY.equals(reason)) {
            message = name + " is locked because your points are negative.\nFinish your tasks to unlock it.";
        } else if (REASON_SELF.equals(reason)) {
            message = "Snapper's settings are locked.\nUse Emergency → Settings in Snapper if you really need them.";
        } else {
            message = name + " is blocked.\nComplete today's task and spend points to unlock it.";
        }

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setPadding(64, 64, 64, 64);
        layout.setBackgroundColor(Color.BLACK);

        TextView text = new TextView(this);
        text.setText(message);
        text.setTextColor(Color.WHITE);
        text.setTextSize(20);
        text.setGravity(Gravity.CENTER);
        layout.addView(text);

        if (REASON_DNS.equals(reason)) {
            Button dns = new Button(this);
            dns.setText("Set Private DNS");
            dns.setOnClickListener(v -> {
                try {
                    startActivity(new Intent("android.settings.PRIVATE_DNS_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                } catch (android.content.ActivityNotFoundException e) {
                    startActivity(new Intent(android.provider.Settings.ACTION_WIRELESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                }
                finish();
            });
            layout.addView(dns);
        }

        if (REASON_SLEEP.equals(reason)) {
            Button call = new Button(this);
            call.setText("Phone");
            call.setOnClickListener(v -> {
                startActivity(new Intent(Intent.ACTION_DIAL).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                finish();
            });
            layout.addView(call);
            org.json.JSONArray sites = SleepMode.allowedWebsites(this);
            for (int i = 0; i < sites.length(); i++) {
                String site = sites.optString(i);
                Button b = new Button(this);
                b.setText("Open " + SleepMode.host(site));
                b.setOnClickListener(v -> openSite(site));
                layout.addView(b);
            }
        }

        Button open = new Button(this);
        open.setText("Open Snapper");
        open.setOnClickListener(v -> {
            startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            finish();
        });
        layout.addView(open);

        Button home = new Button(this);
        home.setText("Go home");
        home.setOnClickListener(v -> goHome());
        layout.addView(home);

        setContentView(layout);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        goHome();
    }

    private static String istTime(long millis) {
        java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("HH:mm", java.util.Locale.US);
        f.setTimeZone(java.util.TimeZone.getTimeZone("Asia/Kolkata"));
        return f.format(new java.util.Date(millis));
    }

    private void openSite(String site) {
        // Chrome may briefly show its previous tab before loading the site; don't block that moment.
        StateStore.grantGrace(this, "chromeSite", 8_000);
        Intent i = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(SleepMode.url(site)))
            .setPackage(SleepMode.CHROME)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(i);
        } catch (android.content.ActivityNotFoundException e) {
            startActivity(i.setPackage(null));
        }
        finish();
    }

    private void goHome() {
        startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        finish();
    }
}
