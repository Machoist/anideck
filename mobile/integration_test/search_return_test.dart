import 'package:anideck_mobile/provider_browser.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:material_ui/material_ui.dart';

Future<void> waitFor(WidgetTester tester, Finder finder) async {
  final deadline = DateTime.now().add(const Duration(seconds: 30));
  while (finder.evaluate().isEmpty && DateTime.now().isBefore(deadline)) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 100)),
    );
    await tester.pump(const Duration(milliseconds: 100));
  }
  expect(finder, findsWidgets);
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'returning from a source title retains results without reopening the keyboard',
    (tester) async {
      await tester.pumpWidget(const MaterialApp(home: ProviderBrowser()));
      await tester.enterText(find.byType(TextField), "Hell's Paradise");
      await tester.tap(find.widgetWithText(FilledButton, 'Search'));
      final result = find.widgetWithText(ListTile, "Hell's Paradise");
      await waitFor(tester, result);
      // Re-focus before selecting a result, as can happen with keyboard searches.
      await tester.tap(find.byType(TextField));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<EditableText>(find.byType(EditableText))
            .focusNode
            .hasFocus,
        isTrue,
      );
      await tester.tap(result.first);
      await waitFor(tester, find.text('About'));
      await tester.pumpAndSettle();
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(result, findsWidgets);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        "Hell's Paradise",
      );
      expect(
        tester
            .widget<EditableText>(find.byType(EditableText))
            .focusNode
            .hasFocus,
        isFalse,
      );
      expect(tester.view.viewInsets.bottom, 0);
      await tester.tap(find.byType(TextField));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<EditableText>(find.byType(EditableText))
            .focusNode
            .hasFocus,
        isTrue,
      );
      // ignore: avoid_print
      print(
        'SEARCH_RETURN query=retained results=retained focus=cleared keyboard=hidden',
      );
      await tester.pumpWidget(const SizedBox());
    },
  );
}
