import 'package:path/path.dart' as path;
import 'package:sqflite/sqflite.dart';

import 'providers/anikoto_catalog.dart';

class ResumePoint {
  const ResumePoint(this.episode, this.audio, this.position, this.duration);
  final int episode;
  final String audio;
  final Duration position, duration;

  Duration get startPosition =>
      position >= duration - const Duration(seconds: 5)
      ? Duration.zero
      : position;
}

enum WatchStatus {
  planning,
  watching,
  completed,
  paused,
  dropped,
  rewatching;

  String get label => switch (this) {
    planning => 'Planning',
    watching => 'Watching',
    completed => 'Completed',
    paused => 'Paused',
    dropped => 'Dropped',
    rewatching => 'Rewatching',
  };
}

class LibraryEntry {
  const LibraryEntry(
    this.title,
    this.resume, {
    this.status = WatchStatus.planning,
    this.watched = 0,
    this.scoreHalf,
  });
  final ProviderTitle title;
  final ResumePoint? resume;
  final WatchStatus status;
  final int watched;
  final int? scoreHalf;
  String get scoreLabel => scoreHalf == null
      ? 'Not rated'
      : '${scoreHalf! / 2}'.replaceFirst(RegExp(r'\.0$'), '');
}

/// Device-local data only. Never stores credentials, embeds or signed media URLs.
class LocalLibrary {
  LocalLibrary({Future<Database> Function()? open})
    : _open = open ?? _openDefault;
  static final instance = LocalLibrary();
  static const schemaVersion = 2;

  /// Database filename; every earlier app launch created it on Home.
  static const fileName = 'anideck-library-v1.db';
  final Future<Database> Function() _open;
  Future<Database>? _database;

  static Future<Database> _openDefault() async => openDatabase(
    path.join(await getDatabasesPath(), fileName),
    version: schemaVersion,
    onCreate: createSchema,
    onUpgrade: upgradeSchema,
  );

  static Future<void> createSchema(Database db, int version) async {
    await db.execute(
      'CREATE TABLE titles ('
      'uri TEXT PRIMARY KEY, name TEXT NOT NULL, poster TEXT, saved INTEGER NOT NULL, '
      "status TEXT NOT NULL DEFAULT 'planning', watched INTEGER NOT NULL DEFAULT 0, scoreHalf INTEGER)",
    );
    await db.execute(
      'CREATE TABLE checkpoints ('
      'uri TEXT NOT NULL, episode INTEGER NOT NULL, audio TEXT NOT NULL, '
      'position INTEGER NOT NULL, duration INTEGER NOT NULL, updated INTEGER NOT NULL, '
      'PRIMARY KEY(uri, episode, audio), '
      'FOREIGN KEY(uri) REFERENCES titles(uri) ON DELETE CASCADE)',
    );
  }

  static Future<void> upgradeSchema(
    Database db,
    int oldVersion,
    int newVersion,
  ) async {
    if (oldVersion < 2) {
      await db.execute(
        "ALTER TABLE titles ADD COLUMN status TEXT NOT NULL DEFAULT 'planning'",
      );
      await db.execute(
        'ALTER TABLE titles ADD COLUMN watched INTEGER NOT NULL DEFAULT 0',
      );
      await db.execute('ALTER TABLE titles ADD COLUMN scoreHalf INTEGER');
    }
  }

  Future<void> updateDetails(
    ProviderTitle title, {
    required WatchStatus status,
    required int watched,
    required int? scoreHalf,
  }) async {
    if (watched < 0 ||
        watched > 100000 ||
        (scoreHalf != null && (scoreHalf < 1 || scoreHalf > 20))) {
      throw ArgumentError('Invalid list details');
    }
    final count = await (await _db()).update(
      'titles',
      {'status': status.name, 'watched': watched, 'scoreHalf': scoreHalf},
      where: 'uri = ?',
      whereArgs: [_key(title)],
    );
    if (count != 1) throw StateError('This show is no longer in My list');
  }

  Future<Database> _db() async {
    try {
      return await (_database ??= _open());
    } catch (_) {
      _database = null; // A failed open can be retried without deleting data.
      rethrow;
    }
  }

  String _key(ProviderTitle title) =>
      AnikotoCatalog.titleUri(title.uri.toString()).toString();

  Future<void> save(ProviderTitle title) async {
    if (title.name.trim().isEmpty || title.name.length > 500) {
      throw ArgumentError('Invalid title name');
    }
    final db = await _db();
    await db.insert('titles', {
      'uri': _key(title),
      'name': title.name,
      'poster': title.poster?.scheme == 'https'
          ? title.poster.toString()
          : null,
      'saved': DateTime.now().microsecondsSinceEpoch,
    }, conflictAlgorithm: ConflictAlgorithm.ignore);
  }

  Future<bool> contains(ProviderTitle title) async =>
      (await (await _db()).query(
        'titles',
        columns: ['uri'],
        where: 'uri = ?',
        whereArgs: [_key(title)],
        limit: 1,
      )).isNotEmpty;

  Future<void> checkpoint(ProviderTitle title, ResumePoint point) async {
    if (point.episode < 1 ||
        !{'sub', 'dub'}.contains(point.audio) ||
        point.position.isNegative ||
        point.duration <= Duration.zero ||
        point.position > point.duration) {
      throw ArgumentError('Invalid playback checkpoint');
    }
    final db = await _db(), uri = _key(title);
    await db.transaction((txn) async {
      final saved = await txn.query(
        'titles',
        columns: ['uri'],
        where: 'uri = ?',
        whereArgs: [uri],
      );
      if (saved.isEmpty) return; // Watching never silently adds a show.
      await txn.insert('checkpoints', {
        'uri': uri,
        'episode': point.episode,
        'audio': point.audio,
        'position': point.position.inMilliseconds,
        'duration': point.duration.inMilliseconds,
        'updated': DateTime.now().microsecondsSinceEpoch,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    });
  }

  ResumePoint _point(Map<String, Object?> row) => ResumePoint(
    row['episode'] as int,
    row['audio'] as String,
    Duration(milliseconds: row['position'] as int),
    Duration(milliseconds: row['duration'] as int),
  );

  Future<ResumePoint?> resume(
    ProviderTitle title,
    int episode,
    String audio,
  ) async {
    final rows = await (await _db()).query(
      'checkpoints',
      where: 'uri = ? AND episode = ? AND audio = ?',
      whereArgs: [_key(title), episode, audio],
      limit: 1,
    );
    return rows.isEmpty ? null : _point(rows.single);
  }

  Future<List<LibraryEntry>> entries() async {
    final db = await _db();
    // One database read, not one native round-trip for every saved title.
    final rows = await db.rawQuery(
      'SELECT t.uri, t.name, t.poster, t.status, t.watched, t.scoreHalf, '
      'c.episode, c.audio, c.position, c.duration FROM titles t '
      'LEFT JOIN checkpoints c ON c.rowid = (SELECT rowid FROM checkpoints '
      'WHERE uri = t.uri ORDER BY updated DESC, rowid DESC LIMIT 1) '
      'ORDER BY t.saved DESC',
    );
    return rows
        .map(
          (row) => LibraryEntry(
            ProviderTitle(
              Uri.parse(row['uri'] as String),
              row['name'] as String,
              poster: row['poster'] == null
                  ? null
                  : Uri.tryParse(row['poster'] as String),
            ),
            row['episode'] == null ? null : _point(row),
            status: WatchStatus.values.byName(row['status'] as String),
            watched: row['watched'] as int,
            scoreHalf: row['scoreHalf'] as int?,
          ),
        )
        .toList();
  }

  Future<void> close() async {
    final pending = _database;
    _database = null;
    if (pending != null) await (await pending).close();
  }
}
