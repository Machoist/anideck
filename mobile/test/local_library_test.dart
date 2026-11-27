import 'dart:io';

import 'package:anideck_mobile/local_library.dart';
import 'package:anideck_mobile/providers/anikoto_catalog.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as path;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  sqfliteFfiInit();
  late Directory temp;
  late LocalLibrary library;
  late String databasePath;
  Future<Database> open() => databaseFactoryFfi.openDatabase(
    databasePath,
    options: OpenDatabaseOptions(
      version: LocalLibrary.schemaVersion,
      onCreate: LocalLibrary.createSchema,
      onUpgrade: LocalLibrary.upgradeSchema,
      singleInstance: false,
    ),
  );
  final title = ProviderTitle(
    Uri.parse('https://anikototv.bz/watch/generated-season-2'),
    "A viewer's show",
  );
  const point = ResumePoint(
    7,
    'sub',
    Duration(seconds: 123),
    Duration(minutes: 24),
  );

  setUp(() async {
    temp = await Directory.systemTemp.createTemp('anideck-library-test-');
    databasePath = path.join(temp.path, 'library.db');
    library = LocalLibrary(open: open);
  });
  tearDown(() async {
    await library.close();
    await temp.delete(recursive: true);
  });

  test(
    'saved title and resume survive closing and reopening a real database',
    () async {
      await library.save(title);
      await library.checkpoint(title, point);
      await library.close();
      library = LocalLibrary(open: open);
      final entries = await library.entries();
      expect(entries.single.title.name, title.name);
      expect(entries.single.resume!.episode, 7);
      expect(entries.single.resume!.position, const Duration(seconds: 123));
      expect(entries.single.resume!.audio, 'sub');
    },
  );

  test('duplicate save preserves checkpoints and legacy origin shares exact identity', () async {
    await library.save(title);
    await library.checkpoint(title, point);
    await library.save(
      ProviderTitle(
        Uri.parse('https://anikototv.to/watch/generated-season-2/ep-7?x=1'),
        'Legacy result',
      ),
    );
    expect((await library.entries()).length, 1);
    expect((await library.resume(title, 7, 'sub'))!.position, point.position);
  });

  test(
    'episodes, audio and seasons never borrow another resume position',
    () async {
      final second = ProviderTitle(
        Uri.parse('https://anikototv.bz/watch/generated-season-3'),
        'Another season',
      );
      await library.save(title);
      await library.save(second);
      await library.checkpoint(title, point);
      await library.checkpoint(
        title,
        const ResumePoint(
          7,
          'dub',
          Duration(seconds: 18),
          Duration(minutes: 24),
        ),
      );
      expect((await library.resume(title, 7, 'sub'))!.position, point.position);
      expect((await library.resume(title, 7, 'dub'))!.position.inSeconds, 18);
      expect(await library.resume(title, 8, 'sub'), isNull);
      expect(await library.resume(second, 7, 'sub'), isNull);
    },
  );

  test(
    'watching an unsaved show does not silently create a list entry',
    () async {
      await library.checkpoint(title, point);
      expect(await library.entries(), isEmpty);
    },
  );

  test('invalid input is rejected and a failed open can be retried', () async {
    var attempts = 0;
    library = LocalLibrary(
      open: () {
        if (++attempts == 1) throw StateError('Disk unavailable');
        return open();
      },
    );
    await expectLater(library.save(title), throwsStateError);
    await library.save(title);
    await expectLater(
      library.checkpoint(
        title,
        const ResumePoint(0, 'sub', Duration.zero, Duration(minutes: 1)),
      ),
      throwsArgumentError,
    );
    await expectLater(
      library.save(
        ProviderTitle(
          Uri.parse('https://unrelated.test/watch/title'),
          'Wrong source',
        ),
      ),
      throwsA(isA<ProviderFailure>()),
    );
    expect((await library.entries()).length, 1);
  });

  test('reaching the end offers replay, not an out-of-range resume', () {
    const end = ResumePoint(
      1,
      'sub',
      Duration(seconds: 59),
      Duration(minutes: 1),
    );
    expect(end.startPosition, Duration.zero);
    expect(point.startPosition, point.position);
  });

  test(
    'v1 upgrade retains saved title and resume, then persists new list details',
    () async {
      final old = await databaseFactoryFfi.openDatabase(
        databasePath,
        options: OpenDatabaseOptions(
          version: 1,
          singleInstance: false,
          onCreate: (db, _) async {
            await db.execute(
              'CREATE TABLE titles (uri TEXT PRIMARY KEY, name TEXT NOT NULL, poster TEXT, saved INTEGER NOT NULL)',
            );
            await db.execute(
              'CREATE TABLE checkpoints (uri TEXT NOT NULL, episode INTEGER NOT NULL, audio TEXT NOT NULL, position INTEGER NOT NULL, duration INTEGER NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(uri, episode, audio), FOREIGN KEY(uri) REFERENCES titles(uri) ON DELETE CASCADE)',
            );
          },
        ),
      );
      await old.insert('titles', {
        'uri': title.uri.toString(),
        'name': title.name,
        'saved': 1,
      });
      await old.insert('checkpoints', {
        'uri': title.uri.toString(),
        'episode': 7,
        'audio': 'sub',
        'position': 123000,
        'duration': 1440000,
        'updated': 1,
      });
      await old.close();
      final migrated = (await library.entries()).single;
      expect(migrated.status, WatchStatus.planning);
      expect(migrated.watched, 0);
      expect(migrated.scoreHalf, isNull);
      expect(migrated.resume!.position.inSeconds, 123);
      await library.updateDetails(
        title,
        status: WatchStatus.watching,
        watched: 3,
        scoreHalf: 13,
      );
      await library.close();
      library = LocalLibrary(open: open);
      final saved = (await library.entries()).single;
      expect(saved.status, WatchStatus.watching);
      expect(saved.watched, 3);
      expect(saved.scoreLabel, '6.5');
      expect(saved.resume!.position.inSeconds, 123);
    },
  );

  test('checkpoints and duplicate saves never overwrite manual status, count or score', () async {
    await library.save(title);
    await library.updateDetails(
      title,
      status: WatchStatus.paused,
      watched: 8,
      scoreHalf: 17,
    );
    await library.checkpoint(title, point);
    await library.save(title);
    final entry = (await library.entries()).single;
    expect(entry.status, WatchStatus.paused);
    expect(entry.watched, 8);
    expect(entry.scoreLabel, '8.5');
    await library.updateDetails(
      title,
      status: WatchStatus.rewatching,
      watched: 0,
      scoreHalf: null,
    );
    expect((await library.resume(title, 7, 'sub'))!.position, point.position);
    expect((await library.entries()).single.scoreHalf, isNull);
  });

  test('invalid list details and edits to unsaved titles cannot create or modify entries', () async {
    await expectLater(
      library.updateDetails(
        title,
        status: WatchStatus.watching,
        watched: 1,
        scoreHalf: 13,
      ),
      throwsStateError,
    );
    await library.save(title);
    for (final score in [0, 21]) {
      await expectLater(
        library.updateDetails(
          title,
          status: WatchStatus.completed,
          watched: 2,
          scoreHalf: score,
        ),
        throwsArgumentError,
      );
    }
    await expectLater(
      library.updateDetails(
        title,
        status: WatchStatus.completed,
        watched: -1,
        scoreHalf: 13,
      ),
      throwsArgumentError,
    );
    expect((await library.entries()).single.status, WatchStatus.planning);
  });
}
