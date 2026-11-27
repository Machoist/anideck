import 'package:material_ui/material_ui.dart';

import 'player_preview.dart';
import 'preview_sample.dart';
import 'provider_browser.dart';
import 'library_page.dart';
import 'mobile_home.dart';
import 'onboarding.dart';
export 'mobile_home.dart' show PreviewHome;

import 'package:flutter/foundation.dart' show kIsWeb, kDebugMode;

const mobileDiagnosticsEnabled =
    kDebugMode &&
    bool.fromEnvironment('ANIDECK_DIAGNOSTICS', defaultValue: true);

void main() => runApp(const AniDeckMobile(onboarding: !kIsWeb));
const accent = Color(0xffbba5ff);

class AniDeckMobile extends StatelessWidget {
  const AniDeckMobile({super.key, this.home, this.onboarding = false});
  final Widget? home;

  /// Shows first-launch onboarding before the default home (the app sets
  /// this; tests that pump the default home leave it off).
  final bool onboarding;
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'AniDeck Mobile Preview',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      brightness: Brightness.dark,
      useMaterial3: true,
      scaffoldBackgroundColor: const Color(0xff111016),
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xff111016),
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleSpacing: 24,
      ),
      cardTheme: CardThemeData(
        color: const Color(0xff211e2b),
        elevation: 0,
        margin: const EdgeInsets.symmetric(vertical: 6),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: Color(0xff383141)),
        ),
      ),
      colorScheme: ColorScheme.fromSeed(
        seedColor: accent,
        brightness: Brightness.dark,
        surface: const Color(0xff201e2b),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: accent,
          foregroundColor: const Color(0xff211b35),
          minimumSize: const Size(48, 52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
    ),
    home: home ?? (onboarding ? OnboardingGate(home: _home()) : _home()),
  );

  Widget _home() => PreviewHome(
    onSamples: !mobileDiagnosticsEnabled
        ? null
        : (context) => Navigator.of(context).push(
            MaterialPageRoute<void>(builder: (_) => const PlaybackSamples()),
          ),
  );
}

class PlaybackSamples extends StatelessWidget {
  const PlaybackSamples({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 640),
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              Row(
                children: [
                  Image.asset('assets/app-icon.png', width: 36, height: 36),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(
                      'AniDeck',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  const Chip(
                    label: Text(
                      'PREVIEW',
                      style: TextStyle(fontSize: 10, letterSpacing: 1),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 46),
              const Text(
                'YOUR NEXT WATCH, ON DECK',
                style: TextStyle(
                  color: accent,
                  fontSize: 11,
                  letterSpacing: 2,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'A little screen.\nA whole new deck.',
                style: TextStyle(
                  fontSize: 40,
                  height: 1.12,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -1.4,
                ),
              ),
              const SizedBox(height: 18),
              const Text(
                'Your anime deserves a place in your pocket. Let’s start with a player that feels right.',
                style: TextStyle(
                  color: Color(0xffb4afc2),
                  height: 1.6,
                  fontSize: 15,
                ),
              ),
              const SizedBox(height: 32),
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xff383049), Color(0xff201e2b)],
                  ),
                  border: Border.all(color: const Color(0xff514660)),
                  borderRadius: BorderRadius.circular(26),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.play_circle_outline_rounded,
                      color: accent,
                      size: 48,
                    ),
                    const SizedBox(height: 28),
                    const Text(
                      'Press play. Make yourself comfortable.',
                      style: TextStyle(
                        fontSize: 23,
                        height: 1.2,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'A short sample for trying sound, captions and playback controls.',
                      style: TextStyle(color: Color(0xffc5bed3), height: 1.5),
                    ),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => const PreviewPlayer(),
                          ),
                        ),
                        icon: const Icon(Icons.play_arrow_rounded),
                        label: const Text(
                          'Try the player',
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              if (!kIsWeb) ...[
                OutlinedButton.icon(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const LibraryPage(),
                    ),
                  ),
                  icon: const Icon(Icons.bookmarks_outlined),
                  label: const Text('My list'),
                ),
                const SizedBox(height: 12),
              ],
              FilledButton.icon(
                onPressed: kIsWeb
                    ? null
                    : () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => const ProviderBrowser(),
                        ),
                      ),
                icon: const Icon(Icons.explore_outlined),
                label: const Text('Browse anime on Anikoto'),
              ),
              if (kIsWeb)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text(
                    'Anime source preview is available in the Android build.',
                    style: TextStyle(color: Color(0xffaaa2b8), fontSize: 12),
                  ),
                ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) =>
                        const PreviewPlayer(sample: PreviewSample.streaming),
                  ),
                ),
                icon: const Icon(Icons.waves_rounded),
                label: const Text('Try a streaming sample'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(double.infinity, 48),
                ),
              ),
              const SizedBox(height: 16),
              const Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  Chip(
                    avatar: Icon(Icons.closed_caption_outlined, size: 18),
                    label: Text('Captions'),
                  ),
                  Chip(
                    avatar: Icon(Icons.replay_10_rounded, size: 18),
                    label: Text('Quick seeking'),
                  ),
                  Chip(
                    avatar: Icon(Icons.pause_circle_outline, size: 18),
                    label: Text('Background pause'),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              const Text(
                'An early look at AniDeck for your phone. Account connections come next.',
                style: TextStyle(
                  color: Color(0xff8f899e),
                  fontSize: 12,
                  height: 1.5,
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
