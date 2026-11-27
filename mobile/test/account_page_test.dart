import 'package:anideck_mobile/account_page.dart';
import 'package:anideck_mobile/account_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:http/testing.dart';
import 'package:http/http.dart' as http;

import 'account_service_test.dart' show MemoryVault, key, joined;

void main() {
  testWidgets(
    'narrow enlarged recovery page signs in and hides revealed key on background',
    (tester) async {
      tester.view.physicalSize = const Size(320, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final protected = <bool>[];
      final service = AccountService(
        vault: MemoryVault(),
        api: AccountApi(client: MockClient((_) async => joined())),
      );
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: TextScaler.linear(1.5)),
            child: child!,
          ),
          home: AccountPage(
            service: service,
            screenProtection: (value) async {
              protected.add(value);
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(protected, [true]);
      await tester.scrollUntilVisible(find.byType(TextField), 220);
      await tester.enterText(find.byType(TextField), key);
      await tester.ensureVisible(find.text('Sign in with key'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sign in with key'));
      await tester.pumpAndSettle();
      expect(find.text('@Fixture'), findsOneWidget);
      expect(find.text(key), findsNothing);
      await tester.scrollUntilVisible(find.text('Show private key'), 220);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Show private key'));
      await tester.pumpAndSettle();
      expect(find.text(key), findsOneWidget);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await tester.pump();
      expect(find.text(key), findsNothing);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
      expect(protected, [true, false]);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'storage/privacy failures do not expose a key input or pretend success',
    (tester) async {
      final service = AccountService(
        vault: MemoryVault(),
        api: AccountApi(
          client: MockClient((_) async => http.Response('{}', 500)),
        ),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: AccountPage(
            service: service,
            screenProtection: (_) async =>
                throw Exception('generated privacy failure'),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(TextField), findsNothing);
      expect(
        find.textContaining('Account privacy could not start'),
        findsOneWidget,
      );
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
    },
  );
}
