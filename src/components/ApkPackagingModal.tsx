import React, { useState } from 'react';
import { Check, Copy, Download, ExternalLink, Smartphone, Terminal, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface ApkPackagingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApkPackagingModal: React.FC<ApkPackagingModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [downloadedBundle, setDownloadedBundle] = useState(false);

  if (!isOpen) return null;

  const appUrl = window.location.origin;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(appUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  const handleDownloadAndroidNativeBundle = () => {
    const androidManifestXml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.voxguard.translator.offline">

    <!-- Required permissions for transparent background audio & noise-filtered translation -->
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="VoxGuard Translator"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">

        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:exported="true"
            android:launchMode="singleTask">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- Transparent Foreground Microphone Service (Never hidden from user) -->
        <service
            android:name=".VoxGuardForegroundAudioService"
            android:enabled="true"
            android:exported="false"
            android:foregroundServiceType="microphone" />
    </application>
</manifest>`;

    const capacitorConfig = {
      appId: 'com.voxguard.translator.offline',
      appName: 'VoxGuard Offline Translator',
      webDir: 'dist',
      server: {
        androidScheme: 'https',
      },
      android: {
        allowMixedContent: false,
        captureInput: true,
        webContentsDebuggingEnabled: false,
      },
    };

    const bundlePayload = {
      project: 'VoxGuard — On-Device Any-to-English Android Translator & Opus Vault',
      generatedAt: new Date().toISOString(),
      targetUrl: appUrl,
      instructions: [
        'Option A (30-Second Cloud APK): Open https://www.pwabuilder.com, paste targetUrl, click Package for Stores -> Android -> Download Signed .apk.',
        'Option B (Local Capacitor APK): Run `npx @capacitor/cli init VoxGuard com.voxguard.translator.offline`, copy AndroidManifest.xml into android/app/src/main/, and run `npx cap build android`.',
      ],
      capacitorConfig,
      androidManifestXml,
    };

    const blob = new Blob([JSON.stringify(bundlePayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voxguard-android-apk-builder-bundle.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadedBundle(true);
    setTimeout(() => setDownloadedBundle(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-6 my-8">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Android .APK &amp; WebAPK Packaging Studio
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Install directly onto your Android phone or generate a standalone signed <code className="font-mono">.apk</code> binary.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comparison explanation requested by user */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Method 1 · Fastest (0 Seconds)
              </span>
              <Smartphone className="w-4 h-4 text-emerald-500" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Android Native WebAPK Install
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              When opened in Chrome on your Android phone, Android compiles and installs a signed <strong>WebAPK</strong> directly into your phone&apos;s app drawer. Works 100% offline with wake-lock &amp; lock-screen notification controls.
            </p>
            {isInstalled ? (
              <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 py-2">
                Installed on this device
              </div>
            ) : isInstallable ? (
              <button
                type="button"
                onClick={install}
                className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Smartphone className="w-4 h-4" />
                <span>Install Android WebAPK Now</span>
              </button>
            ) : (
              <div className="text-xs text-slate-500 dark:text-slate-400 pt-1">
                On Android Chrome: tap the <strong>⋮ Menu → Add to Home screen / Install App</strong>.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">
                Method 2 · Standalone .APK File
              </span>
              <Download className="w-4 h-4 text-cyan-500" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Generate Signed .APK Binary
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Want a standalone <code className="font-mono">.apk</code> file you can sideload or transfer via USB? Copy this app&apos;s URL below and open <strong>PWABuilder&apos;s Android APK Packager</strong> to compile a signed <code className="font-mono">.apk</code> in ~30 seconds.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyUrl}
                className="flex-1 min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {copiedUrl ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                <span>{copiedUrl ? 'Copied URL' : '1. Copy App URL'}</span>
              </button>
              <a
                href={`https://www.pwabuilder.com/reportcard?site=${encodeURIComponent(appUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
              >
                <span>2. Build .APK</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Native Android Manifest & Capacitor Bundle */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-500" />
              <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Android Studio / Capacitor Native Foreground Service Config
              </h4>
            </div>
            <button
              type="button"
              onClick={handleDownloadAndroidNativeBundle}
              className="min-h-[40px] px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors"
            >
              {downloadedBundle ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Downloaded Native Config</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download AndroidManifest.xml &amp; Config</span>
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Includes pre-configured <code className="font-mono">FOREGROUND_SERVICE_MICROPHONE</code>, <code className="font-mono">WAKE_LOCK</code>, and <code className="font-mono">MODIFY_AUDIO_SETTINGS</code> permissions for transparent screen-off audio translation.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
