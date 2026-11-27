import 'dart:convert';
import 'dart:io';

import 'package:anideck_mobile/account_service.dart';
import 'package:anideck_mobile/local_library.dart';
import 'package:anideck_mobile/onboarding.dart';
import 'package:anideck_mobile/providers/anikoto_catalog.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:path/path.dart' as path;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'account_service_test.dart' show MemoryVault, key, joined;

/// Generated fixtures only: no real accounts, keys or network.
class MemoryStore implements OnboardingStore {
  bool complete = false, failRead = false, failWrite = false;
  final outcomes = <String>[];
  @override
  Future<bool> isComplete() async {
    if (failRead) throw Exception('generated store read failure');
    return complete;
  }

  @override
  Future<void> markComplete(String outcome) async {
    if (failWrite) throw Exception('generated store write failure');
    outcomes.add(outcome);
    complete = true;
  }
}

const homeText = 'Fixture home';
const otherKey =
    'adk_1111111111111111111111111111111111111111111111111111111111111111';

class Harness {
  Harness({
    http.Client? client,
    MemoryVault? vault,
    this.existing = false,
    MemoryStore? store,
    String Function()? newKey,
  }) : vault = vault ?? MemoryVault(),
       store = store ?? MemoryStore() {
    service = () => AccountService(
      vault: this.vault,
      api: AccountApi(
        client: client ?? MockClient((_) async => throw StateError('no net')),
      ),
      newKey: newKey,
    );
  }
  final MemoryVault vault;
  final MemoryStore store;
  final bool existing;
  late final AccountService Function() service;
  final protection = <bool>[];
  var existingChecks = 0, aniListOpened = 0;

  Widget app({OnboardingStore? storeOverride}) => MaterialApp(
    theme: ThemeData(brightness: Brightness.dark, useMaterial3: true),
    home: OnboardingGate(
      home: const Scaffold(body: Text(homeText)),
      store: storeOverride ?? store,
      existingInstallation: () async {
        existingChecks++;
        return existing;
      },
      accountService: service,
      screenProtection: (on) async => protection.add(on),
      openAniList: (_) async => aniListOpened++,
    ),
  );
}

/// Any real-looking key fragment (hints/help text say only `adk_…`).
final keyPattern = RegExp(r'adk_[a-fA-F0-9]{6}');

Finder byKey(String value) => find.byKey(ValueKey(value));

void phone(WidgetTester tester, {Size size = const Size(390, 844)}) {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Future<void> tapKey(WidgetTester tester, String value) async {
  await tester.ensureVisible(byKey(value));
  await tester.pumpAndSettle();
  await tester.tap(byKey(value));
  await tester.pumpAndSettle();
}

/// The typed key must only ever exist as an obscured field value.
void expectNoVisibleKey(WidgetTester tester) {
  // Displayed text only; the obscured input is checked separately below.
  expect(
    find.byWidgetPredicate((w) {
      final shown = switch (w) {
        Text(:final data) => data ?? '',
        RichText(:final text) => text.toPlainText(),
        SelectableText(:final data) => data ?? '',
        _ => '',
      };
      return keyPattern.hasMatch(shown);
    }),
    findsNothing,
  );
  for (final field in tester.widgetList<EditableText>(
    find.byType(EditableText),
  )) {
    if (field.controller.text.isNotEmpty) expect(field.obscureText, isTrue);
  }
}

http.Response notJoined() => http.Response(
  jsonEncode({'joined': false, 'session': 'generated.session'}),
  200,
);
http.Response created() => http.Response(
  jsonEncode({
    'me': {'handle': 'new_fixture', 'name': 'new_fixture'},
  }),
  200,
);

void main() {
  sqfliteFfiInit();

  testWidgets('fresh install: welcome offers all three choices; guest skip '
      'reaches optional AniList, then home, and is remembered', (tester) async {
    phone(tester);
    final h = Harness();
    await tester.pumpWidget(h.app());
    await tester.pumpAndSettle();
    expect(find.text('Welcome to AniDeck.'), findsOneWidget);
    expect(find.text('Create AniDeck profile'), findsOneWidget);
    expect(find.text('Sign in with private key'), findsOneWidget);
    expect(find.text('Continue without an account'), findsOneWidget);
    expect(find.textContaining('sign in on another device'), findsOneWidget);
    // All three choices are on the first screen without scrolling.
    final skip = tester.getRect(byKey('onboarding-skip'));
    expect(skip.bottom, lessThanOrEqualTo(844));
    expect(skip.height, greaterThanOrEqualTo(48));
    expect(find.textContaining('Kitsu'), findsNothing);
    expect(h.protection, isEmpty);

    await tapKey(tester, 'onboarding-skip');
    expect(h.store.outcomes, ['guest']);
    expect(find.text('Ready when you are.'), findsOneWidget);
    expect(byKey('onboarding-anilist'), findsOneWidget);
    expect(find.text('Optional'), findsOneWidget);
    expect(find.textContaining('Kitsu'), findsNothing);
    expect(h.vault.value, isNull);

    await tapKey(tester, 'onboarding-done');
    expect(find.text(homeText), findsOneWidget);

    // Restart: a new gate over the same store opens home directly.
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(h.app());
    await tester.pumpAndSettle();
    expect(find.text(homeText), findsOneWidget);
    expect(find.text('Welcome to AniDeck.'), findsNothing);
    expect(h.existingChecks, 1, reason: 'only the first launch detects');
  });

  testWidgets('Connect AniList opens the existing flow and finishes', (
    tester,
  ) async {
    phone(tester);
    final h = Harness();
    await tester.pumpWidget(h.app());
    await tester.pumpAndSettle();
    await tapKey(tester, 'onboarding-skip');
    await tapKey(tester, 'onboarding-anilist');
    expect(h.aniListOpened, 1);
    expect(find.text(homeText), findsOneWidget);
  });

  testWidgets('existing installation is never sent through onboarding', (
    tester,
  ) async {
    phone(tester);
    final h = Harness(existing: true);
    await tester.pumpWidget(h.app());
    await tester.pumpAndSettle();
    expect(find.text(homeText), findsOneWidget);
    expect(find.text('Welcome to AniDeck.'), findsNothing);
    expect(h.store.outcomes, ['existing']);
  });

  testWidgets('existing user stays home even if the store cannot be read '
      'or written', (tester) async {
    phone(tester);
    final h = Harness(
      existing: true,
      store: MemoryStore()
        ..failRead = true
        ..failWrite = true,
    );
    await tester.pumpWidget(h.app());
    await tester.pumpAndSettle();
    expect(find.text(homeText), findsOneWidget);
  });

  testWidgets('if completion cannot be saved the guest still continues and '
      'is told', (tester) async {
    phone(tester);
    final h = Harness(store: MemoryStore()..failWrite = true);
    await tester.pumpWidget(h.app());
    await tester.pumpAndSettle();
    await tapKey(tester, 'onboarding-skip');
    expect(byKey('onboarding-save-warning'), findsOneWidget);
    await tapKey(tester, 'onboarding-done');
    expect(find.text(homeText), findsOneWidget);
  });

  testWidgets('recovery validates the key locally without any request, '
      'protects the screen and never shows the key', (tester) async {
    phone(tester);
    var requests = 0;
    final h = Harness(
      client: MockClient((_) async {
        requests++;
        return joined();
      }),
    );
    await tester.pumpWidget(h.app());
    await tester.pumpAndSettle();
    await tapKey(tester, 'onboarding-sign-in');
    expect(h.protection, [true]);
    expect(find.text('Sign in with your private key.'), findsOneWidget);
    final field = tester.widget<TextField>(byKey('onboarding-field'));
    expect(field.obscureText, isTrue);
    expect(field.enableSuggestions, isFalse);
    expect(field.autocorrect, isFalse);
    expect(field.enableIMEPersonalizedLearning, isFalse);

    for (final bad in ['', 'adk_123', key.toUpperCase(), '${key}0']) {
      await tester.enterText(byKey('onboarding-field'), bad);
      await tapKey(tester, 'onboarding-submit');
      expect(
        find.textContaining('Enter the complete private key'),
        findsOneWidget,
      );
    }
    expect(requests, 0);
    expect(h.vault.value, isNull);

    // Back returns to the welcome, clears the field and drops protection.
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(find.text('Welcome to AniDeck.'), findsOneWidget);
    expect(h.protection, [true, false]);
    expect(h.store.outcomes, isEmpty);
  });

  testWidgets('offline sign-in keeps account and local list, retries, then '
      'signs in without displaying the key', (tester) async {
    phone(tester);
    final library = LocalLibrary(
      open: () => databaseFactoryFfiNoIsolate.openDatabase(
        inMemoryDatabasePath,
        options: OpenDatabaseOptions(
          version: LocalLibrary.schemaVersion,
          onCreate: LocalLibrary.createSchema,
        ),
      ),
    );
    final title = ProviderTitle(
      Uri.parse('https://anikototv.bz/watch/generated-1'),
      'Generated show',
    );
    await tester.runAsync(() => library.save(title));
    Future<String> savedName() async =>
        (await tester.runAsync(library.entries))!.single.title.name;
    var online = false, requests = 0;
    final h = Harness(
      client: MockClient((request) async {
        requests++;
        expect(request.url.path, '/v1/session');
        if (!online) throw const SocketException('generated offline');
        return joined();
      }),
    );
    await tester.pumpWidget(h.app());
    await tester.pumpAndSettle();
    await tapKey(tester, 'onboarding-sign-in');
    await tester.enterText(byKey('onboarding-field'), key);
    await tester.pump();
    expectNoVisibleKey(tester);
    await tapKey(tester, 'onboarding-submit');
    expect(
      find.textContaining('Could not reach your AniDeck account'),
      findsOneWidget,
    );
    expect(find.text('Try again'), findsOneWidget);
    expect(h.vault.value, isNull, reason: 'nothing saved on failure');
    expect(h.store.outcomes, isEmpty);
    expect(await savedName(), 'Generated show');
    expectNoVisibleKey(tester);

    online = true;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(requests, 2);
    expect(find.text('Welcome, @Fixture.'), findsOneWidget);
    expect(h.vault.value, key);
    expect(h.store.outcomes, ['signed-in']);
    expect(h.protection, [true, false]);
    expectNoVisibleKey(tester);
    expect(await savedName(), 'Generated show');
    await tester.runAsync(library.close);
  });

  testWidgets('a rejected key leaves an already saved account untouched', (
    tester,
  ) async {
    phone(tester);
    // A device that somehow reached onboarding with a saved key must keep it.
    final vault = MemoryVault()..value = otherKey;
    final h = Harness(
      vault: vault,
      client: MockClient((_) async => http.Response('{}', 401)),
    );
    await tester.pumpWidget(h.app());
    await tester.pumpAndSettle();
    await tapKey(tester, 'onboarding-sign-in');
    await tester.enterText(byKey('onboarding-field'), key);
    await tapKey(tester, 'onboarding-submit');
    expect(byKey('onboarding-error'), findsOneWidget);
    expect(vault.value, otherKey);
    expect(h.store.outcomes, isEmpty);
    expectNoVisibleKey(tester);
  });

  testWidgets('backgrounding the sign-in step clears the typed key', (
    tester,
  ) async {
    phone(tester);
    final h = Harness();
    await tester.pumpWidget(h.app());
    await tester.pumpAndSettle();
    await tapKey(tester, 'onboarding-sign-in');
    await tester.enterText(byKey('onboarding-field'), key);
    for (final state in [
      AppLifecycleState.inactive,
      AppLifecycleState.hidden,
      AppLifecycleState.paused,
      AppLifecycleState.hidden,
      AppLifecycleState.inactive,
      AppLifecycleState.resumed,
    ]) {
      tester.binding.handleAppLifecycleStateChanged(state);
    }
    await tester.pump();
    expect(
      tester.widget<TextField>(byKey('onboarding-field')).controller!.text,
      isEmpty,
    );
  });

  testWidgets('create validates the handle, survives a network failure with '
      'the same saved key and never shows it', (tester) async {
    phone(tester);
    var online = false;
    final paths = <String>[];
    final h = Harness(
      newKey: () => key,
      client: MockClient((request) async {
        paths.add(request.url.path);
        if (!online) throw const SocketException('generated offline');
        return request.url.path == '/v1/session' ? notJoined() : created();
      }),
    );
    await tester.pumpWidget(h.app());
    await tester.pumpAndSettle();
    await tapKey(tester, 'onboarding-create');
    expect(h.protection, isEmpty);
    await tester.enterText(byKey('onboarding-field'), 'no');
    await tapKey(tester, 'onboarding-submit');
    expect(
      find.text('Use 3–20 letters, numbers or underscores.'),
      findsOneWidget,
    );
    expect(paths, isEmpty);

    await tester.enterText(byKey('onboarding-field'), 'new_fixture');
    await tapKey(tester, 'onboarding-submit');
    expect(byKey('onboarding-error'), findsOneWidget);
    expect(h.vault.value, key, reason: 'key saved before any account write');
    expect(h.store.outcomes, isEmpty);

    online = true;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('Welcome, @new_fixture.'), findsOneWidget);
    expect(paths, ['/v1/session', '/v1/session', '/v1/me']);
    expect(h.vault.value, key);
    expect(h.store.outcomes, ['created']);
    expectNoVisibleKey(tester);
  });

  testWidgets('narrow screen, large text and an open keyboard keep the '
      'field and action reachable without overflow', (tester) async {
    phone(tester, size: const Size(320, 640));
    final h = Harness();
    tester.platformDispatcher.textScaleFactorTestValue = 1.6;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await tester.pumpWidget(h.app());
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.scrollUntilVisible(byKey('onboarding-skip'), 200);
    expect(tester.takeException(), isNull);
    await tester.scrollUntilVisible(byKey('onboarding-sign-in'), -200);
    await tapKey(tester, 'onboarding-sign-in');
    // Simulate the on-screen keyboard covering the lower half.
    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(byKey('onboarding-field'), 120);
    await tester.showKeyboard(byKey('onboarding-field'));
    await tester.pumpAndSettle();
    final field = tester.getRect(byKey('onboarding-field'));
    expect(field.bottom, lessThanOrEqualTo(640 - 300));
    await tester.enterText(byKey('onboarding-field'), 'adk_short');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    expect(
      find.textContaining('Enter the complete private key'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  group('persistence and detection', () {
    late Directory temp;
    setUp(() async {
      temp = await Directory.systemTemp.createTemp('anideck-onboarding-');
    });
    tearDown(() => temp.delete(recursive: true));

    Future<Database> open() => databaseFactoryFfiNoIsolate.openDatabase(
      path.join(temp.path, SqliteOnboardingStore.fileName),
      options: OpenDatabaseOptions(
        version: 1,
        onCreate: SqliteOnboardingStore.createSchema,
        singleInstance: false,
      ),
    );

    test('completion survives closing and reopening the database', () async {
      final first = SqliteOnboardingStore(open: open);
      expect(await first.isComplete(), isFalse);
      await first.markComplete('guest');
      await first.close();
      final second = SqliteOnboardingStore(open: open);
      expect(await second.isComplete(), isTrue);
      await second.close();
    });

    test('a failed open is retried instead of cached', () async {
      var attempts = 0;
      final store = SqliteOnboardingStore(
        open: () async {
          if (++attempts == 1) throw Exception('generated open failure');
          return open();
        },
      );
      await expectLater(store.isComplete(), throwsException);
      expect(await store.isComplete(), isFalse);
      await store.close();
    });

    test('detection: library database, saved key or token means existing; '
        'unreadable storage never forces onboarding', () async {
      Future<String?> none() async => null;
      Future<String?> some() async => 'present';
      Future<String?> broken() async => throw Exception('generated');
      expect(
        await detectExistingInstallation(
          libraryExists: () async => false,
          secureReads: [none, none],
        ),
        isFalse,
      );
      expect(
        await detectExistingInstallation(
          libraryExists: () async => true,
          secureReads: [none, none],
        ),
        isTrue,
      );
      expect(
        await detectExistingInstallation(
          libraryExists: () async => false,
          secureReads: [none, some],
        ),
        isTrue,
      );
      expect(
        await detectExistingInstallation(
          libraryExists: () async => false,
          secureReads: [broken],
        ),
        isTrue,
      );
    });
  });
}
