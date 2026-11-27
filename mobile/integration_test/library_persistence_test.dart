import 'package:anideck_mobile/local_library.dart';
import 'package:anideck_mobile/providers/anikoto_catalog.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path/path.dart' as path;
import 'package:sqflite/sqflite.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  const phase = String.fromEnvironment('LIBRARY_PHASE', defaultValue: 'read');
  testWidgets(
    'native SQLite persists across independent Android launches ($phase)',
    (tester) async {
      final library = LocalLibrary(
        open: () async => openDatabase(
          path.join(
            await getDatabasesPath(),
            'anideck-generated-acceptance.db',
          ),
          version: LocalLibrary.schemaVersion,
          onCreate: LocalLibrary.createSchema,
          onUpgrade: LocalLibrary.upgradeSchema,
        ),
      );
      final title = ProviderTitle(
        Uri.parse('https://anikototv.bz/watch/generated-persistence-fixture'),
        'Generated persistence fixture',
      );
      await tester.runAsync(() async {
        if (phase == 'write') {
          await library.save(title);
          await library.updateDetails(
            title,
            status: WatchStatus.watching,
            watched: 5,
            scoreHalf: 17,
          );
          await library.checkpoint(
            title,
            const ResumePoint(
              3,
              'dub',
              Duration(seconds: 137),
              Duration(minutes: 24),
            ),
          );
        }
        final entries = await library.entries();
        expect(entries.single.title.name, title.name);
        expect(entries.single.resume!.episode, 3);
        expect(entries.single.resume!.audio, 'dub');
        expect(entries.single.resume!.position.inSeconds, 137);
        expect(entries.single.status, WatchStatus.watching);
        expect(entries.single.watched, 5);
        expect(entries.single.scoreLabel, '8.5');
        await library.close();
        // ignore: avoid_print
        print('LIBRARY_NATIVE phase=$phase persisted=pass');
      });
    },
  );
}
