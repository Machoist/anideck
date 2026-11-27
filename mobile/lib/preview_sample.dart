enum PreviewSample {
  clip,
  streaming;

  Uri get uri => Uri.parse(switch (this) {
    clip => 'https://flutter.github.io/assets-for-api-docs/assets/videos/butterfly.mp4',
    streaming => 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_adv_example_hevc/master.m3u8',
  });

  String get attribution => switch (this) {
    clip => 'Public Flutter sample • Sample captions',
    streaming => 'Apple streaming sample • Sample captions',
  };
}
