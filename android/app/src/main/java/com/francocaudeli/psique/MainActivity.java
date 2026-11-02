package com.francocaudeli.psique;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.webkit.WebSettings;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Solo debug necesita llamar al HTTP de loopback mediante adb reverse.
        // La política de red limita la excepción a 127.0.0.1; release no la activa.
        if (BuildConfig.DEBUG && getBridge() != null) {
            getBridge().getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
    }
}
