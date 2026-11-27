import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:video_player/video_player.dart';

import 'anikoto_catalog.dart';
import 'embed_resolver.dart';

class ProviderPlaybackRequest {
  const ProviderPlaybackRequest(this.title, this.episode, this.audio);
  final ProviderTitle title;
  final ProviderEpisode episode;
  final String audio;
}

Future<ClosedCaptionFile> loadProviderCaptions(
  ResolvedEpisode media,
  http.Client client,
) async {
  if (media.captions.isEmpty) return WebVTTCaptionFile('WEBVTT\n\n');
  final english = media.captions.where(
    (c) => RegExp(r'english|\ben\b', caseSensitive: false).hasMatch(c.label),
  );
  final caption = english.isEmpty ? media.captions.first : english.first;
  final request = http.Request('GET', caption.uri)
    ..followRedirects = false
    ..headers.addAll(media.headers);
  final response = await client
      .send(request)
      .timeout(const Duration(seconds: 8));
  if (response.statusCode != 200) {
    throw const ProviderFailure(
      'Subtitles couldn’t load. Retry playback to try again.',
    );
  }
  final bytes = <int>[];
  await for (final chunk in response.stream.timeout(
    const Duration(seconds: 8),
  )) {
    if (bytes.length + chunk.length > 1000000) {
      throw const ProviderFailure('Subtitle file exceeded its limit.');
    }
    bytes.addAll(chunk);
  }
  final text = utf8.decode(bytes).replaceFirst('\uFEFF', '').trimLeft();
  final ClosedCaptionFile file;
  if (text.startsWith('WEBVTT')) {
    file = WebVTTCaptionFile(text);
  } else if (RegExp(r'^\d+\s*\r?\n\d\d:\d\d:\d\d,\d{3}').hasMatch(text)) {
    file = SubRipCaptionFile(text);
  } else {
    throw const ProviderFailure('This subtitle format isn’t supported yet.');
  }
  if (file.captions.isEmpty) {
    throw const ProviderFailure('The source supplied an empty subtitle file.');
  }
  return file;
}
