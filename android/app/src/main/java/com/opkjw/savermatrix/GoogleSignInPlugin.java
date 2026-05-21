package com.opkjw.savermatrix;

import android.content.Intent;
import android.util.Log;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.Scopes;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import com.google.android.gms.tasks.Task;

@CapacitorPlugin(name = "GoogleAuth")
public class GoogleSignInPlugin extends Plugin {

    private static final String TAG = "GoogleSignInPlugin";
    private static final String WEB_CLIENT_ID =
        "1081217420528-qfe93nsohh49fbqp5oku4d5k9i0c5n8c.apps.googleusercontent.com";

    private GoogleSignInClient googleSignInClient;

    @Override
    public void load() {
        GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(WEB_CLIENT_ID)
            .requestEmail()
            .requestScopes(new Scope(Scopes.PROFILE))
            .build();
        googleSignInClient = GoogleSignIn.getClient(getActivity(), gso);
        Log.d(TAG, "GoogleSignInPlugin loaded, webClientId=" + WEB_CLIENT_ID);
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        // Google Play Services 사용 가능 여부 먼저 확인
        int availability = GoogleApiAvailability.getInstance()
            .isGooglePlayServicesAvailable(getContext());
        if (availability != ConnectionResult.SUCCESS) {
            Log.e(TAG, "Google Play Services unavailable: " + availability);
            call.reject("Google Play Services 사용 불가: " + availability, String.valueOf(availability));
            return;
        }
        Intent signInIntent = googleSignInClient.getSignInIntent();
        startActivityForResult(call, signInIntent, "handleSignInResult");
    }

    @ActivityCallback
    private void handleSignInResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Task<GoogleSignInAccount> task =
            GoogleSignIn.getSignedInAccountFromIntent(result.getData());
        try {
            GoogleSignInAccount account = task.getResult(ApiException.class);
            Log.d(TAG, "Sign-in success: " + account.getEmail());
            JSObject ret = new JSObject();
            ret.put("idToken", account.getIdToken());
            ret.put("email", account.getEmail());
            ret.put("displayName", account.getDisplayName() != null ? account.getDisplayName() : "");
            call.resolve(ret);
        } catch (ApiException e) {
            Log.e(TAG, "Sign-in failed statusCode=" + e.getStatusCode()
                + " message=" + e.getMessage());
            call.reject("SIGN_IN_FAILED", String.valueOf(e.getStatusCode()));
        }
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        googleSignInClient.signOut().addOnCompleteListener(task -> call.resolve());
    }
}
