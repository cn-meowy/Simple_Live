import 'package:simple_live_app/core/model/live_room_item.dart';

class LiveCategoryResult {
  final bool hasMore;
  final List<LiveRoomItem> items;
  LiveCategoryResult({
    required this.hasMore,
    required this.items,
  });
}
