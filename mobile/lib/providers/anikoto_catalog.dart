import 'dart:async';
import 'dart:convert';

import 'package:html/parser.dart' as html;
import 'package:html/dom.dart' show Document, Element;
import 'package:http/http.dart' as http;

class ProviderFailure implements Exception {
  const ProviderFailure(this.message);
  final String message;
  @override
  String toString() => message;
}

class ProviderTitle {
  const ProviderTitle(this.uri, this.name, {this.poster});
  final Uri uri;
  final String name;
  final Uri? poster;
}

class ProviderEpisode {
  const ProviderEpisode(
    this.number,
    this.id,
    this.servers,
    this.title, {
    required this.sub,
    required this.dub,
  });
  final int number;
  final String id, servers, title;
  final bool sub, dub;
  bool supports(String audio) => audio == 'sub' ? sub : audio == 'dub' && dub;
}

class ProviderDetails {
  const ProviderDetails(
    this.name,
    this.synopsis,
    this.poster,
    this.genres,
    this.facts,
  );
  final String name, synopsis;
  final Uri? poster;
  final List<String> genres;
  final Map<String, String> facts;
}

/// Provider-owned search selection, never a fuzzy mapping to tracker IDs.
class AnikotoCatalog {
  AnikotoCatalog({http.Client? client}) : _client = client ?? http.Client();
  static final base = Uri.parse('https://anikototv.bz');
  static const userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
  final http.Client _client;
  final _pending = <Completer<void>>{};
  bool _closed = false;
  final _pages = <Uri, Future<Document>>{};

  static Uri titleUri(String value) {
    final uri = base.resolve(value);
    if (uri.scheme != 'https' ||
        !{'anikototv.bz', 'anikototv.to'}.contains(uri.host) ||
        uri.userInfo.isNotEmpty ||
        (uri.hasPort && uri.port != 443) ||
        !uri.path.startsWith('/watch/')) {
      throw const ProviderFailure('Unexpected provider title address.');
    }
    final path = uri.path
        .replaceFirst(RegExp(r'/ep-[^/]+/?$'), '')
        .replaceFirst(RegExp(r'/$'), '');
    if (path == '/watch') {
      throw const ProviderFailure('Missing provider title.');
    }
    return base.replace(path: path);
  }

  static List<ProviderTitle> parseTitles(String body) {
    final document = html.parse(body), rows = <Uri, ProviderTitle>{};
    for (final anchor in document.querySelectorAll('a[href*="/watch/"]')) {
      try {
        final uri = titleUri(anchor.attributes['href']!);
        Element? card = anchor.parent;
        while (card != null &&
            !card.classes.contains('item') &&
            !card.classes.contains('swiper-slide')) {
          card = card.parent;
        }
        final name =
            (card?.querySelector('a.name, .ak-title')?.text ??
                    anchor.attributes['title'] ??
                    anchor.text)
                .trim();
        if (name.isEmpty) continue;
        final image =
            (anchor.querySelector('img') ?? card?.querySelector('img'))
                ?.attributes['src'];
        final poster = image == null ? null : base.resolve(image);
        rows[uri] = ProviderTitle(
          uri,
          name,
          poster: poster?.scheme == 'https' && poster!.userInfo.isEmpty
              ? poster
              : null,
        );
      } on ProviderFailure {
        continue;
      }
    }
    return rows.values.toList(growable: false);
  }

  static List<ProviderEpisode> parseEpisodes(String body) {
    final rows = <int, ProviderEpisode>{};
    final ids = <String>{};
    for (final anchor
        in html
            .parse(body)
            .querySelectorAll('a[data-num][data-id][data-ids]')) {
      final number = int.tryParse(anchor.attributes['data-num'] ?? '');
      final id = anchor.attributes['data-id'] ?? '';
      final servers = anchor.attributes['data-ids'] ?? '';
      if (number == null ||
          number < 1 ||
          number > 3000 ||
          !RegExp(r'^\d+$').hasMatch(id) ||
          servers.isEmpty) {
        continue;
      }
      if (rows.containsKey(number) || !ids.add(id)) {
        throw const ProviderFailure('Provider episode identities conflict.');
      }
      rows[number] = ProviderEpisode(
        number,
        id,
        servers,
        anchor.parent?.attributes['title'] ?? '',
        sub: (int.tryParse(anchor.attributes['data-sub'] ?? '') ?? 0) > 0,
        dub: (int.tryParse(anchor.attributes['data-dub'] ?? '') ?? 0) > 0,
      );
    }
    return rows.values.toList()..sort((a, b) => a.number.compareTo(b.number));
  }

  Future<String> _read(Uri uri) async {
    if (_closed) throw const ProviderFailure('Provider request cancelled.');
    if (uri.scheme != 'https' || uri.host != base.host) {
      throw const ProviderFailure('Unexpected provider request.');
    }
    final abort = Completer<void>();
    _pending.add(abort);
    final timer = Timer(const Duration(seconds: 10), () {
      if (!abort.isCompleted) abort.complete();
    });
    try {
      final request =
          http.AbortableRequest('GET', uri, abortTrigger: abort.future)
            ..followRedirects = false
            ..headers.addAll({
              'Referer': '$base/',
              'User-Agent': userAgent,
              'X-Requested-With': 'XMLHttpRequest',
            });
      final response = await _client.send(request);
      if (response.statusCode != 200) {
        throw const ProviderFailure(
          'The provider is temporarily unavailable. Try again.',
        );
      }
      final bytes = <int>[];
      await for (final chunk in response.stream) {
        if (bytes.length + chunk.length > 3000000) {
          abort.complete();
          throw const ProviderFailure('Provider response exceeded its limit.');
        }
        bytes.addAll(chunk);
      }
      final text = utf8.decode(bytes);
      if (RegExp(
        r'<title>\s*(just a moment|access denied)|verify you are human',
        caseSensitive: false,
      ).hasMatch(text)) {
        throw const ProviderFailure(
          'The provider requires browser verification. Try another source.',
        );
      }
      return text;
    } on ProviderFailure {
      rethrow;
    } catch (_) {
      throw const ProviderFailure(
        'Couldn’t reach the provider. Check your connection and retry.',
      );
    } finally {
      timer.cancel();
      _pending.remove(abort);
    }
  }

  Future<dynamic> _result(Uri uri) async {
    try {
      final data = jsonDecode(await _read(uri));
      if (data is! Map || data['status'] != 200 || data['result'] == null) {
        throw const FormatException();
      }
      return data['result'];
    } on FormatException {
      throw const ProviderFailure('The provider returned an invalid response.');
    }
  }

  Future<List<ProviderTitle>> search(String query) async {
    final term = query.trim();
    if (term.length < 2 || term.length > 150) return [];
    return parseTitles(
      await _read(
        base.replace(path: '/filter', queryParameters: {'keyword': term}),
      ),
    );
  }

  Future<List<ProviderTitle>> discover() async {
    final document = html.parse(await _read(base.resolve('/home')));
    final cards = document
        .querySelectorAll('.swiper-slide, .ani.items .item')
        .where((card) => card.querySelector('.adult') == null);
    final titles = <Uri, ProviderTitle>{};
    // Spotlight images are landscape backdrops. Prefer a real poster from a
    // normal card only when its normalized provider identity is identical.
    final posters = <Uri, Uri>{};
    for (final card in document.querySelectorAll('.ani.items .item')) {
      if (card.querySelector('.adult') != null) continue;
      for (final title in parseTitles(card.outerHtml)) {
        if (title.poster != null) posters[title.uri] = title.poster!;
      }
    }
    for (final card in cards) {
      for (final title in parseTitles(card.outerHtml)) {
        titles.putIfAbsent(
          title.uri,
          () => ProviderTitle(
            title.uri,
            title.name,
            poster: posters[title.uri] ?? title.poster,
          ),
        );
      }
      if (titles.length >= 24) break;
    }
    if (titles.isEmpty) {
      throw const ProviderFailure(
        'The source feed couldn’t load. Search is still available.',
      );
    }
    return titles.values.take(24).toList(growable: false);
  }

  Future<Document> _titlePage(ProviderTitle title) async {
    final uri = titleUri(title.uri.toString());
    if (_pages.length >= 8 && !_pages.containsKey(uri)) {
      _pages.remove(_pages.keys.first);
    }
    try {
      return await (_pages[uri] ??= _read(uri).then((body) {
        final page = html.parse(body);
        final nodes = page.querySelectorAll('.watch-wrap[data-id]');
        if (nodes.length != 1 ||
            !RegExp(r'^\d+$')
                .hasMatch(nodes.single.attributes['data-id'] ?? '') ||
            titleUri(nodes.single.attributes['data-url'] ?? '') != uri) {
          throw const ProviderFailure(
            'The provider returned a different or unavailable title.',
          );
        }
        return page;
      }));
    } catch (_) {
      _pages.remove(uri);
      rethrow;
    }
  }

  void refreshTitle(ProviderTitle title) =>
      _pages.remove(titleUri(title.uri.toString()));

  Future<ProviderDetails> details(ProviderTitle title) async {
    final page = await _titlePage(title);
    String clean(String? value) =>
        (value ?? '').replaceAll(RegExp(r'\s+'), ' ').trim();
    final image = page.querySelector('#w-info .poster img')?.attributes['src'];
    final poster = image == null ? title.poster : base.resolve(image);
    final facts = <String, String>{};
    for (final row in page.querySelectorAll('#w-info .bmeta .meta > div')) {
      final text = clean(row.text), colon = clean(row.text).indexOf(':');
      if (colon < 1) continue;
      final key = text.substring(0, colon).trim(),
          value = text.substring(colon + 1).trim();
      if ({'Type', 'Aired', 'Status', 'Duration'}.contains(key) &&
          value.isNotEmpty &&
          !value.contains('?')) {
        facts[key] = value;
      }
    }
    return ProviderDetails(
      clean(page.querySelector('#w-info h1')?.text).isEmpty
          ? title.name
          : clean(page.querySelector('#w-info h1')?.text),
      clean(page.querySelector('#w-info .synopsis .content')?.text),
      poster?.scheme == 'https' && poster!.userInfo.isEmpty ? poster : null,
      page
          .querySelectorAll('#w-info a[href*="/genre/"]')
          .map((e) => clean(e.text))
          .where((e) => e.isNotEmpty)
          .toSet()
          .take(12)
          .toList(),
      facts,
    );
  }

  Future<List<ProviderEpisode>> episodes(ProviderTitle title) async {
    final uri = titleUri(title.uri.toString());
    final page = await _titlePage(title);
    final nodes = page.querySelectorAll('.watch-wrap[data-id]');
    if (nodes.length != 1) {
      throw const ProviderFailure('Provider title metadata is unavailable.');
    }
    final id = nodes.single.attributes['data-id'] ?? '';
    if (!RegExp(r'^\d+$').hasMatch(id) ||
        titleUri(nodes.single.attributes['data-url'] ?? '') != uri) {
      throw const ProviderFailure('The provider returned a different title.');
    }
    final result = await _result(base.replace(path: '/ajax/episode/list/$id'));
    if (result is! String) {
      throw const ProviderFailure('Provider episodes are unavailable.');
    }
    return parseEpisodes(result);
  }

  Future<List<Uri>> embeds(ProviderEpisode episode, String audio) async {
    if (!episode.supports(audio)) {
      throw const ProviderFailure(
        'This episode does not list the selected audio.',
      );
    }
    final result = await _result(
      base.replace(
        path: '/ajax/server/list',
        queryParameters: {'servers': episode.servers},
      ),
    );
    if (result is! String) {
      throw const ProviderFailure('Provider players are unavailable.');
    }
    final ids = <String>{};
    for (final group in html.parse(result).querySelectorAll('[data-type]')) {
      if (group.attributes['data-type'] != audio) continue;
      for (final row in group.querySelectorAll('li[data-link-id]')) {
        if (row.attributes['data-ep-id'] == episode.id) {
          ids.add(row.attributes['data-link-id']!);
        }
      }
    }
    final urls = <Uri>{};
    for (final id in ids.take(3)) {
      final server = await _result(
        base.replace(path: '/ajax/server', queryParameters: {'get': id}),
      );
      final uri = server is Map ? Uri.tryParse('${server['url']}') : null;
      if (uri != null &&
          uri.scheme == 'https' &&
          uri.host == 'megaplay.buzz' &&
          uri.userInfo.isEmpty &&
          (!uri.hasPort || uri.port == 443)) {
        urls.add(uri);
      }
    }
    if (urls.isEmpty) {
      throw const ProviderFailure(
        'No supported player is available for this episode.',
      );
    }
    return urls.toList(growable: false);
  }

  void close() {
    _closed = true;
    _pages.clear();
    for (final abort in _pending) {
      if (!abort.isCompleted) abort.complete();
    }
    _client.close();
  }
}
