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
    static final String REASON_LOCKED = "locked";
    static final String REASON_PENALTY = "penalty";
    static final String REASON_SELF = "self";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String name = getIntent().getStringExtra(EXTRA_NAME);
        String reason = getIntent().getStringExtra(EXTRA_REASON);

        String message;
        if (REASON_PENALTY.equals(reason)) {
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

    private void goHome() {
        startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        finish();
    }
}
