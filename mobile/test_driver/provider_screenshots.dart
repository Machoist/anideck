import 'dart:io';

import 'package:integration_test/integration_test_driver_extended.dart';

Future<void> main() async {
  final root = Directory(
    Platform.environment['ANIDECK_SCREENSHOTS'] ??
        '../../../outputs/mobile-provider-visuals',
  );
  await root.create(recursive: true);
  await integrationDriver(
    onScreenshot:
        (String name, List<int> bytes, [Map<String, Object?>? args]) async {
          if (!RegExp(r'^provider-[a-z]+$').hasMatch(name)) return false;
          await File('${root.path}/$name.png').writeAsBytes(bytes, flush: true);
          return true;
        },
  );
}
