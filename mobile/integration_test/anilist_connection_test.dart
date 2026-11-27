import 'dart:convert';

import 'package:anideck_mobile/account_service.dart';
import 'package:anideck_mobile/anilist_page.dart';
import 'package:anideck_mobile/anilist_service.dart';
import 'package:anideck_mobile/local_library.dart';
import 'package:anideck_mobile/main.dart';
import 'package:anideck_mobile/providers/anikoto_catalog.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:integration_test/integration_test.dart';
import 'package:material_ui/material_ui.dart';

// Dedicated acceptance emulator only. Generated credentials, no live account API.
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  const phase = String.fromEnvironment('ANILIST_PHASE', defaultValue: 'write');
  const capture = bool.fromEnvironment('CAPTURE_SCREENSHOTS');
  final token = 'native_fixture_${'z' * 32}';
  final accountKey = 'adk_${'d' * 64}';
  const privacy = MethodChannel('anideck/privacy');
  testWidgets('native AniList persistence and account isolation $phase', (
    tester,
  ) async {
    final vault = AniListVault();
    final accountVault = DeviceAccountVault();
    final local = ProviderTitle(
      AnikotoCatalog.titleUri('/watch/generated-tracker-fixture'),
      'Generated local fixture',
    );
    final observedRequests = <http.Request>[];
    if (phase == 'write') {
      await vault.delete();
      await accountVault.write(accountKey);
      await LocalLibrary.instance.save(local);
    } else {
      expect(await vault.read(), token);
    }
    final service = AniListService(
      vault: vault,
      api: AniListApi(
        client: MockClient((request) async {
          observedRequests.add(request);
          final body = jsonDecode(request.body);
          return http.Response(
            jsonEncode({
              'data': (body['query'] as String).contains('Viewer')
                  ? {
                      'Viewer': {'id': 456, 'name': 'NativeTrackerFixture'},
                    }
                  : {
                      'Page': {
                        'pageInfo': {'hasNextPage': false},
                        'mediaList': [
                          {
                            'id': 1,
                            'status': 'CURRENT',
                            'progress': 12,
                            'score': 8.5,
                            'media': {
                              'id': 100,
                              'title': {
                                'userPreferred': 'Generated anime — Season 2',
                              },
                              'coverImage': {'large': null},
                            },
                          },
                          {
                            'id': 2,
                            'status': 'PLANNING',
                            'progress': 0,
                            'score': 0,
                            'media': {
                              'id': 101,
                              'title': {
                                'userPreferred': 'Another generated title',
                              },
                              'coverImage': {'large': null},
                            },
                          },
                        ],
                      },
                    },
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      ),
    );
    await tester.pumpWidget(
      AniDeckMobile(home: AniListPageView(service: service)),
    );
    Future<void> settleUntil(Finder finder) async {
      for (var i = 0; i < 100 && finder.evaluate().isEmpty; i++) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 100)),
        );
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(finder, findsOneWidget);
    }

    if (phase == 'write') {
      await settleUntil(find.byType(TextField));
      await tester.scrollUntilVisible(
        find.byType(TextField),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), token);
      await tester.ensureVisible(find.text('Connect AniList'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Connect AniList'));
    }
    await settleUntil(find.text('NativeTrackerFixture'));
    for (var i = 0; i < 100 && service.entries.length != 2; i++) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 100)),
      );
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(
      service.entries.length,
      2,
      reason: tester
          .widgetList<Text>(find.byType(Text))
          .map((t) => t.data ?? '')
          .join(' | '),
    );
    expect(observedRequests.length, 2);
    for (final request in observedRequests) {
      expect(request.url.toString(), 'https://graphql.anilist.co');
      expect(request.headers['Authorization'], 'Bearer $token');
      expect(jsonDecode(request.body)['query'], startsWith('query'));
    }
    await tester.scrollUntilVisible(
      find.text('8.5 / 10'),
      150,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(find.text('Episode 12'), findsOneWidget);
    expect(await vault.read(), token);
    expect(await accountVault.read(), accountKey);
    expect(await LocalLibrary.instance.contains(local), isTrue);
    expect(await privacy.invokeMethod<bool>('isScreenProtected'), isTrue);
    if (capture) {
      await binding.convertFlutterSurfaceToImage();
      await tester.pump();
      await binding.takeScreenshot('provider-anilist');
    }
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
    expect(await privacy.invokeMethod<bool>('isScreenProtected'), isFalse);
    if (phase == 'read') {
      final disconnect = AniListService(vault: vault);
      await disconnect.signOut();
      disconnect.close();
      expect(await vault.read(), isNull);
      expect(await accountVault.read(), accountKey);
      expect(await LocalLibrary.instance.contains(local), isTrue);
      await accountVault.delete();
    }
    await LocalLibrary.instance.close();
    // ignore: avoid_print
    print(
      'ANILIST_NATIVE phase=$phase secure_persistence=pass separate_account=pass local_list=pass privacy=pass',
    );
  });
}
