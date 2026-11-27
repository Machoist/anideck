import 'package:anideck_mobile/account_page.dart';
import 'package:anideck_mobile/account_service.dart';
import 'package:anideck_mobile/main.dart';
import 'package:anideck_mobile/local_library.dart';
import 'package:anideck_mobile/providers/anikoto_catalog.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'dart:convert';

// Generated identities only. No live account or production API request is made.
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  const phase = String.fromEnvironment('ACCOUNT_PHASE', defaultValue: 'write');
  const capture = bool.fromEnvironment('CAPTURE_SCREENSHOTS');
  final key = 'adk_${'c' * 64}';
  const privacy = MethodChannel('anideck/privacy');
  testWidgets('native secure key storage and account privacy $phase', (
    tester,
  ) async {
    final vault = DeviceAccountVault();
    final title = ProviderTitle(
      AnikotoCatalog.titleUri('/watch/generated-account-fixture'),
      'Generated local list fixture',
    );
    if (phase == 'write') {
      await vault.delete();
      await LocalLibrary.instance.save(title);
      await vault.write(key);
    }
    expect(await vault.read(), key);
    expect(await LocalLibrary.instance.contains(title), isTrue);
    final service = AccountService(
      vault: vault,
      api: AccountApi(
        client: MockClient((request) async {
          expect(request.url.path, '/v1/session');
          return http.Response(
            jsonEncode({
              'joined': true,
              'me': {'handle': 'NativeFixture', 'name': 'Generated account'},
            }),
            200,
          );
        }),
      ),
    );
    await tester.pumpWidget(AniDeckMobile(home: AccountPage(service: service)));
    for (
      var i = 0;
      i < 100 && find.text('@NativeFixture').evaluate().isEmpty;
      i++
    ) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 100)),
      );
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.text('@NativeFixture'), findsOneWidget);
    expect(find.text(key), findsNothing);
    expect(await privacy.invokeMethod<bool>('isScreenProtected'), isTrue);
    if (capture) {
      // Only the public/masked screen is captured. Never reveal the generated key here.
      await binding.convertFlutterSurfaceToImage();
      await tester.pump();
      await binding.takeScreenshot('provider-account');
    }
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
    expect(await privacy.invokeMethod<bool>('isScreenProtected'), isFalse);
    if (phase == 'read') {
      final logout = AccountService(vault: vault);
      await logout.signOut();
      expect(await vault.read(), isNull);
      expect(await LocalLibrary.instance.contains(title), isTrue);
      logout.close();
    }
    await LocalLibrary.instance.close();
    // ignore: avoid_print
    print(
      'ACCOUNT_NATIVE phase=$phase encrypted_vault_roundtrip=pass screen_privacy=pass local_list_preserved=pass',
    );
  });
}
