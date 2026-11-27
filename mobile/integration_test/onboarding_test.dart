import 'package:anideck_mobile/account_service.dart';
import 'package:anideck_mobile/onboarding.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:integration_test/integration_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:sqflite/sqflite.dart';

/// Native acceptance on a dedicated emulator: real sqflite store and real
/// screen protection (the real soft keyboard is checked with adb input on
/// the installed app; see the audit). Accounts are generated
/// fixtures with an in-memory vault and a mock HTTP client: no real account,
/// key or network request. Prints `VISUAL <state>` and holds each state so a
/// host can capture the screen; the sign-in step is FLAG_SECURE by design.
class _Vault implements AccountVault {
  String? value;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String key) async => value = key;
  @override
  Future<void> delete() async => value = null;
}

final _fixtureKey = 'adk_${'b' * 64}';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  Future<void> hold(
    WidgetTester tester,
    String state, {
    int seconds = 3,
  }) async {
    // ignore: avoid_print
    print('VISUAL $state');
    await tester.runAsync(
      () => Future<void>.delayed(Duration(seconds: seconds)),
    );
    await tester.pump();
  }

  Future<void> settle(WidgetTester tester, [int ms = 800]) async {
    await tester.runAsync(
      () => Future<void>.delayed(Duration(milliseconds: ms)),
    );
    await tester.pumpAndSettle();
  }

  Future<void> tapKey(WidgetTester tester, String key) async {
    await tester.ensureVisible(find.byKey(ValueKey(key)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(ValueKey(key)));
    await settle(tester);
  }

  testWidgets('fresh install, keyboard, offline recovery, guest skip and '
      'restart on a native device', (tester) async {
    await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
    final store = SqliteOnboardingStore();
    expect(
      await tester.runAsync(store.isComplete),
      isFalse,
      reason: 'fresh test install',
    );
    final vault = _Vault();
    var requests = 0;
    final protection = <bool>[];
    Widget app() => MaterialApp(
      theme: ThemeData(
        brightness: Brightness.dark,
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xff111016),
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xffbba5ff),
          brightness: Brightness.dark,
        ),
      ),
      home: OnboardingGate(
        home: const Scaffold(body: Center(child: Text('Fixture home'))),
        store: store,
        existingInstallation: () async => false,
        accountService: () => AccountService(
          vault: vault,
          api: AccountApi(
            // Always offline: the fixture never reaches any server.
            client: MockClient((request) async {
              requests++;
              throw http.ClientException('generated offline');
            }),
          ),
        ),
        screenProtection: (on) async {
          protection.add(on);
          await const MethodChannel('anideck/privacy')
              .invokeMethod<void>('setScreenProtected', on);
        },
        openAniList: (_) async {},
      ),
    );

    await tester.pumpWidget(app());
    await settle(tester);
    expect(find.text('Continue without an account'), findsOneWidget);
    await hold(tester, 'welcome');

    // Create step: real keyboard over an unprotected screen.
    await tapKey(tester, 'onboarding-create');
    await tester.enterText(find.byKey(const ValueKey('onboarding-field')), 'x');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await settle(tester);
    expect(
      find.text('Use 3–20 letters, numbers or underscores.'),
      findsOneWidget,
    );
    await hold(tester, 'create-validation');
    await tester.tap(find.byTooltip('Back'));
    await settle(tester);

    // Sign-in step: protected screen, real keyboard, offline then retry.
    await tapKey(tester, 'onboarding-sign-in');
    expect(protection, [true]);
    expect(
      await const MethodChannel('anideck/privacy')
          .invokeMethod<bool>('isScreenProtected'),
      isTrue,
    );
    await hold(tester, 'sign-in-protected');
    await tester.enterText(
      find.byKey(const ValueKey('onboarding-field')),
      _fixtureKey,
    );
    await tester.tap(find.byKey(const ValueKey('onboarding-submit')));
    await settle(tester);
    expect(find.byKey(const ValueKey('onboarding-error')), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
    expect(vault.value, isNull);
    expect(await tester.runAsync(store.isComplete), isFalse);
    // Back out instead of retrying: guest path is the restart scenario.
    await tester.tap(find.byTooltip('Back'));
    await settle(tester);
    expect(protection, [true, false]);
    expect(requests, 1);

    await tapKey(tester, 'onboarding-skip');
    expect(find.text('Ready when you are.'), findsOneWidget);
    await hold(tester, 'anilist-optional');
    await tapKey(tester, 'onboarding-done');
    expect(find.text('Fixture home'), findsOneWidget);

    // Restart: drop the tree and the database connection, reopen from disk.
    await tester.pumpWidget(const SizedBox());
    await tester.runAsync(store.close);
    final reopened = SqliteOnboardingStore();
    expect(await tester.runAsync(reopened.isComplete), isTrue);
    await tester.runAsync(reopened.close);
    await tester.pumpWidget(app());
    await settle(tester);
    expect(find.text('Fixture home'), findsOneWidget);
    expect(find.text('Welcome to AniDeck.'), findsNothing);
    await hold(tester, 'restart-home');

    // Leave the device as found: remove this test's state database.
    await tester.pumpWidget(const SizedBox());
    await tester.runAsync(store.close);
    await tester.runAsync(
      () async => deleteDatabase(
        '${await getDatabasesPath()}/${SqliteOnboardingStore.fileName}',
      ),
    );
    await SystemChrome.setPreferredOrientations([]);
  });
}
